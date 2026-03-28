import anthropic
from fastapi import APIRouter, HTTPException, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
import json

from db.database import db, row_to_dict
from db.auth import get_current_user
from agent.rules import AgentRules, rules_to_prompt_section

router = APIRouter()
client = anthropic.Anthropic()

MODES = {
    "recruiter": {
        "label": "Answer Recruiter Questions",
        "instruction": "You are answering questions from a recruiter on behalf of the driver. Be professional, concise, and compelling.",
    },
    "skill_gap": {
        "label": "Skill Gap Analysis",
        "instruction": "Analyze the driver's profile against job requirements. List matching skills, identify gaps, and suggest steps to improve.",
    },
    "interview_prep": {
        "label": "Interview Prep",
        "instruction": "Help the driver prepare for interviews. Generate likely questions, provide model answers based on their experience, and coach on STAR method responses.",
    },
}


def get_profile_for_user(user_id: int) -> dict:
    with db() as cur:
        cur.execute("SELECT * FROM profiles WHERE user_id = %s", (user_id,))
        row = cur.fetchone()
        cur.execute("SELECT first_name, last_name, email, phone FROM users WHERE id = %s", (user_id,))
        user_row = cur.fetchone()
    profile = row_to_dict(row) if row else {}
    user = user_row or {}
    # Parse JSON list fields
    for f in ["licenses_held","licenses_obtaining","endorsements","freight_current","freight_interested"]:
        if isinstance(profile.get(f), str):
            try: profile[f] = json.loads(profile[f])
            except: profile[f] = []
        elif profile.get(f) is None:
            profile[f] = []
    profile["first_name"] = user.get("first_name","")
    profile["last_name"]  = user.get("last_name","")
    profile["email"]      = user.get("email","")
    profile["phone"]      = user.get("phone","")
    profile["name"]       = f"{user.get('first_name','')} {user.get('last_name','')}".strip()
    return profile


def get_rules_for_user(user_id: int) -> AgentRules:
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


def build_system_prompt(profile: dict) -> str:
    name     = profile.get("name") or "the driver"
    exp      = profile.get("cdl_experience","")
    licenses = ", ".join(profile.get("licenses_held",[]))
    freight  = ", ".join(profile.get("freight_current",[]))
    endorse  = ", ".join(profile.get("endorsements",[]))
    driver_type = profile.get("driver_type","")
    zip_code = profile.get("zip_code","")
    violations = profile.get("moving_violations","")
    accidents  = profile.get("preventable_accidents","")
    return f"""You are an AI agent representing {name}, a CDL truck driver.

DRIVER PROFILE:
- Name: {name}
- CDL Experience: {exp}
- Licenses: {licenses}
- Endorsements: {endorse or 'None'}
- Freight experience: {freight or 'Not specified'}
- Driver type seeking: {driver_type}
- Home zip: {zip_code}
- Moving violations (3yr): {violations}
- Preventable accidents (3yr): {accidents}

Always speak as if representing this driver. Be factual and professional."""


class ChatMessage(BaseModel):
    role: str
    content: str


class AgentChatRequest(BaseModel):
    mode: str
    messages: list[ChatMessage]
    job_description: Optional[str] = None


@router.get("/modes")
def get_modes():
    return {"modes": [{"id": k, "label": v["label"]} for k, v in MODES.items()]}


@router.get("/status")
def agent_status(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    profile = get_profile_for_user(user_id)
    rules   = get_rules_for_user(user_id)
    name    = profile.get("name","")
    ready   = bool(profile.get("setup_complete") or profile.get("zip_code") or profile.get("cdl_experience"))
    status_text = name if ready else "Profile incomplete"
    if ready and rules.rules_active:
        status_text = f"{name} · Rules active"
    return {
        "ready": ready,
        "setup_complete": bool(profile.get("setup_complete")),
        "name": status_text,
        "rules_active": rules.rules_active,
    }


@router.post("/chat")
def agent_chat(request: AgentChatRequest, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    profile = get_profile_for_user(user_id)
    rules   = get_rules_for_user(user_id)

    if not profile.get("setup_complete") and not profile.get("name"):
        raise HTTPException(status_code=400, detail="Complete your Driver Profile first.")

    if request.mode not in MODES:
        raise HTTPException(status_code=400, detail=f"Unknown mode: {request.mode}")

    mode_config   = MODES[request.mode]
    base_system   = build_system_prompt(profile)
    rules_section = rules_to_prompt_section(rules)
    system_prompt = f"{base_system}\n\n{rules_section}\n\n=== MODE: {mode_config['label'].upper()} ===\n{mode_config['instruction']}"

    if request.job_description:
        system_prompt += f"\n\n=== JOB DESCRIPTION ===\n{request.job_description[:3000]}"

    messages = [{"role": m.role, "content": m.content} for m in request.messages]

    def stream_response():
        with client.messages.stream(
            model="claude-opus-4-5", max_tokens=1500,
            system=system_prompt, messages=messages,
        ) as stream:
            for text in stream.text_stream:
                yield f"data: {json.dumps({'text': text})}\n\n"
        yield "data: [DONE]\n\n"

    return StreamingResponse(stream_response(), media_type="text/event-stream")
