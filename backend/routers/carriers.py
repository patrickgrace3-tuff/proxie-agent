import asyncio
import anthropic
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json, uuid
from datetime import datetime, timezone

from db.database import db, row_to_dict
from db.auth import get_current_user
from agent.scraper import scrape_jobs_with_fallback
from agent.rules import AgentRules, score_carrier_against_rules
from agent.profile import CandidateProfile

router = APIRouter()
client = anthropic.Anthropic()

STATUS_LABELS = {
    "pending": "Pending Approval", "approved": "Approved", "contacted": "Contacted",
    "interested": "Interested", "not_interested": "Not Interested",
    "rejected": "Rejected", "hired": "Hired", "passed": "Driver Passed",
}


# ── Helpers ───────────────────────────────────────────────────────────────────

def get_user_profile(user_id: int) -> dict:
    with db() as cur:
        cur.execute("SELECT * FROM profiles WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    if not row:
        return {}
    r = row_to_dict(row)
    for f in ["licenses_held","licenses_obtaining","endorsements","freight_current","freight_interested"]:
        if isinstance(r.get(f), str):
            try: r[f] = json.loads(r[f])
            except: r[f] = []
        elif r.get(f) is None:
            r[f] = []
    return r


def get_user_rules(user_id: int) -> AgentRules:
    with db() as cur:
        cur.execute("SELECT * FROM agent_rules WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    if not row:
        return AgentRules()
    r = row_to_dict(row)
    for f in ["pay_types_accepted","preferred_regions","states_blacklist","blacklisted_carriers","preferred_carriers"]:
        if isinstance(r.get(f), str):
            try: r[f] = json.loads(r[f])
            except: r[f] = []
        elif r.get(f) is None:
            r[f] = []
    for f in ["statewide_only","no_touch_freight_required","drop_and_hook_preferred","team_driving_ok",
              "hazmat_ok","overnights_ok","requires_benefits","requires_401k","requires_health_insurance",
              "pet_policy_required","rider_policy_required","auto_call_enabled","auto_email_enabled",
              "require_approval_before_call","reject_if_forced_dispatch","reject_if_lease_purchase_only",
              "reject_if_no_ELD_provided","reject_if_no_sign_on_bonus","rules_active"]:
        if f in r: r[f] = bool(r[f])
    return AgentRules(**{k: v for k, v in r.items() if k in AgentRules.model_fields})


def add_outreach_db(user_id: int, record: dict):
    record_id = record.get("id") or f"or_{uuid.uuid4().hex[:12]}"
    with db() as cur:
        cur.execute("""
            INSERT INTO outreach_log (
                id, user_id, carrier_name, carrier_id, job_title, job_url, location,
                cpm, weekly_pay_estimate, home_time, freight_types, match_score,
                match_passed, match_failed, match_warnings, status, channel,
                recruiter_name, recruiter_phone, driver_approved, outcome_notes
            ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
                status=VALUES(status), last_updated=CURRENT_TIMESTAMP
        """, (
            record_id, user_id,
            record.get("carrier_name",""), record.get("carrier_id",""),
            record.get("job_title",""), record.get("job_url",""),
            record.get("location",""), record.get("cpm"),
            record.get("weekly_pay_estimate"),
            record.get("home_time",""),
            json.dumps(record.get("freight_types",[])),
            record.get("match_score",0),
            json.dumps(record.get("match_passed",[])),
            json.dumps(record.get("match_failed",[])),
            json.dumps(record.get("match_warnings",[])),
            record.get("status","pending"),
            record.get("channel",""),
            record.get("recruiter_name",""),
            record.get("recruiter_phone",""),
            1 if record.get("driver_approved") else 0,
            record.get("outcome_notes",""),
        ))
    return record_id


def get_outreach_db(user_id: int) -> list:
    with db() as cur:
        cur.execute("SELECT * FROM outreach_log WHERE user_id = %s ORDER BY created_at DESC", (user_id,))
        rows = cur.fetchall()
    results = []
    for r in rows:
        d = row_to_dict(r)
        for f in ["freight_types","match_passed","match_failed","match_warnings"]:
            if isinstance(d.get(f), str):
                try: d[f] = json.loads(d[f])
                except: d[f] = []
            elif d.get(f) is None:
                d[f] = []
        results.append(d)
    return results


# ── Models ────────────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    max_results: Optional[int] = 25
    force_refresh: Optional[bool] = False

class ApproveRequest(BaseModel):
    record_id: str
    channel: str = "email"

class UpdateStatusRequest(BaseModel):
    record_id: str
    status: str
    notes: Optional[str] = ""
    offer_cpm: Optional[float] = None
    offer_weekly: Optional[float] = None
    recruiter_name: Optional[str] = ""
    recruiter_phone: Optional[str] = ""
    follow_up_date: Optional[str] = ""

class ClipRequest(BaseModel):
    carrier_name: str
    job_title: str = ""
    job_url: str = ""
    location: str = ""
    cpm: Optional[float] = None
    pay_type: str = ""
    pay_min: Optional[float] = None
    pay_max: Optional[float] = None
    weekly_est: Optional[float] = None
    home_time: str = ""
    freight_types: list[str] = []
    recruiter_phone: str = ""
    source: str = "Chrome Extension"
    description: str = ""
    notes: str = ""

class GenerateScriptRequest(BaseModel):
    record_id: str
    channel: str = "voice"


# ── Endpoints ─────────────────────────────────────────────────────────────────

@router.post("/search")
async def search_carriers(request: SearchRequest, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    profile = get_user_profile(user_id)
    rules   = get_user_rules(user_id)

    carriers = await scrape_jobs_with_fallback(
        profile=profile, rules=rules.model_dump(),
        max_results=(request.max_results or 25) * 2
    )
    scored = []
    for c in carriers:
        match = score_carrier_against_rules(c, rules)
        scored.append({**c, "match": match})
    scored.sort(key=lambda x: (0 if x["match"]["eligible"] else 1, -x["match"]["score"]))
    top = scored[:request.max_results]

    auto_queued = 0
    if rules.rules_active and (rules.auto_call_enabled or rules.auto_email_enabled):
        existing_ids = {r["carrier_id"] for r in get_outreach_db(user_id)}
        eligible = [c for c in top if c["match"]["eligible"] and c["id"] not in existing_ids]
        for carrier in eligible[:rules.max_outreach_per_day or 5]:
            add_outreach_db(user_id, {
                "carrier_id": carrier["id"],
                "carrier_name": carrier.get("name",""),
                "job_title": carrier.get("job_title",""),
                "job_url": carrier.get("job_url",""),
                "location": carrier.get("location",""),
                "cpm": carrier.get("cpm"),
                "weekly_pay_estimate": carrier.get("weekly_pay_estimate"),
                "home_time": carrier.get("home_time",""),
                "freight_types": carrier.get("freight_types",[]),
                "match_score": carrier["match"]["score"],
                "match_passed": carrier["match"]["passed"],
                "match_failed": carrier["match"]["failed"],
                "match_warnings": carrier["match"]["warnings"],
                "status": "approved" if not rules.require_approval_before_call else "pending",
                "driver_approved": not rules.require_approval_before_call,
                "channel": "voice" if rules.auto_call_enabled else "email",
                "recruiter_phone": carrier.get("recruiter_phone",""),
                "recruiter_name": carrier.get("recruiter_name",""),
            })
            auto_queued += 1

    return {
        "results": top, "total": len(top),
        "eligible": len([c for c in top if c["match"]["eligible"]]),
        "source": "fresh", "rules_applied": rules.rules_active,
        "auto_queued": auto_queued,
    }


@router.post("/clip")
def clip_job_from_extension(request: ClipRequest, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    rules   = get_user_rules(user_id)

    # Extract and clean location to "City, ST" format
    import re as _re
    raw_loc = request.location or ""
    loc_m = _re.search(r"([A-Z][a-z]{2,}(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})(?:\b|\s|$)", raw_loc)
    clean_location = f"{loc_m.group(1)}, {loc_m.group(2)}" if loc_m else raw_loc
    state_match = _re.search(r",\s*([A-Z]{2})", clean_location)
    operating_states = [state_match.group(1)] if state_match else []if state_match else []

    # Derive CPM from weekly_est if cpm not provided (assume 2400 mi/wk)
    cpm = request.cpm
    weekly = request.weekly_est
    if not cpm and weekly:
        cpm = round(weekly / 2400 * 100, 1)
    if not weekly and cpm:
        weekly = round(cpm / 100 * 2400)

    carrier = {
        "id": f"clip_{uuid.uuid4().hex[:12]}",
        "name": request.carrier_name,
        "job_title": request.job_title,
        "job_url": request.job_url,
        "location": request.location,
        "cpm": cpm,
        "weekly_pay_estimate": weekly,
        "home_time": request.home_time,
        "freight_types": request.freight_types,
        "operating_states": operating_states,
        "recruiter_phone": request.recruiter_phone,
        "source": request.source,
        # Default flags — extension can't reliably detect these
        "no_touch": False, "drop_and_hook": False, "forced_dispatch": False,
        "lease_only": False, "sign_on_bonus": False, "health_insurance": False,
        "retirement_plan": False, "eld_provided": False,
    }
    match = score_carrier_against_rules(carrier, rules)
    record_id = add_outreach_db(user_id, {
        "carrier_id":          carrier["id"],
        "carrier_name":        request.carrier_name,
        "job_title":           request.job_title,
        "job_url":             request.job_url,
        "location":            clean_location,
        "cpm":                 cpm,
        "weekly_pay_estimate": weekly,
        "home_time":           request.home_time,
        "freight_types":       request.freight_types,
        "match_score":         match["score"],
        "match_passed":        match["passed"],
        "match_failed":        match["failed"],
        "match_warnings":      match["warnings"],
        "status":              "pending" if rules.require_approval_before_call else "approved",
        "driver_approved":     not rules.require_approval_before_call,
        "recruiter_phone":     request.recruiter_phone,
        "outcome_notes":       request.notes,
    })
    return {"success": True, "record_id": record_id, "match_score": match["score"]}


@router.post("/queue-outreach")
def queue_outreach_endpoint(carriers: list[dict], user: dict = Depends(get_current_user)):
    """Accept full carrier objects from the search results and save to outreach log."""
    user_id = int(user["sub"])
    rules   = get_user_rules(user_id)
    queued  = 0
    for carrier in carriers:
        match = carrier.get("match", {})
        # Re-score if no match data
        if not match:
            match = score_carrier_against_rules(carrier, rules)
        add_outreach_db(user_id, {
            "carrier_id":          carrier.get("id", f"c_{uuid.uuid4().hex[:10]}"),
            "carrier_name":        carrier.get("name", "Unknown Carrier"),
            "job_title":           carrier.get("job_title", "CDL Driver"),
            "job_url":             carrier.get("job_url", ""),
            "location":            carrier.get("location", ""),
            "cpm":                 carrier.get("cpm"),
            "weekly_pay_estimate": carrier.get("weekly_pay_estimate"),
            "home_time":           carrier.get("home_time", ""),
            "freight_types":       carrier.get("freight_types", []),
            "match_score":         match.get("score", 0),
            "match_passed":        match.get("passed", []),
            "match_failed":        match.get("failed", []),
            "match_warnings":      match.get("warnings", []),
            "status":              "pending" if rules.require_approval_before_call else "approved",
            "driver_approved":     not rules.require_approval_before_call,
            "channel":             "voice" if rules.auto_call_enabled else "email",
            "recruiter_name":      carrier.get("recruiter_name", ""),
            "recruiter_phone":     carrier.get("recruiter_phone", ""),
        })
        queued += 1
    return {"queued": queued}


@router.post("/approve")
def approve_outreach(request: ApproveRequest, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("""
            UPDATE outreach_log SET status='approved', channel=%s, driver_approved=1
            WHERE id=%s AND user_id=%s
        """, (request.channel, request.record_id, user_id))
    return {"success": True}


@router.post("/update-status")
def update_status(request: UpdateStatusRequest, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    fields = {"status": request.status}
    if request.notes:       fields["outcome_notes"]  = request.notes
    if request.offer_cpm:   fields["offer_cpm"]       = request.offer_cpm
    if request.offer_weekly:fields["offer_weekly"]    = request.offer_weekly
    if request.recruiter_name:  fields["recruiter_name"]  = request.recruiter_name
    if request.recruiter_phone: fields["recruiter_phone"] = request.recruiter_phone
    if request.follow_up_date:  fields["follow_up_date"]  = request.follow_up_date
    if request.status == "contacted":
        fields["contacted_at"] = datetime.now(timezone.utc)
    set_clause = ", ".join(f"{k}=%s" for k in fields)
    with db() as cur:
        cur.execute(f"UPDATE outreach_log SET {set_clause} WHERE id=%s AND user_id=%s",
                    list(fields.values()) + [request.record_id, user_id])
    return {"success": True}


@router.post("/pass")
def driver_pass(record_id: str, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("UPDATE outreach_log SET status='passed', driver_approved=0 WHERE id=%s AND user_id=%s",
                    (record_id, user_id))
    return {"success": True}


@router.get("/outreach-log")
def get_outreach_log(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    records = get_outreach_db(user_id)
    return {"records": records, "total": len(records), "status_labels": STATUS_LABELS}


@router.get("/stats")
def get_stats(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    records = get_outreach_db(user_id)
    status_counts = {}
    for r in records:
        status_counts[r["status"]] = status_counts.get(r["status"], 0) + 1
    return {
        "total_outreach": len(records),
        "status_counts": status_counts,
        "interested_count": status_counts.get("interested", 0),
        "hired_count": status_counts.get("hired", 0),
    }


@router.post("/generate-script")
def generate_script(request: GenerateScriptRequest, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    records = get_outreach_db(user_id)
    record  = next((r for r in records if r["id"] == request.record_id), None)
    if not record:
        return {"error": "Record not found"}
    profile = get_user_profile(user_id)
    rules   = get_user_rules(user_id)
    name    = f"{profile.get('first_name','')} {profile.get('last_name','')}".strip() or "the driver"
    channel_instruction = {
        "voice": "Write a natural phone script under 90 seconds. Include opening, key qualifications, questions about pay/home time, and closing.",
        "email": "Write a professional email with subject line. Keep it 4-5 short paragraphs.",
        "sms":   "Write a brief SMS under 160 characters.",
    }.get(request.channel, "Write an outreach message.")
    cpm_text = f"{record['cpm']}c/mi" if record.get('cpm') else 'Not listed'
    system = f"You are drafting outreach for {name} applying to {record['carrier_name']}. Position: {record['job_title']} | Location: {record['location']} | CPM: {cpm_text} | Home time: {record.get('home_time','Not listed')} | Match score: {record['match_score']}/100 | Min CPM needed: {f'{rules.min_cpm}c' if rules.min_cpm else 'Flexible'}. {channel_instruction} Speak in first person as the driver."
    message = client.messages.create(
        model="claude-opus-4-5", max_tokens=800, system=system,
        messages=[{"role":"user","content":f"Generate the {request.channel} script."}]
    )
    return {"script": message.content[0].text, "channel": request.channel}


@router.get("/outreach-record/{record_id}/analysis")
async def get_call_analysis(record_id: str, user: dict = Depends(get_current_user)):
    """Return call analysis. If no summary yet, fetch transcript from Bland AI and analyze on the spot."""
    user_id = int(user["sub"])

    # Get outreach record
    with db() as cur:
        cur.execute(
            "SELECT * FROM outreach_log WHERE id = %s AND user_id = %s",
            (record_id, user_id)
        )
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Record not found")
    r = row_to_dict(row)

    # Get associated call_id from call_log
    with db() as cur:
        cur.execute(
            "SELECT call_id, transcript, summary FROM call_log WHERE outreach_record_id = %s AND user_id = %s ORDER BY dispatched_at DESC LIMIT 1",
            (record_id, user_id)
        )
        call_row = cur.fetchone()
    call_data = row_to_dict(call_row) if call_row else {}
    call_id = call_data.get("call_id", "")

    # If no summary yet but we have a call_id, fetch from Bland AI and analyze now
    if not r.get("call_summary") and not r.get("outcome_notes") and call_id:
        import agent.voice as voice_module
        from agent.voice import fetch_and_analyze
        if voice_module.BLAND_API_KEY:
            try:
                analysis = await fetch_and_analyze(call_id, record_id)
                # Reload record with fresh data
                with db() as cur:
                    cur.execute("SELECT * FROM outreach_log WHERE id = %s AND user_id = %s", (record_id, user_id))
                    row = cur.fetchone()
                r = row_to_dict(row) if row else r
            except Exception as e:
                print(f"[Analysis] Live fetch failed: {e}")

    return {
        "call_summary":          r.get("call_summary") or "",
        "outcome_notes":         r.get("outcome_notes") or "",
        "status":                r.get("status") or "",
        "recruiter_name":        r.get("recruiter_name") or "",
        "recruiter_phone":       r.get("recruiter_phone") or "",
        "offer_cpm":             r.get("offer_cpm"),
        "offer_weekly":          r.get("offer_weekly"),
        "follow_up_date":        r.get("follow_up_date") or "",
        "call_duration_seconds": r.get("call_duration_seconds") or 0,
        "recording_url":         r.get("recording_url") or "",
        "has_call_id":           bool(call_id),
    }


@router.post("/rescore-all")
def rescore_all(user: dict = Depends(get_current_user)):
    """Re-score all outreach records against current rules."""
    user_id = int(user["sub"])
    rules   = get_user_rules(user_id)
    records = get_outreach_db(user_id)
    updated = 0
    for rec in records:
        carrier = {
            "name":              rec.get("carrier_name", ""),
            "location":          rec.get("location", ""),
            "cpm":               rec.get("cpm"),
            "weekly_pay_estimate": rec.get("weekly_pay_estimate"),
            "home_time":         rec.get("home_time", ""),
            "freight_types":     rec.get("freight_types", []),
            "operating_states":  [],
            "no_touch":          False, "drop_and_hook": False,
            "forced_dispatch":   False, "lease_only":    False,
            "sign_on_bonus":     False, "health_insurance": False,
            "retirement_plan":   False,
        }
        match = score_carrier_against_rules(carrier, rules)
        with db() as cur:
            cur.execute("""
                UPDATE outreach_log
                SET match_score=%s, match_passed=%s, match_failed=%s, match_warnings=%s
                WHERE id=%s AND user_id=%s
            """, (
                match["score"],
                json.dumps(match["passed"]),
                json.dumps(match["failed"]),
                json.dumps(match["warnings"]),
                rec["id"], user_id
            ))
        updated += 1
    return {"updated": updated, "message": f"Re-scored {updated} records against your current rules."}


@router.delete("/outreach-record/{record_id}")
def delete_outreach_record(record_id: str, user: dict = Depends(get_current_user)):
    """Permanently delete an outreach record for the current user."""
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute(
            "DELETE FROM outreach_log WHERE id = %s AND user_id = %s",
            (record_id, user_id)
        )
        deleted = cur.rowcount
    if not deleted:
        from fastapi import HTTPException
        raise HTTPException(status_code=404, detail="Record not found.")
    return {"success": True}


@router.delete("/cache")
def clear_cache():
    return {"success": True, "message": "Cache cleared"}