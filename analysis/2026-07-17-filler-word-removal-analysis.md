# Analysis: Filler Word Removal
Date: 2026-07-17
Story: 2026-07-17-filler-word-removal-story.md
Scope: full-stack
Repos scanned: API local (backend/) | Frontend local (frontend/)
Figma: none

---

## Project Fingerprint

FastAPI backend (Python 3.9, SQLAlchemy 2.0, SQLite) with FFmpeg for media processing and faster-whisper for transcription. Stories 1–6 complete — 107 tests passing. Established patterns: ORM model → Pydantic schema → Service class → API router → test class. Frontend is React 18 + TypeScript + Vite + TailwindCSS + TanStack Query. Component pattern: VideoCard.tsx owns all state, child panels (SilencePanel, TranscriptPanel) receive props and callbacks.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| Whisper segments group filler + speech together | Medium | Whisper returns segment-level timestamps (e.g. "um yeah let's go"), not word-level. For V1: only match segments whose entire text is a known filler word/phrase. |
| "like" and "so" are context-dependent | Medium | "like" meaning "for example" vs filler. False positives are accepted scope for V1 — user can inspect list before removing. |
| No transcript → detection attempt | High | Must 400 with a clear "transcribe first" message if transcript missing or status ≠ completed. |
| export_path already used by silence removal | High | Video.export_path is owned by silence removal. Filler removal needs its own column filler_export_path TEXT — same idempotent ALTER TABLE pattern in startup. |
| Both silence and filler removal run on same video | Medium | Each uses its own export path column, so they can coexist. Confirmed by schema review. |
| Empty filler result | Low | Must return 200 + empty list (not 404) — same contract as silence detection's empty list. |

---

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| Given completed transcript, detect fillers and return timestamps | Needs work | Transcript model and data exist; FillerService.detect() is missing |
| Given detected fillers, display list of word + timestamps | Needs work | FillerPanel.tsx does not exist |
| Given "Remove Fillers" clicked, cut/merge/export | Needs work | FillerService.remove() and export endpoint missing; FFmpegService.concat_segments() is reusable |
| Given removal complete, clear list + show "Fillers removed" + preview | Needs work | Frontend state pattern exists in SilencePanel — mirror it |
| Given no transcript, show "transcribe first" message | Needs work | Must query transcripts table and check status == completed in detect endpoint |
| Given no fillers found, show "No filler words detected" | Needs work | Empty list handling follows silence panel pattern |

---

## API Analysis

### Domain Concepts — API

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| Transcript model | app/models/transcript.py | Stores Whisper segments as JSON TEXT — source of filler timestamps |
| TranscriptStatus.completed | app/models/transcript.py | Gate check — only detect if status is completed |
| SilenceDetection model | app/models/silence.py | Direct structural template for FillerDetection model |
| SilenceService | app/services/silence.py | Template for FillerService — detect/get/remove pattern |
| FFmpegService.concat_segments() | app/services/ffmpeg.py | Reusable for merging clips after filler cuts |
| VideoService.get_by_id() | app/services/video.py | Standard 404 guard — used by all existing endpoints |
| Video.export_path | app/models/video.py | Silence-owned column — filler needs its own filler_export_path |
| settings.exports_path / settings.temp_path | app/core/config.py | Existing storage paths — filler exports go to same exports/ dir |
| _in_flight set pattern | app/api/v1/silence.py | 409 duplicate-guard pattern to copy for filler remove endpoint |
| _migrate_silence_columns() | app/main.py | Template for _migrate_filler_columns() startup function |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| FillerDetection model | ORM model | Mirror of SilenceDetection — id, video_id, segments JSON TEXT, detected_at |
| FillerSegment schema | Pydantic model | Fields: word (str), start (float), end (float), duration (float) |
| FillerDetectionResponse schema | Pydantic model | id, video_id, segments, detected_at — with JSON field_validator |
| FillerService | Service class | detect(), get_segments(), remove() — mirrors SilenceService |
| Filler word set constant | Module-level set | {"um", "uh", "hmm", "uh-huh", "mm-hmm", "like", "you know", "so", "er", "ah"} |
| app/api/v1/fillers.py | API router | 4 endpoints: POST detect, GET get, POST remove, GET export/stream |
| Video.filler_export_path | ORM column | Nullable TEXT — separate from export_path |
| _migrate_filler_columns() | Startup function | Idempotent ALTER TABLE for filler_export_path on videos |
| Register filler router | app/main.py | Include router with prefix /api/v1/videos, tag fillers |
| app/models/__init__.py update | Import | Add from app.models.filler import FillerDetection |

### Strategic Approach — API

Detection is pure text processing — query the completed transcript, scan each segment's text (lowercased, punctuation stripped) against the hardcoded filler word set, and return matching segments with their Whisper timestamps. No FFmpeg audio analysis is needed. Removal follows the exact same cut-and-concat pattern as SilenceService.remove(): compute non-filler windows (inverting filler ranges), extract clips with ffmpeg -ss/-to -c copy, concat with FFmpegService.concat_segments(), save to exports/, update video.filler_export_path. The FillerService is architecturally identical to SilenceService — the only novel logic is the text-based detection in detect().

### Key Design Decisions — API

- Segment-level detection only (V1): faster-whisper returns segment-level timestamps, not per-word. Only segments whose entire stripped text is a known filler word are matched. This avoids false cuts in mixed segments and keeps detection simple and deterministic.
- Separate filler_export_path column: export_path is silence-owned. Adding filler_export_path lets both features coexist on the same video without overwriting each other's output.
- Transcript gate in detect endpoint: If no Transcript record exists or status != completed, return 400 with "Transcribe the video first" — detection is impossible without Whisper output.
- Filler word set as a module constant: Hardcoded in FillerService for V1 — no DB table or config needed. Easy to extend in a future story.

---

## Frontend Analysis

### Domain Concepts — Frontend

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| VideoCard.tsx | frontend/src/components/library/VideoCard.tsx | Owns all panel state — add fillerDetection state and mutations here |
| SilencePanel.tsx | frontend/src/components/library/SilencePanel.tsx | Direct structural template for FillerPanel.tsx |
| TranscriptPanel.tsx | frontend/src/components/library/TranscriptPanel.tsx | Shows how transcript state drives panel render |
| SilenceDetection / SilenceSegment types | frontend/src/types/index.ts | Template for FillerDetection / FillerSegment types |
| API client functions | frontend/src/api/client.ts | Template for filler API functions |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| FillerSegment interface | types/index.ts | Fields: word, start, end, duration |
| FillerDetection interface | types/index.ts | id, video_id, segments, detected_at |
| filler_export_path on Video interface | types/index.ts | Nullable string — mirrors export_path |
| detectFillers() | api/client.ts | POST /{video_id}/fillers/detect |
| getFillers() | api/client.ts | GET /{video_id}/fillers |
| removeFillers() | api/client.ts | POST /{video_id}/fillers/remove |
| getFillerExportStreamUrl() | api/client.ts | Returns stream URL string (no fetch) |
| FillerPanel.tsx | New component | Props: fillerDetection, transcript, onDetect, onRemove, isDetecting, isRemoving, exportStreamUrl |
| VideoCard.tsx updates | Existing file | Add fillerDetection state, fillerError state, detectMutation, removeMutation, useEffect for on-mount getFillers(), FillerPanel render |

### Strategic Approach — Frontend

FillerPanel.tsx is a structural copy of SilencePanel.tsx with two differences: it shows a word column alongside timestamps in the segment table, and the detect button is labeled "Detect Fillers" / "Re-detect". VideoCard.tsx gains a fillerDetection state and two mutations following the same pattern as detectMutation / removeMutation for silence. The filler panel renders below the silence panel. After removal, fillerDetection.segments is cleared in state (same pattern as silence) and a green "Fillers removed" message appears with a "Re-remove" gray button.

### Key Design Decisions — Frontend

- Word column in segment table: Unlike silence (start/end/duration), filler segments include the matched word — display it in the first column so users can see what was caught before removing.
- Detect button requires transcript: If transcript === null, show the detect button as disabled with label "Transcribe first" rather than hiding it — lets users discover the feature without needing to know the dependency.
- Separate filler_export_path drives preview: video.filler_export_path (not video.export_path) determines whether the filler export preview shows. Both previews can be visible simultaneously.

---

## Dependencies

- Transcript model and TranscriptStatus — filler detection reads from this table; no modification
- FFmpegService.concat_segments() — reused unchanged for clip merging
- VideoService.get_by_id() — reused for all 4 filler endpoints
- settings.exports_path / settings.temp_path — shared storage directories
- app/main.py lifespan — add _migrate_filler_columns() call alongside existing migrations
- VideoCard.tsx — modified to add filler state; silence/transcript panels unaffected
