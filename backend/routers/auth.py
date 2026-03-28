from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone

from db.database import db, row_to_dict
from db.auth import hash_password, verify_password, create_token, get_current_user

router = APIRouter()


class RegisterRequest(BaseModel):
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""
    phone: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/register")
def register(request: RegisterRequest):
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    with db() as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", (request.email.lower().strip(),))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="An account with that email already exists.")

        password_hash = hash_password(request.password)
        cur.execute("""
            INSERT INTO users (email, password_hash, first_name, last_name, phone, role, is_active)
            VALUES (%s, %s, %s, %s, %s, 'driver', 1)
        """, (
            request.email.lower().strip(),
            password_hash,
            request.first_name.strip(),
            request.last_name.strip(),
            request.phone.strip(),
        ))
        user_id = cur.lastrowid

        cur.execute("INSERT INTO profiles (user_id) VALUES (%s)", (user_id,))
        cur.execute("INSERT INTO agent_rules (user_id) VALUES (%s)", (user_id,))

        token_data = create_token(user_id, request.email.lower(), "driver")

    return {
        "success": True,
        "token": token_data["token"],
        "user": {
            "id": user_id,
            "email": request.email.lower(),
            "first_name": request.first_name,
            "last_name": request.last_name,
            "role": "driver",
        }
    }


@router.post("/login")
def login(request: LoginRequest):
    with db() as cur:
        cur.execute("""
            SELECT id, email, password_hash, first_name, last_name, role, is_active
            FROM users WHERE email = %s
        """, (request.email.lower().strip(),))
        user = cur.fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact support.")
    if not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    with db() as cur:
        cur.execute("UPDATE users SET last_login = %s WHERE id = %s",
                    (datetime.now(timezone.utc), user["id"]))

    token_data = create_token(user["id"], user["email"], user["role"])

    return {
        "success": True,
        "token": token_data["token"],
        "user": {
            "id": user["id"],
            "email": user["email"],
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "role": user["role"],
        }
    }


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("""
            SELECT id, email, first_name, last_name, phone, role, is_active, created_at, last_login
            FROM users WHERE id = %s
        """, (user_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")
    return row_to_dict(row)


@router.post("/logout")
def logout(user: dict = Depends(get_current_user)):
    return {"success": True, "message": "Logged out successfully."}


@router.put("/change-password")
def change_password(body: dict, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    old_pw = body.get("old_password", "")
    new_pw = body.get("new_password", "")

    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

    with db() as cur:
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if not row or not verify_password(old_pw, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                    (hash_password(new_pw), user_id))

    return {"success": True, "message": "Password updated."}


@router.put("/update-profile")
def update_profile(body: dict, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    first = body.get("first_name", "").strip()
    last  = body.get("last_name", "").strip()
    phone = body.get("phone", "").strip()
    with db() as cur:
        cur.execute(
            "UPDATE users SET first_name=%s, last_name=%s, phone=%s WHERE id=%s",
            (first, last, phone, user_id)
        )
    return {"success": True}
