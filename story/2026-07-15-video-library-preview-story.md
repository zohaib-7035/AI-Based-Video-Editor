# User Story: Video Library & Preview
Date: 2026-07-15
Source: Pasted text

---

## Story 3: Browse and preview uploaded videos

**As a** creator,
**I want** to browse all my uploaded videos and preview any one of them,
**So that** I can identify the right video to edit before starting any editing workflow.

### Scope In
- `GET /api/v1/videos` endpoint returning a list of all uploaded videos (id, filename, duration, size, upload date, status)
- `GET /api/v1/videos/{id}/stream` endpoint (or static file mount) to serve raw video bytes to the browser's HTML5 `<video>` player
- Frontend Video Library page (`/library`) listing all videos in a card or table layout
- Each video entry shows: original filename, formatted duration (mm:ss), human-readable file size (e.g. "45.2 MB"), and upload date
- Inline video preview: clicking a video opens an HTML5 `<video>` player within the page (no new tab or modal required unless UX warrants it)
- Delete action on each video card calls the existing `DELETE /api/v1/videos/{id}` endpoint and refreshes the list
- Empty state UI when no videos have been uploaded, with a link to the Upload page
- Navigation link to Library added to the existing Layout header

### Scope Out
- Thumbnail / poster-frame generation (requires FFmpeg seek — deferred to a future story)
- Sorting, filtering, or search across the video list
- Batch-select or bulk delete
- Pagination (all videos returned in a single response; pagination deferred until volume warrants it)
- Renaming videos
- Any editing operations (cutting, trimming, export — Stories 6–8)
- Video streaming with range-request / HLS (simple full-file serve is sufficient for preview)

### Acceptance Criteria

- Given at least one video has been uploaded, when I navigate to `/library`, then I see a list of all uploaded videos with no missing entries.
- Given a video entry in the library, when I view its card, then I see the original filename, duration formatted as `mm:ss`, file size formatted in MB or GB (2 decimal places), and the upload timestamp.
- Given a video entry in the library, when I click the Preview button, then an HTML5 `<video>` player renders and I can play, pause, and seek the video without leaving the page.
- Given no videos have been uploaded, when I navigate to `/library`, then I see an empty-state message and a link that takes me to `/upload`.
- Given a video entry in the library, when I click Delete and confirm the action, then the video is removed from the list, the backend deletes the record and file, and I see the updated list (or empty state if it was the last video).
- Given the backend is unavailable, when I load `/library`, then I see an error message rather than a blank or crashed page.

### Definition of Done
- [ ] `GET /api/v1/videos` endpoint implemented, tested, and returning correct schema
- [ ] Video file serving endpoint implemented (static mount or `/stream` route)
- [ ] Frontend `/library` route renders list with all required metadata fields
- [ ] HTML5 video player preview working in-page
- [ ] Delete flow working end-to-end (API call → list refresh)
- [ ] Empty state rendered when video list is empty
- [ ] Navigation header updated with Library link
- [ ] Backend tests written and passing (list endpoint: happy path + empty list + schema validation)
- [ ] No regression in existing upload or health endpoints

---
