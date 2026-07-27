# Analysis: Project Foundation
Date: 2026-07-14
Story: story/2026-07-14-project-foundation-story.md
Scope: full-stack
Repos scanned: greenfield — no existing codebase
Figma: none

---

## Project Fingerprint

This is a brand-new, greenfield project. The only artifacts that exist are
`plan/plan.md` (the V1 master plan) and the story file. There is no existing
backend, frontend, database, or configuration to scan. Every concept listed in
the "Missing or Needs to Be Added" tables must be created from scratch. The
target stack is Python 3.10+ / FastAPI on the backend and React 18 /
TypeScript / Vite on the frontend, connected via REST + WebSocket over localhost.

---

## Risks and Edge Cases

| Risk | Severity | Notes |
|------|----------|-------|
| Developer runs Python 3.9 or below | High | `pydantic-settings` v2 and `match` statements require 3.10+. Pin in README and check in health startup log. |
| FFmpeg not installed or not in PATH | High | Health endpoint must detect this explicitly and return `"ffmpeg": "offline"` — not crash. |
| Ollama not running at startup | Medium | Backend must start successfully even when Ollama is unreachable. Health endpoint flags it; application does not block. |
| Port 8000 or 5173 already occupied | Medium | Both ports must be overridable via `.env`. Document clearly in README. |
| Windows path separators break storage paths | Medium | Use `pathlib.Path` throughout — never string concatenation with `/` or `\`. |
| SQLite file created in wrong working directory | Medium | Resolve `database.db` path relative to the project root using `Path(__file__).parent`, not `os.getcwd()`. |
| CORS misconfiguration blocks video streaming | Medium | `Content-Range` and `Accept-Ranges` headers must be explicitly included in CORS `expose_headers`. Required for browser `<video>` range requests in Story 3. |
| Frontend `.env` variable not prefixed with `VITE_` | Low | Vite only exposes variables prefixed `VITE_` to the browser bundle. `VITE_API_URL` is the correct key. |
| SQLite WAL mode not applied | Low | Must be set via `PRAGMA journal_mode=WAL` after engine creation, not assumed as default. |
| `create_all()` conflicts with future model imports | Low | All SQLAlchemy models must be imported before `Base.metadata.create_all()` is called in `main.py` lifespan. |

---

## Acceptance Criteria Coverage

| Criterion | Status | Notes |
|-----------|--------|-------|
| FastAPI starts on port 8000 with no errors | Needs work | Nothing exists yet — `main.py`, `core/config.py`, `core/database.py` must all be created. |
| `GET /api/v1/health` returns 200 with service statuses | Needs work | `api/v1/health.py` router must be created and mounted. FFmpeg, Ollama, DB, and storage checks must all be implemented. |
| React app loads on localhost:5173 with no console errors | Needs work | Full frontend scaffold must be created: Vite, React, TypeScript, Tailwind, React Router. |
| Missing `.env` does not crash the backend | Needs work | `pydantic-settings` with `env_file` and `env_file_encoding` handles this, but defaults must be set for every field. |
| `database.db` auto-created with WAL mode on first run | Needs work | `init_db()` in lifespan must call `create_all()` then execute the WAL pragma. |
| CORS allows frontend → backend calls | Needs work | `CORSMiddleware` must be added to `main.py` with correct origins, methods, headers, and `expose_headers`. |
| `APP_PORT=9000` in `.env` changes listening port | Needs work | `uvicorn` must read the port from config, not hardcode 8000. Document in README. |

---

## API Analysis

### Domain Concepts — API

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| V1 Master Plan | plan/plan.md | Defines full folder structure, API surface, DB schema, and story sequence |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `app/main.py` | FastAPI entry point | App init, lifespan, CORS middleware, router mounting |
| `app/core/config.py` | Pydantic BaseSettings | Reads `.env`; provides typed settings singleton |
| `app/core/database.py` | SQLAlchemy engine | SQLite engine, SessionLocal factory, Base, `init_db()` |
| `app/core/logging_config.py` | Logging setup | Structured console + rotating file handler (10 MB, 5 files) |
| `app/core/dependencies.py` | FastAPI Depends | `get_db()` generator used by all future routers |
| `app/api/__init__.py` | Package marker | Empty |
| `app/api/v1/__init__.py` | Package marker | Empty |
| `app/api/v1/health.py` | FastAPI router | `GET /api/v1/health` — checks FFmpeg, Ollama, DB, storage |
| `app/models/__init__.py` | Package marker | Empty placeholder; populated from Story 2 onward |
| `app/schemas/__init__.py` | Package marker | Empty placeholder; populated from Story 2 onward |
| `app/services/__init__.py` | Package marker | Empty placeholder; populated from Story 2 onward |
| `app/workers/__init__.py` | Package marker | Empty placeholder; populated from Story 4 onward |
| `storage/uploads/.gitkeep` | Directory marker | Ensures git tracks the empty folder |
| `storage/exports/.gitkeep` | Directory marker | Ensures git tracks the empty folder |
| `storage/temp/.gitkeep` | Directory marker | Ensures git tracks the empty folder |
| `database.db` | SQLite file | Auto-created on first run — must NOT be committed |
| `.env` | Config file | Developer-local, git-ignored |
| `.env.example` | Config template | Committed to repo; documents every variable with defaults |
| `requirements.txt` | Python deps | All packages pinned to exact versions |
| `docker-compose.yml` | Optional Docker | Skeleton only for V1 — backend service, volume mounts |

### Strategic Approach — API

This is a pure scaffolding story — no business logic is introduced. The recommended
approach is to build the config → database → logging → app layers in strict dependency
order, then mount the single health router. Every module introduced here (config,
database, dependencies) will be imported unchanged by all 9 subsequent stories.
The lifespan pattern (`@asynccontextmanager` on `app`) ensures `init_db()` and
storage-directory creation run exactly once at startup, with clean shutdown handling.

### Key Design Decisions — API

- **`pydantic-settings` v2 over `python-dotenv` directly** — gives typed, validated
  config with IDE autocomplete; `.env` loading is a side effect, not the primary interface.
- **`pathlib.Path` for all file paths** — Windows-safe, no manual separator handling.
- **WAL mode via PRAGMA after engine creation** — SQLite default journal mode causes
  lock errors under concurrent reads; WAL must be applied explicitly on every new connection.
- **Lifespan over `@app.on_event`** — `on_event` is deprecated in FastAPI 0.93+;
  `asynccontextmanager` lifespan is the current pattern.
- **Health endpoint returns 200 always** — individual services report their own status
  inside the JSON body. HTTP 503 is reserved for when the backend itself cannot respond,
  not when Ollama is offline.
- **No Alembic in Story 1** — `create_all()` is correct for V1 local-only use.
  Alembic can be introduced post-V1 if the schema needs migrations.

---

## Frontend Analysis

### Domain Concepts — Frontend

#### Existing in Codebase
| Concept | Location | Notes |
|---------|----------|-------|
| V1 Master Plan | plan/plan.md | Defines frontend folder structure, component list, and library choices |

#### Missing or Needs to Be Added
| Concept | Type | Notes |
|---------|------|-------|
| `frontend/package.json` | Node manifest | React 18, TypeScript, Vite, Tailwind, React Router, Zustand, TanStack Query — all pinned |
| `frontend/index.html` | Vite entry HTML | Single root `<div id="root">`, imports `src/main.tsx` |
| `frontend/vite.config.ts` | Vite config | Dev proxy `/api` → `http://localhost:8000`; resolves `@/` alias to `src/` |
| `frontend/tsconfig.json` | TypeScript config | Strict mode, path aliases matching Vite config |
| `frontend/tailwind.config.ts` | Tailwind config | Content paths covering `src/**/*.{ts,tsx}` |
| `frontend/postcss.config.js` | PostCSS config | Required by Tailwind v3 |
| `frontend/.env` | Frontend env | `VITE_API_URL=http://localhost:8000` — git-ignored |
| `frontend/src/main.tsx` | React entry point | `ReactDOM.createRoot`, wraps App in `QueryClientProvider` |
| `frontend/src/App.tsx` | Router root | `BrowserRouter` with routes: `/` → Dashboard |
| `frontend/src/pages/Dashboard.tsx` | Placeholder page | "AI Video Editor" heading; calls `/api/v1/health` to verify connectivity |
| `frontend/src/components/common/Layout.tsx` | App shell | Header + main content slot; used by all pages |
| `frontend/src/api/client.ts` | Base fetch wrapper | Sets `baseURL` from `VITE_API_URL`; handles JSON headers and errors |
| `frontend/src/types/index.ts` | Shared TS types | `HealthResponse` interface; extended by future stories |
| `frontend/src/store/` | Zustand stores | Empty directory placeholder — populated from Story 2 onward |
| `frontend/src/hooks/` | Custom hooks | Empty directory placeholder — `useWebSocket`, `useSSE` added in Story 4+ |

### Strategic Approach — Frontend

This story establishes the React application shell only — no domain components
are introduced. The recommended approach is to scaffold in this order: package
install → Vite + Tailwind config → TypeScript config → entry files → base API
client → Layout + Dashboard page. The Vite dev proxy (`/api` → backend) allows
the frontend to call the API without CORS issues during development, while
`VITE_API_URL` provides the production-ready override path. The Dashboard page
should make a real call to `/api/v1/health` and display the result — this proves
the full request chain works before Story 2 begins.

### Key Design Decisions — Frontend

- **Vite over Create React App** — faster HMR, native ESM, first-class TypeScript
  support, actively maintained.
- **Vite dev proxy for `/api`** — avoids CORS friction during development; the
  backend CORS config handles production and non-proxy scenarios.
- **TanStack React Query for server state** — avoids manual `useEffect` + `useState`
  fetch patterns that every future story would otherwise repeat.
- **Zustand for client state** — lighter than Redux; no boilerplate; stores added
  per-story rather than configured upfront.
- **`src/api/client.ts` as the single fetch boundary** — every future API call
  goes through this module; base URL and error handling are defined once.
- **`@/` path alias** — avoids `../../../` relative imports across the component tree.

---

## Dependencies

| Dependency | Direction | Notes |
|------------|-----------|-------|
| `plan/plan.md` | Reference | Folder structure, API surface, and DB schema must match exactly |
| FFmpeg (system) | External | Detected at health check; required by Stories 2, 6, 7, 8 |
| Ollama (system) | External | Detected at health check; required by Story 9 |
| Faster-Whisper (Python package) | Future | Not installed in Story 1; required by Story 4 |
| Stories 2–10 | Downstream | All depend on the database session, config, logging, and folder structure established here |
