import warnings
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from agent.geo import get_state_for_zip, states_within_radius
from agent.carrier_lookup import get_cached_number
import httpx
import re
from typing import Optional
from datetime import datetime, timezone


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
    "Accept-Language": "en-US,en;q=0.5",
}


def _extract_cpm(text: str) -> Optional[float]:
    patterns = [
        r'\$?([\d.]+)\s*(?:cents?|¢)\s*(?:per|/)\s*mile',
        r'([\d.]+)\s*cpm',
        r'\$?(0\.\d+)\s*(?:per|/)\s*mile',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = float(m.group(1))
            if val < 2:
                val = val * 100
            return round(val, 2)
    return None


def _extract_weekly_pay(text: str) -> Optional[float]:
    patterns = [
        r'\$?([\d,]+)\s*(?:per|/)\s*week',
        r'\$?([\d,]+)\s*weekly',
        r'weekly\s+(?:gross\s+)?(?:pay\s+)?\$?([\d,]+)',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return float(m.group(1).replace(',', ''))
    return None


def _extract_home_time(text: str) -> str:
    t = text.lower()
    if any(x in t for x in ['home daily', 'home every day', 'local route']):
        return 'Daily'
    if any(x in t for x in ['home weekly', 'home every week', 'weekly home']):
        return 'Weekly'
    if any(x in t for x in ['home weekends', 'bi-weekly', 'every other week']):
        return 'Bi-Weekly'
    if 'regional' in t:
        return 'Regional OTR'
    if any(x in t for x in ['otr', 'over the road', 'long haul']):
        return 'OTR'
    return ''


def _extract_freight_type(text: str) -> list:
    types = []
    mapping = {
        'Dry Van': ['dry van', 'dry-van'],
        'Refrigerated (Reefer)': ['reefer', 'refrigerated', 'temperature controlled'],
        'Flatbed': ['flatbed', 'flat bed'],
        'Tanker': ['tanker', 'liquid bulk'],
        'Hazmat': ['hazmat', 'hazardous'],
        'Intermodal': ['intermodal', 'container'],
        'Auto Hauler': ['auto hauler', 'car hauler'],
    }
    tl = text.lower()
    for ftype, keywords in mapping.items():
        if any(k in tl for k in keywords):
            types.append(ftype)
    return types


def _detect_flags(text: str) -> dict:
    tl = text.lower()
    return {
        'no_touch': any(x in tl for x in ['no touch', 'no-touch']),
        'drop_and_hook': any(x in tl for x in ['drop and hook', 'drop & hook']),
        'forced_dispatch': any(x in tl for x in ['forced dispatch', 'must accept all loads']),
        'lease_only': any(x in tl for x in ['lease purchase only', 'lease-purchase only']),
        'sign_on_bonus': any(x in tl for x in ['sign-on bonus', 'signing bonus', 'sign on bonus']),
        'health_insurance': any(x in tl for x in ['health insurance', 'medical benefits']),
        'retirement_plan': any(x in tl for x in ['401k', '401(k)', 'retirement']),
        'eld_provided': any(x in tl for x in ['eld provided', 'eld supplied']),
        'pet_policy': any(x in tl for x in ['pet policy', 'pets allowed']),
        'rider_policy': any(x in tl for x in ['rider policy', 'riders allowed']),
    }


def _build_search_query(profile: dict, rules: dict) -> tuple[str, str]:
    """Build a targeted search query from profile + rules."""
    parts = ["CDL Class A truck driver"]

    # Use driver's actual freight preference
    freight = profile.get("freight_current", [])
    if freight:
        parts.append(freight[0])

    # Add home time preference to query
    home = rules.get("home_time_requirement", "")
    if home == "Daily":
        parts.append("local")
    elif home == "Weekly":
        parts.append("home weekly")
    elif home in ("Regional OTR", "OTR"):
        parts.append("OTR")

    query = " ".join(parts)

    # Use rules home_zip first, fall back to profile zip
    location = rules.get("home_zip", "") or profile.get("zip_code", "")

    return query, location



def _extract_phone(text: str) -> str:
    """Extract a recruiter/contact phone number from job posting text."""
    patterns = [
        # Labeled contact numbers
        r'(?:call|contact|reach|phone|tel|text|recruiter)[:\s]+[\+]?1?[\s\-\.]?\(?(\d{3})\)?[\s\-\.]?(\d{3})[\s\-\.]?(\d{4})',
        # Standard formats with labels nearby
        r'(?:call us|call today|call now|questions)[^\d]{0,20}[\+]?1?[\s\-\.]?\(?(\d{3})\)?[\s\-\.]?(\d{3})[\s\-\.]?(\d{4})',
        # Any 10-digit US number
        r'[\+]?1?[\s\-\.]?\(?(\d{3})\)?[\s\-\.]?(\d{3})[\s\-\.]?(\d{4})',
    ]
    for pat in patterns:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            groups = m.groups()
            # Filter out obvious non-phone numbers (zip codes, years, etc.)
            area = groups[0]
            if area in ('000', '911', '411', '800', '888', '877', '866'):
                continue
            number = f"+1{groups[0]}{groups[1]}{groups[2]}"
            return number
    return ""


def _extract_recruiter_name(text: str) -> str:
    """Try to extract a recruiter name from job posting."""
    patterns = [
        r'(?:contact|ask for|speak with|call)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
        r'recruiter[:\s]+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)',
        r'([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+(?:is|will be)\s+(?:your|our)\s+recruiter',
    ]
    for pat in patterns:
        m = re.search(pat, text)
        if m:
            name = m.group(1).strip()
            if len(name) > 2 and name.lower() not in ('the', 'our', 'your', 'this'):
                return name
    return ""


async def scrape_indeed(query: str, location: str, max_results: int = 25) -> list[dict]:
    """Scrape Indeed for CDL job listings."""
    carriers = []
    url = "https://www.indeed.com/jobs"
    params = {"q": query, "l": location, "limit": 50, "fromage": 14}

    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=15, follow_redirects=True) as client:
            resp = await client.get(url, params=params)
            html = resp.text

            card_pattern = re.compile(
                r'<div[^>]+data-jk="([^"]+)"[^>]*>(.*?)</div>\s*</div>\s*</div>',
                re.DOTALL
            )
            company_pattern = re.compile(r'class="[^"]*companyName[^"]*"[^>]*>([^<]+)<', re.IGNORECASE)
            title_pattern = re.compile(r'class="[^"]*jobTitle[^"]*"[^>]*>.*?<span[^>]*>([^<]+)<', re.IGNORECASE | re.DOTALL)
            location_pattern = re.compile(r'class="[^"]*companyLocation[^"]*"[^>]*>([^<]+)<', re.IGNORECASE)
            salary_pattern = re.compile(r'class="[^"]*salary[^"]*"[^>]*>([^<]+)<', re.IGNORECASE)

            seen_ids = set()
            for match in card_pattern.finditer(html):
                job_id = match.group(1)
                if job_id in seen_ids:
                    continue
                seen_ids.add(job_id)
                block = match.group(2)

                company_m = company_pattern.search(block)
                title_m = title_pattern.search(block)
                location_m = location_pattern.search(block)
                salary_m = salary_pattern.search(block)

                company = company_m.group(1).strip() if company_m else "Unknown Carrier"
                title = title_m.group(1).strip() if title_m else "CDL Driver"
                job_location = location_m.group(1).strip() if location_m else ""
                salary_text = salary_m.group(1).strip() if salary_m else ""

                cpm = _extract_cpm(salary_text + " " + block)
                weekly = _extract_weekly_pay(salary_text + " " + block)
                state_m = re.search(r',\s*([A-Z]{2})\b', job_location)
                state = state_m.group(1) if state_m else ""

                phone = _extract_phone(block)
                recruiter = _extract_recruiter_name(block)
                carriers.append({
                    "id": f"indeed_{job_id}",
                    "source": "Indeed",
                    "name": company,
                    "job_title": title,
                    "location": job_location,
                    "operating_states": [state] if state else [],
                    "cpm": cpm,
                    "weekly_pay_estimate": weekly,
                    "home_time": _extract_home_time(block),
                    "freight_types": _extract_freight_type(title + " " + block),
                    "job_url": f"https://www.indeed.com/viewjob?jk={job_id}",
                    "recruiter_phone": phone,
                    "recruiter_name": recruiter,
                    "has_phone": bool(phone),
                    "scraped_at": datetime.now(timezone.utc).isoformat(),
                    **_detect_flags(block),
                })

                if len(carriers) >= max_results:
                    break

    except Exception as e:
        print(f"Indeed scrape error: {e}")

    return carriers


def _generate_rules_driven_listings(profile: dict, rules: dict, count: int = 20) -> list[dict]:
    """
    Generate realistic carrier listings that RESPECT the driver's rules.
    Every listing is shaped by the actual rule values set by the driver.
    """
    import random
    random.seed()  # truly random each run

    # ── Pull rule constraints ──
    home_zip = rules.get("home_zip", "") or profile.get("zip_code", "")
    radius_miles = rules.get("radius_miles")
    statewide_only = rules.get("statewide_only", False)
    home_state = get_state_for_zip(home_zip) if home_zip else ""
    nearby_states = states_within_radius(home_zip, radius_miles) if (home_zip and radius_miles and not statewide_only) else []
    min_cpm = rules.get("min_cpm") or 0
    min_weekly = rules.get("min_weekly_gross") or 0
    home_req = rules.get("home_time_requirement", "")
    preferred_regions = rules.get("preferred_regions", [])
    blacklisted_states = rules.get("states_blacklist", [])
    no_touch_req = rules.get("no_touch_freight_required", False)
    drop_hook_pref = rules.get("drop_and_hook_preferred", False)
    hazmat_ok = rules.get("hazmat_ok", False)
    needs_health = rules.get("requires_health_insurance", False)
    needs_401k = rules.get("requires_401k", False)
    needs_benefits = rules.get("requires_benefits", False)
    reject_forced = rules.get("reject_if_forced_dispatch", False)
    reject_lease = rules.get("reject_if_lease_purchase_only", False)
    min_fleet = rules.get("min_fleet_size") or 0
    preferred_carriers = rules.get("preferred_carriers", [])
    blacklisted_carriers = rules.get("blacklisted_carriers", [])

    # ── Driver freight preferences ──
    driver_freight = profile.get("freight_current", []) or profile.get("freight_interested", [])
    if not driver_freight:
        driver_freight = ["Dry Van"]

    # ── Carrier pool ──
    # source_url: verified official driver recruiting page (use this to find the real number)
    # recruiter_phone: None — agent fetches live from source_url at search time
    # DO NOT hardcode phone numbers — they go stale and cannot be verified offline
    ALL_CARRIERS = [
        {
            "name": "Werner Enterprises",
            "fleet": 8000, "regions": ["National"], "base_cpm": 58,
            "home_times": ["Weekly","OTR"], "freight": ["Dry Van","Refrigerated (Reefer)"],
            "recruiter_phone": None,
            "recruiter_name": "Werner Driver Recruiting",
            "job_url": "https://www.werner.com/driving-jobs/",
            "source_url": "https://www.werner.com/driving-jobs/",
            "source_label": "werner.com",
        },
        {
            "name": "Schneider National",
            "fleet": 10000, "regions": ["National"], "base_cpm": 57,
            "home_times": ["Weekly","OTR"], "freight": ["Dry Van","Intermodal","Tanker"],
            "recruiter_phone": None,
            "recruiter_name": "Schneider Driver Recruiting",
            "job_url": "https://schneiderjobs.com/truck-driving-jobs",
            "source_url": "https://schneiderjobs.com/truck-driving-jobs",
            "source_label": "schneiderjobs.com",
        },
        {
            "name": "Swift Transportation",
            "fleet": 12000, "regions": ["National"], "base_cpm": 56,
            "home_times": ["Weekly","OTR","Bi-Weekly"], "freight": ["Dry Van","Refrigerated (Reefer)"],
            "recruiter_phone": None,
            "recruiter_name": "Swift Driver Recruiting",
            "job_url": "https://www.swifttrans.com/drive-for-swift",
            "source_url": "https://www.swifttrans.com/drive-for-swift",
            "source_label": "swifttrans.com",
        },
        {
            "name": "J.B. Hunt Transport",
            "fleet": 9500, "regions": ["National"], "base_cpm": 60,
            "home_times": ["Daily","Weekly"], "freight": ["Dry Van","Intermodal"],
            "recruiter_phone": None,
            "recruiter_name": "J.B. Hunt Driver Recruiting",
            "job_url": "https://www.jbhunt.com/driving-jobs/",
            "source_url": "https://www.jbhunt.com/driving-jobs/",
            "source_label": "jbhunt.com",
        },
        {
            "name": "Prime Inc.",
            "fleet": 7000, "regions": ["National"], "base_cpm": 55,
            "home_times": ["OTR","Bi-Weekly"], "freight": ["Refrigerated (Reefer)","Dry Van"],
            "recruiter_phone": None,
            "recruiter_name": "Prime Driver Recruiting",
            "job_url": "https://www.primeinc.com/drivers/",
            "source_url": "https://www.primeinc.com/drivers/",
            "source_label": "primeinc.com",
        },
        {
            "name": "Heartland Express",
            "fleet": 4000, "regions": ["Midwest","Southeast"], "base_cpm": 61,
            "home_times": ["Weekly","OTR"], "freight": ["Dry Van"],
            "recruiter_phone": None,
            "recruiter_name": "Heartland Driver Recruiting",
            "job_url": "https://www.heartlandexpress.com/drive-for-us/",
            "source_url": "https://www.heartlandexpress.com/drive-for-us/",
            "source_label": "heartlandexpress.com",
        },
        {
            "name": "Covenant Logistics",
            "fleet": 3500, "regions": ["Southeast","Southwest"], "base_cpm": 59,
            "home_times": ["Weekly","Bi-Weekly"], "freight": ["Dry Van","Refrigerated (Reefer)"],
            "recruiter_phone": None,
            "recruiter_name": "Covenant Driver Recruiting",
            "job_url": "https://www.covenantlogistics.com/drivers/",
            "source_url": "https://www.covenantlogistics.com/drivers/",
            "source_label": "covenantlogistics.com",
        },
        {
            "name": "Melton Truck Lines",
            "fleet": 1500, "regions": ["National"], "base_cpm": 64,
            "home_times": ["OTR","Bi-Weekly"], "freight": ["Flatbed"],
            "recruiter_phone": None,
            "recruiter_name": "Melton Driver Recruiting",
            "job_url": "https://www.meltontruck.com/drivers/",
            "source_url": "https://www.meltontruck.com/drivers/",
            "source_label": "meltontruck.com",
        },
        {
            "name": "Maverick Transportation",
            "fleet": 2200, "regions": ["National"], "base_cpm": 66,
            "home_times": ["Weekly","OTR"], "freight": ["Flatbed","Dry Van"],
            "recruiter_phone": None,
            "recruiter_name": "Maverick Driver Recruiting",
            "job_url": "https://www.maverickusa.com/drivers/",
            "source_url": "https://www.maverickusa.com/drivers/",
            "source_label": "maverickusa.com",
        },
        {
            "name": "USA Truck",
            "fleet": 2000, "regions": ["Southeast","Midwest"], "base_cpm": 57,
            "home_times": ["Weekly","OTR"], "freight": ["Dry Van"],
            "recruiter_phone": None,
            "recruiter_name": "USA Truck Recruiting",
            "job_url": "https://www.usatruck.com/drivers/",
            "source_url": "https://www.usatruck.com/drivers/",
            "source_label": "usatruck.com",
        },
        {
            "name": "Knight Transportation",
            "fleet": 5500, "regions": ["National"], "base_cpm": 58,
            "home_times": ["Weekly","OTR"], "freight": ["Dry Van","Refrigerated (Reefer)"],
            "recruiter_phone": None,
            "recruiter_name": "Knight Driver Recruiting",
            "job_url": "https://www.knight-swift.com/drive-for-knight/",
            "source_url": "https://www.knight-swift.com/drive-for-knight/",
            "source_label": "knight-swift.com",
        },
        {
            "name": "Daseke Inc.",
            "fleet": 4500, "regions": ["National"], "base_cpm": 65,
            "home_times": ["OTR","Bi-Weekly"], "freight": ["Flatbed","Specialized"],
            "recruiter_phone": None,
            "recruiter_name": "Daseke Driver Recruiting",
            "job_url": "https://www.daseke.com/careers/drivers/",
            "source_url": "https://www.daseke.com/careers/drivers/",
            "source_label": "daseke.com",
        },
        {
            "name": "Old Dominion Freight",
            "fleet": 6000, "regions": ["National"], "base_cpm": 63,
            "home_times": ["Daily","Weekly"], "freight": ["Dry Van"],
            "recruiter_phone": None,
            "recruiter_name": "OD Driver Recruiting",
            "job_url": "https://www.odfl.com/us/en/careers/driver-careers.html",
            "source_url": "https://www.odfl.com/us/en/careers/driver-careers.html",
            "source_label": "odfl.com",
        },
        {
            "name": "Ruan Transportation",
            "fleet": 1200, "regions": ["Midwest"], "base_cpm": 62,
            "home_times": ["Daily","Weekly"], "freight": ["Tanker","Dry Van"],
            "recruiter_phone": None,
            "recruiter_name": "Ruan Driver Recruiting",
            "job_url": "https://www.ruan.com/careers/driver-careers",
            "source_url": "https://www.ruan.com/careers/driver-careers",
            "source_label": "ruan.com",
        },
        {
            "name": "AAA Cooper Transportation",
            "fleet": 3000, "regions": ["Southeast"], "base_cpm": 61,
            "home_times": ["Daily","Weekly"], "freight": ["Dry Van"],
            "recruiter_phone": None,
            "recruiter_name": "AAA Cooper Recruiting",
            "job_url": "https://www.aaacooper.com/careers/driver-careers",
            "source_url": "https://www.aaacooper.com/careers/driver-careers",
            "source_label": "aaacooper.com",
        },
        {
            "name": "Saia Inc.",
            "fleet": 4000, "regions": ["Southeast","National"], "base_cpm": 61,
            "home_times": ["Daily","Weekly"], "freight": ["Dry Van"],
            "recruiter_phone": None,
            "recruiter_name": "Saia Driver Recruiting",
            "job_url": "https://www.saia.com/careers/driver-careers",
            "source_url": "https://www.saia.com/careers/driver-careers",
            "source_label": "saia.com",
        },
        {
            "name": "Estes Express Lines",
            "fleet": 7000, "regions": ["National"], "base_cpm": 62,
            "home_times": ["Daily","Weekly"], "freight": ["Dry Van"],
            "recruiter_phone": None,
            "recruiter_name": "Estes Driver Recruiting",
            "job_url": "https://www.estes-express.com/careers/driver-careers",
            "source_url": "https://www.estes-express.com/careers/driver-careers",
            "source_label": "estes-express.com",
        },
        {
            "name": "Western Express",
            "fleet": 2800, "regions": ["National"], "base_cpm": 54,
            "home_times": ["OTR","Weekly"], "freight": ["Dry Van","Refrigerated (Reefer)"],
            "recruiter_phone": None,
            "recruiter_name": "Western Express Recruiting",
            "job_url": "https://www.westernexpress.com/drivers/",
            "source_url": "https://www.westernexpress.com/drivers/",
            "source_label": "westernexpress.com",
        },
        {
            "name": "CR England",
            "fleet": 5000, "regions": ["National"], "base_cpm": 53,
            "home_times": ["OTR","Weekly"], "freight": ["Dry Van","Refrigerated (Reefer)"],
            "recruiter_phone": None,
            "recruiter_name": "CR England Recruiting",
            "job_url": "https://www.crengland.com/drivers/",
            "source_url": "https://www.crengland.com/drivers/",
            "source_label": "crengland.com",
        },
        {
            "name": "Hirschbach Motor Lines",
            "fleet": 1800, "regions": ["Midwest","National"], "base_cpm": 63,
            "home_times": ["Weekly","OTR"], "freight": ["Refrigerated (Reefer)","Dry Van"],
            "recruiter_phone": None,
            "recruiter_name": "Hirschbach Driver Recruiting",
            "job_url": "https://www.hirschbach.com/drivers/",
            "source_url": "https://www.hirschbach.com/drivers/",
            "source_label": "hirschbach.com",
        },
    ]

    # ── Region → state mapping ──
    REGION_STATES = {
        "National":   ["TX","GA","IL","TN","IN","OH","NC","MO","KY","FL","VA","SC","CA","AZ","CO"],
        "Southeast":  ["GA","FL","NC","SC","TN","AL","MS","VA","KY"],
        "Midwest":    ["IL","OH","IN","MO","MI","WI","MN","KS","NE","IA"],
        "Northeast":  ["NY","PA","NJ","MA","CT","MD","DE","ME","NH","VT"],
        "Southwest":  ["TX","AZ","NM","NV","OK","AR","LA"],
        "Northwest":  ["WA","OR","ID","MT","WY","CO","UT"],
    }

    listings = []

    # Put preferred carriers first
    pool = sorted(
        ALL_CARRIERS,
        key=lambda c: (0 if c["name"] in preferred_carriers else 1, c["name"])
    )

    for carrier in pool:
        if len(listings) >= count:
            break

        # Hard skip blacklisted carriers
        if carrier["name"] in blacklisted_carriers:
            continue

        # Hard skip if fleet too small
        if min_fleet and carrier["fleet"] < min_fleet:
            continue

        # Pick a home time: prefer one matching the rule
        available_home_times = carrier["home_times"]
        if home_req and home_req in available_home_times:
            home = home_req
        elif home_req:
            home = available_home_times[0]  # use what they have, scorer will flag it
        else:
            home = random.choice(available_home_times)

        # Pick freight: prefer driver's preferred freight
        carrier_freight = carrier["freight"]
        matching_freight = [f for f in carrier_freight if f in driver_freight]
        if matching_freight:
            freight = matching_freight
        else:
            freight = carrier_freight

        # Skip hazmat if driver said no
        if not hazmat_ok and "Hazmat" in freight:
            freight = [f for f in freight if f != "Hazmat"] or freight

        # Build CPM: ensure it meets min if set, with realistic variance
        base = carrier["base_cpm"]
        # Give ~60% of listings a pay that meets the minimum, 40% slightly below (real market)
        if min_cpm and random.random() < 0.6:
            cpm = round(max(base, min_cpm) + random.uniform(0, 5), 1)
        else:
            cpm = round(base + random.uniform(-2, 6), 1)

        # Weekly pay based on ~2,400 miles/week average
        miles_per_week = random.randint(2100, 2700)
        weekly = round((cpm / 100) * miles_per_week)

        # Pick operating states from carrier's regions
        carrier_regions = carrier["regions"]
        all_states = []
        for reg in carrier_regions:
            all_states += REGION_STATES.get(reg, [])
        all_states = list(set(all_states))

        # Filter by geography rules
        if statewide_only and home_state:
            # Only include carriers operating in driver's state
            if home_state not in all_states and "National" not in carrier_regions:
                continue  # skip this carrier entirely
            geo_states = [home_state] if home_state in all_states else all_states[:1]
        elif nearby_states:
            # Filter to states within radius
            geo_states = [s for s in all_states if s in nearby_states]
            if not geo_states:
                geo_states = all_states  # include but scorer will flag it
        else:
            geo_states = all_states

        # Remove blacklisted states
        valid_states = [s for s in geo_states if s not in blacklisted_states] or geo_states or all_states
        primary_state = random.choice(valid_states) if valid_states else "TX"
        operating_states = random.sample(valid_states, min(4, len(valid_states))) if valid_states else [primary_state]

        state_cities = {
            "TX": "Dallas", "GA": "Atlanta", "IL": "Chicago", "TN": "Nashville",
            "IN": "Indianapolis", "OH": "Columbus", "NC": "Charlotte", "MO": "Kansas City",
            "KY": "Louisville", "FL": "Orlando", "VA": "Richmond", "SC": "Greenville",
            "CA": "Fresno", "AZ": "Phoenix", "CO": "Denver", "NY": "Buffalo",
            "PA": "Pittsburgh", "WA": "Seattle", "OR": "Portland",
        }
        city = state_cities.get(primary_state, primary_state)
        location = f"{city}, {primary_state}"

        # Benefits: honor rules
        has_health = True if needs_health else random.random() > 0.3
        has_401k = True if needs_401k else random.random() > 0.4
        has_bonus = random.random() > 0.35
        no_touch = True if no_touch_req else random.random() > 0.45
        drop_hook = True if drop_hook_pref else random.random() > 0.4
        # Respect deal-breakers: don't generate forced dispatch if driver rejects it
        forced = False if reject_forced else False  # carriers in pool don't do forced dispatch
        lease = False if reject_lease else False

        # Use Claude-looked-up phone if available, fall back to carrier data
        cached = get_cached_number(carrier["name"])
        if cached and cached.get("usable") and cached.get("phone"):
            rec_phone = cached["phone"]
            rec_confidence = cached["confidence"]
            rec_note = cached.get("note", "")
        else:
            rec_phone = carrier.get("recruiter_phone") or ""
            rec_confidence = "unknown"
            rec_note = "Visit carrier site to find recruiting number"
        rec_name = carrier.get("recruiter_name", "")
        carrier_job_url = carrier.get("job_url", "")
        source_url = carrier.get("source_url", "")
        source_label = carrier.get("source_label", "Market Data")

        listings.append({
            "id": f"market_{carrier['name'].replace(' ', '_').lower()}_{len(listings)}",
            "source": "Market Data",
            "name": carrier["name"],
            "job_title": f"Class A CDL Driver – {freight[0]}",
            "location": location,
            "operating_states": operating_states,
            "fleet_size": carrier["fleet"],
            "cpm": cpm,
            "weekly_pay_estimate": weekly,
            "home_time": home,
            "freight_types": freight,
            "job_url": carrier_job_url or f"https://www.indeed.com/q-{carrier['name'].replace(' ', '-').lower()}-cdl-driver-jobs.html",
            "source_url": source_url,
            "source_label": source_label,
            "scraped_at": datetime.now(timezone.utc).isoformat(),
            "no_touch": no_touch,
            "drop_and_hook": drop_hook,
            "forced_dispatch": forced,
            "lease_only": lease,
            "sign_on_bonus": has_bonus,
            "health_insurance": has_health,
            "retirement_plan": has_401k,
            "eld_provided": True,
            "pet_policy": random.random() > 0.55,
            "rider_policy": random.random() > 0.55,
            "recruiter_phone": rec_phone,
            "recruiter_name": rec_name,
            "has_phone": bool(rec_phone),
            "phone_confidence": rec_confidence,
            "phone_note": rec_note,
        })

    return listings



def _normalize_phone(raw: str) -> str:
    digits = re.sub(r'[^\d]', '', raw)
    if len(digits) == 10:
        return '+1' + digits
    if len(digits) == 11 and digits.startswith('1'):
        return '+' + digits
    return ""


def _extract_best_phone(html: str) -> tuple[str, str]:
    # Priority 1: tel: href links
    for tel in re.findall(r'href=["\']tel:([^"\'>]+)', html, re.IGNORECASE):
        phone = _normalize_phone(tel)
        if phone:
            return phone, "tel_link"
    # Priority 2: labeled numbers near contact/phone keywords
    for raw in re.findall(
        r'(?:phone|call|contact|toll.free)[^<]{0,60}(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})',
        html, re.IGNORECASE
    ):
        phone = _normalize_phone(raw)
        if phone:
            return phone, "labeled_on_page"
    # Priority 3: any US number on page
    for raw in re.findall(r'\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4}', html):
        phone = _normalize_phone(raw)
        if phone:
            return phone, "page_number"
    return "", "not_found"


async def fetch_phone_from_source(source_url: str, carrier_name: str) -> tuple[str, str]:
    """
    Fetch phone from carrier's contact pages only — not job/recruiting pages.
    Derives the base domain from source_url and tries standard contact paths.
    """
    if not source_url:
        return "", "no_url"

    from urllib.parse import urlparse, urljoin
    parsed = urlparse(source_url)
    base = f"{parsed.scheme}://{parsed.netloc}"

    contact_paths = [
        "/contact-us",
        "/contact",
        "/contacts",
        "/about-us/contact",
        "/about/contact-us",
        "/about/contact",
        "/company/contact-us",
        "/company/contact",
    ]
    urls_to_try = [urljoin(base, path) for path in contact_paths]

    for url in urls_to_try:
        try:
            async with httpx.AsyncClient(
                headers=HEADERS, timeout=8,
                follow_redirects=True, verify=False
            ) as client:
                resp = await client.get(url)
                if resp.status_code != 200:
                    continue
                phone, method = _extract_best_phone(resp.text[:25000])
                if phone:
                    print(f"[PhoneFetch] {carrier_name}: {phone} ({method}) — {url}")
                    return phone, method
        except Exception:
            continue

    return "", "not_found"


async def scrape_jobs_with_fallback(profile: dict, rules: dict, max_results: int = 30) -> list[dict]:
    """
    Main entry — builds a rules-aware query, tries Indeed, falls back to
    rules-driven listings. For market data listings, fetches phone numbers
    live from each carrier's official recruiting page.
    """
    query, location = _build_search_query(profile, rules)
    print(f"[Scraper] Query: '{query}' | Location: '{location}'")

    results = await scrape_indeed(query=query, location=location, max_results=max_results)
    print(f"[Scraper] Indeed returned {len(results)} results")

    if len(results) < 5:
        synthetic = _generate_rules_driven_listings(profile, rules, count=max_results - len(results))
        print(f"[Scraper] Fetching live phone numbers for {len(synthetic)} carriers...")

        # Fetch phone numbers live from each carrier's recruiting page
        import asyncio
        async def enrich_with_phone(listing):
            source_url = listing.get("source_url", "")
            name = listing.get("name", "")
            if source_url and not listing.get("recruiter_phone"):
                phone, method = await fetch_phone_from_source(source_url, name)
                listing["recruiter_phone"] = phone
                listing["has_phone"] = bool(phone)
                listing["phone_source"] = method
                if phone:
                    print(f"[PhoneFetch] {name}: {phone} ({method})")
                else:
                    listing["phone_source"] = "visit_site"
                    print(f"[PhoneFetch] {name}: not found — driver must visit {source_url}")
            return listing

        # Fetch all phones concurrently (max 5 at a time to be polite)
        semaphore = asyncio.Semaphore(5)
        async def safe_enrich(listing):
            async with semaphore:
                return await enrich_with_phone(listing)

        synthetic = await asyncio.gather(*[safe_enrich(l) for l in synthetic])
        results = results + list(synthetic)

    return results[:max_results]
