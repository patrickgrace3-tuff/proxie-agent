from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from db.database import db, row_to_dict
from db.auth import require_admin, hash_password

router = APIRouter()


# ── User management ───────────────────────────────────────────────────────────

@router.get("/users")
def list_users(
    search: str = "",
    role: str = "",
    active: Optional[int] = None,
    limit: int = 50,
    offset: int = 0,
    admin: dict = Depends(require_admin)
):
    """List all users with optional filters."""
    conditions = []
    params = []

    if search:
        conditions.append("(u.email LIKE %s OR u.first_name LIKE %s OR u.last_name LIKE %s)")
        like = f"%{search}%"
        params += [like, like, like]
    if role:
        conditions.append("u.role = %s")
        params.append(role)
    if active is not None:
        conditions.append("u.is_active = %s")
        params.append(active)

    where = "WHERE " + " AND ".join(conditions) if conditions else ""

    with db() as cur:
        cur.execute(f"""
            SELECT u.id, u.email, u.first_name, u.last_name, u.phone,
                   u.role, u.is_active, u.created_at, u.last_login,
                   u.notes,
                   p.setup_complete,
                   p.cdl_experience,
                   (SELECT COUNT(*) FROM outreach_log o WHERE o.user_id = u.id) AS outreach_count,
                   (SELECT COUNT(*) FROM call_log c WHERE c.user_id = u.id) AS call_count
            FROM users u
            LEFT JOIN profiles p ON p.user_id = u.id
            {where}
            ORDER BY u.created_at DESC
            LIMIT %s OFFSET %s
        """, params + [limit, offset])
        users = [row_to_dict(r) for r in cur.fetchall()]

        cur.execute(f"SELECT COUNT(*) as total FROM users u {where}", params)
        total = cur.fetchone()["total"]

    return {"users": users, "total": total}


@router.get("/users/{user_id}")
def get_user_detail(user_id: int, admin: dict = Depends(require_admin)):
    """Full detail for one user including profile, rules, outreach."""
    with db() as cur:
        cur.execute("""
            SELECT u.*, p.*, ar.rules_active, ar.min_cpm, ar.home_time_requirement,
                   ar.auto_call_enabled, ar.max_outreach_per_day
            FROM users u
            LEFT JOIN profiles p ON p.user_id = u.id
            LEFT JOIN agent_rules ar ON ar.user_id = u.id
            WHERE u.id = %s
        """, (user_id,))
        user = row_to_dict(cur.fetchone())
        if not user:
            raise HTTPException(status_code=404, detail="User not found.")

        cur.execute("""
            SELECT * FROM outreach_log WHERE user_id = %s
            ORDER BY created_at DESC LIMIT 20
        """, (user_id,))
        outreach = [row_to_dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT * FROM call_log WHERE user_id = %s
            ORDER BY dispatched_at DESC LIMIT 10
        """, (user_id,))
        calls = [row_to_dict(r) for r in cur.fetchall()]

    return {"user": user, "outreach": outreach, "calls": calls}


class UpdateUserRequest(BaseModel):
    first_name: Optional[str] = None
    last_name: Optional[str] = None
    phone: Optional[str] = None
    role: Optional[str] = None
    notes: Optional[str] = None


@router.put("/users/{user_id}")
def update_user(user_id: int, request: UpdateUserRequest, admin: dict = Depends(require_admin)):
    fields, params = [], []
    if request.first_name is not None:
        fields.append("first_name = %s"); params.append(request.first_name)
    if request.last_name is not None:
        fields.append("last_name = %s"); params.append(request.last_name)
    if request.phone is not None:
        fields.append("phone = %s"); params.append(request.phone)
    if request.role is not None and request.role in ("driver", "admin"):
        fields.append("role = %s"); params.append(request.role)
    if request.notes is not None:
        fields.append("notes = %s"); params.append(request.notes)

    if not fields:
        raise HTTPException(status_code=400, detail="No fields to update.")

    params.append(user_id)
    with db() as cur:
        cur.execute(f"UPDATE users SET {', '.join(fields)} WHERE id = %s", params)

    return {"success": True}


@router.post("/users/{user_id}/activate")
def activate_user(user_id: int, admin: dict = Depends(require_admin)):
    with db() as cur:
        cur.execute("UPDATE users SET is_active = 1 WHERE id = %s", (user_id,))
    return {"success": True, "message": "Account activated."}


@router.post("/users/{user_id}/deactivate")
def deactivate_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == int(admin["sub"]):
        raise HTTPException(status_code=400, detail="You cannot deactivate your own account.")
    with db() as cur:
        cur.execute("UPDATE users SET is_active = 0 WHERE id = %s", (user_id,))
    return {"success": True, "message": "Account deactivated."}


@router.post("/users/{user_id}/reset-password")
def admin_reset_password(user_id: int, body: dict, admin: dict = Depends(require_admin)):
    new_pw = body.get("new_password", "")
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")
    with db() as cur:
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                    (hash_password(new_pw), user_id))
    return {"success": True, "message": "Password reset successfully."}


@router.post("/users/{user_id}/reset-profile")
def admin_reset_profile(user_id: int, admin: dict = Depends(require_admin)):
    with db() as cur:
        cur.execute("""
            UPDATE profiles SET
                zip_code='', licenses_held=NULL, licenses_obtaining=NULL,
                cdl_experience='', endorsements=NULL, military_service='',
                moving_violations='', preventable_accidents='', driver_type='',
                owner_operator_interest='', solo_or_team='', team_interest='',
                freight_current=NULL, freight_interested=NULL,
                best_contact_time='', agreed_to_terms='', setup_complete=0
            WHERE user_id = %s
        """, (user_id,))
        cur.execute("DELETE FROM outreach_log WHERE user_id = %s", (user_id,))
    return {"success": True, "message": "Profile and outreach log reset."}


@router.delete("/users/{user_id}")
def delete_user(user_id: int, admin: dict = Depends(require_admin)):
    if user_id == int(admin["sub"]):
        raise HTTPException(status_code=400, detail="You cannot delete your own account.")
    with db() as cur:
        cur.execute("DELETE FROM users WHERE id = %s", (user_id,))
    return {"success": True, "message": "User deleted."}


# ── Stats dashboard ───────────────────────────────────────────────────────────

@router.get("/stats")
def admin_stats(admin: dict = Depends(require_admin)):
    with db() as cur:
        cur.execute("SELECT COUNT(*) as total FROM users WHERE role='driver'")
        total_drivers = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*) as total FROM users WHERE role='driver' AND is_active=1")
        active_drivers = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*) as total FROM users WHERE role='driver' AND is_active=0")
        inactive_drivers = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*) as total FROM profiles WHERE setup_complete=1")
        profiles_complete = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*) as total FROM outreach_log")
        total_outreach = cur.fetchone()["total"]

        cur.execute("SELECT COUNT(*) as total FROM call_log")
        total_calls = cur.fetchone()["total"]

        cur.execute("""
            SELECT COUNT(*) as total FROM outreach_log
            WHERE status IN ('interested','hired')
        """)
        positive_outcomes = cur.fetchone()["total"]

        cur.execute("""
            SELECT status, COUNT(*) as count
            FROM outreach_log GROUP BY status
        """)
        outreach_by_status = {r["status"]: r["count"] for r in cur.fetchall()}

        cur.execute("""
            SELECT DATE(created_at) as day, COUNT(*) as signups
            FROM users WHERE role='driver'
            AND created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(created_at) ORDER BY day
        """)
        signups_last_30 = [row_to_dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT u.id, u.email, u.first_name, u.last_name, u.last_login,
                   COUNT(o.id) as outreach_count
            FROM users u
            LEFT JOIN outreach_log o ON o.user_id = u.id
            WHERE u.role = 'driver' AND u.is_active = 1
            GROUP BY u.id
            ORDER BY outreach_count DESC LIMIT 5
        """)
        top_active = [row_to_dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT u.id, u.email, u.first_name, u.last_name, u.created_at
            FROM users u WHERE u.role = 'driver'
            ORDER BY u.created_at DESC LIMIT 5
        """)
        recent_signups = [row_to_dict(r) for r in cur.fetchall()]

    return {
        "total_drivers": total_drivers,
        "active_drivers": active_drivers,
        "inactive_drivers": inactive_drivers,
        "profiles_complete": profiles_complete,
        "total_outreach": total_outreach,
        "total_calls": total_calls,
        "positive_outcomes": positive_outcomes,
        "outreach_by_status": outreach_by_status,
        "signups_last_30": signups_last_30,
        "top_active_drivers": top_active,
        "recent_signups": recent_signups,
    }


# ── Activity feed ─────────────────────────────────────────────────────────────

@router.get("/activity")
def admin_activity(limit: int = 50, admin: dict = Depends(require_admin)):
    with db() as cur:
        cur.execute("""
            SELECT o.*, u.email, u.first_name, u.last_name
            FROM outreach_log o
            JOIN users u ON u.id = o.user_id
            ORDER BY o.last_updated DESC LIMIT %s
        """, (limit,))
        outreach = [row_to_dict(r) for r in cur.fetchall()]

        cur.execute("""
            SELECT c.*, u.email, u.first_name, u.last_name
            FROM call_log c
            JOIN users u ON u.id = c.user_id
            ORDER BY c.dispatched_at DESC LIMIT %s
        """, (limit,))
        calls = [row_to_dict(r) for r in cur.fetchall()]

    return {"outreach": outreach, "calls": calls}
