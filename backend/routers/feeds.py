"""
Carrier job feed management.
Supports XML (including Appcast-style), JSON, and CSV feeds.
Parses jobs into feed_jobs table and scores against user rules.
"""
import json
import csv
import io
import re
import hashlib
from typing import Optional
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from pydantic import BaseModel

from db.database import db, row_to_dict
from db.auth import get_current_user
from agent.rules import AgentRules, score_carrier_against_rules

router = APIRouter()


# ── Models ────────────────────────────────────────────────────────────────────
class FeedCreate(BaseModel):
    name: str
    feed_type: str
    source: str
    is_url: bool = True
    field_map: Optional[dict] = None
    default_carrier: Optional[str] = ""   # company name when feed doesn't include it
    default_phone: Optional[str] = ""      # recruiter phone when feed doesn't include it


class FeedUpdate(BaseModel):
    name: Optional[str] = None
    status: Optional[str] = None
    field_map: Optional[dict] = None


# ── Field extraction helpers ──────────────────────────────────────────────────
def _get(obj: dict, *keys, default="") -> str:
    """Try multiple field name variants, return first non-empty."""
    for k in keys:
        v = obj.get(k)
        if v is not None and str(v).strip():
            return str(v).strip()
    return default


def _extract_cpm(text: str) -> Optional[float]:
    """Extract CPM from strings like '$0.55/mile', '55 cpm', '55¢'."""
    if not text:
        return None
    text = str(text)
    m = re.search(r'\$?(\d+\.?\d*)\s*(?:cpm|¢|cents?(?:\s*per\s*mile)?)', text, re.IGNORECASE)
    if m:
        v = float(m.group(1))
        return v if v > 10 else v * 100  # handle both 0.55 and 55
    m = re.search(r'\$0\.(\d{2,})', text)
    if m:
        return float('0.' + m.group(1)) * 100
    return None


def _extract_weekly(text: str) -> Optional[float]:
    """Extract weekly pay — picks the highest value in a range like $880-$2,000/week."""
    if not text:
        return None
    text = str(text).replace(',', '')
    # Find all dollar amounts
    amounts = re.findall(r'\$?(\d{3,5})(?:\.\d+)?', text)
    # Filter to plausible weekly pay range ($400 - $10,000)
    valid = [float(a) for a in amounts if 400 <= float(a) <= 10000]
    if not valid:
        return None
    # Only return if there's a weekly/week/wk keyword nearby, or if called from full_text scan
    if any(kw in text.lower() for kw in ['/wk', '/week', 'weekly', 'per week', 'a week', 'week!']):
        return max(valid)  # use highest value in range
    # If no weekly keyword, only return if it looks like a specific pay field (short text)
    if len(text) < 50:
        return max(valid)
    return None


def _clean_location(text: str) -> str:
    """Extract City, ST from messy location strings."""
    if not text:
        return ""
    m = re.search(r'([A-Z][a-z]{2,}(?:\s[A-Z][a-z]+)*),\s*([A-Z]{2})\b', text)
    if m:
        return f"{m.group(1)}, {m.group(2)}"
    return text[:100]


def _job_id(feed_id: int, carrier: str, title: str, location: str, raw: dict) -> str:
    """Generate a stable unique ID for deduplication within a feed."""
    # Try known ID fields from the raw row first
    for k in ('id', 'jobId', 'job_id', 'referencenumber', 'referenceNumber',
              'requisitionId', 'requisition_id', 'jobref', 'JobRef', 'ref'):
        v = raw.get(k) or raw.get(k.lower())
        if v and str(v).strip():
            return str(v).strip()[:200]
    # Fallback: hash of feed_id + carrier + title + location (stable across syncs)
    sig = f"{feed_id}|{carrier}|{title}|{location}"
    return hashlib.md5(sig.encode()).hexdigest()


# ── XML parser ────────────────────────────────────────────────────────────────
def parse_xml_feed(content: str, field_map: dict = None, feed_id: int = 0) -> list[dict]:
    import xml.etree.ElementTree as ET
    fm = field_map or {}
    jobs = []
    try:
        root = ET.fromstring(content)
    except ET.ParseError as e:
        raise ValueError(f"Invalid XML: {e}")

    # Find job records — try common container patterns
    items = (
        root.findall('.//job') or
        root.findall('.//Job') or
        root.findall('.//item') or
        root.findall('.//position') or
        root.findall('.//listing') or
        root.findall('.//vacancy') or
        list(root)
    )

    def tag_text(el, *tags) -> str:
        for t in tags:
            found = el.find(t)
            if found is not None and found.text:
                return found.text.strip()
        return ""

    for item in items:
        # Build flat dict from XML element
        raw = {child.tag: (child.text or "").strip() for child in item}

        carrier = (
            fm.get('carrier_name') and tag_text(item, fm['carrier_name']) or
            tag_text(item, 'company', 'Company', 'employer', 'Employer',
                     'advertiser', 'Advertiser', 'brand', 'Brand',
                     'companyName', 'company_name', 'CompanyName',
                     'clientname', 'ClientName', 'client', 'Client',
                     'organization', 'Organization', 'businessname',
                     'BusinessName', 'hiringorganization', 'HiringOrganization')
        )
        title = (
            fm.get('job_title') and tag_text(item, fm['job_title']) or
            tag_text(item, 'title', 'Title', 'jobtitle', 'JobTitle',
                     'job_title', 'positionTitle', 'position', 'Position',
                     'JobCategory', 'jobcategory', 'occupation', 'Occupation')
        )
        location = _clean_location(
            fm.get('location') and tag_text(item, fm['location']) or
            tag_text(item, 'location', 'Location', 'city', 'City',
                     'jobLocation', 'job_location', 'worksite')
        )
        pay_text = tag_text(item, 'salary', 'Salary', 'compensation',
                            'Compensation', 'pay', 'Pay', 'rate', 'cpm', 'CPM')
        url = tag_text(item, 'url', 'URL', 'link', 'Link', 'apply_url',
                       'applyUrl', 'job_url', 'jobUrl', 'detailUrl')
        desc = tag_text(item, 'description', 'Description', 'body',
                        'summary', 'jobDescription', 'requirements')
        home_time = tag_text(item, 'hometime', 'homeTime', 'home_time',
                             'schedule', 'Schedule')
        phone = tag_text(item, 'phone', 'Phone', 'recruiterPhone',
                         'recruiter_phone', 'contactPhone')

        if not carrier and not title:
            continue

        jobs.append({
            '_raw': raw,
            '_id': _job_id(feed_id, carrier, title, location, raw),
            'carrier_name': carrier or 'Unknown Carrier',
            'job_title': title or 'CDL Driver',
            'location': location,
            'cpm': _extract_cpm(pay_text),
            'weekly_pay': _extract_weekly(pay_text),
            'home_time': home_time,
            'job_url': url,
            'description': desc[:1000] if desc else '',
            'recruiter_phone': phone,
        })
    return jobs


# ── JSON parser ───────────────────────────────────────────────────────────────
def _extract_home_time_from_text(text: str) -> str:
    """Extract home time from description/benefits text."""
    if not text:
        return ""
    text_lower = text.lower()
    if "home daily" in text_lower or "daily home" in text_lower or "local" in text_lower:
        return "Daily"
    if "home weekly" in text_lower or "weekly home" in text_lower or "home every week" in text_lower:
        return "Weekly"
    if "home bi-weekly" in text_lower or "every two weeks" in text_lower or "biweekly" in text_lower:
        return "Bi-Weekly"
    if "regional" in text_lower:
        return "Regional OTR"
    if "otr" in text_lower or "over the road" in text_lower or "3-4 weeks" in text_lower:
        return "OTR"
    return ""


def parse_json_feed(content: str, field_map: dict = None, feed_id: int = 0, default_carrier: str = "", default_phone: str = "") -> list[dict]:
    fm = field_map or {}
    try:
        data = json.loads(content)
    except json.JSONDecodeError as e:
        raise ValueError(f"Invalid JSON: {e}")

    # Unwrap common wrappers
    if isinstance(data, dict):
        for key in ('jobs', 'results', 'listings', 'data', 'items', 'positions', 'vacancies'):
            if key in data and isinstance(data[key], list):
                data = data[key]
                break
        else:
            data = [data]

    jobs = []
    for row in data:
        if not isinstance(row, dict):
            continue

        # Carrier name — Leadflex uses client_name, also try common variants
        carrier = _get(row,
            fm.get('carrier_name', ''),
            'client_name', 'clientName', 'client_Name',
            'company', 'Company', 'employer', 'companyName',
            'company_name', 'brand', 'advertiser', 'organization')
        # Fall back to the feed-level default carrier name if set
        if not carrier and default_carrier:
            carrier = default_carrier

        title = _get(row,
            fm.get('job_title', ''),
            'job_title', 'jobTitle', 'title', 'position', 'positionTitle', 'name')

        # Location — Leadflex splits into city/state; also try combined fields
        city  = _get(row, 'city', 'City', 'region', 'Region', 'work_city', 'workCity')
        state = _get(row, 'state', 'State', 'work_state', 'workState', 'st')
        if city and state:
            location = f"{city.strip()}, {state.strip()}"
        elif city or state:
            location = f"{city.strip()}{state.strip()}"
        else:
            location = _clean_location(_get(row,
                fm.get('location', ''), 'location', 'jobLocation', 'address'))

        # Pay — Leadflex uses 'pay' field like "$880-$2000 week"
        desc     = _get(row, 'description', 'summary', 'body', 'jobDescription')
        benefits = _get(row, 'job_benefits', 'benefits', 'jobBenefits', 'perks')
        full_text = f"{desc} {benefits}"

        pay_text = _get(row, 'pay', 'Pay', 'salary', 'compensation', 'rate', 'cpm',
                        'base_salary', 'wage', 'hourly_wage')

        # CPM — Leadflex has cents_per_mile field
        cpm_raw = _get(row, 'cents_per_mile', 'cpm', 'CPM', 'centsPerMile')

        # If pay fields are blank, scan the description and benefits text
        if not pay_text and not cpm_raw:
            pay_text = full_text

        url = _get(row, 'base_url', 'url', 'link', 'applyUrl', 'apply_url',
                   'application_link', 'jobUrl', 'detailUrl')

        # Home time — Leadflex has home_time field but it may be null; also check campaign_name_filter
        home_time = (
            _get(row, 'home_time', 'homeTime', 'hometime', 'schedule') or
            _get(row, 'campaign_name_filter', 'campaignNameFilter') or
            _extract_home_time_from_text(full_text)
        )

        phone = (_get(row, 'phone', 'recruiterPhone', 'contactPhone', 'recruiter_phone') or default_phone)

        # External ID — Leadflex uses leadflex_job_id or requisition_id
        ext_id_val = (
            _get(row, 'leadflex_job_id', 'external_job_id', 'requisition_id',
                 'requisitionId', 'id', 'jobId', 'job_id') or
            _job_id(feed_id, carrier, title, location, row)
        )

        if not carrier and not title:
            continue

        jobs.append({
            '_raw': row,
            '_id': str(ext_id_val)[:200],
            'carrier_name': carrier or default_carrier or 'Unknown Carrier',
            'job_title': title or 'CDL-A Driver',
            'location': location,
            'cpm': _extract_cpm(str(cpm_raw)) if cpm_raw else _extract_cpm(pay_text),
            'weekly_pay': _extract_weekly(pay_text),
            'home_time': home_time,
            'job_url': url,
            'description': (desc[:1000] if desc else '') + (' | ' + benefits[:500] if benefits else ''),
            'recruiter_phone': phone,
        })
    return jobs


# ── CSV parser ────────────────────────────────────────────────────────────────
def parse_csv_feed(content: str, field_map: dict = None, feed_id: int = 0) -> list[dict]:
    fm = field_map or {}
    reader = csv.DictReader(io.StringIO(content))
    jobs = []
    for row in reader:
        row = {k.strip().lower().replace(' ', '_'): (v or '').strip() for k, v in row.items()}

        carrier = _get(row, fm.get('carrier_name', ''), 'company', 'employer', 'carrier', 'advertiser')
        title   = _get(row, fm.get('job_title', ''), 'title', 'job_title', 'position')
        location = _clean_location(_get(row, fm.get('location', ''), 'location', 'city', 'state'))
        pay_text = _get(row, 'salary', 'pay', 'compensation', 'rate', 'cpm')
        url      = _get(row, 'url', 'link', 'apply_url', 'job_url')
        phone    = _get(row, 'phone', 'recruiter_phone', 'contact_phone')
        home_time = _get(row, 'home_time', 'hometime', 'schedule')

        if not carrier and not title:
            continue

        jobs.append({
            '_raw': row,
            '_id': _job_id(feed_id, carrier, title, location, row),
            'carrier_name': carrier or 'Unknown Carrier',
            'job_title': title or 'CDL Driver',
            'location': location,
            'cpm': _extract_cpm(pay_text),
            'weekly_pay': _extract_weekly(pay_text),
            'home_time': home_time,
            'job_url': url,
            'description': '',
            'recruiter_phone': phone,
        })
    return jobs


# ── Fetch + parse ─────────────────────────────────────────────────────────────
async def fetch_and_parse(feed: dict) -> list[dict]:
    source   = feed['source']
    ftype    = feed['feed_type']
    is_url   = feed.get('is_url', 1)
    field_map = json.loads(feed['field_map']) if feed.get('field_map') else {}

    if is_url:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.get(source, headers={'User-Agent': 'DriverAgent/1.0'})
            resp.raise_for_status()
            content = resp.text
    else:
        content = source

    default_carrier = field_map.pop('_default_carrier', '') if field_map else ''
    default_phone    = field_map.pop('_default_phone', '') if field_map else ''

    if ftype == 'xml':
        return parse_xml_feed(content, field_map, feed['id'])
    elif ftype == 'json':
        return parse_json_feed(content, field_map, feed['id'], default_carrier, default_phone)
    elif ftype == 'csv':
        return parse_csv_feed(content, field_map, feed['id'])
    else:
        content_stripped = content.strip()
        if content_stripped.startswith('<'):
            return parse_xml_feed(content, field_map, feed['id'])
        elif content_stripped.startswith('[') or content_stripped.startswith('{'):
            return parse_json_feed(content, field_map, feed['id'], default_carrier, default_phone)
        else:
            return parse_csv_feed(content, field_map, feed['id'])


def get_user_rules_obj(user_id: int) -> AgentRules:
    """Load user rules from DB as AgentRules object."""
    try:
        with db() as cur:
            cur.execute("SELECT * FROM agent_rules WHERE user_id=%s", (user_id,))
            row = cur.fetchone()
        if not row:
            return AgentRules()
        r = row_to_dict(row)
        for f in ['pay_types_accepted','preferred_regions','states_blacklist','blacklisted_carriers','preferred_carriers']:
            if isinstance(r.get(f), str):
                try: r[f] = json.loads(r[f])
                except: r[f] = []
        return AgentRules(**{k: v for k, v in r.items() if k in AgentRules.model_fields})
    except Exception:
        return AgentRules()


def score_job(job: dict, rules: AgentRules) -> int:
    """Score a feed job against the user's rules. Uses pay, home time, location."""
    import re as _re
    location = job.get('location', '')

    # Extract state from "City, ST" for geography scoring
    state_match = _re.search(r',\s*([A-Z]{2})\b', location)
    operating_states = [state_match.group(1)] if state_match else []

    # Build weekly pay from cpm if missing
    cpm = job.get('cpm')
    weekly = job.get('weekly_pay')
    if not weekly and cpm:
        weekly = round(cpm / 100 * 2400)

    carrier = {
        'name':                  job.get('carrier_name', ''),
        'location':              location,
        'cpm':                   cpm,
        'weekly_pay_estimate':   weekly,
        'home_time':             job.get('home_time', ''),
        'freight_types':         [],
        'operating_states':      operating_states,
        'no_touch':              False,
        'drop_and_hook':         False,
        'forced_dispatch':       False,
        'lease_only':            False,
        'sign_on_bonus':         False,
        'health_insurance':      False,
        'retirement_plan':       False,
    }
    result = score_carrier_against_rules(carrier, rules)
    return max(0, min(100, result.get('score', 50)))


# ── Routes ────────────────────────────────────────────────────────────────────
@router.post("/feeds/rescore")
def rescore_feed_jobs(user: dict = Depends(get_current_user)):
    """Re-score all feed jobs against the user's current rules."""
    user_id = int(user["sub"])
    rules = get_user_rules_obj(user_id)
    with db() as cur:
        cur.execute("SELECT id, carrier_name, location, cpm, weekly_pay, home_time FROM feed_jobs WHERE user_id=%s", (user_id,))
        rows = cur.fetchall()
    updated = 0
    for row in rows:
        j = row_to_dict(row)
        score = score_job(j, rules)
        with db() as cur:
            cur.execute("UPDATE feed_jobs SET match_score=%s WHERE id=%s AND user_id=%s",
                        (score, j['id'], user_id))
        updated += 1
    return {"success": True, "updated": updated}


@router.get("/feeds")
def list_feeds(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("SELECT * FROM carrier_feeds WHERE user_id=%s ORDER BY created_at DESC", (user_id,))
        rows = cur.fetchall()
    return {"feeds": [row_to_dict(r) for r in rows]}


@router.post("/feeds")
async def create_feed(feed: FeedCreate, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    field_map_json = json.dumps(feed.field_map) if feed.field_map else None
    # Store default_carrier in field_map JSON
    fm = feed.field_map or {}
    if feed.default_carrier:
        fm['_default_carrier'] = feed.default_carrier
    if feed.default_phone:
        fm['_default_phone'] = feed.default_phone
    field_map_json = json.dumps(fm) if fm else None
    with db() as cur:
        cur.execute("""
            INSERT INTO carrier_feeds (user_id, name, feed_type, source, is_url, field_map)
            VALUES (%s, %s, %s, %s, %s, %s)
            RETURNING id
        """, (user_id, feed.name, feed.feed_type, feed.source,
              1 if feed.is_url else 0, field_map_json))
        feed_id = cur.fetchone()["id"]

    return {"success": True, "feed_id": feed_id, "message": "Feed created. Click Sync to load jobs."}

@router.post("/feeds/{feed_id}/sync")
async def sync_feed(feed_id: int, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("SELECT * FROM carrier_feeds WHERE id=%s AND user_id=%s", (feed_id, user_id))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Feed not found")
    feed = row_to_dict(row)

    try:
        jobs = await fetch_and_parse(feed)
        rules = get_user_rules_obj(user_id)

        inserted = 0
        updated  = 0
        for j in jobs:
            ext_id = j['_id']
            score  = score_job(j, rules)
            freight_json = json.dumps(j.get('freight_types', []))
            raw_json = json.dumps({k: v for k, v in j.get('_raw', {}).items()
                                   if isinstance(v, (str, int, float, bool, type(None)))})[:2000]
            with db() as cur:
                cur.execute("""
                    INSERT INTO feed_jobs
                        (user_id, feed_id, external_id, carrier_name, job_title,
                         location, cpm, weekly_pay, home_time, freight_types,
                         description, job_url, recruiter_phone, match_score, raw_data)
                    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
                    ON CONFLICT (feed_id, external_id) DO UPDATE SET
                        carrier_name=EXCLUDED.carrier_name,
                        job_title=EXCLUDED.job_title,
                        location=EXCLUDED.location,
                        cpm=EXCLUDED.cpm,
                        weekly_pay=EXCLUDED.weekly_pay,
                        home_time=EXCLUDED.home_time,
                        job_url=EXCLUDED.job_url,
                        description=EXCLUDED.description,
                        recruiter_phone=EXCLUDED.recruiter_phone,
                        match_score=EXCLUDED.match_score,
                        raw_data=EXCLUDED.raw_data,
                        updated_at=NOW()
                """, (user_id, feed_id, ext_id, j['carrier_name'], j['job_title'],
                      j['location'], j.get('cpm'), j.get('weekly_pay'), j['home_time'],
                      freight_json, j['description'], j['job_url'], j['recruiter_phone'],
                      score, raw_json))
                inserted += 1

        with db() as cur:
            cur.execute("""
                UPDATE carrier_feeds SET last_synced=NOW(), job_count=%s, status='active', error_msg=NULL
                WHERE id=%s
            """, (len(jobs), feed_id))

        return {"success": True, "feed_id": feed_id, "jobs_parsed": len(jobs), "inserted": inserted}

    except Exception as e:
        with db() as cur:
            cur.execute("UPDATE carrier_feeds SET status='error', error_msg=%s WHERE id=%s",
                        (str(e)[:500], feed_id))
        raise HTTPException(status_code=400, detail=f"Feed sync failed: {e}")


@router.delete("/feeds/{feed_id}")
def delete_feed(feed_id: int, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("DELETE FROM carrier_feeds WHERE id=%s AND user_id=%s", (feed_id, user_id))
    return {"success": True}


@router.get("/feeds/jobs")
def get_feed_jobs(
    user: dict = Depends(get_current_user),
    feed_id: Optional[int] = None,
    search: str = "",
    min_score: int = 0,
    apply_rules: bool = False,
    page: int = 1,
    per_page: int = 20,
):
    user_id = int(user["sub"])
    offset = (page - 1) * per_page

    effective_min_score = min_score
    if apply_rules:
        rules = get_user_rules_obj(user_id)
        if getattr(rules, 'rules_active', False):
            effective_min_score = max(min_score, 60)

    where = ["fj.user_id=%s", "fj.in_outreach=0"]
    params = [user_id]
    if feed_id:
        where.append("fj.feed_id=%s")
        params.append(feed_id)
    if search:
        where.append("(fj.carrier_name LIKE %s OR fj.job_title LIKE %s OR fj.location LIKE %s)")
        params += [f"%{search}%", f"%{search}%", f"%{search}%"]
    if effective_min_score:
        where.append("fj.match_score >= %s")
        params.append(effective_min_score)

    where_clause = ' AND '.join(where)
    sql = f"""
        SELECT fj.*, cf.name as feed_name
        FROM feed_jobs fj
        LEFT JOIN carrier_feeds cf ON fj.feed_id = cf.id
        WHERE {where_clause}
        ORDER BY fj.match_score DESC, fj.updated_at DESC
        LIMIT %s OFFSET %s
    """
    with db() as cur:
        cur.execute(sql, params + [per_page, offset])
        rows = cur.fetchall()
        cur.execute(f"SELECT COUNT(*) as cnt FROM feed_jobs fj LEFT JOIN carrier_feeds cf ON fj.feed_id=cf.id WHERE {where_clause}", params)
        total_row = cur.fetchone()

    total = row_to_dict(total_row).get('cnt', 0) if total_row else 0
    total_pages = max(1, (total + per_page - 1) // per_page)
    rules_active = apply_rules and getattr(get_user_rules_obj(user_id), 'rules_active', False)

    return {
        "jobs": [row_to_dict(r) for r in rows],
        "total": total,
        "page": page,
        "per_page": per_page,
        "total_pages": total_pages,
        "rules_active": rules_active,
        "effective_min_score": effective_min_score,
    }


@router.post("/feeds/jobs/{job_id}/queue")
def queue_feed_job(job_id: int, user: dict = Depends(get_current_user)):
    """Add a feed job to outreach log."""
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("SELECT * FROM feed_jobs WHERE id=%s AND user_id=%s", (job_id, user_id))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="Job not found")
    j = row_to_dict(row)

    import uuid
    carrier_id = f"feed_{uuid.uuid4().hex[:12]}"
    record_id  = uuid.uuid4().hex[:20]
    with db() as cur:
        cur.execute("""
            INSERT INTO outreach_log
                (id, user_id, carrier_id, carrier_name, job_title, job_url, location,
                 cpm, weekly_pay_estimate, home_time, match_score, status, channel, recruiter_phone)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending','feed',%s)
        """, (record_id, user_id, carrier_id, j['carrier_name'], j['job_title'], j['job_url'],
              j['location'], j['cpm'], j['weekly_pay'], j['home_time'], j['match_score'],
              j.get('recruiter_phone') or ''))
        cur.execute("UPDATE feed_jobs SET in_outreach=1 WHERE id=%s", (job_id,))

    return {"success": True}


@router.post("/feeds/jobs/queue-bulk")
def queue_bulk_feed_jobs(
    payload: dict,
    user: dict = Depends(get_current_user)
):
    """Queue multiple feed jobs at once."""
    user_id = int(user["sub"])
    job_ids = payload.get("job_ids", [])
    queued = 0
    import uuid
    for job_id in job_ids:
        with db() as cur:
            cur.execute("SELECT * FROM feed_jobs WHERE id=%s AND user_id=%s AND in_outreach=0",
                        (job_id, user_id))
            row = cur.fetchone()
        if not row:
            continue
        j = row_to_dict(row)
        carrier_id = f"feed_{uuid.uuid4().hex[:12]}"
        record_id  = uuid.uuid4().hex[:20]
        with db() as cur:
            cur.execute("""
                INSERT INTO outreach_log
                    (id, user_id, carrier_id, carrier_name, job_title, job_url, location,
                     cpm, weekly_pay_estimate, home_time, match_score, status, channel, recruiter_phone)
                VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'pending','feed',%s)
            """, (record_id, user_id, carrier_id, j['carrier_name'], j['job_title'], j['job_url'],
                  j['location'], j['cpm'], j['weekly_pay'], j['home_time'], j['match_score'],
                  j.get('recruiter_phone') or ''))
            cur.execute("UPDATE feed_jobs SET in_outreach=1 WHERE id=%s", (job_id,))
        queued += 1
    return {"success": True, "queued": queued}
