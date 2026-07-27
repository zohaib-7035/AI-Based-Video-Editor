# User Story: Export Video
Date: 2026-07-26
Source: Pasted text

---

## Story 8: Export Video to MP4 with Progress

**As a** video creator,
**I want** to export my edited video as an MP4 at 720p or 1080p,
**So that** I can publish it on YouTube and social media.

### Scope In
- POST `/api/v1/videos/{id}/export` — accepts `resolution` (720p | 1080p), returns SSE stream
- FFmpeg re-encodes to H.264 video + AAC audio at the chosen resolution
- Source for export is the most-processed version of the video: `executed_plan_path` → `filler_export_path` → `export_path` → `filepath` (whichever is newest/most-edited)
- SSE event types: `progress` (0–100 percent), `done` (with `download_url`), `error`
- `_in_flight` guard — returns 409 if export already running for this video
- `export_path` column on `Video` updated on completion (reuses existing column)
- Frontend: Export panel in VideoCard with resolution picker (720p / 1080p), Export button, real-time progress bar, download link on completion
- A dedicated `GET /api/v1/videos/{id}/export/download` endpoint for attachment download (Content-Disposition: attachment), distinct from the inline stream endpoint

### Scope Out
- Other container/codec formats (WebM, MOV, AVI, H.265) — future story
- Custom bitrate or CRF quality controls — future story
- Audio-only export — future story
- Direct upload to YouTube / social media APIs — out of scope (local-first, no cloud)
- Batch export of multiple videos — future story
- Export of subtitle-burned-in video — future story

### Acceptance Criteria

- Given a video exists, when the user POSTs `{"resolution": "720p"}` to `/export`, then the backend streams SSE `progress` events (0–100) followed by a `done` event containing a `download_url`
- Given a video exists, when the user POSTs `{"resolution": "1080p"}` to `/export`, then the exported file is re-encoded at 1920×1080 with audio codec AAC and original audio bitrate preserved
- Given an export is in progress, when a second POST `/export` arrives for the same video, then the API returns 409 Conflict immediately (before starting any FFmpeg process)
- Given an invalid or missing `resolution` value, when the user POSTs to `/export`, then the API returns 422 with a descriptive validation error message
- Given the `done` SSE event has been received, when the user clicks the download link in the frontend, then the browser downloads the MP4 file (Content-Disposition: attachment)
- Given the FFmpeg process fails mid-encode, when the error occurs, then the SSE stream emits an `error` event with a human-readable message and the in-flight guard is released

### Definition of Done
- [ ] Implementation complete and peer-reviewed
- [ ] Tests written and passing (target: 20+ tests, >96% Strong rating)
- [ ] No regression in existing 168 passing tests
- [ ] FFmpeg encode verified: output resolution correct, audio codec AAC, audio bitrate preserved
- [ ] SSE contract validated: `progress` (0–100 percent int), `done` (download_url), `error` (message) event shapes
- [ ] `_in_flight` 409 guard confirmed in tests
- [ ] Frontend export panel: resolution picker, progress bar, download link — manually verified in browser
- [ ] Exported file is playable in VLC / browser
