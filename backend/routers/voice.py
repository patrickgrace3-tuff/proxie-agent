import json
from fastapi import APIRouter, Request, HTTPException, Depends
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone

from db.database import db, row_to_dict
from db.auth import get_current_user
from agent.carrier_lookup import lookup_recruiting_numbers, load_all_cached
from agent.voice import (
    dispatch_call, get_call_status, analyze_call_transcript,
    load_call_log, BLAND_API_KEY
)
import agent.voice as voice_module

router = APIRouter()


# ── DB helpers ────────────────────────────────────────────────────────────────

def get_outreach_record(record_id: str, user_id: int) -> dict:
    """Fetch a single outreach record from MySQL, scoped to user."""
    with db() as cur:
        cur.execute(
            "SELECT * FROM outreach_log WHERE id = %s AND user_id = %s",
            (record_id, user_id)
        )
        row = cur.fetchone()
    if not row:
        return None
    r = row_to_dict(row)
    for f in ["freight_types", "match_passed", "match_failed", "match_warnings"]:
        if isinstance(r.get(f), str):
            try: r[f] = json.loads(r[f])
            except: r[f] = []
        elif r.get(f) is None:
            r[f] = []
    return r


def update_outreach_record(record_id: str, user_id: int, updates: dict):
    """Update fields on an outreach record."""
    if not updates:
        return
    set_clause = ", ".join(f"{k} = %s" for k in updates)
    with db() as cur:
        cur.execute(
            f"UPDATE outreach_log SET {set_clause} WHERE id = %s AND user_id = %s",
            list(updates.values()) + [record_id, user_id]
        )


def get_user_profile(user_id: int) -> dict:
    with db() as cur:
        cur.execute("SELECT * FROM profiles WHERE user_id = %s", (user_id,))
        profile_row = row_to_dict(cur.fetchone()) or {}
        cur.execute("SELECT first_name, last_name, email, phone FROM users WHERE id = %s", (user_id,))
        user_row = cur.fetchone() or {}
    profile_row.update({
        "first_name": user_row.get("first_name", ""),
        "last_name":  user_row.get("last_name", ""),
        "name": f"{user_row.get('first_name','')} {user_row.get('last_name','')}".strip(),
        "email": user_row.get("email", ""),
        "phone": user_row.get("phone", ""),
    })
    return profile_row


def get_user_rules(user_id: int) -> dict:
    with db() as cur:
        cur.execute("SELECT * FROM agent_rules WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    return row_to_dict(row) if row else {}


# ── Models ────────────────────────────────────────────────────────────────────

class CallRequest(BaseModel):
    outreach_record_id: str
    recruiter_phone: str
    recruiter_name: Optional[str] = ""
    webhook_url: Optional[str] = ""
    voice: Optional[str] = "nat"
    max_duration: Optional[int] = 120


class ConfigRequest(BaseModel):
    bland_api_key: str
    bland_phone_number: str
    webhook_base_url: Optional[str] = ""


class TestCallRequest(BaseModel):
    test_phone: str


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/config")
def set_voice_config(request: ConfigRequest, user: dict = Depends(get_current_user)):
    voice_module.BLAND_API_KEY = request.bland_api_key
    voice_module.BLAND_PHONE_NUMBER = request.bland_phone_number
    voice_module.WEBHOOK_BASE_URL = request.webhook_base_url or ""
    return {"success": True}


@router.get("/config")
def get_voice_config(user: dict = Depends(get_current_user)):
    key = voice_module.BLAND_API_KEY
    return {
        "configured": bool(key),
        "api_key_preview": f"...{key[-6:]}" if key and len(key) > 6 else "",
        "phone_number": voice_module.BLAND_PHONE_NUMBER,
        "webhook_url": voice_module.WEBHOOK_BASE_URL,
    }


@router.post("/dispatch")
async def dispatch_voice_call(request: CallRequest, user: dict = Depends(get_current_user)):
    if not voice_module.BLAND_API_KEY:
        raise HTTPException(status_code=400, detail="Bland AI not configured. Go to Voice Settings first.")

    user_id = int(user["sub"])
    record = get_outreach_record(request.outreach_record_id, user_id)
    if not record:
        raise HTTPException(status_code=404, detail="Outreach record not found.")
    if not request.recruiter_phone:
        raise HTTPException(status_code=400, detail="Recruiter phone number required.")

    # Save phone and mark as voice channel
    update_outreach_record(request.outreach_record_id, user_id, {
        "recruiter_phone": request.recruiter_phone,
        "channel": "voice",
    })

    # Load user's profile and rules from MySQL
    profile = get_user_profile(user_id)
    rules   = get_user_rules(user_id)

    result = await dispatch_call(
        recruiter_phone=request.recruiter_phone,
        outreach_record_id=request.outreach_record_id,
        outreach_record=record,
        webhook_url=request.webhook_url or voice_module.WEBHOOK_BASE_URL,
        profile_data=profile,
        rules_data=rules,
        voice=request.voice or "nat",
        max_duration=request.max_duration or 120,
    )
    return result


@router.post("/test-call")
async def test_voice_call(request: TestCallRequest, user: dict = Depends(get_current_user)):
    if not voice_module.BLAND_API_KEY:
        raise HTTPException(status_code=400, detail="Bland AI not configured.")

    user_id = int(user["sub"])
    profile = get_user_profile(user_id)
    rules   = get_user_rules(user_id)

    from agent.voice import build_call_prompt
    import httpx

    dummy = {
        "carrier_name": "Test Carrier Inc.", "job_title": "Class A CDL Driver – Dry Van",
        "location": "Nashville, TN", "cpm": 62.0,
        "home_time": "Weekly", "freight_types": ["Dry Van"],
    }
    prompt = build_call_prompt(profile, rules, dummy)
    test_prompt = f"This is a TEST CALL. Say: 'Hi, this is a test of your Driver Agent voice system. Here is a preview: ' then deliver the first 2 lines of: {prompt[:300]}. Keep it under 30 seconds."

    payload = {
        "phone_number": request.test_phone,
        "task": test_prompt,
        "model": "enhanced", "language": "en", "voice": "nat",
        "max_duration": 60, "record": True,
    }
    if voice_module.BLAND_PHONE_NUMBER:
        payload["from"] = voice_module.BLAND_PHONE_NUMBER

    async with httpx.AsyncClient(timeout=20) as client:
        resp = await client.post(
            "https://api.bland.ai/v1/calls",
            headers={"authorization": voice_module.BLAND_API_KEY, "Content-Type": "application/json"},
            json=payload,
        )
    result = resp.json()
    return {"success": True, "call_id": result.get("call_id"), "message": "Test call dispatched!"}


@router.get("/status/{call_id}")
async def call_status(call_id: str, user: dict = Depends(get_current_user)):
    if not voice_module.BLAND_API_KEY:
        raise HTTPException(status_code=400, detail="Bland AI not configured.")
    return await get_call_status(call_id)


@router.post("/webhook")
async def bland_webhook(request: Request):
    """Bland AI webhook — called when a call ends."""
    try:
        payload = await request.json()
    except Exception:
        return JSONResponse({"ok": False}, status_code=400)

    call_id    = payload.get("call_id", "")
    status     = payload.get("status", "")
    transcript = payload.get("concatenated_transcript", "") or payload.get("transcript", "")
    duration   = payload.get("call_length", 0)
    answered_by = payload.get("answered_by", "")
    metadata   = payload.get("metadata") or {}

    outreach_record_id = metadata.get("outreach_record_id", "")
    user_id = int(metadata.get("user_id", 0))

    # Fallback: look up from call log
    if not outreach_record_id:
        log = load_call_log()
        entry = next((e for e in log if e.get("call_id") == call_id), None)
        if entry:
            outreach_record_id = entry.get("outreach_record_id", "")
            user_id = int(entry.get("user_id", 0))

    print(f"[Webhook] {call_id} | {status} | answered_by={answered_by} | {duration}s")

    if status == "completed" and outreach_record_id and user_id:
        update_outreach_record(outreach_record_id, user_id, {
            "call_duration_seconds": int(duration or 0),
        })
        if transcript:
            await analyze_call_transcript(call_id, outreach_record_id, transcript)
        elif answered_by == "voicemail":
            update_outreach_record(outreach_record_id, user_id, {
                "status": "contacted",
                "outcome_notes": "Left voicemail. Awaiting callback.",
            })

    return JSONResponse({"ok": True})


@router.get("/call-log")
def get_call_log_endpoint(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    from agent.voice import load_call_log
    calls = load_call_log(user_id=user_id)
    return {"calls": calls, "total": len(calls)}


@router.get("/call-log/{call_id}/transcript")
async def get_transcript(call_id: str, user: dict = Depends(get_current_user)):
    if not voice_module.BLAND_API_KEY:
        raise HTTPException(status_code=400, detail="Bland AI not configured.")
    data = await get_call_status(call_id)
    return {
        "call_id":     call_id,
        "transcript":  data.get("concatenated_transcript", ""),
        "status":      data.get("status", ""),
        "duration":    data.get("call_length", 0),
        "answered_by": data.get("answered_by", ""),
        "recording_url": data.get("recording_url", ""),
    }


@router.get("/debug/{call_id}")
async def debug_call(call_id: str, user: dict = Depends(get_current_user)):
    """Debug: show raw Bland AI response for a call."""
    if not voice_module.BLAND_API_KEY:
        raise HTTPException(status_code=400, detail="Bland AI not configured.")
    data = await get_call_status(call_id)
    return {
        "bland_keys": list(data.keys()),
        "status": data.get("status"),
        "answered_by": data.get("answered_by"),
        "call_length": data.get("call_length"),
        "recording_url": data.get("recording_url"),
        "transcript_len": len(data.get("concatenated_transcript") or ""),
        "raw": data,
    }


@router.post("/call-log/{call_id}/analyze")
async def analyze_call(call_id: str, user: dict = Depends(get_current_user)):
    """Manually trigger analysis — fetches transcript + recording from Bland AI."""
    if not voice_module.BLAND_API_KEY:
        raise HTTPException(status_code=400, detail="Bland AI not configured.")
    from agent.voice import fetch_and_analyze
    user_id = int(user["sub"])

    # Look up outreach_record_id from call_log table
    outreach_record_id = None
    with db() as cur:
        cur.execute("SELECT outreach_record_id FROM call_log WHERE call_id = %s AND user_id = %s",
                    (call_id, user_id))
        row = cur.fetchone()
        if row:
            outreach_record_id = row.get("outreach_record_id") or list(row.values())[0]

    # If not in call_log, try finding it from outreach_log outcome_notes
    if not outreach_record_id:
        with db() as cur:
            cur.execute(
                "SELECT id FROM outreach_log WHERE user_id = %s AND outcome_notes LIKE %s",
                (user_id, f"%{call_id}%")
            )
            row = cur.fetchone()
            if row:
                outreach_record_id = row.get("id") or list(row.values())[0]
                # Insert missing call_log entry
                with db() as cur2:
                    cur2.execute("""
                        INSERT IGNORE INTO call_log (user_id, call_id, outreach_record_id, status)
                        VALUES (%s, %s, %s, 'dispatched')
                    """, (user_id, call_id, outreach_record_id))

    if not outreach_record_id:
        raise HTTPException(status_code=404, detail=f"Call {call_id} not found. Make sure it was dispatched from this account.")

    result = await fetch_and_analyze(call_id, outreach_record_id)
    return result


@router.get("/lookup-numbers")
async def lookup_numbers(force_refresh: bool = False, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    # Get user's outreach records that have no phone
    with db() as cur:
        cur.execute(
            "SELECT * FROM outreach_log WHERE user_id = %s AND (recruiter_phone IS NULL OR recruiter_phone = '')",
            (user_id,)
        )
        rows = cur.fetchall()
    carriers = [row_to_dict(r) for r in rows]
    if not carriers:
        return {"message": "All records have phone numbers.", "updated": 0}
    results = await lookup_recruiting_numbers(force_refresh=force_refresh)
    updated = 0
    # results is a dict keyed by carrier_name
    if isinstance(results, dict):
        for carrier_name, info in results.items():
            if not isinstance(info, dict):
                continue
            phone = info.get("recruiter_phone") or info.get("phone")
            if not phone:
                continue
            # Find matching outreach records by carrier name
            for c in carriers:
                if c.get("carrier_name", "").lower() == carrier_name.lower():
                    update_outreach_record(c["id"], user_id, {"recruiter_phone": phone})
                    updated += 1
    return {"updated": updated, "total": len(carriers)}