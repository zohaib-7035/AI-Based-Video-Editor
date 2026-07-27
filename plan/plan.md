# AI Video Editor V1 — Master Plan

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | FastAPI (Python 3.10+) |
| Frontend | React + TypeScript + Vite + Tailwind CSS |
| LLM | Ollama (Qwen3) |
| Video Processing | FFmpeg |
| Transcription | Faster-Whisper |
| Database | SQLite (SQLAlchemy ORM) |
| State Management | Zustand |
| Server State | TanStack React Query |

---

## Story Order & Rationale

The AI Editing Assistant (Story 9) is intentionally delayed until the full editing
pipeline is stable. The LLM orchestrates existing capabilities — it should not be
the first thing built.

| # | Story | Reason for Position |
|---|-------|---------------------|
| 1 | Project Foundation | Everything depends on this |
| 2 | Video Upload & Management | Core data — all other stories need a video |
| 3 | Video Library & Preview | User must see and play videos before editing |
| 4 | AI Transcription | Required by Stories 5, 6, 7, and 9 |
| 5 | Subtitle Generation | Depends on transcript from Story 4 |
| 6 | Silence Detection & Removal | Depends on video + FFmpeg from Story 2 |
| 7 | Filler Word Detection & Removal | Depends on transcript from Story 4 |
| 8 | Export Video | Finalizes the editing pipeline before AI touches it |
| 9 | AI Editing Assistant | LLM plans using Stories 5, 6, 7, 8 as building blocks |
| 10 | Execute AI Editing Plan | LLM executes the fully-tested pipeline |

---

## Dependency Map

```
Story 1 — Foundation
    └── Story 2 — Video Upload
            └── Story 3 — Library & Preview
                    └── Story 4 — Transcription
                            ├── Story 5 — Subtitles
                            └── Story 7 — Filler Word Removal
            └── Story 6 — Silence Removal
            └── Story 8 — Export
                    └── Story 9 — AI Editing Assistant
                                    └── Story 10 — Execute AI Plan
```

---

## Story 1 — Project Foundation

### User Story
```
As a developer,
I want a scalable project foundation,
so that future AI video editing features can be added easily.
```

### Goal
Create the project skeleton that every future story builds on.

### What Gets Built
| Layer | Deliverable |
|-------|-------------|
| Backend | FastAPI app, SQLite + SQLAlchemy, config via `.env`, structured logging, API versioning at `/api/v1/` |
| Frontend | React + TypeScript + Vite + Tailwind, base API client, React Router shell |
| DevOps | `.gitignore`, `requirements.txt`, `package.json`, folder structure, `README.md` |
| API | `GET /api/v1/health` — checks FFmpeg, Ollama, database, storage |

### Folder Structure
```
ai_video_editor/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/           ← config, database, logging, dependencies
│   │   ├── api/v1/         ← all routers live here
│   │   ├── models/         ← SQLAlchemy ORM models
│   │   ├── schemas/        ← Pydantic schemas
│   │   ├── services/       ← business logic
│   │   └── workers/        ← background jobs, WebSocket manager
│   ├── storage/
│   │   ├── uploads/
│   │   ├── exports/
│   │   └── temp/
│   ├── database.db
│   ├── .env
│   └── requirements.txt
├── frontend/
│   ├── src/
│   │   ├── pages/
│   │   ├── components/
│   │   ├── api/
│   │   ├── store/
│   │   ├── hooks/
│   │   └── types/
│   └── package.json
└── README.md
```

### Database
No tables yet — only engine init + WAL mode pragma.

### API Endpoints
```
GET  /api/v1/health
```

Response:
```json
{
  "status": "ok",
  "version": "1.0.0",
  "services": {
    "database": "ok",
    "ffmpeg": "ok",
    "ollama": "offline",
    "storage": "ok"
  }
}
```

### Definition of Done
- Backend starts with `uvicorn app.main:app --reload`
- Frontend starts with `npm run dev`
- `/api/v1/health` returns 200 with service statuses
- SQLite file is auto-created on first run
- CORS allows frontend → backend calls

---

## Story 2 — Video Upload & Management

### User Story
```
As a user,
I want to upload videos,
so that I can edit them using AI.
```

### Goal
Allow users to upload video files. No editing yet — just reliable ingest and storage.

### What Gets Built
| Layer | Deliverable |
|-------|-------------|
| Backend | Multipart file upload, format + size validation, FFmpeg metadata probe, storage to `/uploads/`, DB record creation |
| Frontend | Drag-and-drop upload zone, upload progress bar, success/error states |
| API | Upload, get, delete endpoints |

### Database Tables Added
```
videos
──────────────────────────────
id            TEXT PK (UUID)
filename      TEXT
filepath      TEXT
file_size     INTEGER
duration      REAL
width         INTEGER
height        INTEGER
fps           REAL
codec         TEXT
format        TEXT
status        TEXT       ← uploaded | processing | ready | error
created_at    DATETIME
updated_at    DATETIME
```

### API Endpoints
```
POST   /api/v1/videos/upload        ← multipart, returns video record
GET    /api/v1/videos/{id}          ← get single video metadata
DELETE /api/v1/videos/{id}          ← delete file + DB record
```

### Validation Rules
- Allowed formats: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`
- Max file size: configurable via `.env` (default 2 GB)
- FFmpeg probe must succeed — reject corrupt files

### Definition of Done
- Upload an MP4 → file appears in `storage/uploads/`
- DB record contains correct duration, resolution, fps
- Uploading a `.pdf` returns a 422 error
- Uploading a file over the size limit returns a 413 error
- Deleting a video removes both the file and the DB record

---

## Story 3 — Video Library & Preview

### User Story
```
As a user,
I want to browse and preview my uploaded videos,
so that I can choose which one to edit.
```

### Goal
Let users see all uploaded videos and play them in the browser.

### What Gets Built
| Layer | Deliverable |
|-------|-------------|
| Backend | List endpoint, streaming endpoint with HTTP range requests, thumbnail generation via FFmpeg |
| Frontend | Video library grid, metadata cards (name, duration, size, date), inline video player, delete button |
| API | List, stream, thumbnail endpoints |

### API Endpoints
```
GET    /api/v1/videos                    ← list all videos (paginated)
GET    /api/v1/videos/{id}/stream        ← byte-range streaming for <video> tag
GET    /api/v1/videos/{id}/thumbnail     ← JPEG frame at 10% mark
```

### Key Technical Detail
The browser `<video>` element requires the server to respond to `Range:` headers.
FastAPI's `FileResponse` does not handle this by default — a custom streaming
response with `Content-Range` headers must be implemented.

### Definition of Done
- Library page shows all uploaded videos with metadata
- Clicking a video opens the player and it plays without buffering artifacts
- Thumbnail is shown for each video card
- Delete removes the video from the list immediately
- Empty state shown when no videos are uploaded yet

---

## Story 4 — AI Transcription

### User Story
```
As a user,
I want AI to transcribe my video,
so that captions and editing can be performed automatically.
```

### Goal
Transcribe a video using Faster-Whisper and store the result with word-level timestamps.

### What Gets Built
| Layer | Deliverable |
|-------|-------------|
| Backend | `WhisperService` wrapping Faster-Whisper, background job system, WebSocket progress push |
| Frontend | "Transcribe" button, real-time progress bar, transcript display panel with click-to-seek |
| API | Transcribe, transcript, segment edit, job status, WebSocket |

### Database Tables Added
```
transcripts
──────────────────────────────
id             TEXT PK (UUID)
video_id       TEXT FK → videos.id
language       TEXT
model_used     TEXT
status         TEXT       ← pending | processing | done | failed
created_at     DATETIME

transcript_segments
──────────────────────────────
id             TEXT PK (UUID)
transcript_id  TEXT FK → transcripts.id
start_time     REAL
end_time       REAL
text           TEXT
words_json     TEXT       ← JSON array of {word, start, end}

jobs
──────────────────────────────
id             TEXT PK (UUID)
type           TEXT       ← transcription | export | edit
status         TEXT       ← queued | running | done | failed | cancelled
progress       REAL       ← 0.0 to 1.0
message        TEXT
video_id       TEXT FK → videos.id (nullable)
started_at     DATETIME
finished_at    DATETIME
```

### API Endpoints
```
POST   /api/v1/videos/{id}/transcribe    ← starts background job, returns job_id
GET    /api/v1/videos/{id}/transcript    ← returns full transcript + segments
PATCH  /api/v1/segments/{id}            ← manual correction of a segment
GET    /api/v1/jobs/{job_id}            ← poll job status
WS     /ws/jobs/{job_id}               ← real-time progress push
```

### Whisper Model Options (configurable in `.env`)
| Model | Speed | Accuracy |
|-------|-------|---------|
| `tiny` | Fastest | Lowest |
| `base` | Fast | Low |
| `small` | Medium | Medium |
| `medium` | Slow | High |
| `large-v3` | Slowest | Best |

### Definition of Done
- Click Transcribe → progress bar increments in real time via WebSocket
- Transcript appears with correct text and timestamps after completion
- Clicking a word in the transcript seeks the player to that timestamp
- Transcription works on CPU (no GPU required)
- A failed transcription sets job status to `failed` with an error message

---

## Story 5 — Subtitle Generation

### User Story
```
As a user,
I want subtitles generated automatically,
so that my videos become easier to watch.
```

### Goal
Convert the transcript into downloadable SRT and VTT files and render them as an
overlay during playback.

### What Gets Built
| Layer | Deliverable |
|-------|-------------|
| Backend | SRT and VTT generators from transcript segments, file download endpoint |
| Frontend | "Generate Subtitles" button, subtitle overlay on player, download buttons |
| API | Generate, list, download, preview endpoints |

### Database Tables Added
```
subtitles
──────────────────────────────
id             TEXT PK (UUID)
transcript_id  TEXT FK → transcripts.id
format         TEXT       ← srt | vtt
filepath       TEXT
created_at     DATETIME
```

### API Endpoints
```
POST   /api/v1/videos/{id}/subtitles          ← generate SRT + VTT from transcript
GET    /api/v1/videos/{id}/subtitles          ← list generated subtitle files
GET    /api/v1/subtitles/{id}/download        ← download SRT or VTT file
GET    /api/v1/subtitles/{id}/preview         ← return subtitle data as JSON for overlay
```

### File Format Examples

**SRT:**
```
1
00:00:01,240 --> 00:00:04,800
Hello and welcome to this tutorial.

2
00:00:05,100 --> 00:00:08,300
Today we'll cover the basics.
```

**VTT:**
```
WEBVTT

00:00:01.240 --> 00:00:04.800
Hello and welcome to this tutorial.
```

### Definition of Done
- Subtitles generate in under 5 seconds for a 10-minute video
- SRT and VTT files are downloadable
- Subtitles display as an overlay on the video player, synchronized to playback
- Generation fails gracefully if no transcript exists (clear error message)

---

## Story 6 — Silence Detection & Removal

### User Story
```
As a user,
I want silent parts detected and removed,
so that my videos become shorter and more engaging.
```

### Goal
Detect silent sections in a video and produce a trimmed version with silences removed.

### What Gets Built
| Layer | Deliverable |
|-------|-------------|
| Backend | FFmpeg `silencedetect` filter wrapper, silence segment parser, clip merge via FFmpeg `concat` |
| Frontend | "Detect Silence" button, list of detected segments with timestamps, "Remove Silence" button with confirmation, progress bar |
| API | Detect, get, remove endpoints |

### Database Tables Added
```
silence_segments
──────────────────────────────
id             TEXT PK (UUID)
video_id       TEXT FK → videos.id
start_time     REAL
end_time       REAL
duration       REAL
created_at     DATETIME

edit_operations
──────────────────────────────
id             TEXT PK (UUID)
video_id       TEXT FK → videos.id
operation      TEXT       ← remove_silence | remove_filler | trim | merge
params_json    TEXT
output_path    TEXT
status         TEXT       ← pending | done | failed
created_at     DATETIME
```

### API Endpoints
```
POST   /api/v1/videos/{id}/silence/detect    ← run silencedetect, returns segments
GET    /api/v1/videos/{id}/silence           ← get saved silence segments
POST   /api/v1/videos/{id}/silence/remove    ← remove segments, starts job
```

### Silence Detection Parameters (configurable)
| Parameter | Default | Meaning |
|-----------|---------|---------|
| `noise_threshold` | `-30dB` | Audio below this is classified as silence |
| `min_duration` | `0.5s` | Shorter silences are ignored |

### Definition of Done
- Detect Silence returns a list of timestamps with durations
- User can review the list before removing
- Remove Silence produces a new video file with silences cut out
- Original video is never modified
- Progress bar shows during FFmpeg processing

---

## Story 7 — Filler Word Detection & Removal

### User Story
```
As a user,
I want filler words removed,
so that my speech sounds cleaner.
```

### Goal
Use the transcript word timestamps to locate and cut filler words from the video.

### What Gets Built
| Layer | Deliverable |
|-------|-------------|
| Backend | Filler word scanner over `words_json` in transcript segments, FFmpeg multi-cut and concat |
| Frontend | List of detected filler words with context sentences, checkbox selection, "Remove Selected" button |
| API | Detect, get, remove endpoints |

### Default Filler Words
```
um, uh, hmm, like, you know, so, basically, literally, right, okay
```
Configurable via `.env` or settings UI.

### Database Tables Added
```
filler_segments
──────────────────────────────
id             TEXT PK (UUID)
video_id       TEXT FK → videos.id
word           TEXT
start_time     REAL
end_time       REAL
context        TEXT       ← surrounding sentence for review
selected       BOOLEAN    ← user toggled for removal
created_at     DATETIME
```

### API Endpoints
```
POST   /api/v1/videos/{id}/fillers/detect    ← scan transcript, return filler timestamps
GET    /api/v1/videos/{id}/fillers           ← get saved detections
POST   /api/v1/videos/{id}/fillers/remove    ← cut selected fillers, starts job
```

### Key Technical Detail
A 50ms padding buffer is added before and after each cut to avoid abrupt audio
transitions. This value is configurable.

### Definition of Done
- Detect Fillers shows each instance with surrounding sentence context
- User can check/uncheck individual instances before removal
- Removal produces a new video file with selected fillers cut
- Natural audio flow is preserved (no jarring cuts)
- Requires transcript from Story 4 — fails gracefully if none exists

---

## Story 8 — Export Video

### User Story
```
As a user,
I want to export my edited video,
so that I can publish it on YouTube and social media.
```

### Goal
Render the final video with all applied edits and allow the user to download it.

### What Gets Built
| Layer | Deliverable |
|-------|-------------|
| Backend | Export service that compiles all applied `edit_operations` into a single FFmpeg command, format/quality options |
| Frontend | Export modal with format and quality selectors, real-time progress bar, download button |
| API | Export start, job status, cancel, download endpoints |

### Export Options
| Option | Values |
|--------|--------|
| Format | MP4 (H.264), WebM (VP9) |
| Resolution | Original, 1080p, 720p, 480p |
| Quality | Low (CRF 28), Medium (CRF 23), High (CRF 18), Lossless (CRF 0) |
| Audio | Preserve original, AAC 128k, AAC 192k |
| Burn subtitles | Yes / No |

### API Endpoints
```
POST   /api/v1/videos/{id}/export         ← start export job
GET    /api/v1/jobs/{job_id}              ← poll status
POST   /api/v1/jobs/{job_id}/cancel       ← cancel running export
GET    /api/v1/exports/{job_id}/download  ← download completed file
```

### Definition of Done
- Export produces a valid, playable MP4
- 720p and 1080p resize works correctly
- Progress bar updates in real time via WebSocket
- Cancel stops the FFmpeg process cleanly
- Exported file is downloadable directly from the UI
- Original video is untouched

---

## Story 9 — AI Editing Assistant

### User Story
```
As a user,
I want to describe edits using natural language,
so that AI creates an editing plan for me.
```

### Goal
Accept natural language prompts and convert them into structured editing commands
using Ollama (Qwen3). No execution yet — plan only.

### What Gets Built
| Layer | Deliverable |
|-------|-------------|
| Backend | `OllamaService` with SSE streaming, system prompt with project context injection, JSON command parser + validator |
| Frontend | AI chat panel with streaming responses, structured command preview cards, Approve / Reject buttons per command |
| API | Chat (SSE), history, clear history endpoints |

### System Prompt Strategy
The LLM receives project context on every request:
```
You are an AI video editor assistant.
Current project context:
- Video: "interview.mp4" (duration: 12:34, fps: 30)
- Transcript: available (en, large-v3)
- Silence segments: 14 detected
- Filler words: 23 detected

Available operations: remove_silence, remove_fillers,
generate_subtitles, trim, export

Respond with a brief explanation and a JSON commands block.
```

### Command Output Format
```json
{
  "explanation": "I'll remove all silences and add subtitles.",
  "commands": [
    { "op": "remove_silence", "params": { "min_duration": 0.5 } },
    { "op": "generate_subtitles", "params": { "format": "srt" } }
  ]
}
```

### Database Tables Added
```
conversations
──────────────────────────────
id             TEXT PK (UUID)
video_id       TEXT FK → videos.id
role           TEXT       ← user | assistant | system
content        TEXT
commands_json  TEXT       ← parsed commands (nullable)
approved       BOOLEAN    ← user approved this plan
created_at     DATETIME
```

### API Endpoints
```
POST   /api/v1/ai/chat                    ← SSE stream, returns tokens + final JSON
GET    /api/v1/videos/{id}/ai/history     ← conversation history for a video
DELETE /api/v1/videos/{id}/ai/history     ← clear conversation
```

### Definition of Done
- Type "Remove all silences" → AI responds with streaming explanation + command block
- Command cards appear below the response for review
- Approve marks commands as ready; Reject discards them
- Commands are NOT executed in this story
- AI response begins streaming within 1 second
- Conversation history persists across page refreshes

---

## Story 10 — Execute AI Editing Plan

### User Story
```
As a user,
I want the AI editing plan executed,
so that my video is edited automatically.
```

### Goal
Execute the approved AI editing commands from Story 9 and produce a final edited video.

### What Gets Built
| Layer | Deliverable |
|-------|-------------|
| Backend | Command execution engine that maps each `op` string to the correct service method |
| Frontend | "Execute Plan" button, per-step execution progress, final export download link, full edit history log |
| API | Execute endpoint (reuses existing job WebSocket infrastructure) |

### Command → Service Mapping
| Command `op` | Service Called |
|-------------|---------------|
| `remove_silence` | `FFmpegService.remove_silence()` |
| `remove_fillers` | `FFmpegService.remove_fillers()` |
| `generate_subtitles` | Subtitle generator from Story 5 |
| `trim` | `FFmpegService.trim()` |
| `export` | `ExportService.export()` |

### Execution Flow
```
Approved commands list
      ↓
Execute Step 1 → report progress via WebSocket
      ↓ (output becomes input for next step)
Execute Step 2 → report progress
      ↓
...
Execute Step N → final file written to storage/exports/
      ↓
Job status = done → download link shown
```

### API Endpoints
```
POST   /api/v1/ai/execute/{conversation_id}   ← run approved commands in sequence
GET    /api/v1/jobs/{job_id}                  ← existing job status endpoint (reused)
```

### Definition of Done
- Clicking "Execute Plan" runs all approved commands in sequence
- Each step's progress is shown individually
- If a step fails, execution halts and shows which step failed with a clear error
- Final output is downloadable
- Entire pipeline (chat → approve → execute → download) works end to end

---

## Full API Surface (V1)

```
Health
  GET    /api/v1/health

Videos
  POST   /api/v1/videos/upload
  GET    /api/v1/videos
  GET    /api/v1/videos/{id}
  DELETE /api/v1/videos/{id}
  GET    /api/v1/videos/{id}/stream
  GET    /api/v1/videos/{id}/thumbnail

Transcription
  POST   /api/v1/videos/{id}/transcribe
  GET    /api/v1/videos/{id}/transcript
  PATCH  /api/v1/segments/{id}

Subtitles
  POST   /api/v1/videos/{id}/subtitles
  GET    /api/v1/videos/{id}/subtitles
  GET    /api/v1/subtitles/{id}/download
  GET    /api/v1/subtitles/{id}/preview

Silence
  POST   /api/v1/videos/{id}/silence/detect
  GET    /api/v1/videos/{id}/silence
  POST   /api/v1/videos/{id}/silence/remove

Filler Words
  POST   /api/v1/videos/{id}/fillers/detect
  GET    /api/v1/videos/{id}/fillers
  POST   /api/v1/videos/{id}/fillers/remove

Export
  POST   /api/v1/videos/{id}/export
  GET    /api/v1/exports/{job_id}/download

Jobs
  GET    /api/v1/jobs/{job_id}
  POST   /api/v1/jobs/{job_id}/cancel

AI
  POST   /api/v1/ai/chat
  GET    /api/v1/videos/{id}/ai/history
  DELETE /api/v1/videos/{id}/ai/history
  POST   /api/v1/ai/execute/{conversation_id}

WebSocket
  WS     /ws/jobs/{job_id}
```

---

## Full Database Schema (V1)

```
videos
  id, filename, filepath, file_size, duration, width, height,
  fps, codec, format, status, created_at, updated_at

jobs
  id, type, status, progress, message, video_id,
  started_at, finished_at

transcripts
  id, video_id, language, model_used, status, created_at

transcript_segments
  id, transcript_id, start_time, end_time, text, words_json

subtitles
  id, transcript_id, format, filepath, created_at

silence_segments
  id, video_id, start_time, end_time, duration, created_at

filler_segments
  id, video_id, word, start_time, end_time, context,
  selected, created_at

edit_operations
  id, video_id, operation, params_json, output_path,
  status, created_at

conversations
  id, video_id, role, content, commands_json,
  approved, created_at
```

---

## Technology Per Story

| Story | Backend Services | External Tool |
|-------|-----------------|---------------|
| 1 | FastAPI, SQLAlchemy, Pydantic Settings | — |
| 2 | FFmpeg probe, aiofiles | FFmpeg |
| 3 | Range streaming, FileResponse | FFmpeg (thumbnail) |
| 4 | Faster-Whisper, ThreadPoolExecutor, WebSocket | Faster-Whisper |
| 5 | SRT/VTT generator | — |
| 6 | FFmpeg silencedetect | FFmpeg |
| 7 | Transcript word scan, FFmpeg concat | FFmpeg |
| 8 | FFmpeg render pipeline | FFmpeg |
| 9 | Ollama HTTP client, SSE, JSON parser | Ollama + Qwen3 |
| 10 | Command executor, job orchestrator | All of the above |

---

## Estimated Effort

| Story | Complexity | Estimated Duration |
|-------|-----------|-------------------|
| 1 | Low | 1 day |
| 2 | Medium | 1–2 days |
| 3 | Medium | 1 day |
| 4 | High | 2–3 days |
| 5 | Low | 1 day |
| 6 | Medium | 1–2 days |
| 7 | Medium | 1–2 days |
| 8 | High | 2 days |
| 9 | High | 2–3 days |
| 10 | High | 2 days |
| **Total** | | **~14–18 days** |

---

## Development Workflow (SPDD)

For every story, follow this sequence:

```
Phase 1 — Requirements Analysis
  1. Analyze the user story
  2. Explain the problem
  3. List functional requirements
  4. List non-functional requirements
  5. Write acceptance criteria

Phase 2 — Technical Design
  6. Explain possible implementation approaches
  7. Compare each approach
  8. Choose the best approach and justify it
  9. Identify risks and edge cases
  10. Design backend architecture
  11. Design frontend architecture
  12. Design API endpoints
  13. Design database changes
  14. List every file to create or modify

Phase 3 — Planning
  15. Explain the development sequence
  16. Explain testing strategy
  17. Explain scalability for future versions

→ Wait for approval
→ Generate production-ready code one file at a time
→ Explain each file and wait for approval before the next
```
