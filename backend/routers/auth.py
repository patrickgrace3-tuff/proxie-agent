from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from datetime import datetime, timezone
import httpx, os

from db.database import db, row_to_dict
from db.auth import hash_password, verify_password, create_token, get_current_user

router = APIRouter()


class RegisterRequest(BaseModel):
    email: str
    password: str
    first_name: str = ""
    last_name: str = ""
    phone: str = ""


class LoginRequest(BaseModel):
    email: str
    password: str


@router.post("/register")
def register(request: RegisterRequest):
    if len(request.password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters.")

    with db() as cur:
        cur.execute("SELECT id FROM users WHERE email = %s", (request.email.lower().strip(),))
        if cur.fetchone():
            raise HTTPException(status_code=400, detail="An account with that email already exists.")

        password_hash = hash_password(request.password)
        cur.execute("""
            INSERT INTO users (email, password_hash, first_name, last_name, phone, role, is_active)
            VALUES (%s, %s, %s, %s, %s, 'driver', 1)
            RETURNING id
        """, (
            request.email.lower().strip(),
            password_hash,
            request.first_name.strip(),
            request.last_name.strip(),
            request.phone.strip(),
        ))
        user_id = cur.fetchone()["id"]

        cur.execute("INSERT INTO profiles (user_id) VALUES (%s)", (user_id,))
        cur.execute("INSERT INTO agent_rules (user_id) VALUES (%s)", (user_id,))
        token_data = create_token(user_id, request.email.lower(), "driver")

    try:
        with db() as cur:
            cur.execute("SELECT id FROM users WHERE role='admin' ORDER BY id LIMIT 1")
            admin_row = cur.fetchone()
            if admin_row:
                admin_id = admin_row["id"]
                cur.execute("""
                    INSERT INTO feed_jobs (
                        user_id, feed_id, external_id, carrier_name, job_title,
                        location, cpm, weekly_pay, home_time, freight_types,
                        description, job_url, recruiter_phone, match_score, raw_data, in_outreach
                    )
                    SELECT %s, feed_id, external_id, carrier_name, job_title,
                        location, cpm, weekly_pay, home_time, freight_types,
                        description, job_url, recruiter_phone, match_score, raw_data, 0
                    FROM feed_jobs WHERE user_id = %s
                    ON CONFLICT (feed_id, external_id, user_id) DO NOTHING
                """, (user_id, admin_id))
    except Exception as e:
        print(f"[register] feed backfill failed for user {user_id}: {e}")

    return {
        "success": True,
        "token": token_data["token"],
        "user": {
            "id": user_id,
            "email": request.email.lower(),
            "first_name": request.first_name,
            "last_name": request.last_name,
            "role": "driver",
        }
    }


@router.post("/login")
def login(request: LoginRequest):
    with db() as cur:
        cur.execute("""
            SELECT id, email, password_hash, first_name, last_name, role, is_active
            FROM users WHERE email = %s
        """, (request.email.lower().strip(),))
        user = cur.fetchone()

    if not user:
        raise HTTPException(status_code=401, detail="Invalid email or password.")
    if not user["is_active"]:
        raise HTTPException(status_code=403, detail="Account is deactivated. Contact support.")
    if not verify_password(request.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password.")

    with db() as cur:
        cur.execute("UPDATE users SET last_login = %s WHERE id = %s",
                    (datetime.now(timezone.utc), user["id"]))

    token_data = create_token(user["id"], user["email"], user["role"])

    return {
        "success": True,
        "token": token_data["token"],
        "user": {
            "id": user["id"],
            "email": user["email"],
            "first_name": user["first_name"],
            "last_name": user["last_name"],
            "role": user["role"],
        }
    }


@router.get("/me")
def get_me(user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    with db() as cur:
        cur.execute("""
            SELECT id, email, first_name, last_name, phone, role, is_active,
                   created_at, last_login, profile_photo, ai_photo
            FROM users WHERE id = %s
        """, (user_id,))
        row = cur.fetchone()
    if not row:
        raise HTTPException(status_code=404, detail="User not found.")
    return row_to_dict(row)


@router.post("/logout")
def logout(user: dict = Depends(get_current_user)):
    return {"success": True, "message": "Logged out successfully."}


@router.put("/change-password")
def change_password(body: dict, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    old_pw = body.get("old_password", "")
    new_pw = body.get("new_password", "")

    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters.")

    with db() as cur:
        cur.execute("SELECT password_hash FROM users WHERE id = %s", (user_id,))
        row = cur.fetchone()
        if not row or not verify_password(old_pw, row["password_hash"]):
            raise HTTPException(status_code=401, detail="Current password is incorrect.")
        cur.execute("UPDATE users SET password_hash = %s WHERE id = %s",
                    (hash_password(new_pw), user_id))

    return {"success": True, "message": "Password updated."}


@router.put("/update-profile")
def update_profile(body: dict, user: dict = Depends(get_current_user)):
    user_id = int(user["sub"])
    first = body.get("first_name", "").strip()
    last  = body.get("last_name", "").strip()
    phone = body.get("phone", "").strip()
    with db() as cur:
        cur.execute(
            "UPDATE users SET first_name=%s, last_name=%s, phone=%s WHERE id=%s",
            (first, last, phone, user_id)
        )
    return {"success": True}


# ── Photo Upload ──────────────────────────────────────────────────────────────

@router.post("/upload-photo")
async def upload_photo(body: dict, user: dict = Depends(get_current_user)):
    """Save the driver's profile photo as a base64 data URL."""
    user_id = int(user["sub"])
    photo = body.get("photo", "")

    if not photo or not photo.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="Invalid image data.")
    if len(photo) > 5_000_000:
        raise HTTPException(status_code=400, detail="Image too large. Please use a smaller photo.")

    with db() as cur:
        cur.execute("UPDATE users SET profile_photo=%s WHERE id=%s", (photo, user_id))

    return {"success": True}


# ── AI Comic Portrait (OpenAI only) ──────────────────────────────────────────

@router.post("/generate-ai-photo")
async def generate_ai_photo(body: dict, user: dict = Depends(get_current_user)):
    """
    Step 1: GPT-4o Vision describes the person's appearance from their photo.
    Step 2: DALL-E 3 generates a comic book cartoon truck driver portrait.
    Both steps use OpenAI exclusively — no other AI provider involved.
    The result is always a vibrant comic book / graphic novel style image.
    """
    user_id = int(user["sub"])
    photo = body.get("photo", "")

    if not photo or not photo.startswith("data:image/"):
        raise HTTPException(status_code=400, detail="No photo provided.")

    openai_key = os.environ.get("OPENAI_API_KEY", "")
    if not openai_key:
        raise HTTPException(status_code=500, detail="OPENAI_API_KEY not configured. Add it in Render environment settings.")

    # Parse the data URL
    if "," in photo:
        header, b64 = photo.split(",", 1)
        media_type  = header.split(":")[1].split(";")[0]
    else:
        b64, media_type = photo, "image/jpeg"

    headers = {
        "Authorization": f"Bearer {openai_key}",
        "Content-Type": "application/json",
    }

    # ── Step 1: GPT-4o Vision — describe the person's appearance ─────────
    async with httpx.AsyncClient(timeout=40) as h:
        vision_resp = await h.post(
            "https://api.openai.com/v1/chat/completions",
            headers=headers,
            json={
                "model": "gpt-4o",
                "max_tokens": 400,
                "messages": [{
                    "role": "user",
                    "content": [
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:{media_type};base64,{b64}",
                                "detail": "low"
                            }
                        },
                        {
                            "type": "text",
                            "text": (
                                "Describe this person's physical appearance in precise detail "
                                "for use in a DALL-E image generation prompt. Include: gender, "
                                "approximate age range, skin tone, hair color and style, eye color "
                                "if visible, facial hair if any, face shape, and any distinctive "
                                "features. Be specific and objective. Output only the description, "
                                "no preamble or commentary."
                            )
                        }
                    ]
                }]
            }
        )

    if vision_resp.status_code != 200:
        err = "GPT-4o Vision failed."
        try:
            err = vision_resp.json().get("error", {}).get("message", err)
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=err)

    description = vision_resp.json()["choices"][0]["message"]["content"].strip()

    # ── Step 2: DALL-E 3 — comic book cartoon truck driver portrait ───────
    # Style is ALWAYS comic book / graphic novel — never photorealistic
    dalle_prompt = (
        f"A vibrant comic book style cartoon portrait of a CDL Class A truck driver superhero. "
        f"The character is based on a person with this appearance: {description}. "
        f"Drawn in bold graphic novel / comic book art style with strong outlines, "
        f"vivid colors, and dynamic cel shading. The character wears a trucking jacket "
        f"or work shirt with a bold logo, looking confident and heroic. "
        f"Background shows a stylized American highway with a massive semi truck. "
        f"Comic book panel composition, Marvel or DC graphic novel art quality, "
        f"clean bold lines, saturated colors, no photorealism, no photographs."
    )

    async with httpx.AsyncClient(timeout=90) as h:
        dalle_resp = await h.post(
            "https://api.openai.com/v1/images/generations",
            headers=headers,
            json={
                "model": "dall-e-3",
                "prompt": dalle_prompt,
                "n": 1,
                "size": "1024x1024",
                "quality": "standard",
                "response_format": "b64_json",
            }
        )

    if dalle_resp.status_code != 200:
        err = "DALL-E 3 image generation failed."
        try:
            err = dalle_resp.json().get("error", {}).get("message", err)
        except Exception:
            pass
        raise HTTPException(status_code=502, detail=err)

    img_b64      = dalle_resp.json()["data"][0]["b64_json"]
    ai_photo_url = f"data:image/png;base64,{img_b64}"

    # ── Step 3: Save AI photo to user account ─────────────────────────────
    with db() as cur:
        cur.execute("UPDATE users SET ai_photo=%s WHERE id=%s", (ai_photo_url, user_id))

    return {
        "success":     True,
        "ai_photo":    ai_photo_url,
        "description": description,
    }


# ── Delete Photos ─────────────────────────────────────────────────────────────

@router.delete("/delete-photo")
async def delete_photo(body: dict, user: dict = Depends(get_current_user)):
    """Delete profile_photo and/or ai_photo for the current user."""
    user_id = int(user["sub"])
    which   = body.get("which", "both")  # "profile" | "ai" | "both"

    with db() as cur:
        if which in ("profile", "both"):
            cur.execute("UPDATE users SET profile_photo=NULL WHERE id=%s", (user_id,))
        if which in ("ai", "both"):
            cur.execute("UPDATE users SET ai_photo=NULL WHERE id=%s", (user_id,))

    return {"success": True}