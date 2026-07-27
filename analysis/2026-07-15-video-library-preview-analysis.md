# Analysis: Video Library & Preview
Date: 2026-07-15
Story: story/2026-07-15-video-library-preview-story.md
Scope: full-stack
Repos scanned: backend (local), frontend (local)
Figma: none

---

## Project Fingerprint

FastAPI 0.115.5 (Python 3.9.12) backend with SQLAlchemy 2.0 + SQLite in WAL mode. Single `videos` domain — no module sub-directories; all API code lives under `app/api/v1/`, services under `app/services/`, models under `app/models/`. Frontend is React 18 + TypeScript + Vite + Tailwind CSS 3.4 with TanStack Query 5 for data fetching and React Router v6 for routing. No state management needed for the library view (server state only). Key integrations: FFmpeg via `asyncio.create_subprocess_exec`, Faster-Whisper and Ollama planned but not yet wired.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| `filepath` stored as absolute posix path in DB — moves or storage remounts silently break stream | Medium | Validate `Path(video.filepath).exists()` in the stream endpoint; return 404 with clear message if file is missing from disk |
| `duration` is nullable — FFprobe skips or fails on an edge-case file that passed the earlier validation | Low | Frontend formatting helper must guard against `null`; render "—" rather than crash |
| Delete while preview is playing — `<video>` element holds a reference to a URL that will 404 | Low | Clear active preview state immediately when the delete mutation fires, before the API call completes |
| React Query cache not refreshed after delete — stale list shown until manual reload | Low | Call `queryClient.invalidateQueries(['videos'])` in the `onSuccess` callback of the delete mutation |
| `VideoResponse` exposes the raw server `filepath` — acceptable for local-only use but a path-traversal concern if deployed | Low | No action now; note for future hardening. Stream endpoint gates access via DB lookup, which is sufficient |
| Large files served via `FileResponse` — starlette buffers the whole file into memory if range headers absent | Low | For local preview this is acceptable; `starlette.responses.FileResponse` does support range requests when the browser sends `Range` headers (all modern browsers do for `<video>`) |

---

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| List all uploaded videos with no missing entries | Needs work | `GET /api/v1/videos` endpoint and `VideoService.list_all()` do not exist yet |
| Each card shows filename, mm:ss duration, MB/GB size, upload timestamp | Supported (data) / Needs work (formatting) | All fields are on `VideoResponse`; frontend formatting helpers (duration, bytes) must be written |
| HTML5 `<video>` player renders in-page, supports play/pause/seek | Needs work | `GET /api/v1/videos/{id}/stream` endpoint does not exist; frontend `<video src=...>` element must be added |
| Empty state shown with link to `/upload` | Needs work | `LibraryPage` must handle empty array response |
| Delete removes record + file and refreshes list | Supported (API) / Needs work (frontend wiring) | `DELETE /api/v1/videos/{id}` exists; `deleteVideo()` client function exists; `invalidateQueries` wiring is missing |
| Error message (not crash) when backend unavailable | Needs work | `LibraryPage` must render `isError` state — follow the `Dashboard.tsx` pattern |

---

## API Analysis

### Domain Concepts — API

#### Existing in Codebase

| Concept | Location | Notes |
|---------|----------|-------|
| `Video` ORM model | `app/models/video.py` | Has all needed fields: `id`, `filename`, `file_size`, `duration`, `created_at`, `status`; `filepath` is the on-disk path needed by the stream endpoint |
| `VideoResponse` Pydantic schema | `app/schemas/video.py` | Already contains every field the list and preview need — no schema change required |
| `VideoService.get_by_id` | `app/services/video.py:98` | Reusable in the stream endpoint for the DB lookup before serving the file |
| `VideoService.delete` | `app/services/video.py:105` | Already implemented; no change needed |
| `videos` router | `app/api/v1/videos.py` | Router registered at `/api/v1/videos`; add two new routes here |
| `settings.uploads_path` | `app/core/config.py:52` | Points to `./storage/uploads`; the stream endpoint will resolve paths relative to this |
| CORS middleware — exposes `Content-Range`, `Accept-Ranges`, `Content-Disposition` | `app/main.py:46` | Already configured for range-request headers; browser `<video>` range requests will work without further change |

#### Missing or Needs to Be Added

| Concept | Type | Notes |
|---------|------|-------|
| `VideoService.list_all(db)` | Static method on `VideoService` | `db.query(Video).order_by(Video.created_at.desc()).all()` — returns `List[Video]`; newest first |
| `GET /api/v1/videos` | Route in `videos.py` | Returns `List[VideoResponse]`; delegates to `VideoService.list_all` |
| `GET /api/v1/videos/{id}/stream` | Route in `videos.py` | Calls `VideoService.get_by_id`, validates file exists on disk, returns `FileResponse` with correct MIME type and `Content-Disposition: inline` header |
| MIME type resolver | Helper in `videos.py` | Maps extension (`.mp4` → `video/mp4`, `.mov` → `video/quicktime`, `.avi` → `video/x-msvideo`, `.mkv` → `video/x-matroska`, `.webm` → `video/webm`) — used by the stream route to set the correct `media_type` |

### Strategic Approach — API

Two additions to the existing `videos.py` router, both shallow. `VideoService.list_all` is a single SQLAlchemy query — no joins, no subqueries, no new tables. The stream route reuses `VideoService.get_by_id` for the DB lookup and then delegates file delivery to FastAPI's built-in `FileResponse` from `fastapi.responses`; Starlette handles range requests automatically, which is what the browser `<video>` element needs for seeking. No new services, no new models, no migrations — this story touches only the router and service files.

### Key Design Decisions — API

- **Use `FileResponse` over a `StaticFiles` mount** — `FileResponse` gates file access through the DB (`get_by_id` → 404 if unknown id), sets `Content-Disposition: inline`, and can set the correct MIME type per extension. A `StaticFiles` mount would expose the UUID storage filename directly and bypass future auth middleware.
- **Route is `/{id}/stream`, not `/{id}/file`** — keeps semantics clear and avoids collision with the existing `GET /{id}` metadata route.
- **Order by `created_at DESC`** — newest uploads appear first; no query parameter needed now (pagination is scope-out).
- **Validate file exists before `FileResponse`** — return 404 with `"Video file not found on disk."` if the stored `filepath` no longer exists, to prevent a 500 from starlette.

---

## Frontend Analysis

### Domain Concepts — Frontend

#### Existing in Codebase

| Concept | Location | Notes |
|---------|----------|-------|
| `Video` TypeScript interface | `src/types/index.ts:27` | All required fields present; no changes needed |
| `deleteVideo()` API function | `src/api/client.ts:83` | Calls `DELETE /api/v1/videos/{id}`; ready to use from `LibraryPage` |
| `api.get<T>()` generic helper | `src/api/client.ts:27` | Use for `GET /api/v1/videos` list call |
| `Layout` component + `NAV_LINKS` array | `src/components/common/Layout.tsx:8` | Add `{ to: "/library", label: "Library" }` entry |
| `App.tsx` routes | `src/App.tsx` | Add `<Route path="/library" element={<LibraryPage />} />` |
| `Dashboard.tsx` data-fetching pattern | `src/pages/Dashboard.tsx` | Reference for `useQuery` + skeleton + `isError` state — replicate in `LibraryPage` |
| `ProgressBar` component | `src/components/common/ProgressBar.tsx` | Not needed for this story; noted for Stories 4 and 8 |

#### Missing or Needs to Be Added

| Concept | Type | Notes |
|---------|------|-------|
| `getVideos()` | API client function in `src/api/client.ts` | `api.get<Video[]>('/api/v1/videos')` |
| `LibraryPage` | New page `src/pages/LibraryPage.tsx` | `useQuery(['videos'], getVideos)` + card grid + empty state + error state |
| `VideoCard` | New component `src/components/library/VideoCard.tsx` | Shows metadata, preview toggle, delete button; owns the `<video>` element and inline confirm-delete state |
| Duration formatter | Utility function (inline in `VideoCard` or `src/utils/format.ts`) | `(s: number \| null) => string` — converts float seconds to `mm:ss`; returns `"—"` for null |
| Size formatter | Utility function (same location) | `(bytes: number) => string` — converts bytes to `"X.XX MB"` or `"X.XX GB"` |
| Inline delete confirmation | Local state on `VideoCard` | Two-step: first click sets `confirmDelete = true` (shows "Confirm?" button); second click fires the mutation. Avoids `window.confirm()` and keeps UX consistent with the dark theme |

### Strategic Approach — Frontend

One new page (`LibraryPage`) and one new component (`VideoCard`) wired through the existing routing and API client patterns. `LibraryPage` uses a single `useQuery(['videos'], getVideos)` call; on success it maps the array to `VideoCard` instances. `VideoCard` manages two pieces of local state: `previewOpen` (toggles the `<video>` element) and `confirmDelete` (two-step delete). The delete mutation calls `deleteVideo(id)` then `queryClient.invalidateQueries(['videos'])` to refresh the list — the same pattern that would be used in future stories for any mutating operation. No Zustand store is needed; all state is server-derived or component-local.

### Key Design Decisions — Frontend

- **`<video>` element as toggleable inline expand** — clicking "Preview" on a card shows/hides an HTML5 `<video controls>` element with `src` pointing to `GET /api/v1/videos/{id}/stream`. No modal, no new route. Clicking "Preview" again (or on another card) collapses the player. If a different card's preview is opened, the prior one should close (lift `activePreviewId` to `LibraryPage` and pass it down as a prop, or use a single `useState<string | null>` at page level).
- **Stream URL pattern** — `src={`${BASE_URL}/api/v1/videos/${id}/stream`}` — constructed in `VideoCard` using the same `BASE_URL` from `import.meta.env.VITE_API_URL`.
- **`queryKey: ['videos']`** — matches the key used in `invalidateQueries` after delete; must be consistent across `LibraryPage` and any future components that also show video lists.
- **Two-step delete with inline confirm** — avoids native `window.confirm()` dialog which looks out of place in the dark theme. `confirmDelete` state resets to `false` on mouse-leave or after the mutation completes.
- **`getVideos()` added to `api/client.ts`** — keeps all API calls in one file, consistent with `deleteVideo()` and `uploadVideo()`.

---

## Dependencies

- `fastapi.responses.FileResponse` — stdlib import, no new package dependency
- `src/pages/LibraryPage.tsx` imported by `App.tsx`
- `src/components/library/VideoCard.tsx` imported by `LibraryPage`
- `getVideos()` added to `src/api/client.ts` — consumed by `LibraryPage`
- `Layout.tsx` `NAV_LINKS` — adding Library entry; Dashboard and Upload nav links unaffected
- No new DB migrations — `Video` model and `videos` table are unchanged
- No new Python packages — `FileResponse` is part of `fastapi`/`starlette`
- No new npm packages — `useQuery`, `useMutation` are already in TanStack Query 5
