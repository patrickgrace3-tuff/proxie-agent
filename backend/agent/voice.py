import httpx
import json
import anthropic
from pathlib import Path
from typing import Optional
from datetime import datetime, timezone

from agent.profile import load_profile
from agent.rules import load_rules

BLAND_API_BASE = "https://api.bland.ai/v1"
DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
CALL_LOG_PATH = DATA_DIR / "call_log.json"

_claude_client = None

def get_claude_client():
    global _claude_client
    if _claude_client is None:
        _claude_client = anthropic.Anthropic()
    return _claude_client

# ── Config ────────────────────────────────────────────────────────────────────
BLAND_API_KEY: str = ""
BLAND_PHONE_NUMBER: str = ""
WEBHOOK_BASE_URL: str = ""


def get_headers() -> dict:
    if not BLAND_API_KEY:
        raise ValueError("BLAND_API_KEY not set.")
    return {"authorization": BLAND_API_KEY, "Content-Type": "application/json"}


# ── MySQL helpers ─────────────────────────────────────────────────────────────
def _db_update_outreach(record_id: str, updates: dict):
    if not updates or not record_id:
        return
    try:
        from db.database import db as db_ctx
        set_clause = ", ".join(f"{k} = %s" for k in updates)
        with db_ctx() as cur:
            cur.execute(
                f"UPDATE outreach_log SET {set_clause} WHERE id = %s",
                list(updates.values()) + [record_id]
            )
    except Exception as e:
        print(f"[Voice] DB outreach update failed: {e}")


def _db_update_call_log(call_id: str, updates: dict):
    if not updates or not call_id:
        return
    try:
        from db.database import db as db_ctx
        set_clause = ", ".join(f"{k} = %s" for k in updates)
        with db_ctx() as cur:
            cur.execute(
                f"UPDATE call_log SET {set_clause} WHERE call_id = %s",
                list(updates.values()) + [call_id]
            )
    except Exception as e:
        print(f"[Voice] DB call_log update failed: {e}")


def _db_get_call_log(user_id: int) -> list:
    try:
        from db.database import db as db_ctx, row_to_dict
        with db_ctx() as cur:
            cur.execute("""
                SELECT cl.*, ol.carrier_name
                FROM call_log cl
                LEFT JOIN outreach_log ol ON cl.outreach_record_id = ol.id
                WHERE cl.user_id = %s
                ORDER BY cl.dispatched_at DESC
            """, (user_id,))
            rows = cur.fetchall()
        return [row_to_dict(r) for r in rows]
    except Exception as e:
        print(f"[Voice] DB call_log read failed: {e}")
        return []


# ── Call prompt ───────────────────────────────────────────────────────────────
def build_call_prompt(profile_data: dict, rules_data: dict, outreach_record: dict) -> str:
    name = profile_data.get("name") or f"{profile_data.get('first_name','')} {profile_data.get('last_name','')}".strip() or "the driver"
    carrier   = outreach_record.get("carrier_name", "the carrier")
    job_title = outreach_record.get("job_title", "CDL Driver")
    cpm       = outreach_record.get("cpm")
    home_time = outreach_record.get("home_time", "")
    freight   = ", ".join(outreach_record.get("freight_types") or [])
    location  = outreach_record.get("location", "")

    exp            = profile_data.get("cdl_experience", "")
    licenses       = ", ".join(profile_data.get("licenses_held") or [])
    endorsements   = ", ".join(profile_data.get("endorsements") or [])
    driver_freight = ", ".join(profile_data.get("freight_current") or [])
    driver_type    = profile_data.get("driver_type", "")
    solo_team      = profile_data.get("solo_or_team", "")
    zip_code       = profile_data.get("zip_code", "")
    military       = profile_data.get("military_service", "")
    violations     = profile_data.get("moving_violations", "No")
    accidents      = profile_data.get("preventable_accidents", "No")
    career_goals   = profile_data.get("career_goals", "")

    min_cpm      = rules_data.get("min_cpm")
    home_req     = rules_data.get("home_time_requirement", "")
    no_touch     = rules_data.get("no_touch_freight_required", False)
    needs_health = rules_data.get("requires_health_insurance", False)
    needs_401k   = rules_data.get("requires_401k", False)
    min_weekly   = rules_data.get("min_weekly_gross")

    return f"""You are a professional talent representative calling {carrier} on behalf of a CDL truck driver named {name}.

## Your Identity
- You are calling AS A REPRESENTATIVE of {name}, not as {name} directly
- Introduce yourself as: "Hi, I'm calling on behalf of {name}, a CDL driver who is interested in your {job_title} position"
- Speak professionally and confidently
- You are NOT an AI — if asked, say you are a talent coordinator

## Driver Profile — Know This Cold
- Full Name: {name}
- CDL Experience: {exp}
- Licenses Held: {licenses}
- Endorsements: {endorsements if endorsements else 'Standard CDL'}
- Driver Type Seeking: {driver_type}
- Solo or Team: {solo_team}
- Freight Experience: {driver_freight if driver_freight else 'Varied'}
- Home Zip Code: {zip_code}
- Military Service: {military if military else 'No'}
- Moving Violations (3yr): {violations}
- Preventable Accidents (3yr): {accidents}
{f'- Career Goals: {career_goals}' if career_goals else ''}

## The Position Being Discussed
- Carrier: {carrier}
- Job Title: {job_title}
- Location: {location}
- Posted CPM: {f'{cpm}¢/mile' if cpm else 'Not listed — ask them'}
- Posted Home Time: {home_time if home_time else 'Not listed — ask them'}
- Freight Type: {freight if freight else 'Not listed — ask them'}

## {name}'s Requirements — Use These To Negotiate
{f'- Minimum pay: {min_cpm}¢ per mile' if min_cpm else '- Ask what their CPM range is'}
{f'- Minimum weekly gross: ${min_weekly:,.0f}' if min_weekly else ''}
{f'- Home time needed: {home_req}' if home_req else '- Ask about home time schedule'}
{'- No-touch freight only — confirm this' if no_touch else ''}
{'- Health insurance required — confirm this' if needs_health else ''}
{'- 401(k) required — confirm this' if needs_401k else ''}

## Call Flow
1. **Opening**: "Hi, I'm calling on behalf of {name}, a CDL-A driver who is very interested in your {job_title} position. Is this a good time for two minutes?"
2. **Qualify**: Confirm the position is open. Ask about current CPM, home time, and freight type.
3. **Pitch**: Share {name}'s top qualifications that match this role. Highlight experience and clean record.
4. **Handle objections**: If pay is below minimum, say "{name} is currently looking for {f'{min_cpm}¢/mile minimum' if min_cpm else 'competitive pay'} — is there any flexibility?"
5. **Schedule**: If there is interest, schedule a specific time for the recruiter to speak directly with {name}. Say "Can we schedule a call for {name} to speak with you directly? What day and time works best?" Then CONFIRM the exact day and time by repeating it back: "Great, so we have {name} confirmed for [day] at [time] — is that correct?"
6. **Close**: Get recruiter's name and direct number. Confirm the scheduled meeting time before hanging up.
7. **Voicemail**: Leave a brief professional message with {name}'s name, experience summary, and ask for a callback.

## Hard Rules
- Never invent qualifications not listed above
- If asked something you don't know, say "I'd need to confirm that with {name} directly"
- ALWAYS try to schedule a specific meeting time when the recruiter shows interest — do not end the call without a confirmed time
- Repeat the confirmed day and time back to the recruiter before hanging up
- Always get the recruiter's name and direct number before hanging up
- Keep the call under 3 minutes unless the recruiter is engaged
- If they say the position is filled, ask: "Do you have any similar openings coming up that might be a good fit for {name}?"

## Voicemail Script
"Hi, this message is for the recruiting team at {carrier}. I'm calling on behalf of {name}, an experienced CDL driver with {exp} of experience. {name} holds a {licenses} license{', with ' + endorsements + ' endorsements' if endorsements else ''} and has a clean record. They are very interested in your {job_title} position and looking for {home_req + ' home time' if home_req else 'a great opportunity'}. Please give us a callback at your earliest convenience. Thank you."
"""


# ── Dispatch ──────────────────────────────────────────────────────────────────
async def dispatch_call(
    recruiter_phone: str,
    outreach_record_id: str,
    outreach_record: dict,
    webhook_url: Optional[str] = None,
    profile_data: Optional[dict] = None,
    rules_data: Optional[dict] = None,
    voice: str = "nat",
    max_duration: int = 120,
) -> dict:
    if profile_data is None:
        profile_data = load_profile().model_dump()
    if rules_data is None:
        rules_data = load_rules().model_dump()

    for f in ["licenses_held","licenses_obtaining","endorsements","freight_current","freight_interested"]:
        if isinstance(profile_data.get(f), str):
            try: profile_data[f] = json.loads(profile_data[f])
            except: profile_data[f] = []
        elif profile_data.get(f) is None:
            profile_data[f] = []

    prompt  = build_call_prompt(profile_data, rules_data, outreach_record)
    carrier = outreach_record.get("carrier_name", "the carrier")
    name    = profile_data.get("name") or f"{profile_data.get('first_name','')} {profile_data.get('last_name','')}".strip() or "Driver"

    print(f"[Voice] Dispatching call — voice='{voice}' max_duration={max_duration}s carrier={carrier}")

    payload = {
        "phone_number": recruiter_phone,
        "task": prompt,
        "model": "enhanced",
        "language": "en",
        "voice": voice,
        "voice_id": voice,
        "voice_settings": {"stability": 0.65, "similarity_boost": 0.8, "speed": 0.95},
        "max_duration": max_duration,
        "answered_by_enabled": True,
        "wait_for_greeting": True,
        "record": True,
        "amd": True,
        "interruption_threshold": 120,
        "temperature": 0.7,
        "metadata": {
            "outreach_record_id": outreach_record_id,
            "user_id": str(outreach_record.get("user_id", "")),
            "carrier": carrier,
            "driver": name,
        },
    }
    if BLAND_PHONE_NUMBER:
        payload["from"] = BLAND_PHONE_NUMBER
    effective_webhook = webhook_url or WEBHOOK_BASE_URL
    if effective_webhook:
        payload["webhook"] = f"{effective_webhook.rstrip('/')}/api/voice/webhook"

    async with httpx.AsyncClient(timeout=30) as client:
        resp = await client.post(f"{BLAND_API_BASE}/calls", headers=get_headers(), json=payload)
        resp.raise_for_status()
        result = resp.json()
        print(f"[Voice] Bland dispatch response: {result}")

    call_id = result.get("call_id", "")

    try:
        from db.database import db as db_ctx
        with db_ctx() as cur:
            cur.execute("SELECT user_id FROM outreach_log WHERE id = %s", (outreach_record_id,))
            row = cur.fetchone()
            uid = list(row.values())[0] if row else 0
            if uid:
                cur.execute("""
                    INSERT INTO call_log (user_id, call_id, outreach_record_id, carrier, recruiter_phone, driver_name, status)
                    VALUES (%s, %s, %s, %s, %s, %s, 'dispatched')
                """, (uid, call_id, outreach_record_id, carrier, recruiter_phone, name))
    except Exception as e:
        print(f"[Voice] MySQL call_log write failed: {e}")

    _db_update_outreach(outreach_record_id, {
        "status": "contacted",
        "channel": "voice",
        "contacted_at": datetime.now(timezone.utc),
        "outcome_notes": f"Call dispatched. Call ID: {call_id}",
    })

    return {"success": True, "call_id": call_id, "status": "dispatched"}


# ── Fetch call from Bland AI ──────────────────────────────────────────────────
async def get_call_status(call_id: str) -> dict:
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(f"{BLAND_API_BASE}/calls/{call_id}", headers=get_headers())
        resp.raise_for_status()
        return resp.json()


async def fetch_and_analyze(call_id: str, outreach_record_id: str) -> dict:
    data = await get_call_status(call_id)

    print(f"[Voice] Bland AI response keys: {list(data.keys())}")
    print(f"[Voice] status={data.get('status')} answered_by={data.get('answered_by')} length={data.get('call_length')}")

    transcript = data.get("concatenated_transcript") or ""
    if not transcript and data.get("transcripts"):
        parts = data["transcripts"]
        if isinstance(parts, list):
            transcript = " ".join(t.get("text", "") for t in parts if isinstance(t, dict))

    bland_summary = data.get("summary") or ""
    raw_length    = data.get("call_length") or data.get("corrected_duration") or 0
    duration      = int(float(raw_length) * 60) if raw_length else 0

    recording_url = data.get("recording_url")
    if recording_url is True or recording_url == "true":
        try:
            async with httpx.AsyncClient(timeout=10) as client:
                rec_resp = await client.get(
                    f"{BLAND_API_BASE}/calls/{call_id}/recording",
                    headers=get_headers()
                )
                if rec_resp.status_code == 200:
                    rec_data = rec_resp.json()
                    recording_url = rec_data.get("url") or rec_data.get("recording_url") or ""
                else:
                    recording_url = ""
        except Exception as e:
            print(f"[Voice] Recording fetch failed: {e}")
            recording_url = ""
    elif not isinstance(recording_url, str):
        recording_url = ""

    answered_by = data.get("answered_by") or ""
    status      = data.get("status") or ""

    print(f"[Voice] transcript_len={len(transcript)} recording_url={recording_url[:40] if recording_url else 'none'} duration={duration}s")

    result = {
        "transcript":    transcript,
        "duration":      duration,
        "recording_url": recording_url,
        "answered_by":   answered_by,
        "bland_status":  status,
        "bland_summary": bland_summary,
    }

    _db_update_call_log(call_id, {
        "duration_seconds": duration,
        "transcript":       transcript[:5000] if transcript else "",
        "summary":          bland_summary[:500] if bland_summary else "",
        "status":           "completed" if status in ("completed","ended") else (status or "dispatched"),
    })

    if recording_url:
        try:
            _db_update_outreach(outreach_record_id, {"recording_url": recording_url, "call_duration_seconds": duration})
        except Exception:
            _db_update_outreach(outreach_record_id, {"call_duration_seconds": duration})
    else:
        _db_update_outreach(outreach_record_id, {"call_duration_seconds": duration})

    if transcript and len(transcript.strip()) > 30:
        analysis = await analyze_call_transcript(call_id, outreach_record_id, transcript)
        result.update(analysis)
        if bland_summary and not result.get("summary"):
            result["summary"] = bland_summary
    elif bland_summary:
        result["summary"] = bland_summary
        result["outcome"] = answered_by if answered_by else "completed"
        _db_update_outreach(outreach_record_id, {
            "outcome_notes": bland_summary,
            "call_summary":  bland_summary,
        })
        _db_update_call_log(call_id, {"summary": bland_summary[:500], "status": "completed"})
    else:
        if answered_by == "voicemail":
            msg = "Voicemail left — awaiting callback."
        elif status in ("completed","ended"):
            msg = "Call completed — transcript not yet available. Try again in 1-2 minutes."
        else:
            msg = f"Call status: {status}. Try again shortly."
        result["summary"] = msg
        result["outcome"] = answered_by or "pending"
        _db_update_outreach(outreach_record_id, {"outcome_notes": msg})

    return result


# ── Claude transcript analysis ────────────────────────────────────────────────
async def analyze_call_transcript(call_id: str, outreach_record_id: str, transcript: str) -> dict:
    if not transcript or len(transcript) < 50:
        return {"outcome": "unknown", "summary": "No transcript available"}

    message = get_claude_client().messages.create(
        model="claude-opus-4-5",
        max_tokens=1000,
        system="""You analyze CDL trucking recruiter call transcripts.
Return ONLY a JSON object — no markdown, no extra text:
{
  "outcome": "interested|callback_scheduled|meeting_scheduled|not_interested|voicemail|no_answer",
  "recruiter_name": "name or empty string",
  "callback_number": "phone or empty string",
  "callback_time": "time/date or empty string",
  "meeting_scheduled": false,
  "meeting_datetime": null,
  "meeting_datetime_iso": null,
  "meeting_notes": "any details about the meeting or empty string",
  "offered_cpm": null or number,
  "offered_weekly": null or number,
  "home_time_mentioned": "what they said or empty string",
  "summary": "2-3 sentence plain English summary of the full call",
  "follow_up_action": "specific next step the driver should take"
}

CRITICAL — meeting_scheduled detection rules:
- Set meeting_scheduled TRUE only when a SPECIFIC day AND time were explicitly agreed upon
- Examples that ARE scheduled: "Let's talk Tuesday at 2pm", "How about Thursday at 10am?", "I can call Friday at 3:30"
- Examples that are NOT scheduled: "call us back sometime", "we'll be in touch", "maybe next week"
- When meeting_scheduled is true, set outcome to "meeting_scheduled"
- Set meeting_datetime to human readable e.g. "Tuesday, April 8 at 2:00 PM"
- Set meeting_datetime_iso to ISO 8601 e.g. "2026-04-08T14:00:00" if determinable, else null
""",
        messages=[{
            "role": "user",
            "content": f"Today's date: {datetime.now().strftime('%A, %B %d, %Y')}\n\nTranscript:\n\n{transcript[:4000]}"
        }]
    )

    raw = message.content[0].text.strip().lstrip("```json").lstrip("```").rstrip("```").strip()
    try:
        analysis = json.loads(raw)
    except:
        analysis = {
            "outcome": "unknown", "summary": raw[:400],
            "recruiter_name": "", "callback_number": "",
            "meeting_scheduled": False, "meeting_datetime": None,
            "meeting_datetime_iso": None, "meeting_notes": "",
        }

    outcome_map = {
        "interested":        "interested",
        "meeting_scheduled": "scheduled",
        "callback_scheduled":"callback",
        "not_interested":    "rejected",
        "voicemail":         "contacted",
        "no_answer":         "contacted",
    }
    status = outcome_map.get(analysis.get("outcome", ""), "contacted")

    outreach_updates = {
        "status":        status,
        "call_summary":  analysis.get("summary", ""),
        "outcome_notes": analysis.get("summary", ""),
    }

    if analysis.get("recruiter_name"):  outreach_updates["recruiter_name"]  = analysis["recruiter_name"]
    if analysis.get("callback_number"): outreach_updates["recruiter_phone"] = analysis["callback_number"]
    if analysis.get("offered_cpm"):     outreach_updates["offer_cpm"]       = analysis["offered_cpm"]
    if analysis.get("offered_weekly"):  outreach_updates["offer_weekly"]     = analysis["offered_weekly"]
    if analysis.get("callback_time"):   outreach_updates["follow_up_date"]  = analysis["callback_time"]

    # ── Meeting scheduling ────────────────────────────────────────────────────
    if analysis.get("meeting_scheduled"):
        meeting_notes = analysis.get("meeting_notes", "") or ""
        if analysis.get("meeting_datetime"):
            prefix = f"Meeting scheduled: {analysis['meeting_datetime']}"
            meeting_notes = prefix + (f"\n{meeting_notes}" if meeting_notes else "")

        outreach_updates["meeting_notes"] = meeting_notes

        iso = analysis.get("meeting_datetime_iso")
        if iso:
            try:
                iso_clean = iso.replace("Z", "").split("+")[0].split("-")[0] if "T" in iso else iso
                dt = datetime.fromisoformat(iso.replace("Z", ""))
                dt = dt.replace(tzinfo=None)
                outreach_updates["scheduled_at"] = dt
                print(f"[Voice] Meeting scheduled at {dt} for record {outreach_record_id}")
            except Exception as e:
                print(f"[Voice] Could not parse ISO '{iso}': {e}")
                outreach_updates["scheduled_at"] = None
        else:
            outreach_updates["scheduled_at"] = None

        print(f"[Voice] Meeting detected — status=scheduled notes='{meeting_notes}'")

    _db_update_outreach(outreach_record_id, outreach_updates)
    _db_update_call_log(call_id, {
        "outcome":        analysis.get("outcome", ""),
        "summary":        analysis.get("summary", ""),
        "recruiter_name": analysis.get("recruiter_name", ""),
        "status":         "completed",
    })

    return analysis


# ── Legacy JSON call log ──────────────────────────────────────────────────────
def _load_call_log() -> list:
    if CALL_LOG_PATH.exists():
        try: return json.loads(CALL_LOG_PATH.read_text())
        except: return []
    return []

def load_call_log(user_id: int = 0) -> list:
    if user_id:
        return _db_get_call_log(user_id)
    return _load_call_log()