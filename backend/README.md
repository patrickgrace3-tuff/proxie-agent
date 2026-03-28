# Candidate Agent

An AI-powered personal job search agent. Upload your resume or answer a guided questionnaire to set up your profile, then use your agent to answer recruiter questions, analyze skill gaps, and prep for interviews.

## Features

- **Resume upload** — Claude parses your .txt resume into a structured profile
- **Guided Q&A** — 10-question wizard builds your profile from scratch
- **Agent modes:**
  - Answer recruiter questions on your behalf
  - Skill gap analysis vs. a job description
  - Interview prep & mock Q&A
- **Streaming responses** — real-time Claude output in the chat UI
- **Profile persistence** — saved locally as JSON

## Project Structure

```
candidate-agent/
├── app.py                  ← FastAPI entry point
├── requirements.txt
├── agent/
│   ├── __init__.py
│   └── profile.py          ← Profile model, storage, system prompt builder
├── routers/
│   ├── __init__.py
│   ├── resume.py           ← /api/resume/upload
│   ├── questionnaire.py    ← /api/questionnaire/*
│   └── agent.py            ← /api/agent/chat (streaming)
├── frontend/
│   └── index.html          ← Full single-page app
└── data/
    └── profile.json        ← Auto-created on first save
```

## Setup

### 1. Clone / copy this project

```bash
cd candidate-agent
```

### 2. Create a virtual environment

```bash
python -m venv venv
source venv/bin/activate      # Windows: venv\Scripts\activate
```

### 3. Install dependencies

```bash
pip install -r requirements.txt
```

### 4. Set your Anthropic API key

```bash
export ANTHROPIC_API_KEY=sk-ant-...
```

On Windows:
```
set ANTHROPIC_API_KEY=sk-ant-...
```

### 5. Run the server

```bash
python app.py
```

Then open **http://localhost:8000** in your browser.

## Adding PDF / DOCX support

Install additional libraries:

```bash
pip install pdfplumber python-docx
```

Then update `routers/resume.py` → `extract_text_from_file()`:

```python
import pdfplumber, docx

def extract_text_from_file(file_content: bytes, filename: str) -> str:
    if filename.endswith(".pdf"):
        import io
        with pdfplumber.open(io.BytesIO(file_content)) as pdf:
            return "\n".join(page.extract_text() or "" for page in pdf.pages)
    elif filename.endswith(".docx"):
        import io
        doc = docx.Document(io.BytesIO(file_content))
        return "\n".join(p.text for p in doc.paragraphs)
    return file_content.decode("utf-8", errors="ignore")
```

## Extending the agent

Add new modes in `routers/agent.py` → `MODES` dict:

```python
"salary_negotiation": {
    "label": "Salary Negotiation Coach",
    "instruction": "Help the candidate negotiate compensation packages..."
}
```

The frontend picks up new modes automatically via `/api/agent/modes`.
