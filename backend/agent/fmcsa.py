"""
FMCSA QCMobile API integration.
Uses Claude to identify the correct DOT number, then fetches full safety data.
"""
import httpx
import asyncio
import json
from typing import Optional

FMCSA_BASE = "https://mobile.fmcsa.dot.gov/qc/services"
FMCSA_WEBKEY: str = ""

_claude_client = None

def get_claude_client():
    global _claude_client
    if _claude_client is None:
        import anthropic
        _claude_client = anthropic.Anthropic()
    return _claude_client


async def _fmcsa_get(client: httpx.AsyncClient, path: str) -> Optional[dict]:
    """Single FMCSA API call."""
    try:
        url = f"{FMCSA_BASE}{path}?webKey={FMCSA_WEBKEY}"
        r = await client.get(url, headers={"Accept": "application/json"}, timeout=10)
        if r.status_code == 200:
            return r.json()
    except Exception as e:
        print(f"[FMCSA] GET {path} error: {e}")
    return None


def _int(v) -> int:
    try:
        return int(v or 0)
    except Exception:
        return 0


def _pct(v) -> float:
    try:
        return float(v or 0)
    except Exception:
        return 0.0


async def search_fmcsa_by_name(carrier_name: str, client: httpx.AsyncClient) -> list:
    """
    Search FMCSA by carrier name, return up to 10 candidates with name + DOT.
    Tries variations of the name to maximize results.
    """
    candidates = []
    seen_dots = set()

    # Build search variants — full name, first word(s), stripped suffixes
    import re
    variants = [carrier_name]
    words = carrier_name.split()
    if len(words) > 1:
        variants.append(words[0])                      # "All"
    if len(words) > 2:
        variants.append(" ".join(words[:2]))           # "All My"
        variants.append(" ".join(words[:3]))           # "All My Sons"
    # Strip common suffixes
    cleaned = re.sub(r'\b(Inc\.?|LLC\.?|Ltd\.?|Corp\.?|Co\.?|Moving|Storage|Trucking|Transportation|Freight|Logistics)\b', '', carrier_name, flags=re.IGNORECASE).strip(" ,.")
    if cleaned and cleaned != carrier_name:
        variants.append(cleaned)

    for name in variants:
        name = name.strip()
        if not name or len(name) < 3:
            continue
        data = await _fmcsa_get(client, f"/carriers/name/{name}")
        if not data:
            continue
        for item in (data.get("content", []) or []):
            c = item.get("carrier", {}) if isinstance(item, dict) else {}
            dot = str(c.get("dotNumber", "")).strip()
            if not dot or dot in seen_dots:
                continue
            seen_dots.add(dot)
            candidates.append({
                "dot": dot,
                "legal_name": c.get("legalName", ""),
                "dba_name": c.get("dbaName", ""),
                "state": c.get("phyState", ""),
                "city": c.get("phyCity", ""),
            })
        if len(candidates) >= 15:
            break

    return candidates


async def resolve_dot_via_claude(carrier_name: str, candidates: list) -> Optional[str]:
    """
    Give Claude the real FMCSA candidate list and ask it to pick the best match.
    This is far more accurate than guessing from training data.
    """
    if not candidates:
        return None
    try:
        # Format candidate list for Claude
        lines = []
        for i, c in enumerate(candidates[:15], 1):
            dba = f" (DBA: {c['dba_name']})" if c.get("dba_name") else ""
            loc = f" — {c['city']}, {c['state']}" if c.get("city") else ""
            lines.append(f"{i}. DOT# {c['dot']} | {c['legal_name']}{dba}{loc}")
        candidate_text = "\n".join(lines)

        client = get_claude_client()
        msg = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=100,
            system="""You are a trucking industry expert helping identify the correct FMCSA carrier record.
Given a carrier name we are looking for and a list of FMCSA candidates, pick the single best match.

Rules:
- Pick the largest, most established, or most nationally known version of the company
- Prefer companies that match the full name over partial matches
- If it is a franchise or chain (like a moving company), prefer the parent/main entity
- Return ONLY the DOT number of your best match as a plain integer
- If none are a reasonable match, return: UNKNOWN""",
            messages=[{
                "role": "user",
                "content": f"We are looking for: '{carrier_name}'\n\nFMCSA candidates:\n{candidate_text}\n\nBest matching DOT number:"
            }]
        )
        result = msg.content[0].text.strip().replace(",", "").replace(".", "").strip()
        # Extract just the number if Claude added extra text
        import re
        match = re.search(r'\b(\d{5,8})\b', result)
        if match:
            dot = match.group(1)
            print(f"[FMCSA] Claude picked DOT {dot} from {len(candidates)} candidates for: {carrier_name}")
            return dot
        if result.upper() == "UNKNOWN":
            print(f"[FMCSA] Claude said UNKNOWN from candidates for: {carrier_name}")
            return None
        print(f"[FMCSA] Claude gave unexpected response: {result}")
        return None
    except Exception as e:
        print(f"[FMCSA] Claude pick error: {e}")
        return None


async def verify_dot_match(carrier_name: str, dot: str, fmcsa_legal_name: str, fmcsa_dba_name: str) -> bool:
    """
    Step 2: Ask Claude to confirm the FMCSA record actually matches the carrier we searched for.
    Prevents returning data for a similarly-named but wrong company.
    """
    if not fmcsa_legal_name:
        return False
    try:
        client = get_claude_client()
        msg = client.messages.create(
            model="claude-opus-4-5",
            max_tokens=50,
            system="""You verify whether a trucking company FMCSA record matches the carrier we searched for.
Return only YES or NO.""",
            messages=[{
                "role": "user",
                "content": (
                    f"We searched for carrier: '{carrier_name}'\n"
                    f"FMCSA returned DOT# {dot} with legal name: '{fmcsa_legal_name}'"
                    + (f" (DBA: '{fmcsa_dba_name}')" if fmcsa_dba_name else "")
                    + "\n\nIs this the same company or the same company's main entity? YES or NO"
                )
            }]
        )
        answer = msg.content[0].text.strip().upper()
        matched = answer.startswith("YES")
        print(f"[FMCSA] Verification for DOT {dot} ({fmcsa_legal_name}) vs '{carrier_name}': {answer}")
        return matched
    except Exception as e:
        print(f"[FMCSA] Claude verification error: {e}")
        # On error, fall back to simple string similarity check
        name_upper = carrier_name.upper()
        legal_upper = fmcsa_legal_name.upper()
        return (
            name_upper in legal_upper or
            legal_upper in name_upper or
            any(w in legal_upper for w in name_upper.split() if len(w) > 3)
        )


async def lookup_by_dot(dot_number: str) -> Optional[dict]:
    """Fetch full carrier data from FMCSA by DOT number."""
    if not FMCSA_WEBKEY:
        return None
    async with httpx.AsyncClient(timeout=15) as client:
        return await _full_lookup(dot_number, client)


async def _full_lookup(dot: str, client: httpx.AsyncClient) -> Optional[dict]:
    """Hit all FMCSA endpoints in parallel for a DOT number."""
    results = await asyncio.gather(
        _fmcsa_get(client, f"/carriers/{dot}"),
        _fmcsa_get(client, f"/carriers/{dot}/basics"),
        _fmcsa_get(client, f"/carriers/{dot}/cargo-carried"),
        _fmcsa_get(client, f"/carriers/{dot}/operation-classification"),
        _fmcsa_get(client, f"/carriers/{dot}/oos"),
        _fmcsa_get(client, f"/carriers/{dot}/docket-numbers"),
        _fmcsa_get(client, f"/carriers/{dot}/authority"),
        return_exceptions=True,
    )

    def safe(r):
        return r if isinstance(r, dict) else None

    snapshot_raw, basics_raw, cargo_raw, ops_raw, oos_raw, dockets_raw, auth_raw = [safe(r) for r in results]

    carrier = (snapshot_raw or {}).get("content", {})
    if isinstance(carrier, dict):
        carrier = carrier.get("carrier", {})
    if not carrier:
        print(f"[FMCSA] No carrier data returned for DOT {dot}")
        return None

    return _parse_snapshot(carrier, basics_raw, cargo_raw, ops_raw, oos_raw, dockets_raw, auth_raw)


def _parse_snapshot(carrier, basics_raw, cargo_raw, ops_raw, oos_raw, dockets_raw, auth_raw) -> dict:
    dot_number = str(carrier.get("dotNumber", ""))
    mc_number = carrier.get("mcNumber", "")
    legal_name = carrier.get("legalName", "")
    dba_name = carrier.get("dbaName", "")
    phone = carrier.get("telephone", "")
    email = carrier.get("emailAddress", "")
    city = carrier.get("phyCity", "")
    state = carrier.get("phyState", "")
    street = carrier.get("phyStreet", "")
    zipcode = carrier.get("phyZip", "")
    address = f"{street}, {city}, {state} {zipcode}".strip(", ")

    allowed = (carrier.get("allowedToOperate") or "N").upper() == "Y"
    out_of_svc = (carrier.get("outOfService") or "N").upper() == "Y"
    oos_date = carrier.get("outOfServiceDate", "")
    safety_rating = (carrier.get("safetyRating") or "").upper()
    safety_date = carrier.get("safetyRatingDate", "")
    complaint_ct = _int(carrier.get("complaintCount"))
    total_drivers = _int(carrier.get("totalDrivers"))
    power_units = _int(carrier.get("totalPowerUnits"))

    driver_oos_rate = _pct(carrier.get("driverOosRate"))
    vehicle_oos_rate = _pct(carrier.get("vehicleOosRate"))
    hazmat_oos_rate = _pct(carrier.get("hazmatOosRate"))
    driver_insp_total = _int(carrier.get("driverInspTotal"))
    vehicle_insp_total = _int(carrier.get("vehicleInspTotal"))

    oos_content = (oos_raw or {}).get("content", {}) or {}
    if isinstance(oos_content, list) and oos_content:
        oos_content = oos_content[0]
    if isinstance(oos_content, dict) and oos_content:
        d_insp = _int(oos_content.get("driverInspTotal"))
        d_oos = _int(oos_content.get("driverOosInspTotal"))
        v_insp = _int(oos_content.get("vehicleInspTotal"))
        v_oos = _int(oos_content.get("vehicleOosInspTotal"))
        if d_insp > 0 and driver_oos_rate == 0:
            driver_oos_rate = round(d_oos / d_insp * 100, 1)
            driver_insp_total = d_insp
        if v_insp > 0 and vehicle_oos_rate == 0:
            vehicle_oos_rate = round(v_oos / v_insp * 100, 1)
            vehicle_insp_total = v_insp

    crashes_fatal = _int(carrier.get("crashTotal"))
    crashes_injury = _int(carrier.get("injuryTotal"))
    crashes_tow = _int(carrier.get("towTotal"))
    crash_total = crashes_fatal + crashes_injury + crashes_tow

    # BASIC descriptions keyed by basicsShortDesc from API
    BASIC_DESC_MAP = {
        "Unsafe Driving":                    "Speeding, reckless driving, and unsafe behaviors detected at roadside",
        "HOS Compliance":                    "Hours-of-service violations — driving beyond federal limits to prevent fatigue",
        "Hours-of-Service Compliance":       "Hours-of-service violations — driving beyond federal limits to prevent fatigue",
        "Driver Fitness":                    "Drivers without valid CDL, medical cert, or operating while disqualified",
        "Drugs/Alcohol":                     "Drug and alcohol violations found during inspections or post-accident testing",
        "Controlled Substances/Alcohol":     "Drug and alcohol violations found during inspections or post-accident testing",
        "Vehicle Maint.":                    "Brake failures, tire defects, lights out — equipment problems at roadside",
        "Vehicle Maintenance":               "Brake failures, tire defects, lights out — equipment problems at roadside",
        "Hazmat":                            "Improper handling, labeling, or placarding of hazardous materials",
        "Crash Indicator":                   "Crash involvement rate relative to miles traveled vs similar carriers",
    }

    basics = []
    for b in ((basics_raw or {}).get("content", []) or []):
        if not isinstance(b, dict):
            continue
        bdata = b.get("basic", {})
        if not isinstance(bdata, dict):
            continue
        # Name/ID are inside basicsType
        btype      = bdata.get("basicsType", {}) or {}
        bid        = _int(btype.get("basicsId"))
        short_desc = (btype.get("basicsShortDesc") or btype.get("basicsCode") or "").strip()
        name       = short_desc or f"BASIC {bid}"
        desc       = BASIC_DESC_MAP.get(short_desc, "")

        # Percentile — "Not Public" means FMCSA withholds it for large carriers
        percentile_raw = (bdata.get("basicsPercentile") or "").strip()
        measure_val    = str(bdata.get("measureValue") or "")
        not_public     = percentile_raw in ("Not Public", "Not Applicable", "")

        # Deficient flags
        oor = str(bdata.get("onRoadPerformanceThresholdViolationIndicator") or "N").upper()
        exceeded = str(bdata.get("exceededFMCSAInterventionThreshold") or "-1") == "1"
        deficient = oor == "Y" or exceeded
        serious_viol = str(bdata.get("seriousViolationFromInvestigationPast12MonthIndicator") or "N").upper() == "Y"

        violations = _int(bdata.get("totalViolation"))
        insp_with  = _int(bdata.get("totalInspectionWithViolation"))
        threshold  = bdata.get("basicsViolationThreshold", "")

        basics.append({
            "id":          bid,
            "name":        name,
            "description": desc,
            "percentile":  percentile_raw,
            "measure_value": measure_val,
            "threshold":   threshold,
            "deficient":   deficient,
            "serious_violation": serious_viol,
            "violations":  violations,
            "inspections_with_violation": insp_with,
            "not_public":  not_public,
        })

    # Cargo — cargoClassDesc is flat on each item
    cargo_list = []
    for c in ((cargo_raw or {}).get("content", []) or []):
        if not isinstance(c, dict):
            continue
        desc = c.get("cargoClassDesc", "")
        if desc:
            cargo_list.append(desc)

    # Operations — operationClassDesc is flat on each item
    op_classes = []
    for o in ((ops_raw or {}).get("content", []) or []):
        if not isinstance(o, dict):
            continue
        desc = o.get("operationClassDesc", "")
        if desc:
            op_classes.append(desc)

    # Authority — nested under carrierAuthority, values are "A"/"N" not "ACTIVE"
    auth_content = (auth_raw or {}).get("content", []) or {}
    if isinstance(auth_content, list):
        auth_content = auth_content[0] if auth_content else {}
    ca = auth_content.get("carrierAuthority", auth_content) if isinstance(auth_content, dict) else {}
    def _auth(v):
        v = str(v or "").strip().upper()
        return "ACTIVE" if v == "A" else "INACTIVE" if v == "N" else v
    common_auth   = _auth(ca.get("commonAuthorityStatus"))
    contract_auth = _auth(ca.get("contractAuthorityStatus"))
    broker_auth   = _auth(ca.get("brokerAuthorityStatus"))

    print(f"[FMCSA] Parsed {len(basics)} BASICs | cargo: {len(cargo_list)} | ops: {len(op_classes)} | auth: {common_auth}/{contract_auth}/{broker_auth}")

    mc_numbers = []
    for d in ((dockets_raw or {}).get("content", []) or []):
        if not isinstance(d, dict):
            continue
        dnum = d.get("docketNumber", {})
        if not isinstance(dnum, dict):
            continue
        prefix = dnum.get("docketNumberPrefix", "")
        num = dnum.get("docketNumber", "")
        if prefix and num:
            mc_numbers.append(f"{prefix}-{num}")

    if safety_rating == "UNSATISFACTORY" or out_of_svc:
        safety_status = "UNSAFE"
    elif safety_rating == "CONDITIONAL" or not allowed:
        safety_status = "WARNING"
    else:
        safety_status = "OK"

    warnings = []
    if safety_rating == "UNSATISFACTORY":
        warnings.append("Unsatisfactory FMCSA safety rating - do not work with this carrier")
    if safety_rating == "CONDITIONAL":
        warnings.append("Conditional safety rating - carrier has open compliance issues")
    if out_of_svc:
        warnings.append(f"Out-of-service order active{(' since ' + oos_date) if oos_date else ''}")
    if not allowed:
        warnings.append("Carrier is NOT authorized to operate")
    if driver_oos_rate > 10:
        warnings.append(f"Driver OOS rate {driver_oos_rate:.1f}% is nearly 2x the national average of 5.5%")
    if vehicle_oos_rate > 30:
        warnings.append(f"Vehicle OOS rate {vehicle_oos_rate:.1f}% is above the national average of 20.8%")
    if crashes_fatal > 0:
        warnings.append(f"{crashes_fatal} fatal crash(es) in past 24 months")
    if crash_total > 5:
        warnings.append(f"High crash count: {crash_total} total crashes in 24 months")
    if complaint_ct > 0:
        warnings.append(f"{complaint_ct} consumer complaint(s) on file with FMCSA")
    for b in basics:
        if b["deficient"]:
            warnings.append(f"BASIC deficient: {b['name']} (percentile: {b['percentile']})")
        if b["serious_violation"]:
            warnings.append(f"Serious violation: {b['name']} within last 12 months")

    auto_reject = safety_rating == "UNSATISFACTORY" or out_of_svc
    auto_reject_reason = (
        "Unsatisfactory FMCSA safety rating" if safety_rating == "UNSATISFACTORY"
        else "Active out-of-service order" if out_of_svc
        else None
    )

    return {
        "dot_number": dot_number, "mc_number": mc_number, "mc_numbers": mc_numbers,
        "legal_name": legal_name, "dba_name": dba_name, "address": address,
        "phone": phone, "email": email,
        "safety_rating": safety_rating or "NOT RATED", "safety_rating_date": safety_date,
        "safety_status": safety_status, "allowed_to_operate": allowed,
        "out_of_service": out_of_svc, "oos_date": oos_date, "complaint_count": complaint_ct,
        "common_authority": common_auth, "contract_authority": contract_auth, "broker_authority": broker_auth,
        "total_drivers": total_drivers, "power_units": power_units,
        "driver_oos_rate": driver_oos_rate, "vehicle_oos_rate": vehicle_oos_rate,
        "hazmat_oos_rate": hazmat_oos_rate,
        "driver_insp_total": driver_insp_total, "vehicle_insp_total": vehicle_insp_total,
        "crashes_fatal": crashes_fatal, "crashes_injury": crashes_injury,
        "crashes_tow": crashes_tow, "crash_total": crash_total,
        "basics": basics, "cargo_carried": cargo_list, "operation_classes": op_classes,
        "warnings": warnings, "auto_reject": auto_reject, "auto_reject_reason": auto_reject_reason,
    }


async def enrich_outreach_record(carrier_name: str) -> Optional[dict]:
    """
    Main entry point. Three-step process:
    1. Search FMCSA by name variants to get real candidates.
    2. Claude picks the best matching DOT from the actual candidate list.
    3. Fetch full data and verify the match is correct.
    """
    print(f"[FMCSA] Starting lookup for: {carrier_name}")

    if not FMCSA_WEBKEY:
        print("[FMCSA] No WebKey configured")
        return None

    async with httpx.AsyncClient(timeout=15) as client:
        # Step 1: Search FMCSA for real candidates
        candidates = await search_fmcsa_by_name(carrier_name, client)
        print(f"[FMCSA] Found {len(candidates)} candidates for: {carrier_name}")
        if candidates:
            for c in candidates[:5]:
                print(f"[FMCSA]   DOT {c['dot']} | {c['legal_name']} | {c['city']}, {c['state']}")

        if not candidates:
            print(f"[FMCSA] No FMCSA candidates found for: {carrier_name}")
            return None

        # Step 2: Claude picks the best DOT from real candidates
        dot = await resolve_dot_via_claude(carrier_name, candidates)
        if not dot:
            print(f"[FMCSA] Claude could not pick a match from candidates for: {carrier_name}")
            return None

        # Step 3: Fetch full FMCSA data for the chosen DOT
        result = await _full_lookup(dot, client)
        if not result:
            print(f"[FMCSA] FMCSA returned no data for DOT {dot}")
            return None

        # Step 4: Verify the match
        legal_name = result.get("legal_name", "")
        dba_name   = result.get("dba_name", "")
        is_match   = await verify_dot_match(carrier_name, dot, legal_name, dba_name)

        if not is_match:
            print(f"[FMCSA] Verification FAILED — DOT {dot} ({legal_name}) does not match '{carrier_name}'")
            return {
                "found": False,
                "mismatch": True,
                "searched_for": carrier_name,
                "fmcsa_name": legal_name,
                "dot_number": dot,
                "candidates_found": len(candidates),
                "message": f"Found {len(candidates)} FMCSA records but none confidently matched '{carrier_name}'. Closest was '{legal_name}' (DOT# {dot}).",
            }

        print(f"[FMCSA] Verified: {legal_name} (DOT {dot}) matches '{carrier_name}' | {result.get('safety_rating')} | {result.get('safety_status')}")
        result["verified_match"] = True
        return result
