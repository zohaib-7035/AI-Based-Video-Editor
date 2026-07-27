# Analysis: AI Transcription
Date: 2026-07-15
Story: story/2026-07-15-ai-transcription-story.md
Scope: full-stack
Repos scanned: backend · frontend
Figma: none

---

## Project Fingerprint

FastAPI 0.115.5 (Python 3.9.12) backend with SQLAlchemy 2.0 + SQLite WAL, a `Video` ORM model with a four-state `VideoStatus` enum (`uploaded / processing / ready / error`), and a clean service layer (`VideoService`, `FFmpegService`). `settings.whisper_model` is already defined in `config.py` (`"base"`), meaning the Whisper model name is configurable from day one. Frontend is React 18 + TypeScript + TanStack Query v5 + Tailwind; `ProgressBar` lives in `components/common/` ready to reuse, `VideoCard` owns the per-video action buttons, and `api/client.ts` provides a thin typed wrapper over `fetch` + XHR. Neither `faster-whisper` nor any WebSocket infrastructure is present yet.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| Progress reporting from a sync generator | High | Faster-Whisper's `model.transcribe()` returns a generator; there is no built-in progress callback. Must iterate segments and compute `segment.end / video.duration * 100`. If `duration` is `None`, progress cannot be estimated — send indeterminate pulses instead. |
| SQLite session leak in background task | High | Request-scoped `Session` must never be passed to a background task — it will be closed by the time the task runs. Background task must open its own `SessionLocal()` and close it in a `finally` block. |
| WebSocket + background task coordination | High | The progress queue must be created before `BackgroundTasks.add_task` returns, or the WS client may connect before the queue exists. Use a module-level `Dict[str, asyncio.Queue]` keyed by `video_id`; create the queue in the POST handler before dispatching. |
| `asyncio.to_thread` availability | Medium | `asyncio.to_thread` was added in Python 3.9 — compatible with this project's 3.9.12 runtime. But Faster-Whisper iterates a generator synchronously; the entire transcription must be wrapped in a single `to_thread` call, not yielded back to the event loop per segment. Use a sync `queue.Queue` inside the thread to accumulate progress and drain it from the async side. |
| GPU detection complexity | Medium | Faster-Whisper's `WhisperModel(device="auto")` handles CUDA detection internally. Avoid manual `torch.cuda.is_available()` — it pulls in the full PyTorch import chain unnecessarily. |
| 409 race condition | Medium | Two near-simultaneous POST requests for the same video could both pass the `status != processing` guard before either has written `processing` to the DB. A module-level `set` of in-flight `video_id`s (checked under no lock) is sufficient for a single-process server. |
| `faster-whisper` not in requirements.txt | Medium | Must add `faster-whisper`. CPU users do not need `torch`; GPU users need the CUDA-enabled build. Document both install paths in comments. |
| WebSocket not polyfilled in older browsers | Low | All modern browsers support WebSocket. Not a concern for a local-first desktop tool. |

---

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| POST returns 202 + video status → processing | Needs work | `VideoStatus.processing` exists. No transcribe endpoint or background task infra yet. |
| WS streams progress 0–100 + completion message | Needs work | No WebSocket endpoint. `asyncio.Queue` pattern needed. |
| GET /transcript returns text + segments | Needs work | No `Transcript` model or schema. Endpoint does not exist. |
| Transcript persisted to DB | Needs work | `Transcript` model and `transcripts` table do not exist. |
| CPU + GPU auto-selection | Needs work | `settings.whisper_model` exists but no `TranscriptionService` yet. `device="auto"` is the implementation path. |
| Error state: video status + transcript error field + WS message | Needs work | `VideoStatus.error` exists on the model. Error-state DB write and WS broadcast need implementing. |
| 409 when already in progress | Needs work | No guard exists. Module-level in-flight set is the approach. |
| Frontend: conditional Transcribe / progress / transcript panel | Needs work | `VideoCard` has action buttons but no transcription state. `ProgressBar` is ready to drop in. |

---

## API Analysis

### Domain Concepts — API

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| `VideoStatus` enum | `app/models/video.py:12` | Already has `processing` and `error` states — no change needed |
| `Video` ORM model | `app/models/video.py:19` | `status` field will be updated by `TranscriptionService` |
| `VideoService.get_by_id` | `app/services/video.py:102` | Used to validate video exists before starting transcription |
| `settings.whisper_model` | `app/core/config.py:37` | Model name (`"base"`) already configurable |
| `SessionLocal` | `app/core/database.py:13` | Background task must open its own session from this factory |
| `BackgroundTasks` | FastAPI built-in | No import yet, but no install required |
| `VideoStatus.processing` | `app/models/video.py:14` | Exact value to set on POST |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `Transcript` ORM model | SQLAlchemy model | New table: `id, video_id (FK), text, segments (JSON), language, status, error, created_at` |
| `TranscriptStatus` enum | Python enum | `processing / completed / error` — mirrors `VideoStatus` pattern |
| `TranscriptResponse` schema | Pydantic v2 model | API-facing DTO: `id, video_id, text, segments, language, status, error, created_at` |
| `TranscriptionService` | Service class | Wraps Faster-Whisper; runs in `asyncio.to_thread`; emits progress to a sync `queue.Queue` |
| `_transcription_queues` | Module-level dict | `Dict[str, asyncio.Queue]` in transcriptions router; keyed by `video_id` |
| `_in_flight` | Module-level set | `Set[str]` tracking active `video_id`s; 409 guard |
| `POST /api/v1/videos/{id}/transcribe` | FastAPI route | Creates queue, guards 409, sets status → processing, dispatches background task, returns 202 |
| `GET /api/v1/videos/{id}/transcript` | FastAPI route | Fetches `Transcript` record by `video_id`; 404 if absent |
| `WS /api/v1/videos/{id}/transcribe/ws` | FastAPI WebSocket route | Drains `asyncio.Queue` and forwards JSON to client; cleans up queue on disconnect |
| `faster-whisper` | Python package | Must be added to `requirements.txt` |
| Transcription router | `app/api/v1/transcriptions.py` | New router registered at `/api/v1/videos` prefix in `main.py` |

### Strategic Approach — API

Use FastAPI's built-in `BackgroundTasks` to fire transcription without blocking the POST response. The core synchronous work (Faster-Whisper model load + segment iteration) runs inside `asyncio.to_thread`, keeping the event loop free. A module-level `Dict[str, asyncio.Queue]` connects the background thread to any WebSocket listener: the background thread puts progress dicts into a sync `queue.Queue`, a small async wrapper drains it and forwards to the `asyncio.Queue`, which the WebSocket endpoint consumes. The `Transcript` model is a separate table (not a column on `Video`) following the same `Base` + `init_db` pattern already in place.

### Key Design Decisions — API

- **`device="auto"` not manual torch detection** — Faster-Whisper resolves CUDA availability internally; no `import torch` needed in `TranscriptionService`, which keeps CPU-only installs clean.
- **Separate router file for transcription** — keeps `api/v1/videos.py` focused on CRUD; transcription routes go in `api/v1/transcriptions.py` and are mounted under the same `/api/v1/videos` prefix in `main.py`.
- **`asyncio.Queue` per video, not a global bus** — simple, no external broker, cleans up after each job. Works for a single-process local server.
- **Fresh `SessionLocal()` in background task** — request session is closed before background task runs; never pass it across the boundary.
- **Segment progress formula** — `min(99, int(segment.end / duration * 100))` capped at 99 until the final `completed` message; prevents premature 100% display.
- **`faster-whisper` requirement note** — CPU: `faster-whisper` only. GPU: `faster-whisper` + CUDA-enabled `ctranslate2`. Document both in `requirements.txt` comments.

---

## Frontend Analysis

### Domain Concepts — Frontend

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| `VideoStatus` type | `src/types/index.ts:25` | Already includes `"processing"` — no change needed |
| `Video` interface | `src/types/index.ts:27` | No transcript fields; will stay unchanged (transcript fetched separately) |
| `ProgressBar` component | `src/components/common/ProgressBar.tsx` | Accepts `percent` (0–100) + optional `label`; ready to drop into VideoCard |
| `VideoCard` component | `src/components/library/VideoCard.tsx` | Renders per-video actions; needs Transcribe button + conditional transcript panel |
| `LibraryPage` | `src/pages/LibraryPage.tsx` | Owns `activePreviewId` state; may own active transcription state too |
| `api/client.ts` | `src/api/client.ts` | Needs `transcribeVideo()`, `getTranscript()`, and `createTranscriptionSocket()` |
| TanStack Query `useMutation` | Used in `VideoCard`, `UploadPage` | Same pattern for `transcribeVideo` POST |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `Transcript` interface | `src/types/index.ts` | `{ id, video_id, text, segments: TranscriptSegment[], language, status, created_at }` |
| `TranscriptSegment` interface | `src/types/index.ts` | `{ start: number, end: number, text: string }` |
| `transcribeVideo(id)` | `api/client.ts` | POST to `/api/v1/videos/{id}/transcribe`; returns `{ job: string, video_id: string }` |
| `getTranscript(id)` | `api/client.ts` | GET `/api/v1/videos/{id}/transcript`; returns `Transcript` |
| `createTranscriptionSocket(id)` | `api/client.ts` | Returns `WebSocket` pointed at `ws://localhost:8000/api/v1/videos/{id}/transcribe/ws` |
| `TranscriptPanel` component | `src/components/library/TranscriptPanel.tsx` | Renders full text + scrollable segment list (formatted timestamps) |
| Transcription state in `VideoCard` | `src/components/library/VideoCard.tsx` | `transcribing`, `transcriptProgress`, `transcript`; drives conditional rendering |

### Strategic Approach — Frontend

Extend `VideoCard` with three new conditional rendering zones driven by `video.status` and a locally-held `transcript` state: (1) when `status === "uploaded"` or `status === "ready"` with no transcript, show Transcribe button; (2) when `status === "processing"`, open a WebSocket and show a `ProgressBar` with `"Transcribing…"` label; (3) when transcript is fetched successfully, show a "View Transcript" toggle that reveals `TranscriptPanel`. The WebSocket is opened inside a `useEffect` keyed on `video.status === "processing"`, and torn down on cleanup. TanStack Query's `invalidateQueries(['videos'])` after the WS `completed` message will refresh the card's status from the server.

### Key Design Decisions — Frontend

- **WebSocket in `useEffect`, not `useMutation`** — the WS lifecycle is side-effectful and needs cleanup on unmount; `useEffect` with `return () => ws.close()` is the correct pattern.
- **`status === "processing"` as the WS trigger** — `VideoCard` trusts `video.status` from the library query. When the POST returns 202, `invalidateQueries(['videos'])` triggers a re-fetch which returns `status: "processing"`, which opens the WS.
- **Transcript fetched on demand** — not bundled into the video list response. `useQuery(['transcript', video.id], getTranscript)` fires only when the user clicks "View Transcript", keeping the library list query lean.
- **`TranscriptPanel` as a separate component** — keeps `VideoCard` readable; accepts `transcript: Transcript` prop, no internal fetching.
- **`BASE_URL` → `ws://` for WebSocket** — `createTranscriptionSocket` must replace `http://` with `ws://` (and `https://` with `wss://`) in `BASE_URL` when constructing the WS URL.

---

## Dependencies

- **`app/models/__init__.py`** — must re-export `Transcript` alongside `Video` so `init_db()` picks it up.
- **`app/main.py`** — register the new transcriptions router at prefix `/api/v1/videos`.
- **`backend/requirements.txt`** — add `faster-whisper`.
- **`backend/requirements-test.txt`** — no new test deps; `AsyncMock` + existing `pytest-asyncio` cover WebSocket mocking.
- **`src/pages/LibraryPage.tsx`** — may need to pass a `onTranscribeStart` callback down to `VideoCard` if invalidation needs to be triggered at the page level (same pattern as `onDeleted`).
