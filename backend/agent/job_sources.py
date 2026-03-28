"""
Job source integrations for CDL driver job search.

Sources (in priority order):
1. Appcast XML feed  — trucking-specific, most relevant (requires publisher account)
2. Jooble API        — free tier available, aggregates many boards
3. ZipRecruiter RSS  — public feed, no key required
4. Market data       — our carrier pool as final fallback

Add your credentials to app.py:
  APPCAST_FEED_URL = "https://publisher.appcast.io/..."  # from Appcast onboarding
  JOOBLE_API_KEY   = "your-jooble-key"                  # from jooble.org/api
"""

import httpx
import re
import xml.etree.ElementTree as ET
from typing import Optional
from datetime import datetime, timezone


HEADERS = {
    "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    "Accept": "application/json, text/xml, */*",
}

# Set these in app.py
APPCAST_FEED_URL: str = ""
JOOBLE_API_KEY: str = ""


# ── Shared extraction helpers ──────────────────────────────────────────────────

def _normalize_phone(raw: str) -> str:
    digits = re.sub(r"[^\d]", "", raw)
    if len(digits) == 10:
        return "+1" + digits
    if len(digits) == 11 and digits.startswith("1"):
        return "+" + digits
    return ""


def _extract_cpm(text: str) -> Optional[float]:
    for pat in [
        r"([\d.]+)\s*cpm",
        r"\$?([\d.]+)\s*(?:cents?|¢)\s*(?:per|/)\s*mile",
        r"\$?(0\.\d+)\s*(?:per|/)\s*mile",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            val = float(m.group(1))
            return round(val * 100 if val < 2 else val, 2)
    return None


def _extract_weekly(text: str) -> Optional[float]:
    for pat in [
        r"\$?([\d,]+)\s*(?:per|/)\s*week",
        r"\$?([\d,]+)\s*weekly",
    ]:
        m = re.search(pat, text, re.IGNORECASE)
        if m:
            return float(m.group(1).replace(",", ""))
    return None


def _extract_home_time(text: str) -> str:
    t = text.lower()
    if any(x in t for x in ["home daily", "local route", "home every day"]):
        return "Daily"
    if any(x in t for x in ["home weekly", "weekly home", "home every week"]):
        return "Weekly"
    if any(x in t for x in ["bi-weekly", "every other week", "home weekends"]):
        return "Bi-Weekly"
    if "regional" in t:
        return "Regional OTR"
    if any(x in t for x in ["otr", "over the road", "long haul"]):
        return "OTR"
    return ""


def _extract_freight(text: str) -> list:
    mapping = {
        "Dry Van": ["dry van"],
        "Refrigerated (Reefer)": ["reefer", "refrigerated"],
        "Flatbed": ["flatbed"],
        "Tanker": ["tanker"],
        "Hazmat": ["hazmat"],
        "Intermodal": ["intermodal"],
        "Auto Hauler": ["auto hauler", "car hauler"],
    }
    tl = text.lower()
    return [ft for ft, kws in mapping.items() if any(k in tl for k in kws)]


def _extract_phone_from_text(text: str) -> str:
    # tel: links first
    for tel in re.findall(r'href=["\']tel:([^"\'>]+)', text, re.IGNORECASE):
        p = _normalize_phone(tel)
        if p:
            return p
    # labeled numbers
    for raw in re.findall(
        r'(?:call|phone|contact|recruiting)[^<]{0,60}(\(?\d{3}\)?[\s.\-]\d{3}[\s.\-]\d{4})',
        text, re.IGNORECASE
    ):
        p = _normalize_phone(raw)
        if p:
            return p
    return ""


def _detect_flags(text: str) -> dict:
    tl = text.lower()
    return {
        "no_touch": any(x in tl for x in ["no touch", "no-touch"]),
        "drop_and_hook": any(x in tl for x in ["drop and hook", "drop & hook"]),
        "forced_dispatch": "forced dispatch" in tl,
        "lease_only": "lease purchase only" in tl,
        "sign_on_bonus": any(x in tl for x in ["sign-on bonus", "signing bonus"]),
        "health_insurance": any(x in tl for x in ["health insurance", "medical benefits"]),
        "retirement_plan": any(x in tl for x in ["401k", "401(k)", "retirement"]),
        "eld_provided": "eld provided" in tl,
        "pet_policy": "pet policy" in tl,
        "rider_policy": "rider policy" in tl,
    }


def _state_from_location(location: str) -> str:
    m = re.search(r",\s*([A-Z]{2})\b", location)
    return m.group(1) if m else ""


def _make_listing(
    *,
    id: str,
    source: str,
    source_label: str,
    name: str,
    job_title: str,
    location: str,
    description: str,
    job_url: str,
    source_url: str = "",
    recruiter_phone: str = "",
    recruiter_name: str = "",
) -> dict:
    state = _state_from_location(location)
    text = f"{job_title} {description}"
    return {
        "id": id,
        "source": source,
        "source_label": source_label,
        "name": name,
        "job_title": job_title,
        "location": location,
        "operating_states": [state] if state else [],
        "cpm": _extract_cpm(text),
        "weekly_pay_estimate": _extract_weekly(text),
        "home_time": _extract_home_time(text),
        "freight_types": _extract_freight(text),
        "job_url": job_url,
        "source_url": source_url or job_url,
        "recruiter_phone": recruiter_phone or _extract_phone_from_text(description),
        "recruiter_name": recruiter_name,
        "has_phone": bool(recruiter_phone or _extract_phone_from_text(description)),
        "phone_source": "job_posting" if recruiter_phone else "",
        "scraped_at": datetime.now(timezone.utc).isoformat(),
        **_detect_flags(text),
    }


# ── Source 1: Appcast ──────────────────────────────────────────────────────────

async def fetch_appcast(
    feed_url: str,
    profile: dict,
    rules: dict,
    max_results: int = 30,
) -> list[dict]:
    """
    Fetch live CDL jobs from Appcast XML feed.

    Setup:
      1. Email publishers@appcast.io and request a publisher feed for CDL drivers
      2. They'll give you a feed URL like:
         https://publisher.appcast.io/feed?pub_id=XXXX&format=xml
      3. Set APPCAST_FEED_URL in app.py

    The feed returns real, live job postings updated continuously.
    """
    if not feed_url:
        return []

    zip_code = rules.get("home_zip") or profile.get("zip_code", "")
    freight = profile.get("freight_current", [])
    keywords = "CDL Class A truck driver"
    if freight:
        keywords += f" {freight[0]}"

    # Appcast supports query params to filter the feed
    params = {
        "q": keywords,
        "limit": max_results * 2,
    }
    if zip_code:
        params["location"] = zip_code
        params["radius"] = rules.get("radius_miles") or 500

    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=20, follow_redirects=True) as client:
            resp = await client.get(feed_url, params=params)
            resp.raise_for_status()
            content_type = resp.headers.get("content-type", "")

            if "json" in content_type:
                return _parse_appcast_json(resp.json(), max_results)
            else:
                return _parse_appcast_xml(resp.text, max_results)

    except Exception as e:
        print(f"[Appcast] Error: {e}")
        return []


def _parse_appcast_xml(xml_text: str, max_results: int) -> list[dict]:
    listings = []
    try:
        root = ET.fromstring(xml_text)
        # Handle both RSS and Atom formats
        ns = {"atom": "http://www.w3.org/2005/Atom"}
        items = root.findall(".//item") or root.findall(".//atom:entry", ns)

        for i, item in enumerate(items[:max_results]):
            def g(tag):
                el = item.find(tag)
                return el.text.strip() if el is not None and el.text else ""

            title = g("title")
            company = g("company") or g("source") or "Unknown Carrier"
            location = g("location") or g("city") or ""
            description = g("description") or g("summary") or ""
            url = g("link") or g("url") or ""
            guid = g("guid") or f"appcast_{i}"

            if not title:
                continue

            listings.append(_make_listing(
                id=f"appcast_{re.sub(r'[^a-z0-9]', '_', guid.lower())[:40]}",
                source="Appcast",
                source_label="Appcast.io",
                name=company,
                job_title=title,
                location=location,
                description=description,
                job_url=url,
            ))
    except ET.ParseError as e:
        print(f"[Appcast] XML parse error: {e}")
    return listings


def _parse_appcast_json(data: dict, max_results: int) -> list[dict]:
    listings = []
    jobs = data.get("jobs") or data.get("results") or data.get("data") or []
    for i, job in enumerate(jobs[:max_results]):
        title = job.get("title") or job.get("job_title") or ""
        company = job.get("company") or job.get("advertiser") or "Unknown Carrier"
        location = job.get("location") or job.get("city") or ""
        description = job.get("description") or job.get("body") or ""
        url = job.get("url") or job.get("apply_url") or job.get("link") or ""
        job_id = job.get("id") or job.get("job_id") or f"ac_{i}"

        if not title:
            continue

        listings.append(_make_listing(
            id=f"appcast_{str(job_id)[:40]}",
            source="Appcast",
            source_label="Appcast.io",
            name=company,
            job_title=title,
            location=location,
            description=description,
            job_url=url,
        ))
    return listings


# ── Source 2: Jooble ──────────────────────────────────────────────────────────

async def fetch_jooble(
    api_key: str,
    profile: dict,
    rules: dict,
    max_results: int = 30,
) -> list[dict]:
    """
    Fetch live CDL jobs from Jooble API.

    Setup:
      1. Go to jooble.org/api and request a free API key
      2. Free tier: 500 requests/day, real live jobs aggregated from many boards
      3. Set JOOBLE_API_KEY in app.py
    """
    if not api_key:
        return []

    zip_code = rules.get("home_zip") or profile.get("zip_code", "")
    freight = profile.get("freight_current", [])
    keywords = "CDL Class A truck driver"
    if freight:
        keywords += f" {freight[0]}"

    payload = {
        "keywords": keywords,
        "location": zip_code or "",
        "radius": str(rules.get("radius_miles") or 300),
        "page": "1",
        "ResultsPerPage": str(max_results),
    }

    try:
        async with httpx.AsyncClient(headers=HEADERS, timeout=15) as client:
            resp = await client.post(
                f"https://jooble.org/api/{api_key}",
                json=payload,
            )
            resp.raise_for_status()
            data = resp.json()

        jobs = data.get("jobs", [])
        listings = []

        for i, job in enumerate(jobs[:max_results]):
            title = job.get("title", "")
            company = job.get("company", "Unknown Carrier")
            location = job.get("location", "")
            description = re.sub(r"<[^>]+>", " ", job.get("snippet", ""))
            url = job.get("link", "")
            salary = job.get("salary", "")
            job_id = job.get("id", f"jooble_{i}")

            if not title or "cdl" not in title.lower() and "driver" not in title.lower():
                continue

            listings.append(_make_listing(
                id=f"jooble_{str(job_id)[:40]}",
                source="Jooble",
                source_label="Jooble.org",
                name=company,
                job_title=title,
                location=location,
                description=f"{description} {salary}",
                job_url=url,
            ))

        print(f"[Jooble] Returned {len(listings)} CDL jobs")
        return listings

    except Exception as e:
        print(f"[Jooble] Error: {e}")
        return []


# ── Source 3: ZipRecruiter public RSS ─────────────────────────────────────────

async def fetch_ziprecruiter(
    profile: dict,
    rules: dict,
    max_results: int = 20,
) -> list[dict]:
    """
    Fetch CDL jobs from ZipRecruiter's public RSS feed.
    No API key required. Real live jobs updated frequently.
    """
    zip_code = rules.get("home_zip") or profile.get("zip_code", "")
    freight = profile.get("freight_current", [])

    query = "CDL+Class+A+truck+driver"
    if freight:
        query += f"+{freight[0].replace(' ', '+')}"

    url = f"https://www.ziprecruiter.com/jobs-search/feed/rss?search={query}"
    if zip_code:
        url += f"&location={zip_code}&radius={rules.get('radius_miles') or 300}"

    try:
        async with httpx.AsyncClient(
            headers={**HEADERS, "Accept": "application/rss+xml, application/xml, text/xml"},
            timeout=15, follow_redirects=True
        ) as client:
            resp = await client.get(url)
            if resp.status_code != 200:
                print(f"[ZipRecruiter] Status {resp.status_code}")
                return []

        listings = []
        try:
            root = ET.fromstring(resp.text)
            items = root.findall(".//item")
        except ET.ParseError:
            print("[ZipRecruiter] XML parse failed")
            return []

        for i, item in enumerate(items[:max_results]):
            def g(tag):
                el = item.find(tag)
                return el.text.strip() if el is not None and el.text else ""

            title = g("title")
            description = re.sub(r"<[^>]+>", " ", g("description"))
            url = g("link")
            pub_date = g("pubDate")

            # ZipRecruiter embeds company in title as "Title at Company"
            company = "Unknown Carrier"
            if " at " in title:
                parts = title.rsplit(" at ", 1)
                title = parts[0].strip()
                company = parts[1].strip()

            # Extract location from description
            loc_m = re.search(r'([A-Za-z\s]+,\s*[A-Z]{2})\b', description)
            location = loc_m.group(1).strip() if loc_m else ""

            if not title or "driver" not in title.lower() and "cdl" not in title.lower():
                continue

            listings.append(_make_listing(
                id=f"zip_{i}_{re.sub(r'[^a-z0-9]', '', company.lower())[:20]}",
                source="ZipRecruiter",
                source_label="ZipRecruiter.com",
                name=company,
                job_title=title,
                location=location,
                description=description,
                job_url=url,
            ))

        print(f"[ZipRecruiter] Returned {len(listings)} CDL jobs")
        return listings

    except Exception as e:
        print(f"[ZipRecruiter] Error: {e}")
        return []


# ── Main entry ─────────────────────────────────────────────────────────────────

async def fetch_live_jobs(
    profile: dict,
    rules: dict,
    max_results: int = 30,
) -> tuple[list[dict], str]:
    """
    Try all live job sources in priority order.
    Returns (listings, source_name).
    """
    # 1. Appcast (best — trucking-specific, real-time)
    if APPCAST_FEED_URL:
        results = await fetch_appcast(APPCAST_FEED_URL, profile, rules, max_results)
        if results:
            print(f"[JobFetch] Appcast: {len(results)} live jobs")
            return results, "Appcast"

    # 2. Jooble (good — free API, aggregates many boards)
    if JOOBLE_API_KEY:
        results = await fetch_jooble(JOOBLE_API_KEY, profile, rules, max_results)
        if results:
            print(f"[JobFetch] Jooble: {len(results)} live jobs")
            return results, "Jooble"

    # 3. ZipRecruiter RSS (no key required, decent coverage)
    results = await fetch_ziprecruiter(profile, rules, max_results)
    if results:
        print(f"[JobFetch] ZipRecruiter RSS: {len(results)} live jobs")
        return results, "ZipRecruiter"

    print("[JobFetch] All live sources returned 0 results — using market data fallback")
    return [], "fallback"
