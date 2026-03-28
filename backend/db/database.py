"""
Database connection and table initialization for Driver Agent.
Uses PyMySQL directly (no ORM) for simplicity and full control.
"""
import pymysql
import pymysql.cursors
from contextlib import contextmanager
from pathlib import Path
import json

# ── Config (overridden from app.py) ──────────────────────────────────────────
DB_HOST     = "localhost"
DB_PORT     = 3306
DB_USER     = "root"
DB_PASSWORD = ""          # set in app.py
DB_NAME     = "driver_agent"


def get_connection() -> pymysql.Connection:
    return pymysql.connect(
        host=DB_HOST,
        port=DB_PORT,
        user=DB_USER,
        password=DB_PASSWORD,
        database=DB_NAME,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )


@contextmanager
def db():
    """Context manager — yields a cursor, auto-closes connection."""
    conn = get_connection()
    try:
        with conn.cursor() as cur:
            yield cur
    finally:
        conn.close()


def init_database():
    """
    Create the database and all tables if they don't exist.
    Safe to run on every startup.
    """
    # First connect without a database to create it
    conn = pymysql.connect(
        host=DB_HOST, port=DB_PORT,
        user=DB_USER, password=DB_PASSWORD,
        charset="utf8mb4",
        cursorclass=pymysql.cursors.DictCursor,
        autocommit=True,
    )
    with conn.cursor() as cur:
        cur.execute(f"CREATE DATABASE IF NOT EXISTS `{DB_NAME}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
    conn.close()

    # Now connect with the database and create tables
    conn = get_connection()
    with conn.cursor() as cur:

        # ── Users ─────────────────────────────────────────────────────────────
        cur.execute("""
        CREATE TABLE IF NOT EXISTS users (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            email       VARCHAR(255) NOT NULL UNIQUE,
            password_hash VARCHAR(255) NOT NULL,
            first_name  VARCHAR(100) DEFAULT '',
            last_name   VARCHAR(100) DEFAULT '',
            phone       VARCHAR(30)  DEFAULT '',
            role        ENUM('driver','admin') DEFAULT 'driver',
            is_active   TINYINT(1) DEFAULT 1,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_login  DATETIME DEFAULT NULL,
            notes       TEXT DEFAULT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # ── Driver profiles ───────────────────────────────────────────────────
        cur.execute("""
        CREATE TABLE IF NOT EXISTS profiles (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            user_id         INT NOT NULL UNIQUE,
            zip_code        VARCHAR(10)  DEFAULT '',
            licenses_held   JSON DEFAULT NULL,
            licenses_obtaining JSON DEFAULT NULL,
            cdl_experience  VARCHAR(50)  DEFAULT '',
            endorsements    JSON DEFAULT NULL,
            military_service VARCHAR(10) DEFAULT '',
            moving_violations VARCHAR(5) DEFAULT '',
            preventable_accidents VARCHAR(5) DEFAULT '',
            driver_type     VARCHAR(50)  DEFAULT '',
            owner_operator_interest VARCHAR(10) DEFAULT '',
            solo_or_team    VARCHAR(30)  DEFAULT '',
            team_interest   VARCHAR(10)  DEFAULT '',
            freight_current JSON DEFAULT NULL,
            freight_interested JSON DEFAULT NULL,
            best_contact_time VARCHAR(20) DEFAULT '',
            agreed_to_terms VARCHAR(100) DEFAULT '',
            career_goals    TEXT DEFAULT NULL,
            setup_complete  TINYINT(1) DEFAULT 0,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # ── Agent rules ───────────────────────────────────────────────────────
        cur.execute("""
        CREATE TABLE IF NOT EXISTS agent_rules (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            user_id         INT NOT NULL UNIQUE,
            min_cpm         FLOAT DEFAULT NULL,
            min_weekly_gross FLOAT DEFAULT NULL,
            pay_types_accepted JSON DEFAULT NULL,
            home_time_requirement VARCHAR(30) DEFAULT '',
            max_days_out    INT DEFAULT NULL,
            geography_mode  VARCHAR(20) DEFAULT 'radius',
            home_zip        VARCHAR(10) DEFAULT '',
            radius_miles    INT DEFAULT NULL,
            statewide_only  TINYINT(1) DEFAULT 0,
            preferred_regions JSON DEFAULT NULL,
            states_blacklist JSON DEFAULT NULL,
            no_touch_freight_required TINYINT(1) DEFAULT 0,
            drop_and_hook_preferred TINYINT(1) DEFAULT 0,
            team_driving_ok TINYINT(1) DEFAULT 0,
            hazmat_ok       TINYINT(1) DEFAULT 0,
            overnights_ok   TINYINT(1) DEFAULT 1,
            requires_benefits TINYINT(1) DEFAULT 0,
            requires_401k   TINYINT(1) DEFAULT 0,
            requires_health_insurance TINYINT(1) DEFAULT 0,
            pet_policy_required TINYINT(1) DEFAULT 0,
            rider_policy_required TINYINT(1) DEFAULT 0,
            min_fleet_size  INT DEFAULT NULL,
            auto_call_enabled TINYINT(1) DEFAULT 0,
            auto_email_enabled TINYINT(1) DEFAULT 0,
            require_approval_before_call TINYINT(1) DEFAULT 1,
            max_outreach_per_day INT DEFAULT 5,
            blacklisted_carriers JSON DEFAULT NULL,
            preferred_carriers JSON DEFAULT NULL,
            reject_if_forced_dispatch TINYINT(1) DEFAULT 0,
            reject_if_lease_purchase_only TINYINT(1) DEFAULT 0,
            reject_if_no_ELD_provided TINYINT(1) DEFAULT 0,
            reject_if_no_sign_on_bonus TINYINT(1) DEFAULT 0,
            rules_active    TINYINT(1) DEFAULT 0,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # ── Outreach log ──────────────────────────────────────────────────────
        cur.execute("""
        CREATE TABLE IF NOT EXISTS outreach_log (
            id              VARCHAR(20) PRIMARY KEY,
            user_id         INT NOT NULL,
            carrier_name    VARCHAR(200) DEFAULT '',
            carrier_id      VARCHAR(100) DEFAULT '',
            job_title       VARCHAR(200) DEFAULT '',
            job_url         TEXT DEFAULT NULL,
            location        VARCHAR(200) DEFAULT '',
            cpm             FLOAT DEFAULT NULL,
            weekly_pay_estimate FLOAT DEFAULT NULL,
            home_time       VARCHAR(50) DEFAULT '',
            freight_types   JSON DEFAULT NULL,
            match_score     INT DEFAULT 0,
            match_passed    JSON DEFAULT NULL,
            match_failed    JSON DEFAULT NULL,
            match_warnings  JSON DEFAULT NULL,
            status          VARCHAR(30) DEFAULT 'pending',
            channel         VARCHAR(20) DEFAULT '',
            contacted_at    DATETIME DEFAULT NULL,
            recruiter_name  VARCHAR(200) DEFAULT '',
            recruiter_phone VARCHAR(30) DEFAULT '',
            recruiter_email VARCHAR(200) DEFAULT '',
            call_duration_seconds INT DEFAULT 0,
            call_summary    TEXT DEFAULT NULL,
            recording_url   VARCHAR(500) DEFAULT NULL,
            outcome_notes   TEXT DEFAULT NULL,
            offer_cpm       FLOAT DEFAULT NULL,
            offer_weekly    FLOAT DEFAULT NULL,
            follow_up_date  VARCHAR(50) DEFAULT '',
            driver_approved TINYINT(1) DEFAULT 0,
            driver_passed   TINYINT(1) DEFAULT 0,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_updated    DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # ── Call log ──────────────────────────────────────────────────────────
        cur.execute("""
        CREATE TABLE IF NOT EXISTS call_log (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            user_id         INT NOT NULL,
            call_id         VARCHAR(100) DEFAULT '',
            outreach_record_id VARCHAR(20) DEFAULT '',
            carrier         VARCHAR(200) DEFAULT '',
            recruiter_phone VARCHAR(30) DEFAULT '',
            driver_name     VARCHAR(200) DEFAULT '',
            status          VARCHAR(30) DEFAULT 'dispatched',
            outcome         VARCHAR(50) DEFAULT '',
            duration_seconds INT DEFAULT 0,
            transcript      TEXT DEFAULT NULL,
            summary         TEXT DEFAULT NULL,
            recruiter_name  VARCHAR(200) DEFAULT '',
            dispatched_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # ── Sessions (JWT token blacklist for logout) ─────────────────────────
        cur.execute("""
        CREATE TABLE IF NOT EXISTS sessions (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT NOT NULL,
            token_jti   VARCHAR(100) NOT NULL UNIQUE,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            expires_at  DATETIME NOT NULL,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # ── Carrier feeds (XML/JSON/CSV job feeds) ────────────────────────────
        cur.execute("""
        CREATE TABLE IF NOT EXISTS carrier_feeds (
            id          INT AUTO_INCREMENT PRIMARY KEY,
            user_id     INT NOT NULL,
            name        VARCHAR(200) NOT NULL,
            feed_type   ENUM('xml','json','csv','url') NOT NULL DEFAULT 'xml',
            source      TEXT NOT NULL COMMENT 'URL or raw content',
            is_url      TINYINT(1) DEFAULT 1,
            field_map   TEXT DEFAULT NULL COMMENT 'JSON field mapping',
            status      ENUM('active','paused','error') DEFAULT 'active',
            last_synced DATETIME DEFAULT NULL,
            job_count   INT DEFAULT 0,
            error_msg   TEXT DEFAULT NULL,
            created_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

        # ── Jobs parsed from feeds ────────────────────────────────────────────
        cur.execute("""
        CREATE TABLE IF NOT EXISTS feed_jobs (
            id              INT AUTO_INCREMENT PRIMARY KEY,
            user_id         INT NOT NULL,
            feed_id         INT NOT NULL,
            external_id     VARCHAR(200) DEFAULT NULL,
            carrier_name    VARCHAR(200) DEFAULT NULL,
            job_title       VARCHAR(200) DEFAULT NULL,
            location        VARCHAR(200) DEFAULT NULL,
            cpm             FLOAT DEFAULT NULL,
            weekly_pay      FLOAT DEFAULT NULL,
            home_time       VARCHAR(100) DEFAULT NULL,
            freight_types   TEXT DEFAULT NULL COMMENT 'JSON array',
            description     TEXT DEFAULT NULL,
            job_url         VARCHAR(500) DEFAULT NULL,
            recruiter_phone VARCHAR(50) DEFAULT NULL,
            recruiter_name  VARCHAR(100) DEFAULT NULL,
            match_score     INT DEFAULT 50,
            raw_data        TEXT DEFAULT NULL COMMENT 'original parsed row',
            in_outreach     TINYINT(1) DEFAULT 0,
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            FOREIGN KEY (feed_id) REFERENCES carrier_feeds(id) ON DELETE CASCADE,
            UNIQUE KEY uniq_feed_job (feed_id, external_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
        """)

    conn.close()
    print(f"[DB] Database '{DB_NAME}' initialized successfully")

    # Run migrations for columns added after initial schema
    _run_migrations()


def _run_migrations():
    """Add columns that may not exist in older databases."""
    migrations = [
        "ALTER TABLE outreach_log ADD COLUMN recording_url VARCHAR(500) DEFAULT NULL",
        "ALTER TABLE outreach_log ADD COLUMN call_summary TEXT DEFAULT NULL",
        "ALTER TABLE outreach_log ADD COLUMN fmcsa_data TEXT DEFAULT NULL",
        # Fix feed_jobs unique key — drop old one based on external_id alone, add composite
        "ALTER TABLE feed_jobs DROP INDEX uniq_feed_job",
        "ALTER TABLE feed_jobs ADD UNIQUE KEY uniq_feed_job (feed_id, external_id(191))",
    ]
    try:
        conn = get_connection()
        with conn.cursor() as cur:
            for sql in migrations:
                try:
                    cur.execute(sql)
                    conn.commit()
                except Exception as e:
                    if "Duplicate column" in str(e) or "1060" in str(e):
                        pass  # Already exists
                    else:
                        print(f"[DB] Migration note: {e}")
        conn.close()
    except Exception as e:
        print(f"[DB] Migration failed: {e}")


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
    for k, v in row.items():
        if k in JSON_FIELDS and isinstance(v, str):
            try:
                result[k] = json.loads(v)
            except Exception:
                result[k] = []
        else:
            result[k] = v
    return result
