import json
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional

from db.database import db, row_to_dict
from db.auth import get_current_user
import agent.fmcsa as fmcsa_module
from agent.fmcsa import enrich_outreach_record

router = APIRouter()


class FMCSALookupRequest(BaseModel):
    carrier_name: str
    record_id: Optional[str] = None  # If set, save results to this outreach record


@router.get("/lookup")
async def lookup_carrier(carrier_name: str, user: dict = Depends(get_current_user)):
    """Look up a carrier by name in FMCSA. Returns safety data."""
    if not fmcsa_module.FMCSA_WEBKEY:
        raise HTTPException(status_code=400, detail="FMCSA WebKey not configured in app.py")
    result = await enrich_outreach_record(carrier_name)
    if not result:
        return {"found": False, "carrier_name": carrier_name}
    return {"found": True, **result}


@router.post("/enrich/{record_id}")
async def enrich_record(record_id: str, user: dict = Depends(get_current_user)):
    """
    Look up FMCSA data for an outreach record and save it.
    Auto-rejects if safety rating is Unsatisfactory or carrier is OOS.
    """
    if not fmcsa_module.FMCSA_WEBKEY:
        raise HTTPException(status_code=400, detail="FMCSA WebKey not configured in app.py")

    user_id = int(user["sub"])

    # Get the outreach record
    with db() as cur:
        cur.execute("SELECT * FROM outreach_log WHERE id=%s AND user_id=%s", (record_id, user_id))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")

    record = row_to_dict(row)
    carrier_name = record.get("carrier_name", "")
    if not carrier_name:
        raise HTTPException(status_code=400, detail="No carrier name on record")

    # Look up FMCSA
    safety = await enrich_outreach_record(carrier_name)
    if not safety:
        return {
            "found": False,
            "carrier_name": carrier_name,
            "message": f"Could not identify a confident FMCSA record for '{carrier_name}'. The carrier may not be registered under this name."
        }

    # Claude verified this is the wrong company
    if safety.get("mismatch"):
        return {
            "found": False,
            "mismatch": True,
            "carrier_name": carrier_name,
            "fmcsa_name": safety.get("fmcsa_name"),
            "dot_number": safety.get("dot_number"),
            "message": safety.get("message"),
        }

    # Save FMCSA data to the outreach record
    fmcsa_json = json.dumps(safety)
    updates = {"fmcsa_data": fmcsa_json}

    # Auto-reject if unsafe
    if safety.get("auto_reject"):
        updates["status"] = "rejected"
        updates["outcome_notes"] = f"Auto-rejected: {safety.get('auto_reject_reason')}"
        print(f"[FMCSA] Auto-rejected {carrier_name}: {safety.get('auto_reject_reason')}")

    set_clause = ", ".join(f"`{k}`=%s" for k in updates)
    with db() as cur:
        cur.execute(
            f"UPDATE outreach_log SET {set_clause} WHERE id=%s AND user_id=%s",
            list(updates.values()) + [record_id, user_id]
        )

    return {
        "found": True,
        "carrier_name": carrier_name,
        "auto_rejected": safety.get("auto_reject", False),
        "auto_reject_reason": safety.get("auto_reject_reason"),
        **safety
    }


@router.post("/enrich-all")
async def enrich_all_records(user: dict = Depends(get_current_user)):
    """
    Run FMCSA lookup on all pending/approved outreach records that haven't been enriched yet.
    """
    if not fmcsa_module.FMCSA_WEBKEY:
        raise HTTPException(status_code=400, detail="FMCSA WebKey not configured in app.py")

    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("""
            SELECT id, carrier_name FROM outreach_log
            WHERE user_id=%s
            AND status IN ('pending','approved')
            AND (fmcsa_data IS NULL OR fmcsa_data='')
            ORDER BY created_at DESC
            LIMIT 20
        """, (user_id,))
        rows = cur.fetchall()

    records = [row_to_dict(r) for r in rows]
    results = []

    for rec in records:
        rid = rec["id"]
        name = rec["carrier_name"]
        try:
            safety = await enrich_outreach_record(name)
            if not safety:
                results.append({"id": rid, "carrier": name, "found": False})
                continue

            updates = {"fmcsa_data": json.dumps(safety)}
            if safety.get("auto_reject"):
                updates["status"] = "rejected"
                updates["outcome_notes"] = f"Auto-rejected: {safety.get('auto_reject_reason')}"

            set_clause = ", ".join(f"`{k}`=%s" for k in updates)
            with db() as cur:
                cur.execute(
                    f"UPDATE outreach_log SET {set_clause} WHERE id=%s AND user_id=%s",
                    list(updates.values()) + [rid, user_id]
                )
            results.append({
                "id": rid, "carrier": name, "found": True,
                "rating": safety.get("safety_rating"),
                "auto_rejected": safety.get("auto_reject", False),
            })
        except Exception as e:
            results.append({"id": rid, "carrier": name, "error": str(e)})

    auto_rejected = sum(1 for r in results if r.get("auto_rejected"))
    found = sum(1 for r in results if r.get("found"))
    return {
        "processed": len(results),
        "found": found,
        "auto_rejected": auto_rejected,
        "results": results,
    }
