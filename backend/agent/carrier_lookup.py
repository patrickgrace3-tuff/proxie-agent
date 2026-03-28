"""
Carrier recruiting number lookup via Claude.

At startup (or on demand), asks Claude to provide driver recruiting numbers
with confidence ratings. Claude is honest about what it knows vs doesn't know.
Numbers marked low/unknown are flagged for manual verification.
"""
import json
import anthropic
from pathlib import Path
from datetime import datetime, timezone

DATA_DIR = Path(__file__).parent.parent / "data"
VERIFIED_NUMBERS_PATH = DATA_DIR / "verified_carrier_numbers.json"

client = anthropic.Anthropic()

CARRIERS_TO_LOOK_UP = [
    "Werner Enterprises",
    "Schneider National",
    "Swift Transportation",
    "J.B. Hunt Transport",
    "Prime Inc.",
    "Heartland Express",
    "Covenant Logistics",
    "Melton Truck Lines",
    "Maverick Transportation",
    "Old Dominion Freight",
    "USA Truck",
    "Knight Transportation",
    "Daseke Inc.",
    "CR England",
    "Western Express",
    "Ruan Transportation",
    "AAA Cooper Transportation",
    "Saia Inc.",
    "Estes Express Lines",
    "Hirschbach Motor Lines",
]

LOOKUP_SYSTEM = """You are a trucking industry reference assistant. A user needs CDL driver recruiting phone numbers for major US carriers.

CRITICAL RULES:
1. Only provide a phone number if you have GENUINE confidence it is correct from your training data
2. If you are not sure, set phone to null — do not guess or fabricate
3. Confidence levels:
   - "high": You have seen this number repeatedly in reliable sources and are very confident it is correct
   - "medium": You have seen this number but are not 100% certain it is still current
   - "low": You have seen a number but have significant uncertainty
   - "unknown": You do not have reliable data for this carrier's recruiting line
4. Return ONLY a valid JSON array with no markdown fences, no explanation, no text outside the JSON
5. Include a brief honest note for each entry explaining your confidence basis

JSON format:
[
  {
    "carrier": "Carrier Name",
    "phone": "+1XXXXXXXXXX",
    "confidence": "high|medium|low|unknown",
    "note": "Brief honest note about this number"
  }
]

If confidence is low or unknown, set phone to null."""


async def lookup_recruiting_numbers(force_refresh: bool = False) -> dict:
    """
    Ask Claude to look up recruiting numbers for all carriers.
    Caches results. Returns dict of carrier_name -> {phone, confidence, note}.
    """
    # Use cached if available and not forcing refresh
    if not force_refresh and VERIFIED_NUMBERS_PATH.exists():
        cached = json.loads(VERIFIED_NUMBERS_PATH.read_text())
        print(f"[CarrierLookup] Using cached numbers ({len(cached.get('carriers', {}))} carriers)")
        return cached

    print(f"[CarrierLookup] Asking Claude for recruiting numbers...")

    carrier_list = "\n".join(f"- {c}" for c in CARRIERS_TO_LOOK_UP)
    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=3000,
        system=LOOKUP_SYSTEM,
        messages=[{
            "role": "user",
            "content": f"Please provide the main CDL driver recruiting phone numbers for these carriers:\n\n{carrier_list}\n\nRemember: only provide numbers you genuinely know. null is better than a wrong number."
        }]
    )

    raw = message.content[0].text.strip()

    # Strip markdown fences if present
    if "```" in raw:
        lines = raw.split("\n")
        raw = "\n".join(l for l in lines if not l.startswith("```"))

    try:
        entries = json.loads(raw)
    except json.JSONDecodeError:
        print(f"[CarrierLookup] JSON parse failed: {raw[:200]}")
        return {"carriers": {}, "error": "parse_failed", "fetched_at": datetime.now(timezone.utc).isoformat()}

    # Build lookup dict
    carrier_map = {}
    for entry in entries:
        name = entry.get("carrier", "")
        phone = entry.get("phone")
        confidence = entry.get("confidence", "unknown")
        note = entry.get("note", "")

        # Normalize phone format
        if phone:
            digits = "".join(c for c in phone if c.isdigit())
            if len(digits) == 10:
                phone = f"+1{digits}"
            elif len(digits) == 11 and digits.startswith("1"):
                phone = f"+{digits}"
            else:
                phone = None  # malformed, treat as unknown

        carrier_map[name] = {
            "phone": phone,
            "confidence": confidence,
            "note": note,
            "usable": phone is not None and confidence in ("high", "medium"),
        }

        status = f"{phone} ({confidence})" if phone else f"null ({confidence})"
        print(f"[CarrierLookup] {name}: {status} — {note}")

    result = {
        "carriers": carrier_map,
        "fetched_at": datetime.now(timezone.utc).isoformat(),
        "model": "claude-opus-4-5",
        "total": len(carrier_map),
        "usable": sum(1 for v in carrier_map.values() if v["usable"]),
    }

    DATA_DIR.mkdir(exist_ok=True)
    VERIFIED_NUMBERS_PATH.write_text(json.dumps(result, indent=2))
    print(f"[CarrierLookup] Done: {result['usable']}/{result['total']} usable numbers")
    return result


def get_cached_number(carrier_name: str) -> dict:
    """Get a single carrier's number from cache. Returns empty dict if not found."""
    if not VERIFIED_NUMBERS_PATH.exists():
        return {}
    try:
        data = json.loads(VERIFIED_NUMBERS_PATH.read_text())
        return data.get("carriers", {}).get(carrier_name, {})
    except Exception:
        return {}


def load_all_cached() -> dict:
    """Load full cached lookup result."""
    if not VERIFIED_NUMBERS_PATH.exists():
        return {"carriers": {}, "fetched_at": None}
    try:
        return json.loads(VERIFIED_NUMBERS_PATH.read_text())
    except Exception:
        return {"carriers": {}, "fetched_at": None}
