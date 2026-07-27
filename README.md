# AI Video Editor

Open-source AI-powered video editor. Runs 100% locally. Free. No cloud.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI + Python 3.10+ |
| Frontend | React 18 + TypeScript + Vite |
| Database | SQLite (WAL mode) |
| LLM | Ollama (Qwen3) |
| Video | FFmpeg |
| Transcription | Faster-Whisper |

---

## Prerequisites

Install these before running the project:

| Dependency | Version | Link |
|------------|---------|------|
| Python | 3.10+ | https://python.org |
| Node.js | 18+ | https://nodejs.org |
| FFmpeg | 6.x+ | https://ffmpeg.org/download.html |
| Ollama | Latest | https://ollama.com |

Verify FFmpeg is in your PATH:
```
ffmpeg -version
```

Pull the Qwen3 model into Ollama:
```
ollama pull qwen3
```

---

## Backend Setup

```bash
cd backend

# Create and activate virtual environment
python -m venv .venv

# Windows
.venv\Scripts\activate

# macOS / Linux
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Copy environment config
cp .env.example .env

# Start the backend (auto-reloads on file changes)
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

The API will be available at: http://localhost:8000
Interactive docs: http://localhost:8000/docs

---

## Frontend Setup

Open a second terminal:

```bash
cd frontend

# Install dependencies
npm install

# Start the dev server
npm run dev
```

The app will be available at: http://localhost:5173

---

## Verify Everything Works

```bash
curl http://localhost:8000/api/v1/health
```

Expected response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "database": "ok",
    "ffmpeg": "ok",
    "ollama": "ok",
    "storage": "ok"
  }
}
```

---

## Changing Ports

Edit `backend/.env`:
```
APP_PORT=9000
```

Then restart uvicorn with the new port:
```bash
uvicorn app.main:app --reload --port 9000
```

Update `frontend/.env` to match:
```
VITE_API_URL=http://localhost:9000
```

---

## Project Structure

```
ai_video_editor/
├── backend/
│   ├── app/
│   │   ├── main.py           # FastAPI entry point
│   │   ├── core/             # Config, database, logging, dependencies
│   │   ├── api/v1/           # Route handlers
│   │   ├── models/           # SQLAlchemy models
│   │   ├── schemas/          # Pydantic schemas
│   │   ├── services/         # Business logic
│   │   └── workers/          # Background jobs
│   ├── storage/
│   │   ├── uploads/          # Uploaded video files
│   │   ├── exports/          # Rendered output files
│   │   └── temp/             # FFmpeg working files
│   ├── .env.example
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── api/              # API client
│   │   ├── components/       # Reusable UI
│   │   ├── hooks/            # Custom React hooks
│   │   ├── pages/            # Page components
│   │   ├── store/            # Zustand stores
│   │   └── types/            # TypeScript interfaces
│   └── package.json
├── plan/plan.md              # V1 master plan
└── README.md
```

---

## V1 Stories

| # | Story | Status |
|---|-------|--------|
| 1 | Project Foundation | Done |
| 2 | Video Upload & Management | Pending |
| 3 | Video Library & Preview | Pending |
| 4 | AI Transcription | Pending |
| 5 | Subtitle Generation | Pending |
| 6 | Silence Detection & Removal | Pending |
| 7 | Filler Word Detection & Removal | Pending |
| 8 | Export Video | Pending |
| 9 | AI Editing Assistant | Pending |
| 10 | Execute AI Editing Plan | Pending |
