# Analysis: AI Editing Assistant
Date: 2026-07-18
Story: 2026-07-18-ai-editing-assistant-story.md
Scope: full-stack
Repos scanned: AI Video Editor local (backend + frontend)
Figma: none

---

## Project Fingerprint

FastAPI 0.115.5 on Python 3.9.12, SQLite (WAL) via SQLAlchemy 2.0.36, Pydantic v2. Ollama is already first-class: `ollama_base_url` (`http://localhost:11434`) and `ollama_model` (`qwen3`) live in `Settings`, and `httpx` is already installed and used in `health.py` for the Ollama liveness check. Frontend is React 18.3 + TypeScript 5.7 + Vite 6 + Tailwind CSS 3.4 + TanStack React Query 5; all API calls go through `api/client.ts`; panel components (`SilencePanel`, `FillerPanel`) are conditionally rendered inside `VideoCard` — the same slot this story's `AssistantPanel` will occupy.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| Qwen3 returns non-JSON despite `format: "json"` instruction | High | Use Ollama's built-in JSON mode (`"format": "json"` in request body) + system prompt with explicit schema + fallback strip of ` ```json ` fences before parsing |
| Ollama stream stalls mid-response (slow model, OOM) | Medium | Set per-read timeout on `httpx.AsyncClient`; catch `httpx.ReadTimeout`; emit `{"type":"error"}` SSE event and close stream |
| `fetch` + `ReadableStream` SSE parsing is complex | Medium | `EventSource` only supports GET; implement a thin SSE line-reader using `TextDecoder` + `reader.read()` loop in `api/client.ts` — the same pattern works for Story 10 |
| Qwen3 invents command types not in V1 schema | Low | Pydantic model with `model_config = ConfigDict(extra="ignore")` silently drops unknown fields; backend includes a `warnings` list in the final plan event listing what was stripped |
| Model lacks video metadata (timestamps, duration) | Low | V1 plan is action-type only — no timestamp specifics needed. Story 10 maps actions to real data at execution time |
| Concurrent plan requests for the same video | Low | Add `_in_flight` set guard (same pattern as transcriptions, silence, fillers) — return 409 if already generating |

---

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| Given video selected + prompt submitted → Ollama called via SSE | Needs work | No assistant endpoint exists yet; `ollama_base_url` and `ollama_model` already in `Settings` |
| Given valid JSON returned → validate + render as numbered steps | Needs work | `EditingCommand` Pydantic schema and `AssistantPanel` do not exist yet |
| Given malformed JSON → HTTP 422 + rephrase message | Needs work | Backend must catch `json.JSONDecodeError` / `ValidationError` and emit `{"type":"error"}` SSE event |
| Given valid plan → human-readable step labels per command | Needs work | `AssistantPanel` maps each `action` string to a display label and surfaces `params` inline |
| Given unknown command type → stripped + warning shown | Needs work | `extra="ignore"` on Pydantic drops unknowns; backend collects stripped names and includes in `warnings` field |
| Given Ollama offline → 503 + "is Ollama running?" message | Supported | `httpx.ConnectError` path proven in `_check_ollama()`; reuse same catch in `AssistantService` |
| Given plan displayed + user does not confirm → no processing | Supported | Story 9 is display-only; no execution path exists until Story 10 |

---

## API Analysis

### Domain Concepts — API

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| `settings.ollama_base_url` | `app/core/config.py:33` | `http://localhost:11434` — ready to use |
| `settings.ollama_model` | `app/core/config.py:34` | `qwen3` — ready to use |
| `httpx` (sync client) | `app/api/v1/health.py:9` | Already a dependency; need `httpx.AsyncClient` with `stream()` for SSE relay |
| `VideoService.get_by_id()` | `app/services/video.py` | Reused for video lookup + 404 guard |
| `_in_flight: set` guard pattern | `app/api/v1/transcriptions.py`, `silence.py`, `fillers.py` | Exact same module-level set pattern applies here |
| Router registration pattern | `app/main.py:134` | `app.include_router(fillers.router, prefix="/api/v1/videos", ...)` — follow for assistant router |
| Migration guard pattern | `app/main.py:19–44` | Not needed for Story 9 (no new DB columns) |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `EditingCommand` | Pydantic model | `action: Literal["remove_silence", "remove_fillers", "export"]` + optional `params: dict`; `ConfigDict(extra="ignore")` to drop unknown actions |
| `EditingPlan` | Pydantic model | `commands: List[EditingCommand]`; `warnings: List[str]` for stripped unknown types |
| `AssistantService` | Service class (`app/services/assistant.py`) | `async generate_plan(prompt, video, db)` — calls Ollama `/api/chat` with system prompt, streams tokens, accumulates, validates against `EditingPlan` |
| `app/api/v1/assistant.py` | FastAPI router | `POST /{video_id}/assistant/plan` — accepts `{"prompt": str}`, returns `StreamingResponse` (SSE); `_in_flight` guard; 503 on Ollama connect error |
| `PlanRequest` | Pydantic request body | `prompt: str` (non-empty, max 500 chars) |
| Ollama system prompt | String constant in `AssistantService` | Instructs Qwen3 to return only JSON matching the `EditingPlan` schema; includes schema example |

### Strategic Approach — API

Use `httpx.AsyncClient` with `client.stream("POST", ollama_chat_url, json=payload)` to relay Ollama tokens as SSE events from a FastAPI `StreamingResponse`. The stream has two phases: a `delta` phase (one SSE event per token chunk for UX) and a terminal `plan` or `error` event after the full response is accumulated and validated. The Ollama request uses `"format": "json"` and a system prompt that embeds the V1 command schema, ensuring the model's output is constrained. The `AssistantService` is a plain async class (no DB writes in Story 9) — it takes the prompt and video metadata and returns an async generator of SSE lines consumed by the router's `StreamingResponse`.

### Key Design Decisions — API

- **`/api/chat` not `/api/generate`**: Ollama's chat endpoint supports a `system` message, making schema injection cleaner than prepending to the user prompt in generate mode.
- **`"format": "json"` in Ollama payload**: Activates Ollama's JSON mode which biases the model toward valid JSON — reduces but does not eliminate parse failures.
- **Two-phase SSE stream**: `{"type":"delta","content":"..."}` events stream tokens live; a single `{"type":"plan","commands":[...],"warnings":[...]}` or `{"type":"error","message":"..."}` event closes the stream. This keeps validation server-side while preserving streaming UX.
- **No DB writes in Story 9**: The plan is transient — lives only in the SSE stream and then in React state. Story 10 will own persisting the accepted plan.
- **Python 3.9 constraint**: `Literal["remove_silence", "remove_fillers", "export"]` from `typing` — not `typing_extensions`.

---

## Frontend Analysis

### Domain Concepts — Frontend

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| `VideoCard.tsx` | `frontend/src/components/library/VideoCard.tsx` | Parent component; conditionally renders `SilencePanel` and `FillerPanel` — `AssistantPanel` adds a third slot on the same condition (`video.status === "ready"`) |
| `FillerPanel.tsx` pattern | `frontend/src/components/library/FillerPanel.tsx` | Props: data + callbacks + loading flags; pure display component; exact pattern to follow |
| `api/client.ts` `request<T>()` helper | `frontend/src/api/client.ts:4` | JSON-only; SSE streaming requires a separate `fetch` + `ReadableStream` function alongside this helper |
| `types/index.ts` | `frontend/src/types/index.ts` | Add `EditingCommand`, `EditingPlan`, `PlanStreamEvent` types here |
| `BASE_URL` constant | `frontend/src/api/client.ts:3` | Reused in the new SSE client function |
| TanStack React Query mutations pattern | `VideoCard.tsx:63–141` | Used for all POST actions; SSE is not a mutation — use `useState` + manual `fetch` loop instead |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `AssistantPanel.tsx` | React component | Prompt textarea + submit button + streaming token accumulator + numbered plan display + error state; follows `FillerPanel` props pattern |
| `streamEditingPlan()` | `api/client.ts` function | `async function* streamEditingPlan(videoId, prompt)` — POSTs to `/assistant/plan`, reads `ReadableStream`, yields parsed SSE events line by line |
| `EditingCommand` type | `types/index.ts` | `{ action: "remove_silence" \| "remove_fillers" \| "export"; params?: Record<string, unknown> }` |
| `EditingPlan` type | `types/index.ts` | `{ commands: EditingCommand[]; warnings: string[] }` |
| `PlanStreamEvent` type | `types/index.ts` | Discriminated union: `{ type: "delta"; content: string } \| { type: "plan"; commands: EditingCommand[]; warnings: string[] } \| { type: "error"; message: string }` |
| `assistantError` state | `VideoCard.tsx` | Same pattern as `fillerError`, `silenceError` — shown in the existing error block at the bottom of the card |
| `AssistantPanel` slot in `VideoCard` | `VideoCard.tsx` | Add after the `FillerPanel` block, same `video.status === "ready"` guard |

### Strategic Approach — Frontend

`AssistantPanel` holds all local state (`prompt`, `streamingText`, `plan`, `isStreaming`, `error`) and drives the SSE flow entirely from `useState` + `useEffect` — no React Query mutation since SSE is a streaming read, not a one-shot POST. The `streamEditingPlan()` generator in `api/client.ts` handles the raw `ReadableStream` → SSE line parsing → typed event yielding, keeping the component logic clean. While streaming, the component shows the accumulating token text in a `<pre>` block; once the terminal `plan` event arrives, it switches to the numbered step view. The existing `VideoCard` error display block already handles per-feature errors — just add `assistantError` to the list.

### Key Design Decisions — Frontend

- **Async generator for SSE, not `EventSource`**: `EventSource` only works with GET; since the prompt is in the POST body, use `fetch` + `response.body.getReader()` + `TextDecoder`. Wrapping this in an async generator keeps the component's `useEffect` readable.
- **`useState` not `useMutation` for the plan call**: React Query mutations resolve once and don't stream; the SSE flow is multi-event. Local state + a `useEffect` abort controller is the right model.
- **`AbortController` on panel unmount**: If the user navigates away during streaming, `reader.cancel()` must be called to close the SSE connection and prevent memory leaks.
- **Plan displayed as numbered `<ol>`**: Each `EditingCommand.action` maps to a human label (`remove_silence` → "Remove silence segments", etc.); `params` shown inline if present. No raw JSON ever exposed to the user.

---

## Dependencies

- `httpx` (already installed) — needs `AsyncClient` usage, currently only sync `Client` used
- `SilenceService`, `FillerService` — referenced as V1 command types; no code change needed in Story 9
- `VideoService.get_by_id()` — unchanged, reused
- `app/main.py` — needs one new `include_router` call for the assistant router
- `frontend/src/components/library/VideoCard.tsx` — needs `AssistantPanel` import + state + render slot
- `frontend/src/api/client.ts` — needs `streamEditingPlan()` function
- `frontend/src/types/index.ts` — needs `EditingCommand`, `EditingPlan`, `PlanStreamEvent` types
