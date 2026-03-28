import json
import anthropic
from fastapi import APIRouter, UploadFile, File, HTTPException
from pydantic import BaseModel

from agent.profile import load_profile, save_profile, CandidateProfile

router = APIRouter()
client = anthropic.Anthropic()


class ParsedResumeResponse(BaseModel):
    success: bool
    profile: dict
    message: str


def extract_text_from_file(file_content: bytes, filename: str) -> str:
    """Extract raw text from uploaded file. Extend this for PDF/DOCX support."""
    if filename.endswith(".txt"):
        return file_content.decode("utf-8", errors="ignore")
    # For PDF/DOCX you'd integrate pdfplumber or python-docx here
    # For now, attempt UTF-8 decode as fallback
    try:
        return file_content.decode("utf-8", errors="ignore")
    except Exception:
        raise HTTPException(status_code=400, detail="Could not read file. Please upload a .txt file for now.")


@router.post("/upload", response_model=ParsedResumeResponse)
async def upload_resume(file: UploadFile = File(...)):
    content = await file.read()
    raw_text = extract_text_from_file(content, file.filename)

    if len(raw_text.strip()) < 50:
        raise HTTPException(status_code=400, detail="File appears to be empty or unreadable.")

    # Use Claude to parse the resume into structured data
    prompt = f"""Parse the following resume text and extract all relevant information.
Return ONLY a valid JSON object with these exact keys (use empty strings/arrays if info is missing):

{{
  "name": "",
  "email": "",
  "phone": "",
  "location": "",
  "summary": "",
  "skills": [],
  "experience": [
    {{"title": "", "company": "", "duration": "", "description": ""}}
  ],
  "education": [
    {{"degree": "", "institution": "", "year": ""}}
  ],
  "certifications": []
}}

Resume text:
{raw_text[:8000]}"""

    message = client.messages.create(
        model="claude-opus-4-5",
        max_tokens=2000,
        messages=[{"role": "user", "content": prompt}]
    )

    response_text = message.content[0].text.strip()

    # Strip markdown code fences if present
    if response_text.startswith("```"):
        lines = response_text.split("\n")
        response_text = "\n".join(lines[1:-1])

    try:
        parsed = json.loads(response_text)
    except json.JSONDecodeError:
        raise HTTPException(status_code=500, detail="Failed to parse resume. Please try again.")

    profile = load_profile()
    for key, value in parsed.items():
        if hasattr(profile, key) and value:
            setattr(profile, key, value)
    profile.raw_resume_text = raw_text
    save_profile(profile)

    return ParsedResumeResponse(
        success=True,
        profile=profile.model_dump(),
        message="Resume parsed successfully!"
    )
