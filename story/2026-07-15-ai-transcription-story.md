# User Story: AI Transcription
Date: 2026-07-15
Source: Pasted text

---

## Story 4: Transcribe a video with AI and stream progress in real time

**As a** creator,
**I want** AI to transcribe my uploaded video,
**So that** I can get a timestamped transcript that enables automatic caption generation and intelligent editing in later stories.

### Scope In
- `POST /api/v1/videos/{id}/transcribe` endpoint — triggers transcription as a background task and returns `202 Accepted` immediately
- Faster-Whisper integration with automatic device selection: CUDA GPU when available, CPU fallback otherwise
- Segment-level timestamps returned: each segment has `start`, `end`, `text`
- Full flat transcript text assembled from segments
- `Transcript` DB model persisted to SQLite: `id`, `video_id`, `text`, `segments` (JSON), `language`, `status`, `error`, `created_at`
- `GET /api/v1/videos/{id}/transcript` endpoint to fetch the saved transcript
- WebSocket endpoint `WS /api/v1/videos/{id}/transcribe/ws` streaming `{"progress": 0–100, "status": "processing|completed|error"}` messages during transcription
- Video `status` field updated: `processing` when transcription starts, `ready` when complete, `error` on failure
- Frontend: Transcribe button on video card (visible when status is `uploaded` or `ready`)
- Frontend: Real-time progress bar (reuses existing `ProgressBar` component) displayed while transcription runs
- Frontend: Transcript panel displaying full text + segments list (start → end → text) once complete
- 409 Conflict if transcription is already in progress for the same video

### Scope Out
- SRT / VTT subtitle file generation (Story 5)
- Using transcript for silence or filler-word detection (Stories 6–7)
- Speaker diarization (multiple speakers)
- Language selection UI (language auto-detected by Whisper; no user choice)
- Custom model selection UI (one configured model; no runtime switching)
- Word-level (token-by-token) timestamps — segment-level is sufficient for Stories 5–7
- Translation to a language other than the source

### Acceptance Criteria

- Given a video with status `uploaded`, when I `POST /api/v1/videos/{id}/transcribe`, then the server returns `202 Accepted` with `{"job": "started", "video_id": "<id>"}` and the video status changes to `processing`.
- Given transcription is running, when I connect to `WS /api/v1/videos/{id}/transcribe/ws`, then I receive JSON messages `{"progress": <0–100>, "status": "processing"}` at intervals, and a final `{"progress": 100, "status": "completed"}` when done.
- Given transcription has completed, when I `GET /api/v1/videos/{id}/transcript`, then the response includes `text` (full string) and `segments` (array of `{start, end, text}`), with no missing fields.
- Given transcription has completed, when I query the database directly, then a `transcripts` record exists with the correct `video_id`, non-empty `text`, non-empty `segments` JSON, and `status = "completed"`.
- Given the host machine has a CUDA-capable GPU, when transcription runs, then Faster-Whisper initialises with `device="cuda"` without error; on a CPU-only machine it initialises with `device="cpu"` without error.
- Given transcription fails (e.g. the audio stream is unreadable), when the error is raised, then the video status is set to `error`, the `transcripts` record has `status = "error"` and a non-empty `error` field, and the WebSocket sends `{"progress": 0, "status": "error", "detail": "<message>"}`.
- Given transcription is already in progress for a video, when I `POST /api/v1/videos/{id}/transcribe` again, then the server returns `409 Conflict` with `{"detail": "Transcription already in progress"}`.
- Given the frontend Library page, when a video has status `uploaded`, then a Transcribe button is visible; when status is `processing`, a live progress bar replaces the button; when status is `ready` and a transcript exists, a "View Transcript" control is shown.

### Definition of Done
- [ ] `Transcript` SQLAlchemy model created and migrated
- [ ] `TranscriptionService` implemented with Faster-Whisper (CPU + GPU)
- [ ] `POST /transcribe` endpoint returns 202 and fires background task
- [ ] `GET /transcript` endpoint returns full transcript with segments
- [ ] WebSocket endpoint streams progress and final status
- [ ] Video status field updated correctly through the transcription lifecycle
- [ ] 409 guard implemented for concurrent transcription requests
- [ ] Frontend Transcribe button, progress bar, and transcript panel implemented
- [ ] Backend tests written and passing (happy path, GPU/CPU, 409 conflict, error state, DB persistence)
- [ ] No regression in existing upload, list, stream, or health endpoints

---
