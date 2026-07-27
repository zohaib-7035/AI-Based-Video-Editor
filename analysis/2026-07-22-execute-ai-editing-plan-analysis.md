# Analysis: Execute AI Editing Plan
Date: 2026-07-22
Story: 2026-07-22-execute-ai-editing-plan-story.md
Scope: full-stack
Repos scanned: D:\claude\ai_video_editor\backend (local), D:\claude\ai_video_editor\frontend (local)
Figma: none

---

## Project Fingerprint

FastAPI 0.115.5 (Python 3.9.12) backend with SQLite in WAL mode via SQLAlchemy 2.0. Nine stories implemented across: video upload/management, transcription (Faster-Whisper + WebSocket), subtitle generation (SRT/VTT), silence detection/removal, filler word detection/removal, and AI editing assistant (Ollama + SSE). Frontend is React 18 + TypeScript 5.7 + Vite + Tailwind CSS + TanStack Query + Zustand. All processing is strictly local — FFmpeg via `asyncio.create_subprocess_exec`, LLM via Ollama (`qwen3:0.6b`). Story 10 wires those existing services together into a sequential execution pipeline.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| `generate_subtitles` is NOT a valid `EditingCommand.action` | High | `KNOWN_ACTIONS` frozenset and the `Literal` type both only contain `remove_silence`, `remove_fillers`, `export`. Adding `generate_subtitles` requires changes to the schema, frontend type, `ACTION_LABELS` map, `SYSTEM_PROMPT`, and `KNOWN_ACTIONS` in `AssistantService`. |
| `SubtitleService` has no callable `generate()` method | High | All subtitle generation logic is inline in the `generate_subtitles` route handler in `subtitles.py`. The execute-plan service cannot call it without extracting it into `SubtitleService.generate(video_id, db)` first. |
| Silence/filler removal requires prior detection run | High | `SilenceService.remove()` and `FillerService.remove()` raise `HTTPException(400)` if no detection record exists. Execute-plan must catch these exceptions and convert them to `error` SSE events rather than letting them bubble up and crash the stream. |
| Subtitle generation requires a completed transcript | Medium | The `generate_subtitles` handler raises `HTTPException(400)` if there is no completed transcript. Same catch-and-emit-error pattern applies. |
| Subtitle generation raises 409 if already generated | Medium | If `transcript.srt_path is not None`, the existing endpoint raises 409. Execute-plan should treat this as a skip (emit `warning`, continue) rather than a hard error. |
| `executed_plan_path` column not on `Video` model | Medium | Needs `_migrate_executed_plan_column()` guard in `main.py` following the existing `_migrate_*` pattern. |
| All-silence / all-filler edge case inside remove() | Medium | Both removal services raise `HTTPException(400)` when the entire video is silence or fillers. Execute-plan must treat this as an `error` event and halt without corrupting the DB state. |
| SSE stream closed before terminal event | Low | If the client disconnects mid-stream, the async generator will be cancelled. The `_in_flight` guard must be cleared in a `finally` block (same pattern as `assistant.py`). |

---

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| POST returns 200 + text/event-stream + cache-control: no-cache | Needs work | Pattern exists in `assistant.py` — StreamingResponse with those headers. New endpoint needed. |
| remove_silence command → SilenceService.remove() + progress event | Needs work | `SilenceService.remove(video, db)` exists and is async. Orchestration layer missing. |
| remove_fillers command → FillerService.remove() + progress event | Needs work | `FillerService.remove(video, db)` exists and is async. Orchestration layer missing. |
| generate_subtitles command → SubtitleService.generate() + progress event | Blocked | `SubtitleService.generate()` does not exist. Logic must be extracted from `subtitles.py` route handler first. `generate_subtitles` also not in `EditingCommand.action` Literal. |
| Terminal done event with executed_plan_path persisted to DB | Needs work | `executed_plan_path` column missing from `Video`. Migration guard pattern well-established. |
| Step failure → terminal error event, execution halts | Needs work | Must wrap each `await service.remove()` call in try/except and yield the error event. |
| export command → warning event, execution continues | Needs work | Straightforward to implement — check `cmd.action == "export"` and yield warning. |
| Duplicate in-flight → 409 Conflict | Needs work | `_in_flight` set pattern identical to `assistant.py`, `silence.py`, `fillers.py`. |
| Unknown video ID → 404 Not Found | Supported | `VideoService.get_by_id(video_id, db)` already raises HTTPException(404). |
| Empty commands[] → 422 Unprocessable Entity | Needs work | Requires `min_length=1` on `commands` field in `ExecutePlanRequest` schema. |
| Execute button rendered after plan stream completes | Needs work | `AssistantPanel.tsx` has placeholder text "Execution coming in a future update." — the hook point is ready. |
| Execute button disabled during execution, progress list visible | Needs work | `isExecuting` state + `executionSteps` state needed in `AssistantPanel`. |
| Download link shown on terminal done event | Needs work | `executed_plan_path` URL returned in done event; rendered as anchor tag. |

---

## API Analysis

### Domain Concepts — API

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| `EditingCommand` schema | `schemas/assistant.py:6` | `action: Literal["remove_silence", "remove_fillers", "export"]` — missing `generate_subtitles` |
| `KNOWN_ACTIONS` frozenset | `services/assistant.py:29` | `{"remove_silence", "remove_fillers", "export"}` — missing `generate_subtitles` |
| `SYSTEM_PROMPT` in AssistantService | `services/assistant.py:16` | Lists "Valid actions: remove_silence \| remove_fillers \| export" — must add `generate_subtitles` |
| `SilenceService.remove(video, db)` | `services/silence.py` | Async, returns export URL string. Raises HTTPException(400) if no detection or all-silence. |
| `FillerService.remove(video, db)` | `services/filler.py` | Async, returns export URL string. Raises HTTPException(400) if no detection or all-fillers. |
| Subtitle generation logic | `api/v1/subtitles.py:39–69` | Inline in the route handler — not a callable service method. Raises 400 (no transcript) or 409 (already generated). |
| `_in_flight: set` guard | `assistant.py:19`, `silence.py:20`, `fillers.py:20` | Module-level set, try/finally cleanup. Pattern ready to copy. |
| SSE via `StreamingResponse` + async generator | `assistant.py:22–53` | `media_type="text/event-stream"`, `Cache-Control: no-cache`, `X-Accel-Buffering: no`. |
| `_migrate_*_columns()` pattern | `main.py:19–64` | Idempotent `ALTER TABLE` in try/except OperationalError. Three existing examples. |
| `Video` model | `models/video.py:19` | Has `export_path`, `filler_export_path` — no `executed_plan_path`. |
| `VideoService.get_by_id(video_id, db)` | `services/video.py` | Raises HTTPException(404) with "not found" detail. |
| Router registration in lifespan | `main.py:129–135` | Seven routers registered — new execute-plan router needs `include_router` here. |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `"generate_subtitles"` in `EditingCommand.action` Literal | Schema change | `schemas/assistant.py:9` — add to Literal and update `KNOWN_ACTIONS`, `SYSTEM_PROMPT` |
| `SubtitleService.generate(video_id, db)` | Service method | Extract inline logic from `subtitles.py:39–69` into a reusable class method |
| `ExecutePlanRequest` schema | Pydantic model | `commands: List[EditingCommand]` with `min_length=1`; new file `schemas/execute_plan.py` |
| `ExecuteProgressEvent` / terminal event shapes | Pydantic models | `progress`, `done`, `warning`, `error` event payloads; can be dataclasses or TypedDicts |
| `app/api/v1/execute_plan.py` | FastAPI router | `POST /{video_id}/execute-plan` with SSE stream, `_in_flight` guard, video 404 check |
| `ExecutePlanService` | Service class | Orchestrates commands sequentially; `async def execute(commands, video, db)` yields SSE strings |
| `executed_plan_path` column on `Video` | DB column + migration | `Mapped[Optional[str]]`; `_migrate_executed_plan_column()` in `main.py` |
| Router registered in `main.py` | Router wiring | `app.include_router(execute_plan.router, prefix="/api/v1/videos", tags=["execute-plan"])` |

### Strategic Approach — API

The execute-plan endpoint follows the SSE generator pattern already established in `assistant.py` — a `StreamingResponse` wrapping an async generator with a `_in_flight` guard and `finally` cleanup. A new `ExecutePlanService.execute()` async generator iterates commands in order, dispatching to `SilenceService.remove()`, `FillerService.remove()`, or the new `SubtitleService.generate()` for each recognised action, yielding SSE-encoded `progress` events at each step. Every dispatch is wrapped in try/except so service-level `HTTPException` values are caught and re-emitted as `error` SSE events rather than crashing the stream. The `export` action and any unrecognised action yields a `warning` event and continues. On full completion the `Video.executed_plan_path` is written and a terminal `done` event is yielded.

### Key Design Decisions — API

- **Extract `SubtitleService.generate(video_id, db)` before building the execute-plan service** — The inline route handler logic in `subtitles.py` must become a proper service method. This is the prerequisite for the `generate_subtitles` step and also improves testability of the subtitle endpoint.
- **Execute-plan operates on `video.filepath`** — Consistent with existing silence/filler services: all commands use the original source file, not a previously exported file. This keeps the execution model predictable and avoids chaining complexity.
- **Catch `HTTPException` at each step, not globally** — Each `await service.X()` is individually wrapped so a single failing step yields an `error` event and halts, while already-completed steps remain persisted in the DB.
- **`executed_plan_path` stores the path of the last successful removal export** — Since silence removal writes `video.export_path` and filler removal writes `video.filler_export_path`, `executed_plan_path` holds whichever was the final file produced during execution (or the original filepath if only subtitles were generated).
- **Add `generate_subtitles` to `KNOWN_ACTIONS` and `SYSTEM_PROMPT` in `AssistantService`** — The Ollama prompt currently only lists three actions. Adding `generate_subtitles` enables the AI to recommend it in plans, making end-to-end execution actually useful.

---

## Frontend Analysis

### Domain Concepts — Frontend

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| `AssistantPanel` component | `components/library/AssistantPanel.tsx` | Has plan display + placeholder "Execution coming in a future update." — ready hook point for Execute button |
| `ACTION_LABELS` map | `AssistantPanel.tsx:5` | `{ remove_silence, remove_fillers, export }` — missing `generate_subtitles` |
| `streamEditingPlan()` SSE generator | `api/client.ts:155` | `fetch` + `ReadableStream` + `TextDecoder` pattern — exact template for `streamExecutePlan()` |
| `PlanStreamEvent` discriminated union | `types/index.ts:96` | `delta \| plan \| error` — needs `progress \| done \| warning` variants added |
| `EditingCommand` type | `types/index.ts:86` | `action: "remove_silence" \| "remove_fillers" \| "export"` — missing `"generate_subtitles"` |
| `ProgressBar` component | `components/common/ProgressBar.tsx` | Generic progress bar — may be useful for step display |
| `isStreaming` state pattern | `AssistantPanel.tsx:32` | Guards UI during assistant generation — same pattern for `isExecuting` |
| `AbortController` pattern | `AssistantPanel.tsx:33, 44` | Used to cancel the SSE stream — reuse for execution stream |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `"generate_subtitles"` in `EditingCommand["action"]` union | Type change | `types/index.ts:87` — add to union |
| `ExecutePlanStreamEvent` discriminated union | New type | `progress \| done \| error \| warning` events; add to `types/index.ts` |
| `streamExecutePlan(videoId, commands, signal)` | New function in `client.ts` | POST to `/execute-plan`, same SSE read loop as `streamEditingPlan()` |
| `generate_subtitles` entry in `ACTION_LABELS` | Map entry | `AssistantPanel.tsx:5` — `generate_subtitles: "Generate subtitles"` |
| Execute button in `AssistantPanel` | UI element | Rendered below plan list when `plan !== null && !isStreaming` |
| `isExecuting` state | React state | Mirrors `isStreaming`; disables Execute button during execution |
| `executionSteps` state | React state | Array of `{ action, status: "pending" \| "running" \| "done" \| "error" }` |
| `executionError` state | React state | Holds the error message from a failed execution step |
| `executedPlanUrl` state | React state | Holds the `executed_plan_path` URL from the terminal `done` event |
| Progress step list | UI element | Rendered during/after execution; shows per-step status indicator |
| Download link | UI element | Rendered when `executedPlanUrl !== null`; anchor tag pointing to `executed_plan_path` |

### Strategic Approach — Frontend

`AssistantPanel` already manages an async SSE loop (`streamEditingPlan`), so the execute phase slots in as a second async loop triggered by the Execute button. State is split between plan-generation state (`isStreaming`, `plan`) and execution state (`isExecuting`, `executionSteps`, `executedPlanUrl`, `executionError`). A new `streamExecutePlan()` function in `client.ts` follows the identical `fetch` + `ReadableStream` pattern as `streamEditingPlan()`. On each `progress` event, `executionSteps` is updated to reflect the running/done/error status of each step, driving the step list UI. The `done` event sets `executedPlanUrl`, which renders the download link. A second `AbortController` ref handles cancellation of the execution stream independently from the plan-generation stream.

### Key Design Decisions — Frontend

- **Keep execution state separate from plan-generation state** — `isStreaming`/`plan` remain unchanged; execution adds parallel `isExecuting`/`executionSteps`/`executedPlanUrl` states so the plan display and execution progress are independently visible.
- **Initialise `executionSteps` from `plan.commands` on button click** — Pre-populate all steps as `"pending"` before the first SSE event arrives so the user immediately sees the full step list, not a blank panel that fills in progressively.
- **`generate_subtitles` must be added to `EditingCommand["action"]` and `ACTION_LABELS` in this story** — Without it, the type system rejects the new action and the plan display shows no label for it. These are small, low-risk changes that unblock the whole feature.
- **Reuse existing `AbortController` ref pattern** — A second `abortExecuteRef` alongside `abortRef` allows independent cancellation of the execution stream without interfering with any in-progress plan generation.

---

## Dependencies

- `SilenceService.remove()` — requires `SilenceDetection` record to exist (detection run first)
- `FillerService.remove()` — requires `FillerDetection` record and a completed transcript to exist
- `SubtitleService.generate()` (to be extracted) — requires a completed `Transcript` record
- `VideoService.get_by_id()` — 404 guard, used identically to all other endpoints
- `FFmpegService.concat_segments()` — called internally by silence/filler removal services; no changes needed
- `Video.executed_plan_path` — new column; no other stories depend on it yet
- `main.py` lifespan — `_migrate_executed_plan_column()` must be added alongside existing migration calls
