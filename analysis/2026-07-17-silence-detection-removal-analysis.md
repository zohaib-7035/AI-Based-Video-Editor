# Analysis: Silence Detection & Removal
Date: 2026-07-17
Story: 2026-07-17-silence-detection-removal-story.md
Scope: full-stack
Repos scanned: AI Video Editor backend (local) + frontend (local)
Figma: none

---

## Project Fingerprint

FastAPI 0.115.5 / Python 3.9.12 backend with SQLAlchemy 2.0 on SQLite (WAL mode). Existing routers: `health`, `videos`, `transcriptions`, `subtitles` — all mounted at `/api/v1/videos`. Services layer follows a static-method pattern (`FFmpegService`, `VideoService`, `SubtitleService`). `FFmpegService.probe()` already calls FFprobe via `asyncio.to_thread` — the silencedetect approach mirrors this. Frontend is React 18 + TypeScript 5.7 + Vite + Tailwind + TanStack Query; `VideoCard.tsx` owns all per-video mutations; new feature panels (`TranscriptPanel.tsx`) are extracted as child components with callback props.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| FFmpeg `silencedetect` writes output to stderr, not stdout — must parse stderr not stdout | High | Use `capture_output=True` and read `result.stderr`; regex is well-known: `silence_start:` / `silence_end:` / `silence_duration:` |
| Windows path backslashes in FFmpeg concat list file break the demuxer | High | Use `Path.as_posix()` for all paths written to the concat list; use `-safe 0` flag |
| Long videos: FFmpeg cut+concat may take 30–60s causing HTTP timeout | Medium | Run via `asyncio.to_thread`; use `-c copy` (stream copy, no re-encode) to keep it fast |
| Temp segment files not cleaned up if FFmpeg crashes mid-concat | Medium | Wrap all temp file operations in `try/finally`; delete temp files on error |
| Video with only silence (no non-silent segments) passed to removal | Medium | Guard in service: if non-silent windows list is empty, return 400 before calling FFmpeg |
| `export_path` on `videos` table does not exist yet — `create_all()` won't add it | Low | Apply idempotent `ALTER TABLE videos ADD COLUMN export_path TEXT` in startup migration function |
| Re-detection while removal is in progress | Low | `_in_flight` set in `silence.py` guards 409 on removal; detection is fast and allows concurrent re-detect |

---

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| POST trigger → FFmpeg silencedetect → segments returned | Needs work | `FFmpegService` exists but has no `detect_silence()` method — must add |
| Frontend displays segment list (start, end, duration) | Needs work | No `SilencePanel` component exists — must create |
| Empty silence → empty list + "No silence detected" message | Needs work | Backend returns `[]`; frontend must handle empty state explicitly |
| 404 for unknown video | Supported | `VideoService.get_by_id()` already raises 404 — reuse |
| Re-detect overwrites previous segments | Needs work | `SilenceDetection` record must be upserted (delete old + insert new) |
| POST removal → FFmpeg cuts + concat → file in exports/ | Needs work | `FFmpegService` needs `concat_segments()` method; `exports/` dir already created on startup |
| Frontend renders preview player for export URL | Needs work | No export player in `VideoCard` — must add inside `SilencePanel` |
| 400 when no silence segments stored | Needs work | Guard in removal endpoint before FFmpeg invocation |
| 409 on duplicate removal request | Needs work | Module-level `_in_flight` set in `silence.py` — same pattern as `transcriptions.py` |
| Exported video plays inline without download | Needs work | Re-use existing stream endpoint pattern or add `/silence/export/stream` |

---

## API Analysis

### Domain Concepts — API

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| `FFmpegService` | `backend/app/services/ffmpeg.py` | Has `probe()` via `asyncio.to_thread`; needs two new static async methods |
| `VideoService.get_by_id()` | `backend/app/services/video.py` | Returns `Video` or raises 404 — reuse in silence router |
| `settings.exports_path` | `backend/app/core/config.py` | Already defined + directory created on lifespan startup |
| `settings.temp_path` | `backend/app/core/config.py` | Already defined — use for temp segment files during concat |
| Startup `_migrate_*` guard pattern | `backend/app/main.py` | `try/except OperationalError` per column — repeat for `export_path` |
| `_in_flight` set pattern | `backend/app/api/v1/transcriptions.py` | Module-level set for 409 guard on duplicate jobs — repeat in silence router |
| `Video` ORM model | `backend/app/models/video.py` | Missing `export_path` nullable TEXT column |
| `VideoResponse` schema | `backend/app/schemas/video.py` | Missing `export_path: Optional[str]` field |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `SilenceDetection` ORM model | New model + `silence_detections` table | Fields: `id`, `video_id` (FK CASCADE), `segments` (JSON TEXT), `detected_at` |
| `SilenceDetectionResponse` | New Pydantic schema | Fields: `id`, `video_id`, `segments: List[SilenceSegment]`, `detected_at` |
| `SilenceSegment` | New Pydantic schema | Fields: `start: float`, `end: float`, `duration: float` |
| `FFmpegService.detect_silence()` | New static async method | Runs `ffmpeg -i input -af silencedetect=noise=-50dB:d=0.5 -f null -`; parses stderr for silence timestamps |
| `FFmpegService.concat_segments()` | New static async method | Writes concat file to temp_path, runs `ffmpeg -f concat -safe 0 -i list.txt -c copy output.mp4`; cleans up temp files |
| `SilenceService` | New service class | Orchestrates detection parsing, non-silent window computation, DB upsert, and removal |
| `silence.py` router | New APIRouter | Three endpoints: POST detect, GET segments, POST remove |
| `export_path` column on `Video` | New nullable TEXT column | Added via `ALTER TABLE` guard on startup |
| `_migrate_silence_columns()` | New startup function in `main.py` | Idempotent `ALTER TABLE videos ADD COLUMN export_path TEXT` |

### Strategic Approach — API

Extend `FFmpegService` with two new async static methods (`detect_silence` and `concat_segments`) following the existing `probe()` pattern — each runs FFmpeg via `asyncio.to_thread` and raises `ValueError` on failure. A new `SilenceService` owns the business logic: orchestrating FFmpeg calls, parsing stderr output for silence timestamps using regex, computing non-silent windows by inverting silence ranges against video duration, and managing temp file lifecycle. The silence router (`api/v1/silence.py`) exposes three endpoints and reuses `VideoService.get_by_id()` for 404 guards. Removal runs via `asyncio.to_thread` synchronously in the endpoint (no background task) since `-c copy` concat is fast enough for typical short videos; a module-level `_in_flight` set provides the 409 guard for duplicate removal requests.

### Key Design Decisions — API

- **`SilenceDetection` table (not a column on `Video`)** — mirrors the `Transcript` pattern; stores `segments` as JSON TEXT; one record per video, overwritten on re-detect via delete + insert
- **`export_path` on `Video` model (not a new table)** — silence removal produces one export per video; storing the path on the video record avoids a join and keeps `VideoResponse` self-contained
- **`asyncio.to_thread` for removal, no background task** — `-c copy` is fast enough for acceptable response time; avoids WebSocket/polling complexity excluded from story scope
- **Segment files in `temp_path`** — extracted clips written as `{video_id}_seg_N.mp4`; a `try/finally` block guarantees cleanup whether concat succeeds or fails
- **Parse stderr with regex** — `silence_end` and `silence_duration` markers are reliable; compute `silence_start = silence_end - silence_duration` to derive the full range

---

## Frontend Analysis

### Domain Concepts — Frontend

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| `VideoCard.tsx` | `frontend/src/components/library/VideoCard.tsx` | Owns all per-video state + mutations; `subtitleMutation` pattern to replicate for silence |
| `TranscriptPanel.tsx` | `frontend/src/components/library/TranscriptPanel.tsx` | Child panel pattern — `SilencePanel` follows same props-with-callbacks shape |
| `api/client.ts` | `frontend/src/api/client.ts` | `api.post` / `api.get` helpers + `getStreamUrl` — reuse both |
| `types/index.ts` | `frontend/src/types/index.ts` | `Video`, `Transcript` interfaces — add two new interfaces and extend `Video` |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `SilenceSegment` TS interface | New type in `types/index.ts` | `start: number`, `end: number`, `duration: number` |
| `SilenceDetection` TS interface | New type in `types/index.ts` | `id`, `video_id`, `segments: SilenceSegment[]`, `detected_at` |
| `Video.export_path` field | Extend existing `Video` interface | `export_path: string \| null` |
| `detectSilence()` | New export in `api/client.ts` | `POST /api/v1/videos/{id}/silence/detect` → `SilenceDetection` |
| `getSilence()` | New export in `api/client.ts` | `GET /api/v1/videos/{id}/silence` → `SilenceDetection` |
| `removeSilence()` | New export in `api/client.ts` | `POST /api/v1/videos/{id}/silence/remove` → `{ export_url: string }` |
| `getExportStreamUrl()` | New export in `api/client.ts` | Returns `${BASE_URL}/api/v1/videos/{id}/silence/export/stream` |
| `SilencePanel.tsx` | New component | Renders detect button → segment list → remove button → export preview player |
| Silence state in `VideoCard` | Extend existing component | `silenceDetection` state, `detectMutation`, `removeMutation`; renders `SilencePanel` |

### Strategic Approach — Frontend

Follow the `TranscriptPanel` + `VideoCard` composition pattern exactly: `SilencePanel.tsx` is a presentational child component that receives `silenceDetection`, `onDetect`, `onRemove`, `isDetecting`, `isRemoving`, and `exportStreamUrl` as props; `VideoCard.tsx` owns all state and mutations. The detect mutation calls `detectSilence()` and on success calls `getSilence(video.id).then(setSilenceDetection)` to refresh local state — mirroring how `subtitleMutation.onSuccess` calls `getTranscript()` directly rather than relying on `invalidateQueries`. The export preview is an inline `<video controls>` element rendered inside `SilencePanel` when `exportStreamUrl` is non-null, using the same styling as the existing video preview.

### Key Design Decisions — Frontend

- **`getSilence()` called directly in `onSuccess` (not via `invalidateQueries`)** — `silenceDetection` is local state in `VideoCard`, not part of the `['videos']` query cache; same reasoning as subtitle mutation
- **Silence detection available whenever `video.status === 'ready'`** — does not require a completed transcript; independent feature flow
- **Export preview inside `SilencePanel`** — keeps the original video player clean; the export is a separate processed file and should be visually distinct from the source
- **`silenceDetection` loaded on mount** — call `getSilence(video.id)` in a `useEffect` when `video.status === 'ready'` to restore state after page reload; 404 silently ignored (no detection run yet)

---

## Dependencies

- `FFmpegService` — extended with `detect_silence()` and `concat_segments()`; `probe()` unchanged
- `VideoService` — `get_by_id()` reused; `VideoResponse` schema gains `export_path`
- `main.py` lifespan — gains `_migrate_silence_columns()` call and `silence.router` registration
- `Video` ORM model — gains `export_path` nullable TEXT column
- `VideoCard.tsx` — extended with silence state, two mutations, and `SilencePanel` rendering
- `types/index.ts` — extended with two new interfaces and one new field on `Video`
- `api/client.ts` — extended with four new exports
