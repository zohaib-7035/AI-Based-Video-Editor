# User Story: Silence Detection & Removal
Date: 2026-07-17
Source: Pasted text

---

## Story 6A: Detect and Display Silent Segments

**As a** video creator,
**I want** the app to scan my video and show me which parts are silent,
**So that** I can review what will be removed before committing to the edit.

### Scope In
- Call FFmpeg `silencedetect` filter on an uploaded video
- Parse FFmpeg output to extract silence start/end timestamps and duration
- Store detected segments in the DB linked to the video
- Return detected segments via a REST endpoint
- Display the silence segment list in the frontend (start, end, duration per segment)

### Scope Out
- Removing silence or cutting the video (Story 6B)
- Allowing the user to edit or exclude individual segments before removal
- Waveform or audio visualisation
- Real-time detection progress via WebSocket (detect is fast enough for a single response)

### Acceptance Criteria
- Given a video has been uploaded, when the user triggers silence detection, then the backend runs FFmpeg `silencedetect` and returns a list of silent segments with `start`, `end`, and `duration` fields
- Given silence detection completes, when the frontend receives the response, then each silent segment is displayed in a list showing its start time, end time, and duration
- Given a video with no detectable silence, when detection runs, then an empty segment list is returned and the UI displays a "No silence detected" message
- Given detection is triggered on an unknown video ID, when the request is made, then a 404 is returned
- Given a video that has already been scanned, when detection is triggered again, then the new result overwrites the previous segments

### Definition of Done
- [ ] Implementation complete and peer-reviewed
- [ ] Feature tests written and passing
- [ ] No regression in existing video, transcription, or subtitle flows
- [ ] Frontend displays silence segments correctly with timestamps

---

## Story 6B: Remove Silence and Export Preview

**As a** video creator,
**I want** the detected silent segments removed and the remaining clips merged into one video,
**So that** I get a tighter, more engaging cut without manual editing.

### Scope In
- Accept a POST request to remove silence from a video using its stored silence segments
- Use FFmpeg to cut the non-silent segments and concatenate them via the concat demuxer
- Write the processed output to the `exports/` storage directory
- Store the export file path on the video record
- Return a streamable URL for the exported preview
- Display a preview player in the frontend for the processed video

### Scope Out
- Letting the user selectively exclude individual silence segments (all-or-nothing removal)
- Silence threshold configuration (use fixed defaults: noise tolerance `-50dB`, minimum duration `0.5s`)
- Re-running removal if silence detection was not run first (guard with 400)
- Filler word detection (Story 7)

### Acceptance Criteria
- Given a video has detected silence segments, when the user triggers silence removal, then FFmpeg cuts the non-silent parts and concatenates them into a new file in `exports/`
- Given silence removal completes, when the frontend receives the export URL, then it renders a preview player with the processed video
- Given a video with no silence segments stored, when removal is triggered, then a 400 is returned with a clear error message
- Given silence removal is already in progress for a video, when a duplicate request arrives, then a 409 is returned
- Given removal completes, when the user opens the preview, then the exported video plays inline in the browser and its total duration is shorter than the original

### Definition of Done
- [ ] Implementation complete and peer-reviewed
- [ ] Feature tests written and passing
- [ ] No regression in upload, transcription, subtitle, or stream flows
- [ ] Exported preview is playable in the frontend without download
