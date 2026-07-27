# User Story: Filler Word Removal
Date: 2026-07-17
Source: Pasted text

---

## Story 7: Detect and Remove Filler Words from Video Audio

**As a** video creator,
**I want** filler words like "um", "uh", and "hmm" automatically detected and removed from my video,
**So that** my speech sounds clean and professional without manual editing.

### Scope In
- Detect common English filler words: "um", "uh", "hmm", "uh-huh", "like" (when used as a filler), "you know", "so" (as sentence-filler)
- Use the existing transcript (Whisper output) to locate filler word timestamps — no separate audio pass needed
- Remove the filler word time segments from the video and merge the remaining clips
- Export the processed video as a new file (same pattern as silence removal export)
- Display detected filler segments in the UI before removal (word + timestamp)
- Preserve natural audio flow — apply short crossfade or hard cut (no re-encoding required for V1)

### Scope Out
- Custom filler word lists (user-defined words) — future story
- Language support beyond English — future story
- Adjustable cut style (crossfade vs hard cut) — future story
- Filler word detection without an existing transcript — detection depends on transcription being completed first
- Editing or approving individual filler detections before removal — future story (bulk remove only for V1)

### Acceptance Criteria
- Given a video with a completed transcript, when the user requests filler detection, then the system scans the transcript segments for filler words and returns their timestamps
- Given filler words have been detected, when the user views the results, then a list of detected words with start/end times is displayed in the video card
- Given filler segments are displayed, when the user clicks "Remove Fillers", then the system cuts those segments from the original video, merges the remaining clips, and saves an export file
- Given removal is complete, when the user views the result, then the filler word list clears, a "Fillers removed" confirmation is shown, and the processed preview plays inline
- Given no transcript exists for the video, when the user attempts filler detection, then a clear message instructs them to transcribe the video first
- Given a video has no filler words in its transcript, when detection completes, then "No filler words detected" is shown and no remove button appears

### Definition of Done
- [ ] Filler word detection implemented as a backend service using the existing transcript
- [ ] Detection endpoint returns word + start + end + duration per segment
- [ ] Removal endpoint cuts and merges clips from the original video, saves to exports directory
- [ ] Frontend panel displays detected fillers and handles all states (loading, empty, removed)
- [ ] Backend tests written and passing (target >96% quality score)
- [ ] No regression in transcription, subtitle, or silence removal flows
- [ ] Processed preview plays inline after removal
