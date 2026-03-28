import json
from agent.geo import carrier_location_in_radius, get_state_for_zip, states_within_radius
from pathlib import Path
from pydantic import BaseModel
from typing import Optional

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
RULES_PATH = DATA_DIR / "rules.json"


class AgentRules(BaseModel):
    # ── Pay requirements ──
    min_cpm: Optional[float] = None          # cents per mile
    min_weekly_gross: Optional[float] = None  # dollars
    pay_types_accepted: list[str] = []        # ["CPM", "Percentage", "Hourly", "Salary"]

    # ── Home time ──
    home_time_requirement: str = ""           # "Daily", "Weekly", "Bi-Weekly", "Regional OTR"
    max_days_out: Optional[int] = None        # max consecutive days away

    # ── Geography ──
    geography_mode: str = "radius"            # "radius" | "statewide" | "regions"
    home_zip: str = ""                        # driver home zip (auto-filled from profile)
    radius_miles: Optional[int] = None       # miles from home zip
    statewide_only: bool = False              # only carriers in driver's home state
    preferred_regions: list[str] = []         # legacy region filter
    states_blacklist: list[str] = []          # states to never operate in
    max_radius_from_home: Optional[int] = None  # legacy field

    # ── Load preferences ──
    no_touch_freight_required: bool = False
    drop_and_hook_preferred: bool = False
    team_driving_ok: bool = False
    hazmat_ok: bool = False
    overnights_ok: bool = True

    # ── Company requirements ──
    min_company_age_years: Optional[int] = None   # years in business
    min_fleet_size: Optional[int] = None           # number of trucks
    requires_benefits: bool = False
    requires_401k: bool = False
    requires_health_insurance: bool = False
    pet_policy_required: bool = False
    rider_policy_required: bool = False

    # ── Outreach behavior ──
    auto_call_enabled: bool = False           # allow agent to make calls autonomously
    auto_email_enabled: bool = False          # allow agent to send emails
    require_approval_before_call: bool = True # always ask driver first
    max_outreach_per_day: int = 5             # cap daily contacts
    blacklisted_carriers: list[str] = []      # carrier names to never contact
    preferred_carriers: list[str] = []        # contact these first

    # ── Deal breakers (auto-reject if any true) ──
    reject_if_no_sign_on_bonus: bool = False
    reject_if_forced_dispatch: bool = False
    reject_if_no_ELD_provided: bool = False
    reject_if_lease_purchase_only: bool = False

    # ── Meta ──
    rules_active: bool = False
    rules_version: int = 1


def load_rules() -> AgentRules:
    if RULES_PATH.exists():
        data = json.loads(RULES_PATH.read_text())
        return AgentRules(**data)
    return AgentRules()


def save_rules(rules: AgentRules):
    RULES_PATH.write_text(rules.model_dump_json(indent=2))


def rules_to_prompt_section(rules: AgentRules) -> str:
    if not rules.rules_active:
        return "No agent rules configured — do not contact carriers autonomously."

    lines = ["=== AGENT DEPLOYMENT RULES ===",
             "Only engage with carriers that satisfy ALL of the following:"]

    if rules.min_cpm:
        lines.append(f"- Minimum pay: {rules.min_cpm}¢ per mile")
    if rules.min_weekly_gross:
        lines.append(f"- Minimum weekly gross: ${rules.min_weekly_gross:,.0f}")
    if rules.pay_types_accepted:
        lines.append(f"- Accepted pay types: {', '.join(rules.pay_types_accepted)}")
    if rules.home_time_requirement:
        lines.append(f"- Home time: {rules.home_time_requirement}")
    if rules.max_days_out:
        lines.append(f"- Max days out consecutively: {rules.max_days_out}")
    if rules.home_zip:
        if rules.statewide_only:
            from agent.geo import get_state_for_zip
            state = get_state_for_zip(rules.home_zip) or "home state"
            lines.append(f"- Geography: {state} statewide only (home zip {rules.home_zip})")
        elif rules.radius_miles:
            lines.append(f"- Geography: within {rules.radius_miles} miles of zip {rules.home_zip}")
    if rules.preferred_regions:
        lines.append(f"- Preferred regions: {', '.join(rules.preferred_regions)}")
    if rules.states_blacklist:
        lines.append(f"- NEVER operate in: {', '.join(rules.states_blacklist)}")
    if rules.no_touch_freight_required:
        lines.append("- No-touch freight required")
    if rules.drop_and_hook_preferred:
        lines.append("- Drop-and-hook preferred")
    if not rules.hazmat_ok:
        lines.append("- No hazmat loads")
    if rules.requires_benefits:
        lines.append("- Benefits package required")
    if rules.requires_health_insurance:
        lines.append("- Health insurance required")
    if rules.reject_if_forced_dispatch:
        lines.append("- REJECT any carrier with forced dispatch")
    if rules.reject_if_lease_purchase_only:
        lines.append("- REJECT lease-purchase-only arrangements")
    if rules.blacklisted_carriers:
        lines.append(f"- NEVER contact: {', '.join(rules.blacklisted_carriers)}")
    if rules.preferred_carriers:
        lines.append(f"- Prioritize outreach to: {', '.join(rules.preferred_carriers)}")

    lines.append(f"\nOutreach limits: max {rules.max_outreach_per_day} contacts/day")
    lines.append(f"Auto-call: {'enabled' if rules.auto_call_enabled else 'disabled — requires driver approval'}")
    lines.append(f"Auto-email: {'enabled' if rules.auto_email_enabled else 'disabled'}")

    return "\n".join(lines)


def score_carrier_against_rules(carrier: dict, rules: AgentRules) -> dict:
    """Score a carrier listing against the driver's rules. Returns score 0-100 + reasons."""
    score = 100
    passed = []
    failed = []
    warnings = []

    cpm = carrier.get("cpm")
    if rules.min_cpm and cpm:
        if cpm < rules.min_cpm:
            failed.append(f"Pay {cpm}¢/mi below minimum {rules.min_cpm}¢/mi")
            score -= 40
        else:
            passed.append(f"Pay {cpm}¢/mi meets minimum")

    carrier_states = carrier.get("operating_states", [])
    carrier_location = carrier.get("location", "")

    # Blacklisted states
    blacklisted = [s for s in carrier_states if s in rules.states_blacklist]
    if blacklisted:
        failed.append(f"Operates in blacklisted states: {', '.join(blacklisted)}")
        score -= 30

    # Geography radius / statewide check
    home_zip = rules.home_zip or ""
    home_state = get_state_for_zip(home_zip) if home_zip else ""

    if home_zip and (rules.radius_miles or rules.statewide_only):
        geo_ok, geo_reason = carrier_location_in_radius(
            carrier_location=carrier_location,
            carrier_states=carrier_states,
            center_zip=home_zip,
            radius_miles=rules.radius_miles if not rules.statewide_only else None,
            state_wide=rules.statewide_only,
            home_state=home_state or "",
        )
        if geo_ok:
            passed.append(geo_reason)
        else:
            failed.append(geo_reason)
            score -= 35

    if rules.no_touch_freight_required and not carrier.get("no_touch"):
        failed.append("No-touch freight not guaranteed")
        score -= 20

    if rules.reject_if_forced_dispatch and carrier.get("forced_dispatch"):
        failed.append("Forced dispatch policy — auto-rejected")
        score = 0

    if rules.reject_if_lease_purchase_only and carrier.get("lease_only"):
        failed.append("Lease-purchase only — auto-rejected")
        score = 0

    carrier_name = carrier.get("name", "")
    if carrier_name in rules.blacklisted_carriers:
        failed.append(f"{carrier_name} is blacklisted")
        score = 0

    if carrier_name in rules.preferred_carriers:
        passed.append("Preferred carrier — priority outreach")
        score = min(100, score + 10)

    if rules.requires_health_insurance and not carrier.get("health_insurance"):
        warnings.append("Health insurance not confirmed")
        score -= 10

    if rules.requires_401k and not carrier.get("retirement_plan"):
        warnings.append("401k not confirmed")
        score -= 5

    return {
        "score": max(0, score),
        "passed": passed,
        "failed": failed,
        "warnings": warnings,
        "eligible": score > 0 and len(failed) == 0,
    }
