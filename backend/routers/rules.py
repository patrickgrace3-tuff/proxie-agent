from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
import json, anthropic

from db.database import db, row_to_dict
from db.auth import get_current_user
from agent.rules import AgentRules, score_carrier_against_rules, rules_to_prompt_section


router = APIRouter()
client = anthropic.Anthropic()


def load_rules_for_user(user_id: int) -> AgentRules:
    """Load rules from MySQL for a specific user."""
    with db() as cur:
        cur.execute("SELECT * FROM agent_rules WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
    if not row:
        return AgentRules()
    r = row_to_dict(row)
    # Parse JSON list fields
    for f in ["pay_types_accepted","preferred_regions","states_blacklist","blacklisted_carriers","preferred_carriers"]:
        if isinstance(r.get(f), str):
            try: r[f] = json.loads(r[f])
            except: r[f] = []
        elif r.get(f) is None:
            r[f] = []
    # Convert tinyint bools
    for f in ["statewide_only","no_touch_freight_required","drop_and_hook_preferred","team_driving_ok",
              "hazmat_ok","overnights_ok","requires_benefits","requires_401k","requires_health_insurance",
              "pet_policy_required","rider_policy_required","auto_call_enabled","auto_email_enabled",
              "require_approval_before_call","reject_if_forced_dispatch","reject_if_lease_purchase_only",
              "reject_if_no_ELD_provided","reject_if_no_sign_on_bonus","rules_active"]:
        if f in r:
            r[f] = bool(r[f])
    return AgentRules(**{k: v for k, v in r.items() if k in AgentRules.model_fields})


# Columns that actually exist in the agent_rules MySQL table
AGENT_RULES_DB_FIELDS = {
    "min_cpm","min_weekly_gross","pay_types_accepted","home_time_requirement",
    "max_days_out","geography_mode","home_zip","radius_miles","statewide_only",
    "preferred_regions","states_blacklist","no_touch_freight_required",
    "drop_and_hook_preferred","team_driving_ok","hazmat_ok","overnights_ok",
    "requires_benefits","requires_401k","requires_health_insurance",
    "pet_policy_required","rider_policy_required","min_fleet_size",
    "auto_call_enabled","auto_email_enabled","require_approval_before_call",
    "max_outreach_per_day","blacklisted_carriers","preferred_carriers",
    "reject_if_forced_dispatch","reject_if_lease_purchase_only",
    "reject_if_no_ELD_provided","reject_if_no_sign_on_bonus","rules_active",
}
JSON_FIELDS = {"pay_types_accepted","preferred_regions","states_blacklist","blacklisted_carriers","preferred_carriers"}

def save_rules_for_user(user_id: int, rules: AgentRules):
    """Save rules to PostgreSQL — insert if not exists, update if exists."""
    d = rules.model_dump()
    row = {}
    for k, v in d.items():
        if k not in AGENT_RULES_DB_FIELDS:
            continue
        if k in JSON_FIELDS:
            row[k] = json.dumps(v if v is not None else [])
        else:
            row[k] = v

    with db() as cur:
        # Check if row exists
        cur.execute("SELECT id FROM agent_rules WHERE user_id = %s", (user_id,))
        exists = cur.fetchone()

        if exists:
            set_clause = ", ".join(f"{k} = %s" for k in row)
            cur.execute(
                f"UPDATE agent_rules SET {set_clause} WHERE user_id = %s",
                list(row.values()) + [user_id]
            )
        else:
            row["user_id"] = user_id
            cols = ", ".join(row.keys())
            placeholders = ", ".join(["%s"] * len(row))
            cur.execute(
                f"INSERT INTO agent_rules ({cols}) VALUES ({placeholders})",
                list(row.values())
            )


@router.get("/")
def get_rules(user: dict = Depends(get_current_user)):
    return load_rules_for_user(int(user["sub"])).model_dump()


@router.post("/save")
def save_rules_endpoint(rules: AgentRules, user: dict = Depends(get_current_user)):
    save_rules_for_user(int(user["sub"]), rules)
    return {"success": True, "rules": rules.model_dump()}


@router.post("/activate")
def activate_rules(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    rules = load_rules_for_user(user_id)
    rules.rules_active = True
    save_rules_for_user(user_id, rules)
    return {"success": True, "active": True}


@router.post("/deactivate")
def deactivate_rules(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    rules = load_rules_for_user(user_id)
    rules.rules_active = False
    save_rules_for_user(user_id, rules)
    return {"success": True, "active": False}


@router.get("/status")
def rules_status(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    rules = load_rules_for_user(user_id)
    return {
        "active": rules.rules_active,
        "min_cpm": rules.min_cpm,
        "home_time": rules.home_time_requirement,
        "max_per_day": rules.max_outreach_per_day,
        "require_approval": rules.require_approval_before_call,
    }


class CarrierScoreRequest(BaseModel):
    carriers: list[dict]

@router.post("/score")
def score_carriers(request: CarrierScoreRequest, user: dict = Depends(get_current_user)):
    rules = load_rules_for_user(int(user["sub"]))
    results = []
    for carrier in request.carriers:
        match = score_carrier_against_rules(carrier, rules)
        results.append({"carrier": carrier.get("name"), **match})
    return {"results": results}


class RulesAnalysisRequest(BaseModel):
    rules: dict
    context: str = ""

@router.post("/analyze")
def analyze_rules(request: RulesAnalysisRequest, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("SELECT * FROM profiles WHERE user_id = %s", (user_id,))
        profile_row = row_to_dict(cur.fetchone()) or {}
    rules = AgentRules(**{k: v for k, v in request.rules.items() if k in AgentRules.model_fields})
    rules_text = rules_to_prompt_section(rules)
    # profile available in profile_row dict if needed
    from fastapi.responses import StreamingResponse
    stream = client.messages.stream(
        model="claude-opus-4-5", max_tokens=800,
        system="You are an expert CDL recruiting advisor. Analyze the driver rules and give honest specific feedback.",
        messages=[{"role":"user","content":f"Analyze these agent rules:\n{rules_text}\n\n{request.context}"}]
    )
    def gen():
        with stream as s:
            for text in s.text_stream:
                yield text
    return StreamingResponse(gen(), media_type="text/plain")
