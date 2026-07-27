# Analysis: Export Video
Date: 2026-07-26
Story: story/2026-07-26-export-video-story.md
Scope: full-stack
Repos scanned: D:\claude\ai_video_editor\backend + D:\claude\ai_video_editor\frontend
Figma: none

---

## Project Fingerprint

FastAPI 0.115.5 (Python 3.9.12) with SQLite WAL via SQLAlchemy 2.0.36, Pydantic v2. Video processing is FFmpeg via `asyncio.create_subprocess_exec` (silence detection) or `asyncio.to_thread(subprocess.run)` (probe, concat). Frontend is React 18.3 + TypeScript + Vite + Tailwind + TanStack Query + Zustand. SSE streaming is already established for two features (execute-plan and assistant), using `fetch` + `ReadableStream` reader generators in `client.ts`. The `export` action in `EditingCommand` and `ACTION_LABELS` already exists — it currently yields a warning stub in `ExecutePlanService`.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| `export_path` column conflict with silence removal | High | `SilenceService.remove()` already writes to `video.export_path`; the silence export stream endpoint reads from the same column. Overwriting it with an encode output silently breaks the silence export stream. A dedicated `encode_export_path` column avoids the clash. |
| FFmpeg progress requires real-time stderr read | High | All existing FFmpeg calls use `asyncio.to_thread(subprocess.run)` which blocks until completion — unsuitable for streaming progress. `ExportService.encode()` must use `asyncio.create_subprocess_exec` + incremental stderr reading (same approach as `SilenceService.detect()`). |
| `video.duration` may be `None` | Medium | Progress percent = `elapsed / duration`. If `duration` is `None` (ffprobe partial failure), division by zero. Must emit progress events with `-1` or skip percentage field when duration is unavailable. |
| Scale filter distorts non-16:9 videos | Medium | Hard-coding `scale=1280:720` stretches portrait or 4:3 originals. Use `scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2` or `-vf scale=-2:720` to preserve aspect ratio with letterboxing. |
| Long encodes hit client-side timeouts | Low | CPU H.264 encoding of a 30-minute 1080p video can take 20+ minutes. SSE keeps the connection alive as long as tokens stream; ensure `X-Accel-Buffering: no` is set (already done in execute-plan pattern). |
| AsyncMock SSE generator in tests | Low | `ExportService.encode()` must be mocked as an async generator (same constraint as `ExecutePlanService.execute()`). Cross-session SQLite isolation means persistence should be asserted via the `done` event, not via `db_session` re-query. |

---

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| POST 720p → SSE progress (0–100) + done event with download_url | Needs work | New `export.py` router + `ExportService.encode()` required |
| POST 1080p → re-encoded at 1920×1080, AAC audio preserved | Needs work | FFmpeg args: `-vf scale=1920:1080 -c:v libx264 -c:a aac`; audio bitrate preservation via `-b:a` |
| Duplicate POST → 409 before FFmpeg starts | Needs work | `_in_flight` guard follows execute_plan.py pattern exactly |
| Invalid resolution → 422 with detail | Needs work | `ExportRequest` schema with `Literal["720p", "1080p"]` on `resolution` field |
| download_url → browser downloads MP4 | Needs work | `GET /{id}/export/download` FileResponse with `content_disposition_type="attachment"` |
| FFmpeg error → SSE error event, guard released | Needs work | try/finally in `_stream_with_cleanup` (same as execute_plan); ExportService raises ValueError |

---

## API Analysis

### Domain Concepts — API

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| `Video` ORM model | `app/models/video.py` | Has `export_path`, `filler_export_path`, `executed_plan_path` nullable TEXT columns; `duration` (Float, nullable) used for progress calculation |
| `FFmpegService` | `app/services/ffmpeg.py` | Has `probe()`, `detect_silence()`, `concat_segments()` — no encode/transcode method yet |
| `VideoService.get_by_id()` | `app/services/video.py` | 404-raising lookup used by every router |
| `settings.exports_path` | `app/core/config.py` | `storage/exports/` already created on startup — correct output directory |
| `_in_flight` + `_stream_with_cleanup` pattern | `app/api/v1/execute_plan.py` | Template for the new export router; handles guard release in `finally` |
| `_sse()` helper | `app/services/execute_plan.py` | `f"data: {json.dumps(payload)}\n\n"` — copy this pattern into export service |
| `ExecutePlanService` export stub | `app/services/execute_plan.py:58` | `elif action == "export": yield warning + skip` — must be updated to call real `ExportService.encode()` |
| Migration guard pattern | `app/main.py` | `_migrate_*_columns()` with try/except OperationalError — needed for `encode_export_path` column |
| Router registration | `app/main.py:151` | `app.include_router(execute_plan.router, ...)` — template for registering new export router |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `ExportRequest` schema | Pydantic model | `resolution: Literal["720p", "1080p"]` — 422 for anything else |
| `ExportService.encode()` | Async generator classmethod | Uses `asyncio.create_subprocess_exec` + incremental stderr read; parses `time=HH:MM:SS` vs `video.duration` for progress percent; yields `_sse(progress)` chunks; writes to `exports_path`; returns download URL on completion |
| `app/api/v1/export.py` router | FastAPI router | `POST /{video_id}/export` (SSE StreamingResponse) + `GET /{video_id}/export/download` (FileResponse, attachment); `_in_flight` guard + `_stream_with_cleanup` |
| `encode_export_path` column on `Video` | `Mapped[Optional[str]]` | Avoids overwriting `export_path` (silence removal stream reads it). Requires migration guard. |
| `_migrate_encode_export_path_column()` | Startup migration in `main.py` | Same idempotent try/except OperationalError pattern as existing migrations |
| Export router registration | `app/main.py` | `app.include_router(export.router, prefix="/api/v1/videos", tags=["export"])` |
| `ExecutePlanService` export branch update | `app/services/execute_plan.py:58` | Replace warning stub with `await ExportService.encode(video, resolution, db)`; resolution from `cmd.params.get("resolution", "1080p")` |

### Strategic Approach — API

The encode endpoint follows the execute-plan SSE pattern exactly: `POST /{id}/export` returns a `StreamingResponse` backed by an async generator that yields `_sse()` strings, protected by an `_in_flight` set with try/finally cleanup. `ExportService.encode()` is the new async generator that calls `asyncio.create_subprocess_exec` (not `to_thread`) so stderr can be read incrementally for progress events. Parse `time=HH:MM:SS.ms` from FFmpeg stderr against `video.duration` for percent calculation — consistent with the `detect_silence()` approach already in the codebase. A new `encode_export_path` column on `Video` isolates encode output from the silence-removal `export_path`, keeping both streams independently functional.

### Key Design Decisions — API

- **New column `encode_export_path`** — not reusing `export_path`; avoids breaking the `/silence/export/stream` endpoint which reads that column
- **`asyncio.create_subprocess_exec` for encode** — required for real-time stderr reading; existing `to_thread` pattern cannot yield mid-process
- **Progress via `time=` stderr parsing** — consistent with `detect_silence()` already in codebase; parse `out_time_ms` or `time=HH:MM:SS.ms` against `video.duration`; emit `-1` when duration is None
- **Resolution as `Literal["720p", "1080p"]`** — Pydantic rejects unknown strings at schema boundary (422) before the service sees them
- **Source priority in `ExportService`** — `executed_plan_path` → `filler_export_path` → `export_path` → `filepath`; first non-null path wins

---

## Frontend Analysis

### Domain Concepts — Frontend

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| `streamExecutePlan()` | `src/api/client.ts:155` | Async generator SSE template — `ExportPanel` will need an identical `streamExport()` function |
| `ExecutePlanStreamEvent` discriminated union | `src/types/index.ts:101` | Pattern for the new `ExportStreamEvent` type |
| `Video` interface | `src/types/index.ts:27` | Needs `encode_export_path: string \| null` added for the new column |
| `AssistantPanel.tsx` | `src/components/library/AssistantPanel.tsx` | SSE generator consumption + AbortController + step status UI — direct template for `ExportPanel` |
| `ACTION_LABELS["export"]` | `src/components/library/AssistantPanel.tsx:9` | Already labeled "Export video" — no change needed |
| `VideoCard.tsx` | `src/components/library/VideoCard.tsx` | Houses all feature panels; `ExportPanel` added alongside `SilencePanel`, `FillerPanel`, `AssistantPanel` |
| `ProgressBar` component | `src/components/common/ProgressBar.tsx` | Reusable progress bar — use for encode progress display |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `ExportStreamEvent` type | TypeScript discriminated union | `progress` (percent: number), `done` (download_url: string), `error` (message: string) |
| `streamExport()` function | Async generator in `client.ts` | `POST /api/v1/videos/{id}/export` with `{resolution}` body; same reader/decoder/buffer pattern as `streamExecutePlan()` |
| `getExportDownloadUrl()` function | Helper in `client.ts` | Returns `${BASE_URL}/api/v1/videos/${videoId}/export/download` |
| `ExportPanel.tsx` | New React component | Resolution picker (select: 720p / 1080p), Export button, `ProgressBar` (0–100), download `<a>` on done, error display |
| `ExportPanel` import + render in `VideoCard` | `VideoCard.tsx` | Added alongside existing panel imports; conditionally rendered when `video.status === "ready"` |

### Strategic Approach — Frontend

`ExportPanel` is a self-contained component modelled on `AssistantPanel` — it owns an `AbortController` ref, calls `streamExport()` via `for await`, and drives local state (`isExporting`, `progress`, `downloadUrl`, `error`). The resolution choice is local component state (defaulting to `"1080p"`), passed in the POST body. The existing `ProgressBar` component handles the 0–100 display without any new UI primitives. On `done`, a plain `<a href={downloadUrl} download>` anchor is rendered — `Content-Disposition: attachment` on the server ensures the browser saves rather than navigating.

### Key Design Decisions — Frontend

- **`ExportStreamEvent` is a new type** — not extending `ExecutePlanStreamEvent`; export events are simpler (no `step/total/action` fields, just `percent` for progress)
- **`ProgressBar` reuse** — already exists in common components; no new progress UI needed
- **AbortController on unmount** — same pattern as `AssistantPanel`; cancel the stream if the card is collapsed or user navigates away
- **Resolution default `"1080p"`** — user can downgrade to 720p; default to highest quality

---

## Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| `FFmpegService` | Export service calls it | Encode logic may live in `FFmpegService.encode()` or directly in `ExportService` |
| `VideoService.get_by_id()` | Export router calls it | No change — 404 guard already raises HTTPException |
| `ExecutePlanService` | Calls ExportService | `elif action == "export"` branch updated to call `ExportService.encode()` with resolution from `cmd.params` |
| `main.py` | Registers export router + migration | One new router include + one new migration function |
| `Video.encode_export_path` | Written by ExportService, read by download endpoint | New column — requires migration guard |
| `SilenceService` (read-only) | No change | `export_path` column untouched — safe |
