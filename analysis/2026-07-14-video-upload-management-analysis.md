# Analysis: Video Upload & Management
Date: 2026-07-14
Story: story/2026-07-14-video-upload-management-story.md
Scope: full-stack
Repos scanned: local (backend/ + frontend/)
Figma: none

---

## Project Fingerprint

FastAPI 0.115.5 on Python 3.9.12 with SQLAlchemy 2.0 (SQLite, WAL mode) and
pydantic-settings for config. All backend packages pinned in `requirements.txt`;
test dependencies in `requirements-test.txt`. Frontend is React 18.3 +
TypeScript 5.7 + Vite 6.0 + Tailwind CSS 3.4 + TanStack React Query 5 +
Zustand 5. Vite dev proxy already forwards `/api/*` → `localhost:8000` and
`/ws/*` → `ws://localhost:8000`, so no CORS issues in development. All
`models/`, `schemas/`, `services/`, and `workers/` packages exist but are
empty — Story 2 is the first feature that will populate them.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| FFmpeg probe blocks the event loop | High | `subprocess.run` is synchronous. On the FastAPI async thread this stalls all other requests. Must use `asyncio.run_in_executor` or `asyncio.create_subprocess_exec`. |
| Size validation after full read | High | `python-multipart` buffers the entire file before the route handler runs. Checking only after receipt defeats the purpose. Reject early via `Content-Length` header check before accepting the stream; add a secondary byte-count check during streaming as a fallback. |
| Orphaned file on probe failure | Medium | If FFmpeg probe fails after the file is written to disk, the partial file must be deleted. Requires a `try/finally` around the probe call that removes the file on any exception. |
| `api/client.ts` cannot upload files | Medium | The existing fetch wrapper hardcodes `Content-Type: application/json`. Multipart upload needs `FormData` with no explicit Content-Type header (browser sets the boundary automatically). Upload progress requires `XMLHttpRequest` — the fetch API does not expose upload progress events natively. |
| Video status stuck at `processing` on crash | Medium | If the server process crashes mid-probe, the DB record is left with `status: processing`. A startup sweep to reset stale processing records is good practice (can be deferred to Story 4 when background jobs are introduced). |
| Filename collision in storage | Low | UUID4 is used as the storage filename. Probability of collision is negligible, but the save step should check before writing. |
| Missing `aiofiles` for async disk I/O | Low | `aiofiles` is already in `requirements.txt` — use it for the file write to avoid blocking the event loop during the save step. |
| Windows path separators in DB | Low | Store file paths using `pathlib.Path.as_posix()` for consistency across operating systems. |

---

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| Valid .mp4 → HTTP 200 with full metadata JSON | Needs work | Upload endpoint does not exist yet |
| Valid .mov → file in `storage/uploads/` + DB record | Needs work | Storage paths exist; `videos` table does not |
| Valid .avi → HTTP 200 with metadata | Needs work | Same as above |
| Unsupported format → HTTP 422 | Needs work | Validation logic does not exist |
| Size exceeded → HTTP 413 | Partially supported | `MAX_UPLOAD_SIZE_MB` is in `.env.example` and mapped to `settings.max_upload_size_bytes` — enforcement logic is missing |
| Corrupt file → HTTP 422, no orphan file, no DB record | Needs work | FFmpeg probe and cleanup logic do not exist |
| `GET /api/v1/videos/{id}` → HTTP 200 metadata | Needs work | Router does not exist |
| `GET /api/v1/videos/{invalid-id}` → HTTP 404 | Needs work | Same |
| `DELETE /api/v1/videos/{id}` → HTTP 200, file removed, DB row deleted | Needs work | Same |
| Progress bar updates during upload | Needs work | `api/client.ts` uses `fetch` with no upload progress support |
| ENV-driven size limit (`MAX_UPLOAD_SIZE_MB`) | Supported | Key exists in `.env.example` and `Settings` class; only enforcement is missing |

---

## API Analysis

### Domain Concepts — API

#### Existing in Codebase

| Concept | Location | Notes |
|---------|----------|-------|
| FastAPI app + lifespan | `backend/app/main.py` | Creates storage dirs on startup; `init_db()` runs `create_all` — Video model just needs to be imported for its table to be created |
| `get_db` dependency | `backend/app/core/dependencies.py` | Session-per-request pattern already in place for all future routes |
| `Settings` (pydantic-settings) | `backend/app/core/config.py` | `uploads_path`, `temp_path`, `max_upload_size_bytes` are already computed properties |
| `Base` (DeclarativeBase) | `backend/app/core/database.py` | All ORM models inherit from this; `create_all` in `init_db` will auto-create their tables |
| Storage directories | `backend/storage/uploads/`, `exports/`, `temp/` | Auto-created at startup; `.gitkeep` files present |
| `MAX_UPLOAD_SIZE_MB` config key | `.env.example` + `Settings.max_upload_size_bytes` | Config key and computed byte value both exist |
| `httpx` | `requirements.txt` | Already installed; useful for async sub-requests if needed |
| `aiofiles` | `requirements.txt` | Already installed — use for non-blocking file writes |
| `python-multipart` | `requirements.txt` | Already installed — enables FastAPI `UploadFile` |

#### Missing or Needs to Be Added

| Concept | Type | Notes |
|---------|------|-------|
| `Video` ORM model | `backend/app/models/video.py` | Table: `videos`; columns per plan schema (id UUID, filename, filepath, file_size, duration, width, height, fps, codec, format, status, created_at, updated_at) |
| `VideoStatus` enum | `backend/app/models/video.py` | `uploaded \| processing \| ready \| error` |
| `VideoResponse` Pydantic schema | `backend/app/schemas/video.py` | Serialises `Video` ORM object for API responses |
| `VideoCreate` Pydantic schema | `backend/app/schemas/video.py` | Internal DTO for creating a DB record from probe output |
| `VideoService` | `backend/app/services/video.py` | Orchestrates: validate → save file → probe → create DB record → return response |
| `FFmpegService.probe()` | `backend/app/services/ffmpeg.py` | Runs `ffprobe -v quiet -print_format json -show_streams -show_format` asynchronously via `asyncio.create_subprocess_exec`; parses duration, width, height, fps, codec, format |
| `POST /api/v1/videos/upload` route | `backend/app/api/v1/videos.py` | Receives `UploadFile`; delegates to `VideoService`; returns `VideoResponse` |
| `GET /api/v1/videos/{id}` route | `backend/app/api/v1/videos.py` | Queries `Video` by UUID; returns `VideoResponse` or 404 |
| `DELETE /api/v1/videos/{id}` route | `backend/app/api/v1/videos.py` | Deletes file from disk and DB record; returns 200 |
| Videos router registration | `backend/app/main.py` | `app.include_router(videos.router, prefix="/api/v1/videos", tags=["videos"])` |
| Model import in `database.py` or `main.py` | Side-effect import | `Video` model must be imported before `create_all` runs so SQLAlchemy knows about the table |

### Strategic Approach — API

Introduce a three-layer structure for this story and all future ones: **ORM model** in `models/`, **Pydantic schemas** in `schemas/`, **service class** in `services/`. The route handler in `api/v1/videos.py` stays thin — it validates HTTP concerns (Content-Length check, file extension), calls `VideoService`, and serialises the response. `VideoService` owns the business flow: validate format, save to disk with `aiofiles`, call `FFmpegService.probe()` in a subprocess, write the DB record, and clean up on any failure. `FFmpegService` wraps `ffprobe` as an async subprocess, keeping FFmpeg concerns isolated so it can be reused by later stories (silence detection, export, etc.).

### Key Design Decisions — API

- Use `asyncio.create_subprocess_exec` for `ffprobe` — not `subprocess.run` — to avoid blocking the event loop.
- Reject oversized uploads early: check the `Content-Length` request header before accepting the body; then count bytes during streaming as a secondary guard.
- Store files as `{uuid4()}{original_extension}` in `storage/uploads/` — preserves extension for FFmpeg, avoids filename collisions, decouples storage name from user-supplied filename.
- Store the original user-supplied filename in the `videos.filename` DB column for display purposes.
- Use `try/finally` around the probe call: if `FFmpegService.probe()` raises, delete the saved file before propagating the error — no orphan files.
- Import `Video` model in `app/core/database.py` (or via `main.py`) so `Base.metadata.create_all` picks up the table on first run with no migration tooling needed.
- Use UUID primary keys (stored as TEXT in SQLite) — consistent with the plan and future tables.

---

## Frontend Analysis

### Domain Concepts — Frontend

#### Existing in Codebase

| Concept | Location | Notes |
|---------|----------|-------|
| `Layout` component | `frontend/src/components/common/Layout.tsx` | Dark header/footer wrapper; reusable for any new page |
| `App.tsx` router | `frontend/src/App.tsx` | Single route `/` → Dashboard; needs a new route |
| `api/client.ts` | `frontend/src/api/client.ts` | `get`, `post`, `patch`, `delete` via `fetch`; JSON-only — must be extended for multipart |
| `types/index.ts` | `frontend/src/types/index.ts` | Has `HealthResponse`, `ServiceStatus`, `ApiError`; Video types need to be added |
| TanStack React Query | `frontend/src/main.tsx` | `QueryClient` with `staleTime: 30s` and `retry: 1`; use `useMutation` for upload, `useQuery` for get |
| Tailwind CSS | All components | Utility-first; dark theme pattern established (`bg-gray-950`, `border-gray-800`) |
| `@` path alias | `vite.config.ts` | Resolves to `frontend/src/` — use for all imports |
| Vite dev proxy | `vite.config.ts` | `/api` → `localhost:8000`; no CORS handling needed in frontend code |

#### Missing or Needs to Be Added

| Concept | Type | Notes |
|---------|------|-------|
| `Video`, `VideoStatus`, `UploadState` types | `frontend/src/types/index.ts` | TypeScript interfaces matching `VideoResponse` schema |
| `uploadVideo()` function | `frontend/src/api/client.ts` | Must use `XMLHttpRequest` (not `fetch`) to expose `upload.onprogress` events; accepts `File`, returns `Promise<VideoResponse>`, accepts an `onProgress` callback |
| `deleteVideo()` function | `frontend/src/api/client.ts` | Thin wrapper over existing `api.delete` |
| `UploadZone` component | `frontend/src/components/upload/UploadZone.tsx` | Drag-and-drop area + file picker button; validates extension client-side before sending; shows file name and size after selection |
| `ProgressBar` component | `frontend/src/components/common/ProgressBar.tsx` | Reusable progress bar (used here for upload progress; will be reused for transcription and export in later stories) |
| `UploadPage` page | `frontend/src/pages/UploadPage.tsx` | Composes `UploadZone` + `ProgressBar` + result/error display; uses `useMutation` from React Query |
| Route `/upload` | `frontend/src/App.tsx` | Add `<Route path="/upload" element={<UploadPage />}` |
| Nav link in `Layout` | `frontend/src/components/common/Layout.tsx` | Add "Upload" link in the header beside the logo |

### Strategic Approach — Frontend

Keep the React Query `useMutation` pattern consistent with how the Dashboard uses `useQuery`. The upload itself cannot use the existing `fetch`-based `api` object because `fetch` does not expose upload progress — use `XMLHttpRequest` wrapped in a `Promise` inside a dedicated `uploadVideo()` function in `api/client.ts`. Pass an `onProgress(percent: number)` callback so `UploadPage` can drive local React state for the progress bar without coupling the API layer to component internals. Build `ProgressBar` as a generic, reusable primitive now — it will be needed again in Stories 4 (transcription) and 8 (export). Validate the file extension client-side in `UploadZone` before any network call to give instant feedback on format errors.

### Key Design Decisions — Frontend

- **XHR not fetch for progress:** `XMLHttpRequest.upload.onprogress` is the only reliable cross-browser way to track upload progress. The `fetch` API has no equivalent. Wrap XHR in a `Promise<VideoResponse>` so the call site looks like any other async function.
- **Client-side extension check first:** Validate the extension in `UploadZone` before calling the API. The server also validates, but client-side rejection is instant and avoids a wasted round trip.
- **`ProgressBar` as a shared primitive:** Place it in `components/common/` not `components/upload/` — it will be reused by transcription (Story 4) and export (Story 8).
- **`useMutation` for upload:** React Query's mutation state (`isPending`, `isError`, `isSuccess`) maps naturally to upload loading/error/success UI states without extra local state management.
- **Consistent dark theme:** Follow the pattern in `Dashboard.tsx` and `Layout.tsx` (`bg-gray-900 border border-gray-800 rounded-lg`) for all new UI elements.

---

## Dependencies

- `backend/app/main.py` — must import `Video` model and register the videos router
- `backend/app/core/database.py` — `Base` must be importable by the `Video` model
- `backend/app/core/dependencies.py` — `get_db` injected into all video route handlers
- `backend/app/core/config.py` — `settings.uploads_path` and `settings.max_upload_size_bytes` consumed by `VideoService`
- FFmpeg / `ffprobe` — must be installed and in PATH; already checked by the health endpoint
- `frontend/src/main.tsx` — `QueryClient` already wired; no changes needed
- `frontend/src/App.tsx` — new `/upload` route added here
- `frontend/src/components/common/Layout.tsx` — nav link added here
- `backend/tests/conftest.py` — test database and storage paths already configured; new test file `tests/test_videos.py` will follow the same pattern as `test_health.py`
