# User Story: AI Editing Assistant
Date: 2026-07-18
Source: Pasted text

---

## Story 9: Describe Edits in Natural Language and Generate an Editing Plan

**As a** video creator,
**I want** to describe what I want done to my video in plain English,
**So that** the AI generates a structured editing plan I can review before any changes are made.

### Scope In
- A chat input panel in the frontend where the user types a natural language prompt (e.g. "remove all silences and filler words, then export at 720p")
- The prompt is sent to the backend, which streams a response from Ollama (Qwen3) via SSE
- Ollama returns a structured JSON editing plan — a list of ordered commands with action type and parameters
- Supported command types for V1: `remove_silence`, `remove_fillers`, `export` (with format/quality/resolution)
- The backend validates the returned JSON against a command schema before sending it to the frontend
- The frontend displays the validated editing plan as a readable, step-by-step list
- If Ollama returns invalid or unparseable JSON, the backend returns a 422 with a descriptive error
- The plan is displayed only — no edits are executed

### Scope Out
- Executing the editing plan — covered by Story 10
- Saving or persisting the plan to the database — Story 10 will own that
- Multi-turn conversation / chat history — single prompt → plan for V1
- Custom or unsupported command types beyond the V1 set — unknown commands are stripped and flagged in the response
- Editing plan generation without a selected video — the prompt is always scoped to a specific video_id
- Voice input for prompts — future story

### Acceptance Criteria
- Given a video is selected, when the user types a natural language prompt and submits, then the backend sends the prompt to Ollama (Qwen3) and streams the response back via SSE
- Given Ollama returns a valid JSON editing plan, when the response is fully streamed, then the backend validates it against the command schema and the frontend renders it as a numbered step list
- Given Ollama returns malformed or non-JSON output, when the response is received, then the backend returns HTTP 422 and the frontend shows a clear error asking the user to rephrase
- Given a valid editing plan is displayed, when the user reads it, then each step shows the action type and its parameters in human-readable form (e.g. "Step 1: Remove silence segments", "Step 2: Remove filler words", "Step 3: Export as MP4 at 720p")
- Given the plan contains an unrecognised command type, when validation runs, then the unknown command is omitted from the plan and a warning is shown listing what was removed
- Given the Ollama service is unavailable, when the user submits a prompt, then the backend returns HTTP 503 and the frontend shows "AI service unavailable — is Ollama running?"
- Given a plan is displayed, when the user does not confirm execution, then no video processing occurs

### Definition of Done
- [ ] `/api/v1/videos/{id}/assistant/plan` POST endpoint implemented — accepts `{"prompt": "..."}`, streams SSE from Ollama, validates JSON, returns plan
- [ ] Command schema defined as a Pydantic model covering `remove_silence`, `remove_fillers`, `export` actions
- [ ] Ollama integration uses `asyncio.create_subprocess_exec` or `httpx.AsyncClient` — never `subprocess.run`
- [ ] SSE stream correctly closed and error-handled on Ollama timeout or connection failure
- [ ] Frontend chat panel: prompt input, submit button, streaming indicator, plan display, error states
- [ ] Backend tests written and passing (target >96% quality score, all ACs covered)
- [ ] No regression in transcription, subtitle, silence, or filler flows
- [ ] Plan display clearly labels each step and its parameters; no raw JSON shown to user
