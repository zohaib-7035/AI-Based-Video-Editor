# User Story: Subtitle Generation
Date: 2026-07-17
Source: Pasted text

---

## Story 5A: Generate and download SRT and VTT subtitle files

**As a** creator,
**I want** SRT and VTT subtitle files generated automatically from my video's transcript,
**So that** I can download them and use them on any platform that supports external subtitle tracks.

### Scope In
- `POST /api/v1/videos/{id}/subtitles/generate` — generates SRT and VTT files from the existing `transcripts` record; returns `400` if no completed transcript exists
- `SubtitleService` class in `app/services/subtitle.py` — converts `List[TranscriptSegment]` to correctly formatted SRT and VTT strings
- SRT format: sequential index + `HH:MM:SS,mmm --> HH:MM:SS,mmm` + text block per segment
- VTT format: `WEBVTT` header + `HH:MM:SS.mmm --> HH:MM:SS.mmm` + text block per segment (period as decimal separator, no index)
- Files written to `storage/subtitles/{video_id}.srt` and `storage/subtitles/{video_id}.vtt`
- `srt_path` and `vtt_path` nullable `TEXT` columns added to the `transcripts` table
- `GET /api/v1/videos/{id}/subtitles/srt` — serves the SRT file as `Content-Disposition: attachment; filename="{original_name}.srt"`
- `GET /api/v1/videos/{id}/subtitles/vtt` — serves the VTT file as `Content-Type: text/vtt` (used by both download and browser `<track>`)
- Frontend: "Download SRT" and "Download VTT" buttons added to `TranscriptPanel` (visible only when `srt_path` / `vtt_path` are populated)
- Frontend: "Generate Subtitles" button in `TranscriptPanel` (visible when transcript status is `completed` but no subtitle paths exist yet); calls `POST` and refreshes video query on success
- `storage/subtitles/` directory created alongside existing `uploads/`, `exports/`, `temp/`
- 404 returned by download endpoints when the transcript or file does not exist
- 409 returned by generate endpoint if generation has already been run (paths already populated); user must delete and regenerate — no silent overwrite in V1

### Scope Out
- Subtitle editing UI (editing text, adjusting timestamps in-browser)
- Burning subtitles into the video (hardcoded subtitles via FFmpeg — Story 8 Export)
- Multiple language subtitle tracks (V1 is single-language, matching the transcript language)
- Word-level (token-by-token) granularity — segment-level timestamps are used as-is
- ASS/SSA or other subtitle formats
- VTT styling (`::cue` CSS in the VTT file)
- Synchronized preview in the video player (Story 5B)

### Acceptance Criteria

- Given a video with a completed transcript, when I `POST /api/v1/videos/{id}/subtitles/generate`, then the server returns `200` with `{"srt_url": "/api/v1/videos/{id}/subtitles/srt", "vtt_url": "/api/v1/videos/{id}/subtitles/vtt"}` and both files exist on disk.
- Given a video with no transcript (or transcript status is not `completed`), when I `POST /api/v1/videos/{id}/subtitles/generate`, then the server returns `400` with `{"detail": "No completed transcript found for this video"}`.
- Given subtitle files have been generated, when I `GET /api/v1/videos/{id}/subtitles/srt`, then the response has `Content-Type: text/plain`, `Content-Disposition: attachment; filename="<original_name>.srt"`, and the body is a valid SRT file with sequential indices and comma-separated milliseconds (`HH:MM:SS,mmm`).
- Given subtitle files have been generated, when I `GET /api/v1/videos/{id}/subtitles/vtt`, then the response has `Content-Type: text/vtt`, and the body starts with `WEBVTT`, uses period as the millisecond separator (`HH:MM:SS.mmm`), and contains one cue block per transcript segment.
- Given a transcript with three segments `[{start:0.0, end:2.5, text:"Hello"}, {start:2.5, end:5.0, text:"World"}, {start:5.0, end:8.3, text:"Done"}]`, when the SRT is generated, then the output exactly matches the expected sequential-index SRT format with correct timestamp formatting for each segment.
- Given subtitle files have been generated, when the `transcripts` record is read from the database, then `srt_path` and `vtt_path` are non-null strings pointing to existing files.
- Given subtitles have already been generated for a video, when I `POST /api/v1/videos/{id}/subtitles/generate` again, then the server returns `409 Conflict` with `{"detail": "Subtitles already generated. Delete and regenerate if needed."}`.
- Given no subtitle files exist for a video, when I `GET /api/v1/videos/{id}/subtitles/srt`, then the server returns `404`.
- Given the frontend `TranscriptPanel` with a completed transcript and no subtitle paths, when I click "Generate Subtitles", then the button shows a loading state, `POST` is called, and on success the "Download SRT" and "Download VTT" buttons appear.
- Given subtitle files exist, when I click "Download SRT" or "Download VTT" in the UI, then the browser triggers a file download with the correct filename and content.

### Definition of Done
- [ ] `storage/subtitles/` directory created and added to `.gitignore`
- [ ] `srt_path` and `vtt_path` columns added to `transcripts` table (nullable `TEXT`)
- [ ] `SubtitleService` implemented with `to_srt()` and `to_vtt()` methods; edge cases handled (empty segments, sub-second durations)
- [ ] `POST /subtitles/generate`, `GET /subtitles/srt`, `GET /subtitles/vtt` endpoints implemented
- [ ] `subtitles` router registered in `app/main.py` under `/api/v1/videos`
- [ ] Frontend "Generate Subtitles" button and "Download SRT / VTT" buttons added to `TranscriptPanel`
- [ ] Backend tests written and passing: happy path generation, SRT format correctness, VTT format correctness, 400 (no transcript), 409 (already generated), 404 (no file), DB column persistence
- [ ] No regression in existing transcription, upload, list, stream, or health endpoints

---

## Story 5B: Preview subtitles synchronized with video playback

**As a** creator,
**I want** subtitles to appear overlaid on the video player as it plays,
**So that** I can visually verify the subtitle timing and text before downloading or sharing.

### Scope In
- Modify the `<video>` element in `VideoCard` (or extracted player component) to include a `<track>` element pointing to `GET /api/v1/videos/{id}/subtitles/vtt`
- `<track kind="subtitles" src={vttUrl} default />` added when `vtt_path` is present on the video's transcript
- Subtitle toggle button ("CC" button) in the video player controls — clicking it shows/hides the browser's native subtitle track
- VTT endpoint must serve `Content-Type: text/vtt` with `Access-Control-Allow-Origin: *` header so the browser loads the cross-origin track without CORS errors
- `getSubtitleVttUrl(videoId)` helper exported from `api/client.ts` (same pattern as `getStreamUrl`)
- Transcript data (including `srt_path` / `vtt_path`) included in the `VideoResponse` schema so the frontend knows whether subtitles are available without a separate fetch
- `srt_path` and `vtt_path` fields added to `VideoResponse` Pydantic schema and returned by `GET /api/v1/videos` and `GET /api/v1/videos/{id}`

### Scope Out
- Custom-styled subtitle overlay (CSS `::cue` theming, font size controls)
- Subtitle position adjustment (top / bottom toggle)
- Subtitle editing in the player (click to edit a cue)
- Burning subtitles into the exported video file (Story 8)
- Multiple language track switching

### Acceptance Criteria

- Given a video with generated subtitles, when `GET /api/v1/videos` is called, then each `VideoResponse` item includes `srt_path` and `vtt_path` fields (non-null strings when subtitles exist, `null` otherwise).
- Given `GET /api/v1/videos/{id}/subtitles/vtt`, when the browser requests the VTT file, then the response includes `Content-Type: text/vtt` and `Access-Control-Allow-Origin: *` so the `<track>` element loads without CORS errors.
- Given a video with generated subtitles, when the video player is rendered, then a `<track kind="subtitles" default>` element is present in the DOM pointing to the VTT endpoint.
- Given the video is playing and subtitles are loaded, when a segment's start time is reached, then the browser displays the corresponding subtitle cue overlaid on the video using the native `<track>` API.
- Given the player is rendered with subtitles available, when I click the "CC" toggle button, then the subtitle track is disabled (cues stop appearing); clicking again re-enables it.
- Given a video with no generated subtitles (vtt_path is null), when the video player renders, then no `<track>` element is present and no CC button is visible.
- Given a video with generated subtitles, when I open the video preview in `VideoCard`, then the CC button is visible in the player controls alongside the existing play/pause controls.

### Definition of Done
- [ ] `srt_path` and `vtt_path` fields added to `VideoResponse` Pydantic schema
- [ ] VTT endpoint updated to emit `Access-Control-Allow-Origin: *` header
- [ ] `getSubtitleVttUrl(videoId)` exported from `api/client.ts`
- [ ] `VideoCard` player updated with `<track>` element and CC toggle button
- [ ] `types/index.ts` `Video` interface updated to include `srt_path: string | null` and `vtt_path: string | null`
- [ ] Manual verification: video plays with subtitles appearing at correct timestamps in Chrome and Firefox
- [ ] No regression in existing video preview, transcription flow, or download buttons from Story 5A

---
