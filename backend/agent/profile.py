import json
from pathlib import Path
from pydantic import BaseModel

DATA_DIR = Path(__file__).parent.parent / "data"
DATA_DIR.mkdir(exist_ok=True)
PROFILE_PATH = DATA_DIR / "profile.json"


class CandidateProfile(BaseModel):
    # Basic info
    name: str = ""
    first_name: str = ""
    last_name: str = ""
    email: str = ""
    phone: str = ""
    zip_code: str = ""

    # Licenses
    licenses_held: list[str] = []
    licenses_obtaining: list[str] = []

    # Experience
    cdl_experience: str = ""

    # Endorsements
    endorsements: list[str] = []

    # Background
    military_service: str = ""
    moving_violations: str = ""
    preventable_accidents: str = ""

    # Driver type
    driver_type: str = ""
    owner_operator_interest: str = ""
    solo_or_team: str = ""
    team_interest: str = ""

    # Freight
    freight_current: list[str] = []
    freight_interested: list[str] = []

    # Contact
    best_contact_time: str = ""

    # Terms
    agreed_to_terms: str = ""

    # Meta
    setup_complete: bool = False
    raw_resume_text: str = ""

    # Legacy fields kept for agent compatibility
    summary: str = ""
    skills: list[str] = []
    experience: list[dict] = []
    education: list[dict] = []
    certifications: list[str] = []
    preferred_roles: list[str] = []
    preferred_industries: list[str] = []
    work_style: str = ""
    salary_expectation: str = ""
    availability: str = ""
    career_goals: str = ""
    location: str = ""


def load_profile() -> CandidateProfile:
    if PROFILE_PATH.exists():
        data = json.loads(PROFILE_PATH.read_text())
        return CandidateProfile(**data)
    return CandidateProfile()


def save_profile(profile: CandidateProfile):
    PROFILE_PATH.write_text(profile.model_dump_json(indent=2))


def profile_to_system_prompt(profile: CandidateProfile) -> str:
    licenses = ", ".join(profile.licenses_held) if profile.licenses_held else "None listed"
    obtaining = ", ".join(profile.licenses_obtaining) if profile.licenses_obtaining else "None"
    endorsements = ", ".join(profile.endorsements) if profile.endorsements else "None"
    freight_current = ", ".join(profile.freight_current) if profile.freight_current else "Not specified"
    freight_interest = ", ".join(profile.freight_interested) if profile.freight_interested else "Not specified"

    return f"""You are a professional AI agent representing CDL truck driver {profile.name or 'this candidate'}.
Your role is to answer questions on their behalf, help them prepare for recruiter calls, and provide useful analysis about job fit.

=== DRIVER PROFILE ===
Name: {profile.name}
Phone: {profile.phone}
Email: {profile.email}
Zip Code: {profile.zip_code}
Best time to contact: {profile.best_contact_time}

CDL LICENSES HELD: {licenses}
LICENSES IN PROGRESS: {obtaining}
CDL / OTR EXPERIENCE: {profile.cdl_experience}
ENDORSEMENTS: {endorsements}

DRIVER TYPE: {profile.driver_type}
SOLO OR TEAM: {profile.solo_or_team}
INTERESTED IN TEAM DRIVING: {profile.team_interest}
INTERESTED IN OWNER OP / LEASE PURCHASE: {profile.owner_operator_interest}

FREIGHT CURRENTLY HAULS: {freight_current}
FREIGHT INTERESTED IN: {freight_interest}

SAFETY RECORD:
- Moving violations (last 3 years): {profile.moving_violations or 'Not provided'}
- Preventable accidents (last 3 years): {profile.preventable_accidents or 'Not provided'}

MILITARY SERVICE: {profile.military_service or 'Not provided'}

=== BEHAVIORAL GUIDELINES ===
- Speak professionally on behalf of {profile.name or 'the driver'}
- Never fabricate details not listed above
- For recruiter questions, give clear and direct answers
- For job fit analysis, compare the driver's profile honestly against the opportunity
- For interview prep, focus on trucking industry norms and what carriers look for
- Flag any potential concerns (violations, experience gaps) constructively
"""
