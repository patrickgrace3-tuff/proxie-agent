"""
Database connection and table initialization for Proxie Agent.
Uses psycopg2 (PostgreSQL) for Render hosting.
"""
import psycopg2
import psycopg2.extras
from contextlib import contextmanager
import json
import os

# ── Config (overridden from environment variables) ────────────────────────────
DB_HOST     = os.getenv("DB_HOST", "localhost")
DB_PORT     = int(os.getenv("DB_PORT", 5432))
DB_USER     = os.getenv("DB_USER", "postgres")
DB_PASSWORD = os.getenv("DB_PASSWORD", "")
DB_NAME     = os.getenv("DB_NAME", "proxie_agent")
DATABASE_URL = os.getenv("DATABASE_URL", "")


def get_connection():
    if DATABASE_URL:
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    else:
        conn = psycopg2.connect(
            host=DB_HOST,
            port=DB_PORT,
            user=DB_USER,
            password=DB_PASSWORD,
            dbname=DB_NAME,
        )
    conn.autocommit = True
    return conn


@contextmanager
def db():
    """Context manager — yields a cursor, auto-closes connection."""
    conn = get_connection()
    try:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            yield cur
    finally:
        conn.close()


def init_database():
    """Create all tables if they don't exist. Safe to run on every startup."""
    conn = get_connection()
    cur = conn.cursor()

    # ── Users ─────────────────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        email         VARCHAR(255) NOT NULL UNIQUE,
        password_hash VARCHAR(255) NOT NULL,
        first_name    VARCHAR(100) DEFAULT '',
        last_name     VARCHAR(100) DEFAULT '',
        phone         VARCHAR(30)  DEFAULT '',
        role          VARCHAR(20)  DEFAULT 'driver',
        is_active     SMALLINT     DEFAULT 1,
        created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
        last_login    TIMESTAMP    DEFAULT NULL,
        notes         TEXT         DEFAULT NULL
    )
    """)

    # ── Driver profiles ───────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS profiles (
        id                      SERIAL PRIMARY KEY,
        user_id                 INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        zip_code                VARCHAR(10)  DEFAULT '',
        licenses_held           TEXT DEFAULT NULL,
        licenses_obtaining      TEXT DEFAULT NULL,
        cdl_experience          VARCHAR(50)  DEFAULT '',
        endorsements            TEXT DEFAULT NULL,
        military_service        VARCHAR(10)  DEFAULT '',
        moving_violations       VARCHAR(5)   DEFAULT '',
        preventable_accidents   VARCHAR(5)   DEFAULT '',
        driver_type             VARCHAR(50)  DEFAULT '',
        owner_operator_interest VARCHAR(10)  DEFAULT '',
        solo_or_team            VARCHAR(30)  DEFAULT '',
        team_interest           VARCHAR(10)  DEFAULT '',
        freight_current         TEXT DEFAULT NULL,
        freight_interested      TEXT DEFAULT NULL,
        best_contact_time       VARCHAR(20)  DEFAULT '',
        agreed_to_terms         VARCHAR(100) DEFAULT '',
        career_goals            TEXT DEFAULT NULL,
        setup_complete          SMALLINT     DEFAULT 0,
        updated_at              TIMESTAMP    DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # ── Agent rules ───────────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS agent_rules (
        id                          SERIAL PRIMARY KEY,
        user_id                     INT NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        min_cpm                     FLOAT DEFAULT NULL,
        min_weekly_gross            FLOAT DEFAULT NULL,
        pay_types_accepted          TEXT DEFAULT NULL,
        home_time_requirement       VARCHAR(30) DEFAULT '',
        max_days_out                INT DEFAULT NULL,
        geography_mode              VARCHAR(20) DEFAULT 'radius',
        home_zip                    VARCHAR(10) DEFAULT '',
        radius_miles                INT DEFAULT NULL,
        statewide_only              SMALLINT DEFAULT 0,
        preferred_regions           TEXT DEFAULT NULL,
        states_blacklist            TEXT DEFAULT NULL,
        no_touch_freight_required   SMALLINT DEFAULT 0,
        drop_and_hook_preferred     SMALLINT DEFAULT 0,
        team_driving_ok             SMALLINT DEFAULT 0,
        hazmat_ok                   SMALLINT DEFAULT 0,
        overnights_ok               SMALLINT DEFAULT 1,
        requires_benefits           SMALLINT DEFAULT 0,
        requires_401k               SMALLINT DEFAULT 0,
        requires_health_insurance   SMALLINT DEFAULT 0,
        pet_policy_required         SMALLINT DEFAULT 0,
        rider_policy_required       SMALLINT DEFAULT 0,
        min_fleet_size              INT DEFAULT NULL,
        auto_call_enabled           SMALLINT DEFAULT 0,
        auto_email_enabled          SMALLINT DEFAULT 0,
        require_approval_before_call SMALLINT DEFAULT 1,
        max_outreach_per_day        INT DEFAULT 5,
        blacklisted_carriers        TEXT DEFAULT NULL,
        preferred_carriers          TEXT DEFAULT NULL,
        reject_if_forced_dispatch   SMALLINT DEFAULT 0,
        reject_if_lease_purchase_only SMALLINT DEFAULT 0,
        reject_if_no_ELD_provided   SMALLINT DEFAULT 0,
        reject_if_no_sign_on_bonus  SMALLINT DEFAULT 0,
        rules_active                SMALLINT DEFAULT 0,
        updated_at                  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # ── Outreach log ──────────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS outreach_log (
        id                  VARCHAR(20) PRIMARY KEY,
        user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        carrier_name        VARCHAR(200) DEFAULT '',
        carrier_id          VARCHAR(100) DEFAULT '',
        job_title           VARCHAR(200) DEFAULT '',
        job_url             TEXT DEFAULT NULL,
        location            VARCHAR(200) DEFAULT '',
        cpm                 FLOAT DEFAULT NULL,
        weekly_pay_estimate FLOAT DEFAULT NULL,
        home_time           VARCHAR(50)  DEFAULT '',
        freight_types       TEXT DEFAULT NULL,
        match_score         INT DEFAULT 0,
        match_passed        TEXT DEFAULT NULL,
        match_failed        TEXT DEFAULT NULL,
        match_warnings      TEXT DEFAULT NULL,
        status              VARCHAR(30)  DEFAULT 'pending',
        channel             VARCHAR(20)  DEFAULT '',
        contacted_at        TIMESTAMP DEFAULT NULL,
        recruiter_name      VARCHAR(200) DEFAULT '',
        recruiter_phone     VARCHAR(30)  DEFAULT '',
        recruiter_email     VARCHAR(200) DEFAULT '',
        call_duration_seconds INT DEFAULT 0,
        call_summary        TEXT DEFAULT NULL,
        recording_url       VARCHAR(500) DEFAULT NULL,
        fmcsa_data          TEXT DEFAULT NULL,
        outcome_notes       TEXT DEFAULT NULL,
        offer_cpm           FLOAT DEFAULT NULL,
        offer_weekly        FLOAT DEFAULT NULL,
        follow_up_date      VARCHAR(50)  DEFAULT '',
        driver_approved     SMALLINT DEFAULT 0,
        driver_passed       SMALLINT DEFAULT 0,
        created_at          TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        last_updated        TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # ── Call log ──────────────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS call_log (
        id                  SERIAL PRIMARY KEY,
        user_id             INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        call_id             VARCHAR(100) DEFAULT '',
        outreach_record_id  VARCHAR(20)  DEFAULT '',
        carrier             VARCHAR(200) DEFAULT '',
        recruiter_phone     VARCHAR(30)  DEFAULT '',
        driver_name         VARCHAR(200) DEFAULT '',
        status              VARCHAR(30)  DEFAULT 'dispatched',
        outcome             VARCHAR(50)  DEFAULT '',
        duration_seconds    INT DEFAULT 0,
        transcript          TEXT DEFAULT NULL,
        summary             TEXT DEFAULT NULL,
        recruiter_name      VARCHAR(200) DEFAULT '',
        dispatched_at       TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # ── Sessions ──────────────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id          SERIAL PRIMARY KEY,
        user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        token_jti   VARCHAR(100) NOT NULL UNIQUE,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        expires_at  TIMESTAMP NOT NULL
    )
    """)

    # ── Carrier feeds ─────────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS carrier_feeds (
        id          SERIAL PRIMARY KEY,
        user_id     INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        name        VARCHAR(200) NOT NULL,
        feed_type   VARCHAR(10)  NOT NULL DEFAULT 'xml',
        source      TEXT NOT NULL,
        is_url      SMALLINT DEFAULT 1,
        field_map   TEXT DEFAULT NULL,
        status      VARCHAR(20)  DEFAULT 'active',
        last_synced TIMESTAMP DEFAULT NULL,
        job_count   INT DEFAULT 0,
        error_msg   TEXT DEFAULT NULL,
        created_at  TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """)

    # ── Feed jobs ─────────────────────────────────────────────────────────────
    cur.execute("""
    CREATE TABLE IF NOT EXISTS feed_jobs (
        id              SERIAL PRIMARY KEY,
        user_id         INT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        feed_id         INT NOT NULL REFERENCES carrier_feeds(id) ON DELETE CASCADE,
        external_id     VARCHAR(200) DEFAULT NULL,
        carrier_name    VARCHAR(200) DEFAULT NULL,
        job_title       VARCHAR(200) DEFAULT NULL,
        location        VARCHAR(200) DEFAULT NULL,
        cpm             FLOAT DEFAULT NULL,
        weekly_pay      FLOAT DEFAULT NULL,
        home_time       VARCHAR(100) DEFAULT NULL,
        freight_types   TEXT DEFAULT NULL,
        description     TEXT DEFAULT NULL,
        job_url         VARCHAR(500) DEFAULT NULL,
        recruiter_phone VARCHAR(50)  DEFAULT NULL,
        recruiter_name  VARCHAR(100) DEFAULT NULL,
        match_score     INT DEFAULT 50,
        raw_data        TEXT DEFAULT NULL,
        in_outreach     SMALLINT DEFAULT 0,
        created_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at      TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (feed_id, external_id)
    )
    """)

    cur.close()
    conn.close()
    print(f"[DB] Database initialized successfully")


def _run_migrations():
    """PostgreSQL — tables created fresh so no migrations needed."""
    pass


def row_to_dict(row):
    """Convert a DB row, parsing JSON fields."""
    if not row:
        return None
    JSON_FIELDS = {
        'licenses_held', 'licenses_obtaining', 'endorsements',
        'freight_current', 'freight_interested', 'pay_types_accepted',
        'preferred_regions', 'states_blacklist', 'blacklisted_carriers',
        'preferred_carriers', 'freight_types', 'match_passed',
        'match_failed', 'match_warnings',
    }
    result = {}
    for k, v in dict(row).items():
        if k in JSON_FIELDS and isinstance(v, str):
            try:
                result[k] = json.loads(v)
            except Exception:
                result[k] = []
        else:
            result[k] = v
    return result