# User Story: Execute AI Editing Plan
Date: 2026-07-22
Source: Pasted text

---

## Story 10: Execute AI Editing Plan

**As a** video creator,
**I want** the AI editing plan to be executed automatically,
**So that** my video is edited end-to-end without manual steps.

### Scope In
- New `POST /api/v1/videos/{id}/execute-plan` backend endpoint
- Request body accepts the `EditingCommand[]` list from the AI assistant plan
- Commands executed sequentially in order: `remove_silence` → `remove_fillers` → `generate_subtitles`
- Each command delegates to the already-implemented service (SilenceService, FillerService, SubtitleService)
- SSE progress stream: one `progress` event per step (`{ step, total, action, status: started|done|error }`) plus a terminal `done` or `error` event
- `_in_flight` guard — returns 409 if execution is already running for the same video
- Final edited video path stored back on the `Video` DB record (`executed_plan_path` nullable TEXT column)
- Frontend "Execute Plan" button rendered inside `AssistantPanel` after a plan is received
- Frontend SSE progress panel showing each step with pending / running / done / error state indicators
- Frontend displays a download link to the final video once execution completes

### Scope Out
- `export` action from the AI plan (Story 8 — format/quality/resolution options not yet built; skip with a warning event if present)
- Parallel / concurrent command execution
- Undo or rollback of an executed plan
- Re-executing only a subset of commands
- Chaining the output of one step as the input of the next (all steps operate on the original `video.filepath` per existing service contracts)

### Acceptance Criteria

- **Given** a video exists and has an AI editing plan, **when** `POST /api/v1/videos/{id}/execute-plan` is called with a valid `EditingCommand[]` body, **then** the server returns a streaming `text/event-stream` response with `200 OK` and `cache-control: no-cache`.

- **Given** the request body contains a `remove_silence` command, **when** the executor runs that step, **then** `SilenceService.remove()` is called and a `progress` SSE event is emitted with `{ step: N, total: T, action: "remove_silence", status: "done" }`.

- **Given** the request body contains a `remove_fillers` command, **when** the executor runs that step, **then** `FillerService.remove()` is called and a `progress` SSE event is emitted with `{ step: N, total: T, action: "remove_fillers", status: "done" }`.

- **Given** the request body contains a `generate_subtitles` command, **when** the executor runs that step, **then** `SubtitleService.generate()` is called and a `progress` SSE event is emitted with `{ step: N, total: T, action: "generate_subtitles", status: "done" }`.

- **Given** all commands execute successfully, **when** the final step completes, **then** a terminal `done` SSE event is emitted containing `{ type: "done", executed_plan_path: "<url>" }` and the path is persisted to the `Video` record.

- **Given** a command fails (e.g. FFmpeg error), **when** the exception is caught, **then** a terminal `error` SSE event is emitted with `{ type: "error", action: "<failed_action>", detail: "<message>" }` and execution halts; previously completed steps are preserved.

- **Given** the plan contains an `export` command, **when** the executor encounters it, **then** it emits a `warning` SSE event `{ type: "warning", action: "export", detail: "export not yet supported; skipped" }` and continues to the next command.

- **Given** an execute-plan request is already in-flight for a video, **when** a second `POST /execute-plan` request arrives for the same video, **then** the server returns `409 Conflict` with `{ detail: "Execution already in progress" }`.

- **Given** the video ID does not exist, **when** `POST /execute-plan` is called, **then** the server returns `404 Not Found` with a detail message containing "not found".

- **Given** the request body contains an empty `commands` array, **when** `POST /execute-plan` is called, **then** the server returns `422 Unprocessable Entity` (Pydantic validation).

- **Given** the frontend has received a streaming AI editing plan, **when** the stream completes successfully, **then** an "Execute Plan" button is rendered inside `AssistantPanel` below the displayed plan.

- **Given** the user clicks "Execute Plan", **when** the SSE stream starts, **then** the button is disabled and a progress list appears showing each command step as `pending → running → done` (or `error`).

- **Given** all steps complete, **when** the terminal `done` event arrives, **then** the UI shows a "Download Edited Video" link pointing to the `executed_plan_path` URL.

### Definition of Done
- [ ] Implementation complete and peer-reviewed
- [ ] `POST /api/v1/videos/{id}/execute-plan` endpoint implemented with SSE streaming
- [ ] `executed_plan_path` column added via `_migrate_executed_plan_column()` guard in `main.py`
- [ ] `_in_flight` guard prevents duplicate execution (409 pattern matches silence/fillers/assistant)
- [ ] `export` command skipped gracefully with a warning SSE event
- [ ] Unit + integration tests written and passing (target ≥ 18 tests, >96% Strong)
- [ ] Frontend Execute button, progress panel, and download link implemented and manually verified
- [ ] No regression in existing silence / filler / subtitle / assistant flows
- [ ] All 147 existing tests still pass after migration guard added

---
