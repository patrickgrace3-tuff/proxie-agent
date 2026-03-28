import os
os.environ["ANTHROPIC_API_KEY"] = "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"

# ── MySQL Database ────────────────────────────────────────────────────────────
DB_HOST     = "localhost"
DB_PORT     = 3306
DB_USER     = "root"
DB_PASSWORD = "77149402228708651397690140367961ABC!"   # set after installing MySQL
DB_NAME     = "driver_agent"

# ── Auth ──────────────────────────────────────────────────────────────────────
JWT_SECRET  = "change-this-to-a-long-random-secret-32-chars-minimum"

# ── Bland AI ──────────────────────────────────────────────────────────────────
BLAND_API_KEY      = "org_8275ac50f48aabc9044e7b451240b590a9daf600305d37dc4bdcd3d5d8812a20a9f325c377f58e91e64069"
BLAND_PHONE_NUMBER = ""

# ── FMCSA ─────────────────────────────────────────────────────────────────────
FMCSA_WEBKEY = "cf9d935a628350313ec94e780692c3a0f27e599e"   # Get from mobile.fmcsa.dot.gov/QCDevsite

# ── Job Sources ───────────────────────────────────────────────────────────────
APPCAST_FEED_URL = ""
JOOBLE_API_KEY   = ""

# ─────────────────────────────────────────────────────────────────────────────
import uvicorn
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pathlib import Path
import asyncio

import db.database as _db
_db.DB_HOST     = DB_HOST
_db.DB_PORT     = DB_PORT
_db.DB_USER     = DB_USER
_db.DB_PASSWORD = DB_PASSWORD
_db.DB_NAME     = DB_NAME

import db.auth as _auth
_auth.JWT_SECRET = JWT_SECRET

from db.database import init_database
from routers import resume, questionnaire, agent, rules, carriers, voice
from routers import auth as auth_router
from routers import admin as admin_router
from routers import fmcsa as fmcsa_router
from routers import feeds as feeds_router
import agent.voice as voice_module
import agent.fmcsa as fmcsa_module
import agent.job_sources as job_sources_module

try:
    init_database()
except Exception as e:
    print(f"[DB] Could not connect to MySQL: {e}")
    print("[DB] Set DB_PASSWORD in app.py and make sure MySQL is running")

async def poll_completed_calls():
    """Background task — checks for dispatched calls every 2 minutes and auto-analyzes completed ones."""
    await asyncio.sleep(30)  # Wait for server to fully start
    while True:
        try:
            if voice_module.BLAND_API_KEY:
                from db.database import db, row_to_dict
                from agent.voice import fetch_and_analyze, get_call_status

                # Find calls that are dispatched but not yet analyzed
                with db() as cur:
                    cur.execute("""
                        SELECT cl.call_id, cl.outreach_record_id, cl.user_id
                        FROM call_log cl
                        WHERE cl.status IN ('dispatched', 'completed')
                        AND cl.summary IS NULL
                        AND cl.call_id != ''
                        AND cl.dispatched_at > NOW() - INTERVAL 24 HOUR
                    """)
                    pending = cur.fetchall()

                for row in pending:
                    r = row_to_dict(row)
                    call_id = r.get("call_id")
                    outreach_id = r.get("outreach_record_id")
                    if not call_id or not outreach_id:
                        continue
                    try:
                        data = await get_call_status(call_id)
                        status = data.get("status", "")
                        if status in ("completed", "ended"):
                            print(f"[Poller] Auto-analyzing completed call {call_id[:16]}...")
                            await fetch_and_analyze(call_id, outreach_id)
                            print(f"[Poller] Done: {call_id[:16]}")
                    except Exception as e:
                        print(f"[Poller] Error on {call_id[:16]}: {e}")
                    await asyncio.sleep(2)  # Small delay between calls
        except Exception as e:
            print(f"[Poller] Error: {e}")
        await asyncio.sleep(120)  # Check every 2 minutes


from contextlib import asynccontextmanager

@asynccontextmanager
async def lifespan(app):
    # Start background poller
    task = asyncio.create_task(poll_completed_calls())
    yield
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(title="Driver Agent API", version="2.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

voice_module.BLAND_API_KEY          = BLAND_API_KEY
voice_module.BLAND_PHONE_NUMBER     = BLAND_PHONE_NUMBER
fmcsa_module.FMCSA_WEBKEY          = FMCSA_WEBKEY
job_sources_module.APPCAST_FEED_URL = APPCAST_FEED_URL
job_sources_module.JOOBLE_API_KEY   = JOOBLE_API_KEY

app.include_router(auth_router.router,   prefix="/api/auth",          tags=["auth"])
app.include_router(admin_router.router,  prefix="/api/admin",         tags=["admin"])
app.include_router(resume.router,        prefix="/api/resume",        tags=["resume"])
app.include_router(questionnaire.router, prefix="/api/questionnaire", tags=["questionnaire"])
app.include_router(agent.router,         prefix="/api/agent",         tags=["agent"])
app.include_router(rules.router,         prefix="/api/rules",         tags=["rules"])
app.include_router(carriers.router,      prefix="/api/carriers",      tags=["carriers"])
app.include_router(voice.router,         prefix="/api/voice",         tags=["voice"])
app.include_router(fmcsa_router.router,  prefix="/api/fmcsa",         tags=["fmcsa"])
app.include_router(feeds_router.router,  prefix="/api/feeds",         tags=["feeds"])

from fastapi.responses import FileResponse, RedirectResponse

frontend_path = Path(__file__).parent / "frontend"

@app.get("/")
def root():
    return FileResponse(str(frontend_path / "login.html"))

@app.get("/login")
def login_page():
    return FileResponse(str(frontend_path / "login.html"))

@app.get("/app")
def app_page():
    return FileResponse(str(frontend_path / "index.html"))

app.mount("/static", StaticFiles(directory=str(frontend_path)), name="static")

if __name__ == "__main__":
    uvicorn.run("app:app", host="0.0.0.0", port=8000, reload=True)
