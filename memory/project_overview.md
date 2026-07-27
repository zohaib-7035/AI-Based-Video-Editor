---
name: project-overview
description: "AI Video Editor — what it is, tech stack, current status, and 10-story V1 roadmap"
metadata:
  node_type: memory
  type: project
  originSessionId: 0c3d0380-d2de-4ff0-945f-238c6c3b5845
---

Open-source, 100% local AI-powered video editor. No cloud. No cost.

**Why:** Built to give creators a free, private alternative to cloud video editing tools.

**How to apply:** Frame all suggestions around local-first constraints (no cloud APIs, no SaaS services). Use Ollama/Qwen3 for LLM work, FFmpeg for video, Faster-Whisper for transcription.

## Tech Stack
- Backend: FastAPI 0.115.5 (Python 3.9.12) + SQLite (WAL mode) via SQLAlchemy 2.0.36
- Frontend: React 18.3 + TypeScript 5.7 + Vite 6 + Tailwind CSS 3.4 + TanStack React Query 5 + Zustand 5
- LLM: Ollama (Qwen3 model)
- Video processing: FFmpeg (called via `asyncio.create_subprocess_exec` — never `subprocess.run`)
- Transcription: Faster-Whisper (faster-whisper==1.1.1 in requirements.txt)
- Pydantic: v2 — use `model_config = ConfigDict(from_attributes=True)` for ORM mode (not `orm_mode`)

## Project Structure (after Story 7)
```
D:\claude\ai_video_editor\
├── backend/
│   ├── app/
│   │   ├── main.py                    ← imports app.models before init_db; migration guard for subtitle/silence/filler columns; registers all routers
│   │   ├── core/config.py             ← Settings (pydantic-settings); whisper_model="base"; max_upload_size_bytes is @property
│   │   ├── core/database.py           ← SQLAlchemy + SQLite WAL
│   │   ├── core/dependencies.py
│   │   ├── core/logging_config.py
│   │   ├── api/v1/health.py           ← GET /api/v1/health
│   │   ├── api/v1/videos.py           ← GET / (list), GET /{id}/stream, POST /upload, GET /{id}, DELETE /{id}
│   │   ├── api/v1/transcriptions.py   ← POST /{id}/transcribe, GET /{id}/transcript, WS /{id}/transcribe/ws
│   │   ├── api/v1/subtitles.py        ← POST /{id}/subtitles/generate, GET /{id}/subtitles/srt, GET /{id}/subtitles/vtt
│   │   ├── api/v1/silence.py          ← POST /{id}/silence/detect, GET /{id}/silence, POST /{id}/silence/remove, GET /{id}/silence/export/stream
│   │   ├── api/v1/fillers.py          ← POST /{id}/fillers/detect, GET /{id}/fillers, POST /{id}/fillers/remove, GET /{id}/fillers/export/stream
│   │   ├── models/__init__.py         ← re-exports all ORM models
│   │   ├── models/video.py            ← Video ORM model + VideoStatus enum; export_path + filler_export_path columns
│   │   ├── models/transcript.py       ← Transcript ORM model + TranscriptStatus enum; srt_path/vtt_path columns
│   │   ├── models/silence.py          ← SilenceDetection ORM model (id, video_id, segments JSON, detected_at)
│   │   ├── models/filler.py           ← FillerDetection ORM model (id, video_id, segments JSON, detected_at)
│   │   ├── schemas/video.py           ← VideoCreate, VideoResponse (includes export_path, filler_export_path)
│   │   ├── schemas/transcript.py      ← TranscriptSegment, TranscriptResponse
│   │   ├── schemas/silence.py         ← SilenceSegment, SilenceDetectionResponse (decodes JSON segments via @field_validator)
│   │   ├── schemas/filler.py          ← FillerSegment, FillerDetectionResponse (decodes JSON segments via @field_validator)
│   │   ├── services/ffmpeg.py         ← FFmpegService.probe() + concat_segments() — async
│   │   ├── services/video.py          ← VideoService: list_all/upload/get_by_id/delete
│   │   ├── services/transcription.py  ← TranscriptionService: get_model (cached) + run (sync, to_thread)
│   │   ├── services/subtitle.py       ← SubtitleService: to_srt(), to_vtt() — pure sync
│   │   ├── services/silence.py        ← SilenceService: detect() runs ffmpeg silencedetect; remove() cuts+concat; always uses video.filepath
│   │   └── services/filler.py         ← FillerService: detect() scans transcript vs FILLER_WORDS frozenset; remove() cuts+concat; always uses video.filepath
│   ├── storage/uploads|exports|temp/
│   └── tests/
│       ├── conftest.py
│       ├── test_health.py             ← 14 tests (Story 1)
│       ├── test_videos.py             ← 39 tests (Stories 2+3)
│       ├── test_transcription.py      ← 11 tests (Story 4)
│       ├── test_subtitles.py          ← 23 tests (Story 5)
│       ├── test_silence.py            ← 20 tests (Story 6) — 97.4% Strong
│       └── test_fillers.py            ← 23 tests (Story 7)
├── frontend/
│   ├── src/
│   │   ├── vite-env.d.ts
│   │   ├── App.tsx
│   │   ├── pages/Dashboard.tsx
│   │   ├── pages/LibraryPage.tsx
│   │   ├── pages/UploadPage.tsx
│   │   ├── components/common/Layout.tsx
│   │   ├── components/common/ProgressBar.tsx
│   │   ├── components/upload/UploadZone.tsx
│   │   ├── components/library/VideoCard.tsx    ← silence + filler mutations + restore-on-mount effects
│   │   ├── components/library/TranscriptPanel.tsx
│   │   ├── components/library/SilencePanel.tsx ← detect/remove/export preview; post-removal clears segments locally
│   │   ├── components/library/FillerPanel.tsx  ← detect/remove/export preview; purple filler word table
│   │   ├── api/client.ts              ← all API functions including silence + filler endpoints
│   │   └── types/index.ts             ← Video (export_path, filler_export_path), SilenceDetection, FillerDetection
├── plan/plan.md
├── story/
│   ├── 2026-07-14-project-foundation-story.md
│   ├── 2026-07-14-video-upload-management-story.md
│   ├── 2026-07-15-video-library-preview-story.md
│   ├── 2026-07-15-ai-transcription-story.md
│   └── 2026-07-17-filler-word-removal-story.md
├── analysis/
│   └── 2026-07-17-filler-word-removal-analysis.md
└── reason/
    └── 2026-07-17-filler-word-removal-canvas.md
```

## V1 Stories
| # | Story | Status |
|---|-------|--------|
| 1 | Project Foundation | **Done** — 14 tests |
| 2 | Video Upload & Management | **Done** — 27 tests |
| 3 | Video Library & Preview | **Done** — 12 tests |
| 4 | AI Transcription (Faster-Whisper + WebSocket) | **Done** — 11 tests |
| 5 | Subtitle Generation (SRT/VTT) | **Done** — 23 tests |
| 6 | Silence Detection & Removal | **Done** — 20 tests, 97.4% Strong |
| 7 | Filler Word Detection & Removal | **Done** — 23 tests |
| 8 | Export Video (format/quality/resolution options) | Pending |
| 9 | AI Editing Assistant (Ollama SSE chat) | Pending |
| 10 | Execute AI Editing Plan | Pending |

**Total tests passing: 130**

## Key Architecture Decisions Made

- **File storage:** `{uuid4()}{original_extension}` on disk; original filename preserved in DB
- **Two export paths:** `export_path` (silence removal) and `filler_export_path` (filler removal) — separate nullable TEXT columns on `Video` so both features coexist without overwriting each other
- **Original always source for re-detect/re-remove:** Both SilenceService and FillerService detect() and remove() always use `video.filepath`. Export is output-only, never re-scanned.
- **Post-removal state clearing (frontend):** `onSuccess` in React mutations sets `segments: []` locally instead of re-fetching — DB still holds old detection, local state reflects cleaned state
- **Filler detection via transcript (no new audio pass):** Faster-Whisper segments already have timestamps; detection is pure text scanning against a `frozenset` of filler words (`FILLER_WORDS`). Only whole-segment text matches count.
- **`_PUNCT_RE` normaliser in filler service:** Strips punctuation and lowercases before matching against FILLER_WORDS
- **Segment-level detection only (V1):** multi-word fillers like "you know" only matched if the entire segment text is "you know"
- **`_in_flight` set guard:** Module-level set in transcriptions.py, silence.py, fillers.py — same pattern across all three, prevents 409 duplicate requests
- **SQLite ALTER TABLE guard:** `_migrate_*_columns()` in main.py wraps each ALTER TABLE in `try/except OperationalError` — idempotent on startup (create_all does not add columns to existing tables)
- **Upload flow:** validate format → write file → byte count → FFprobe → DB record. FFprobe fail → file deleted, 422 returned
- **XHR for upload progress:** `fetch` API has no `upload.onprogress`; must use XMLHttpRequest
- **WebSocket lifecycle in VideoCard:** opened when `video.status === "processing"`, torn down via `useEffect` cleanup return
- **Transcript fetched on demand:** `getTranscript(videoId)` in `useEffect` when status=ready and transcript is null
- **`activePreviewId` lifted to LibraryPage:** only one video previews at a time; VideoCard receives `isActive` + `onPreviewToggle`
- **`queryClient.invalidateQueries`:** used after delete/transcription/removal — never manual array splice
- **Subtitle files use `write_bytes`:** `Path.write_bytes(content.encode("utf-8"))` prevents Windows CRLF injection for SRT/VTT
- **starlette FileResponse + Content-Disposition:** must pass `filename=video.filename` explicitly — without it, starlette omits the Content-Disposition header and browsers may download instead of play
- **`GET /transcript` returns any status:** ordered by created_at DESC so frontend can show error transcripts too
- **Pydantic v2:** `ConfigDict(from_attributes=True)`, `@field_validator` with `@classmethod`
- **SQLAlchemy 2.0:** `Mapped[Optional[str]]` for nullable columns — Python 3.9: use `Optional[X]` from typing, NOT `X | None`

## Dev Workflow (SPDD)
Each story: `/story` → `/analysis` → `/reasons-canvas` → `/generate` → `/test-review`

## Ports
- Backend: http://localhost:8000 (`.venv\Scripts\python.exe -m uvicorn app.main:app --reload`)
- Frontend: http://localhost:5173 (`npm run dev`)
- Run tests: `.venv\Scripts\python.exe -m pytest tests/ -v`
