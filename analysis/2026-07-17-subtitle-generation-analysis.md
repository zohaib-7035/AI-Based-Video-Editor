# Analysis: Subtitle Generation
Date: 2026-07-17
Story: 2026-07-17-subtitle-generation-story.md
Scope: full-stack
Repos scanned: backend (FastAPI/Python 3.9), frontend (React 18 / TypeScript 5.7)
Figma: none

---

## Project Fingerprint

FastAPI 0.115.5 (Python 3.9.12) backend with SQLAlchemy 2.0 / SQLite (WAL mode). Four API modules registered on `app`: `health`, `videos`, `transcriptions` — each under `/api/v1/`. Frontend is React 18 + TypeScript + TanStack Query + Zustand on Vite 6 / Tailwind CSS 3.4. Stories 1–4 complete: video upload, library/preview, and AI transcription (Faster-Whisper + WebSocket) are all live. Subtitle generation (Story 5) is the next increment and builds directly on the `Transcript` model created in Story 4.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| `init_db()` uses `create_all()`, which does NOT add columns to existing tables | High | Adding `srt_path`/`vtt_path` to `transcripts` requires a manual `ALTER TABLE` or deleting `database.db` on dev machines. Must document and automate in startup or add a raw `ALTER TABLE IF NOT EXISTS` guard. |
| Float-to-timestamp precision errors in SRT/VTT formatting | Medium | Segment timestamps are `float` (e.g. `2.5000001`). Must round to integer milliseconds via `round(ts * 1000)` before formatting — do not truncate. |
| `transcript` local state in `VideoCard` goes stale after subtitle generation | Medium | After `POST /subtitles/generate` succeeds, the `transcript` state already in memory has `srt_path=null`. The success handler must call `getTranscript(video.id)` again (or `invalidateQueries`) to pick up the new paths before the CC button and download links appear. |
| `<track>` element browser CC button vs. custom CC toggle | Low | Adding `<track default>` makes the browser's native video controls show a CC button. Adding a second custom CC button creates a redundant control. Decision needed: rely on native CC controls only, or hide native and drive via the TextTrack API with a custom button. |
| VTT served to `<track>` element requires the backend CORS origin to match the frontend | Low | `CORSMiddleware` in `main.py` already allows `http://localhost:5173`. Since `<track>` uses the browser's fetch, this is covered for local dev. In production, `cors_origins` must include the deployed frontend URL. No code change needed now, but document it. |
| Empty segments list passed to `to_srt()` / `to_vtt()` | Low | A transcript with no detected speech has `segments=[]`. Both format methods must return a graceful empty output (empty string for SRT; `WEBVTT\n` only for VTT) rather than raising an index error. |

---

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| `POST generate` returns 200 with SRT/VTT URLs; files written to disk | Needs work | `SubtitleService`, endpoint, and `storage/subtitles/` dir all need creating |
| 400 when no completed transcript exists | Needs work | Guard query in generate handler against `Transcript.status != completed` |
| `GET /srt` returns correct `Content-Disposition: attachment` + SRT body | Needs work | New endpoint + `FileResponse` with `content_disposition_type="attachment"` and `media_type="text/plain"` |
| `GET /vtt` returns `Content-Type: text/vtt` body | Needs work | New endpoint; FastAPI has no built-in `text/vtt` media type — pass `media_type="text/vtt"` to `Response` |
| SRT format exact: sequential index + `HH:MM:SS,mmm` comma separator | Needs work | `SubtitleService.to_srt()` must implement this precisely |
| VTT format exact: `WEBVTT` header + `HH:MM:SS.mmm` period separator | Needs work | `SubtitleService.to_vtt()` must implement this precisely |
| DB columns `srt_path`/`vtt_path` populated after generation | Needs work | Columns don't exist in `Transcript` model yet |
| 409 if subtitles already generated | Needs work | Guard on non-null `srt_path` in generate handler |
| 404 on download when no subtitle files | Needs work | Check `srt_path`/`vtt_path` is non-null + file exists on disk |
| Frontend "Generate Subtitles" button → loading → download buttons appear | Needs work | `TranscriptPanel` needs new props and new UI elements; `VideoCard` needs mutation wiring |
| Download SRT/VTT triggers browser file download | Needs work | `<a href={...} download>` anchor in `TranscriptPanel`; URL from `getSubtitleSrtUrl()`/`getSubtitleVttUrl()` |
| `VideoResponse` includes `srt_path`/`vtt_path` (Story 5B AC) | Design decision | See API design decisions — recommend keeping these on `TranscriptResponse` only to avoid a join in the video list query. `VideoCard` already holds `transcript` in local state. |
| `<track kind="subtitles" default>` present in `<video>` element | Needs work | `VideoCard` needs `<track>` added when `transcript?.vtt_path` is non-null |
| VTT served with `Access-Control-Allow-Origin: *` for `<track>` | Supported | Existing `CORSMiddleware` in `main.py` covers `http://localhost:5173`. No extra header needed for local dev. |
| CC toggle shows/hides subtitle track | Needs work | `useRef<HTMLVideoElement>` needed in `VideoCard`; toggle `textTracks[0].mode` |
| No CC button when `vtt_path` is null | Needs work | Conditional render based on `transcript?.vtt_path` |

---

## API Analysis

### Domain Concepts — API

#### Existing in Codebase

| Concept | Location | Notes |
|---------|----------|-------|
| `Transcript` ORM model | `app/models/transcript.py` | Has `id, video_id, text, segments, language, status, error, created_at` — missing `srt_path`, `vtt_path` |
| `TranscriptStatus` enum | `app/models/transcript.py` | `processing`, `completed`, `error` — used to guard generate endpoint |
| `TranscriptResponse` Pydantic schema | `app/schemas/transcript.py` | Pydantic v2; has `@field_validator` for JSON segment decoding; missing subtitle path fields |
| `VideoResponse` Pydantic schema | `app/schemas/video.py` | 13 fields; no transcript or subtitle data |
| `transcriptions` router | `app/api/v1/transcriptions.py` | Registered at prefix `/api/v1/videos`; subtitle router will use same prefix |
| `Settings.storage_path` | `app/core/config.py` | `@property` returning `Path`; `uploads_path`, `exports_path`, `temp_path` follow same pattern |
| `lifespan` startup | `app/main.py` | Creates `uploads/`, `exports/`, `temp/` dirs; `subtitles/` must be added here |
| `init_db()` | `app/core/database.py` | `Base.metadata.create_all()` — creates missing tables, does NOT add columns |
| `VideoService.list_all()` | `app/services/video.py` | Returns `List[Video]` ordered by `created_at DESC`; no join to `transcripts` |

#### Missing or Needs to Be Added

| Concept | Type | Notes |
|---------|------|-------|
| `SubtitleService` | New service class | `app/services/subtitle.py` — `to_srt(segments, video_filename)` and `to_vtt(segments)` returning formatted strings |
| `Transcript.srt_path` | New ORM column | Nullable `Text`, written after file creation |
| `Transcript.vtt_path` | New ORM column | Nullable `Text`, written after file creation |
| `TranscriptResponse.srt_path` / `vtt_path` | New schema fields | `Optional[str]` on `TranscriptResponse` |
| `subtitles` router | New FastAPI `APIRouter` | `app/api/v1/subtitles.py` — three routes |
| `POST /{video_id}/subtitles/generate` | New endpoint | Fetches completed `Transcript`, calls `SubtitleService`, writes files, updates DB |
| `GET /{video_id}/subtitles/srt` | New endpoint | Serves SRT as `FileResponse` with `content_disposition_type="attachment"` |
| `GET /{video_id}/subtitles/vtt` | New endpoint | Serves VTT as `Response(content=..., media_type="text/vtt")` |
| `Settings.subtitles_path` | New `@property` | `return self.storage_path / "subtitles"` |
| Startup `subtitles/` dir creation | Lifespan change | `settings.subtitles_path.mkdir(parents=True, exist_ok=True)` added alongside existing dir creations |
| SQLite column migration guard | Startup utility | `ALTER TABLE transcripts ADD COLUMN srt_path TEXT` wrapped in `try/except OperationalError` to handle already-exists safely |

### Strategic Approach — API

`SubtitleService` is a pure conversion layer — no I/O, no async — that accepts the decoded `List[TranscriptSegment]` and returns a formatted string. The router calls the service synchronously (no `asyncio.to_thread` needed), writes the output files to `storage/subtitles/`, then updates the `srt_path`/`vtt_path` columns on the `Transcript` record in a single commit. The three subtitle endpoints (`generate`, `srt`, `vtt`) are grouped into their own `APIRouter` in `app/api/v1/subtitles.py` and registered in `main.py` at the same prefix as `transcriptions` — keeping all per-video routes consistently nested under `/api/v1/videos`. The DB column gap (SQLite `ALTER TABLE`) is handled via a one-time idempotent migration guard run during startup, consistent with how the project manages schema without Alembic.

### Key Design Decisions — API

- **Keep `srt_path`/`vtt_path` on `TranscriptResponse`, not `VideoResponse`**: Adding them to `VideoResponse` would require a `LEFT JOIN` to `transcripts` in `VideoService.list_all()`, which currently returns plain `Video` ORM objects. The frontend already fetches the transcript on-demand in `VideoCard`; the subtitle paths can ride on the same `TranscriptResponse`. This avoids a join and keeps `VideoService` clean.
- **`SubtitleService` is synchronous**: Formatting strings and writing small text files is CPU-bound and fast. No `asyncio.to_thread` overhead needed — call directly from the async endpoint handler.
- **`GET /subtitles/vtt` uses `Response(content=..., media_type="text/vtt")`**: FastAPI's `FileResponse` does not accept a custom `media_type` override cleanly for non-standard MIME types. Reading the file content and returning a plain `Response` with `media_type="text/vtt"` is cleaner and avoids starlette header conflicts.
- **SQLite ALTER TABLE guard over delete-and-recreate**: Running `ALTER TABLE transcripts ADD COLUMN srt_path TEXT` (with `IF NOT EXISTS` or `try/except OperationalError`) on startup is safer than requiring developers to manually delete `database.db`. Both columns must be added this way.

---

## Frontend Analysis

### Domain Concepts — Frontend

#### Existing in Codebase

| Concept | Location | Notes |
|---------|----------|-------|
| `TranscriptPanel` component | `src/components/library/TranscriptPanel.tsx` | Props: `{ transcript: Transcript }` only — needs `videoId`, subtitle action props |
| `VideoCard` component | `src/components/library/VideoCard.tsx` | Owns all mutations; has `transcript` local state; has `<video controls src={...}>` with no `<track>` and no `useRef` |
| `Transcript` interface | `src/types/index.ts` | 8 fields — missing `srt_path: string \| null`, `vtt_path: string \| null` |
| `Video` interface | `src/types/index.ts` | 13 fields — no subtitle fields (by design: kept on `Transcript`) |
| `getStreamUrl(videoId)` | `src/api/client.ts` | URL constructor pattern to follow for `getSubtitleSrtUrl` / `getSubtitleVttUrl` |
| `transcribeVideo(videoId)` | `src/api/client.ts` | `useMutation` pattern in `VideoCard` to follow for `generateSubtitles` |
| `getTranscript(videoId)` | `src/api/client.ts` | Called in `VideoCard` useEffect on `status === "ready"`; must be called again after subtitle generation to refresh `srt_path`/`vtt_path` |
| `ProgressBar` component | `src/components/common/ProgressBar.tsx` | Reusable; not needed for subtitle generation (no progress — synchronous) |

#### Missing or Needs to Be Added

| Concept | Type | Notes |
|---------|------|-------|
| `Transcript.srt_path` / `vtt_path` | Interface fields | `srt_path: string \| null`, `vtt_path: string \| null` on `Transcript` in `types/index.ts` |
| `getSubtitleSrtUrl(videoId)` | `client.ts` helper | Returns `${BASE_URL}/api/v1/videos/${videoId}/subtitles/srt` |
| `getSubtitleVttUrl(videoId)` | `client.ts` helper | Returns `${BASE_URL}/api/v1/videos/${videoId}/subtitles/vtt` |
| `generateSubtitles(videoId)` | `client.ts` API function | `POST /api/v1/videos/{id}/subtitles/generate` |
| `subtitleMutation` in `VideoCard` | `useMutation` | Calls `generateSubtitles(video.id)`; on success, calls `getTranscript(video.id)` to refresh `transcript` state |
| "Generate Subtitles" button in `TranscriptPanel` | UI element | Visible when `transcript.srt_path === null`; driven by `isGenerating` and `onGenerateSubtitles` props |
| "Download SRT" / "Download VTT" anchors in `TranscriptPanel` | `<a>` elements | `href={getSubtitleSrtUrl(videoId)}` / `href={getSubtitleVttUrl(videoId)}`; `download` attribute triggers browser save |
| `TranscriptPanel` expanded props | Props interface | Add `videoId: string`, `onGenerateSubtitles: () => void`, `isGenerating: boolean` |
| `videoRef` in `VideoCard` | `useRef<HTMLVideoElement>` | Needed for CC toggle via `textTracks[0].mode` |
| `<track>` in `VideoCard`'s `<video>` element | JSX | `<track kind="subtitles" src={getSubtitleVttUrl(video.id)} default />` when `transcript?.vtt_path` is non-null |
| CC toggle button in `VideoCard` | Button + state | `ccEnabled` boolean state; clicking sets `videoRef.current.textTracks[0].mode` |

### Strategic Approach — Frontend

All mutation ownership stays in `VideoCard` (consistent with `deleteMutation` and `transcribeMutation`) while `TranscriptPanel` receives the subtitle state as props. The subtitle generate mutation's `onSuccess` handler calls `getTranscript(video.id)` directly to refresh `transcript` local state (not `invalidateQueries`) so the new `srt_path`/`vtt_path` values become available immediately without re-fetching the full video list. Download buttons are plain `<a href="..." download>` anchors — no fetch needed. The CC toggle for Story 5B uses `useRef<HTMLVideoElement>` on the existing `<video>` element and sets `textTracks[0].mode` to `"showing"` or `"hidden"`.

### Key Design Decisions — Frontend

- **`generateSubtitles` success handler re-fetches transcript**: `queryClient.invalidateQueries(['videos'])` alone won't update `transcript` local state in `VideoCard` (that state is populated by a separate `getTranscript` call, not from the video list). The success handler must explicitly call `getTranscript(video.id).then(setTranscript)`.
- **Download anchors, not fetch**: `<a href={url} download="name.srt">` delegates file download entirely to the browser. No `Blob` creation, no `URL.createObjectURL`. Clean and zero-effort.
- **CC via TextTrack API, not DOM manipulation**: `videoRef.current.textTracks[0].mode = "showing" | "hidden"` is the correct API. Do not try to remove/re-add the `<track>` element — this causes re-buffering. `useRef` on the `<video>` element enables this without breaking the existing `src` + `controls` attributes.
- **`<track>` only rendered when `vtt_path` is non-null**: Avoids the browser making a 404 request for a VTT file that doesn't exist yet, which would emit a console error.

---

## Dependencies

- `app/models/transcript.py` — column additions affect `init_db()` and all test fixtures that create `Transcript` records directly (test_transcription.py)
- `app/main.py` — import and registration of new `subtitles` router; `subtitles_path` dir creation in `lifespan`
- `app/core/config.py` — new `subtitles_path` property
- `backend/tests/test_transcription.py` — no direct breakage, but any test that creates a `Transcript` record will have `srt_path=None` / `vtt_path=None` by default (nullable columns) — safe
- `frontend/src/components/library/VideoCard.tsx` — `TranscriptPanel` call-site must be updated with the new props
- `frontend/src/components/library/TranscriptPanel.tsx` — props interface expands; existing render logic unchanged
