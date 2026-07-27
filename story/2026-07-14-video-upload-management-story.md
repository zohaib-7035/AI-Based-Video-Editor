# User Story: Video Upload & Management
Date: 2026-07-14
Source: Pasted text

---

## Story 2: Video Upload & Management

**As a** user,
**I want** to upload video files and have them validated, stored, and probed for metadata,
**So that** I can edit them using AI features in subsequent steps.

### Scope In
- Multipart file upload endpoint: `POST /api/v1/videos/upload`
- Accepted formats: `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm`
- File format validation by MIME type and file extension
- File size validation (configurable via `MAX_UPLOAD_SIZE_MB` in `.env`, default 2 GB)
- FFmpeg metadata probe on upload (duration, resolution, fps, codec, format)
- Rejection of corrupt files that fail FFmpeg probe
- Storage of uploaded file under `storage/uploads/` with a UUID-based filename
- Creation of a `videos` DB record in SQLite (id, filename, filepath, file_size, duration, width, height, fps, codec, format, status, created_at, updated_at)
- Video status lifecycle: `uploaded → processing → ready | error`
- `GET /api/v1/videos/{id}` — return single video metadata record
- `DELETE /api/v1/videos/{id}` — delete both the file and the DB record
- Frontend drag-and-drop upload zone with file picker fallback
- Frontend upload progress bar (driven by XHR/fetch upload progress events)
- Frontend success state (shows returned video metadata)
- Frontend error states: wrong format, size exceeded, corrupt file

### Scope Out
- No video listing / library page (Story 3)
- No video streaming or playback (Story 3)
- No thumbnail generation (Story 3)
- No transcription or subtitle features (Stories 4–5)
- No silence or filler word detection (Stories 6–7)
- No export or rendering (Story 8)
- No multi-file batch upload
- No chunked / resumable upload (post-V1)
- No user authentication or per-user storage isolation (post-V1)
- No virus / malware scanning
- No cloud storage (all files stored locally only)

### Acceptance Criteria

- Given a user uploads a valid `.mp4` file under the size limit,
  when the upload completes,
  then the server returns HTTP 200 with a JSON body containing the video `id`, `filename`, `duration`, `width`, `height`, `fps`, `codec`, `format`, and `status: "ready"`.

- Given a user uploads a valid `.mov` file,
  when the upload completes,
  then the file is physically present in `storage/uploads/` and a matching record exists in the `videos` table.

- Given a user uploads a valid `.avi` file,
  when the upload completes,
  then the server returns HTTP 200 with correct metadata and `status: "ready"`.

- Given a user uploads a file with an unsupported extension (e.g. `.pdf`, `.txt`, `.exe`),
  when the server receives the request,
  then it returns HTTP 422 with an error message identifying the unsupported format.

- Given a user uploads a file that exceeds the configured size limit,
  when the server receives the request,
  then it returns HTTP 413 with an error message stating the size limit.

- Given a user uploads a file that is corrupt or unreadable by FFmpeg,
  when the FFmpeg probe fails,
  then the server deletes the partially saved file, returns HTTP 422 with an error message, and creates no DB record.

- Given a video record exists,
  when `GET /api/v1/videos/{id}` is called with its UUID,
  then the server returns HTTP 200 with the full metadata JSON for that video.

- Given a video record does not exist,
  when `GET /api/v1/videos/{invalid-id}` is called,
  then the server returns HTTP 404.

- Given a video record exists,
  when `DELETE /api/v1/videos/{id}` is called,
  then the server returns HTTP 200, the file is removed from `storage/uploads/`, and the DB record is deleted.

- Given the frontend upload is in progress,
  when the file transfer is underway,
  then the upload progress bar increments in real time from 0% to 100%.

- Given `MAX_UPLOAD_SIZE_MB=500` is set in `.env`,
  when a 600 MB file is uploaded,
  then the server returns HTTP 413.

### Definition of Done
- [ ] `POST /api/v1/videos/upload` accepts `.mp4`, `.mov`, `.avi`, `.mkv`, `.webm` and rejects all others
- [ ] File size limit enforced and returns correct HTTP 413
- [ ] Corrupt file detection via FFmpeg probe — no orphaned files left on disk
- [ ] `videos` table created in SQLite with all specified columns
- [ ] Uploaded file stored in `storage/uploads/` with UUID filename
- [ ] `GET /api/v1/videos/{id}` returns correct metadata or 404
- [ ] `DELETE /api/v1/videos/{id}` removes file and DB record
- [ ] Frontend drag-and-drop zone functional
- [ ] Progress bar updates during upload
- [ ] Success and error states display correctly in the UI
- [ ] Original filename preserved in DB record; UUID used for storage path
- [ ] `MAX_UPLOAD_SIZE_MB` is read from `.env` (no hardcoded values)
- [ ] Tests written and passing for upload, validation, metadata, delete
- [ ] Story 1 health endpoint still returns `status: "ok"` (no regression)
- [ ] Code reviewed and approved before Story 3 begins

---
