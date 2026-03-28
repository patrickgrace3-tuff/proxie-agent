import json
from pathlib import Path
from pydantic import BaseModel
from typing import Optional
from datetime import datetime, timezone
import uuid

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
OUTREACH_PATH = DATA_DIR / "outreach_log.json"
CARRIERS_PATH = DATA_DIR / "carrier_matches.json"


class OutreachRecord(BaseModel):
    id: str = ""
    carrier_name: str = ""
    carrier_id: str = ""
    job_title: str = ""
    job_url: str = ""
    location: str = ""
    cpm: Optional[float] = None
    weekly_pay_estimate: Optional[float] = None
    home_time: str = ""
    freight_types: list[str] = []
    match_score: int = 0
    match_passed: list[str] = []
    match_failed: list[str] = []
    match_warnings: list[str] = []

    # Outreach tracking
    status: str = "pending"        # pending | approved | contacted | callback | interested | rejected | hired | passed
    channel: str = ""              # voice | email | sms
    contacted_at: Optional[str] = None
    last_updated: Optional[str] = None
    recruiter_name: str = ""
    recruiter_phone: str = ""
    recruiter_email: str = ""
    call_duration_seconds: int = 0
    call_summary: str = ""
    outcome_notes: str = ""
    offer_cpm: Optional[float] = None
    offer_weekly: Optional[float] = None
    follow_up_date: Optional[str] = None
    driver_approved: bool = False
    driver_passed: bool = False


def load_outreach_log() -> list[OutreachRecord]:
    if OUTREACH_PATH.exists():
        data = json.loads(OUTREACH_PATH.read_text())
        return [OutreachRecord(**r) for r in data]
    return []


def save_outreach_log(records: list[OutreachRecord]):
    OUTREACH_PATH.write_text(
        json.dumps([r.model_dump() for r in records], indent=2)
    )


def add_outreach_record(record: OutreachRecord) -> OutreachRecord:
    records = load_outreach_log()
    if not record.id:
        record.id = str(uuid.uuid4())[:8]
    record.last_updated = datetime.now(timezone.utc).isoformat()
    records.insert(0, record)
    save_outreach_log(records)
    return record


def update_outreach_record(record_id: str, updates: dict) -> Optional[OutreachRecord]:
    records = load_outreach_log()
    for i, r in enumerate(records):
        if r.id == record_id:
            data = r.model_dump()
            data.update(updates)
            data["last_updated"] = datetime.now(timezone.utc).isoformat()
            records[i] = OutreachRecord(**data)
            save_outreach_log(records)
            return records[i]
    return None


def save_carrier_matches(matches: list[dict]):
    CARRIERS_PATH.write_text(json.dumps(matches, indent=2))


def load_carrier_matches() -> list[dict]:
    if CARRIERS_PATH.exists():
        return json.loads(CARRIERS_PATH.read_text())
    return []


STATUS_LABELS = {
    "pending":   {"label": "Pending Approval", "color": "#718096"},
    "approved":  {"label": "Approved",          "color": "#3182ce"},
    "contacted": {"label": "Contacted",         "color": "#805ad5"},
    "callback":  {"label": "Callback Scheduled","color": "#dd6b20"},
    "interested":{"label": "Interested",        "color": "#38a169"},
    "rejected":  {"label": "Rejected",          "color": "#e53e3e"},
    "hired":     {"label": "Offer Extended",    "color": "#00897b"},
    "passed":    {"label": "Driver Passed",     "color": "#a0aec0"},
}
