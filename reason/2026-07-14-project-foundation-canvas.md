# REASONS Canvas: Project Foundation
Date: 2026-07-14
Analysis: analysis/2026-07-14-project-foundation-analysis.md
Scope: full-stack

---

## R — Requirements

**Problem:** There is no project yet. No backend, no frontend, no database, no
configuration, and no shared conventions. Every subsequent story (2–10) depends
entirely on the infrastructure, folder layout, config pattern, logging setup,
and database session lifecycle established here. Without a solid foundation,
each future story would need to make its own incompatible decisions.

**Goal:** Bootstrap a fully working, locally-runnable AI Video Editor project —
FastAPI backend + React/TypeScript frontend — that starts cleanly, connects to
SQLite, exposes a health endpoint, and enforces shared conventions that all
future stories follow without modification.

**Definition of Done:**
- [ ] Given the developer installs dependencies and runs `uvicorn app.main:app --reload`, when the command executes, then FastAPI starts on port 8000 with no errors in the console.
- [ ] Given the backend is running, when `GET /api/v1/health` is called, then HTTP 200 is returned with a JSON body reporting the status of database, FFmpeg, Ollama, and storage.
- [ ] Given the developer runs `npm run dev` in the frontend folder, when the browser opens localhost:5173, then the React app loads with no console errors.
- [ ] Given no `.env` file exists on disk, when the backend starts, then it loads defaults from config.py and logs a warning without crashing.
- [ ] Given the backend starts for the first time and no database.db file exists, when init_db() runs in the lifespan, then database.db is created automatically with WAL journal mode enabled.
- [ ] Given the backend is running, when the frontend makes any API call, then CORS headers are present and the browser does not block the request.
- [ ] Given a developer sets APP_PORT=9000 in .env, when the backend starts, then it listens on port 9000, not 8000.

---

## E — Entities

### Data Entities

No database tables are created in Story 1. The SQLAlchemy Base and engine are
initialised and WAL mode is applied, but no models are defined. All table
definitions begin in Story 2.

### Frontend Artifacts

| Name | Type | Path | Responsibility |
|------|------|------|----------------|
| `package.json` | Node manifest | `frontend/` | Declares all frontend dependencies pinned to exact versions |
| `index.html` | Vite HTML entry | `frontend/` | Single root div, imports src/main.tsx |
| `vite.config.ts` | Vite config | `frontend/` | Dev proxy `/api` → backend, `@/` path alias to `src/` |
| `tsconfig.json` | TypeScript config | `frontend/` | Strict mode, path aliases matching Vite |
| `tailwind.config.ts` | Tailwind config | `frontend/` | Content paths for all tsx/ts files |
| `postcss.config.js` | PostCSS config | `frontend/` | Required by Tailwind v3 pipeline |
| `.env` | Frontend env file | `frontend/` | VITE_API_URL=http://localhost:8000, git-ignored |
| `main.tsx` | React entry point | `frontend/src/` | ReactDOM.createRoot, wraps App in QueryClientProvider |
| `App.tsx` | Router root | `frontend/src/` | BrowserRouter, route `/` maps to Dashboard |
| `Layout.tsx` | App shell component | `frontend/src/components/common/` | Header + main content slot, used by all pages |
| `Dashboard.tsx` | Placeholder page | `frontend/src/pages/` | Calls GET /api/v1/health and displays service statuses |
| `client.ts` | Base API client | `frontend/src/api/` | Fetch wrapper — baseURL from VITE_API_URL, JSON headers, error handling |
| `index.ts` | Shared TS types | `frontend/src/types/` | HealthResponse interface; extended by all future stories |

---

## A — Approach

**Pattern:** Pure scaffolding — config-first on the backend, entry-point-first on
the frontend. No business logic is introduced. Every module built here is imported
unchanged by Stories 2–10.

**Strategy:** Build the backend in strict dependency order: config → database →
logging → dependencies → health router → app entry point. This ensures each layer
is testable before the next is added. On the frontend, scaffold in install order:
package.json → tooling configs → entry files → API client → components. The Vite
dev proxy handles cross-origin requests during development so CORS issues appear
in production-like scenarios, not in the dev loop. The Dashboard page makes a
real call to the health endpoint — this proves the entire request chain before
Story 2 begins.

**Scope In:**
- FastAPI application entry point with lifespan, CORS, and router mounting
- SQLite engine with WAL mode and SQLAlchemy Base (no tables yet)
- Pydantic BaseSettings reading from .env with defaults for every field
- Structured logging to console and a rotating log file
- GET /api/v1/health endpoint checking FFmpeg, Ollama, database, and storage
- React + TypeScript frontend scaffold with Vite, Tailwind, React Router
- Base API client with baseURL from VITE_API_URL
- Placeholder Dashboard page showing health status
- Storage directories (uploads/, exports/, temp/) auto-created on startup
- requirements.txt and package.json with all dependencies pinned
- .env.example committed; .env and database.db git-ignored
- Optional docker-compose.yml skeleton

**Scope Out:**
- No video upload or any domain business logic (Story 2)
- No user authentication (post-V1)
- No Alembic migrations — create_all() is correct for V1
- No CI/CD or production deployment configuration
- No Faster-Whisper installation (Story 4)
- No Zustand stores or TanStack Query hooks beyond QueryClientProvider setup
- No frontend routing beyond the single Dashboard placeholder

---

## S — Structure

### API Structure

**Root:** `backend/`

**API Endpoint:**
- Method: GET
- Path: `/api/v1/health`
- Auth: none (public)

**New Files:**
- `backend/app/__init__.py` — package marker
- `backend/app/main.py` — FastAPI app, asynccontextmanager lifespan, CORSMiddleware, router mount
- `backend/app/core/__init__.py` — package marker
- `backend/app/core/config.py` — pydantic BaseSettings, reads .env, exposes singleton settings object
- `backend/app/core/database.py` — SQLite engine, SessionLocal, Base declaration, init_db() with WAL pragma
- `backend/app/core/logging_config.py` — RotatingFileHandler (10 MB, 5 files) + StreamHandler, called once at startup
- `backend/app/core/dependencies.py` — get_db() generator yielding SessionLocal for use as FastAPI Depends
- `backend/app/api/__init__.py` — package marker
- `backend/app/api/v1/__init__.py` — package marker
- `backend/app/api/v1/health.py` — APIRouter with GET /health, subprocess checks for FFmpeg, HTTP check for Ollama, DB ping, storage path check
- `backend/app/models/__init__.py` — empty placeholder; models registered here from Story 2
- `backend/app/schemas/__init__.py` — empty placeholder; schemas registered here from Story 2
- `backend/app/services/__init__.py` — empty placeholder; services added from Story 2
- `backend/app/workers/__init__.py` — empty placeholder; job manager added in Story 4
- `backend/storage/uploads/.gitkeep` — ensures git tracks the empty uploads directory
- `backend/storage/exports/.gitkeep` — ensures git tracks the empty exports directory
- `backend/storage/temp/.gitkeep` — ensures git tracks the empty temp directory
- `backend/.env.example` — documents every env variable with its default value
- `backend/requirements.txt` — all Python dependencies pinned to exact versions
- `docker-compose.yml` — optional skeleton, backend service + volume mounts only

**Modified Files:**
- none (greenfield)

**Database:**
- No migrations in Story 1
- init_db() calls Base.metadata.create_all() then executes PRAGMA journal_mode=WAL

### Frontend Structure

**Root:** `frontend/`

**New Files:**
- `frontend/package.json` — React 18, TypeScript, Vite, Tailwind CSS, React Router v6, Zustand, TanStack React Query, all pinned
- `frontend/index.html` — Vite HTML shell with single root div
- `frontend/vite.config.ts` — dev server proxy /api → http://localhost:8000, @/ alias
- `frontend/tsconfig.json` — strict: true, baseUrl src/, paths @/* → ./*
- `frontend/tailwind.config.ts` — content: src/**/*.{ts,tsx}
- `frontend/postcss.config.js` — tailwindcss and autoprefixer plugins
- `frontend/.env` — VITE_API_URL=http://localhost:8000, git-ignored
- `frontend/src/main.tsx` — ReactDOM.createRoot, QueryClientProvider wrapper
- `frontend/src/App.tsx` — BrowserRouter, Routes, Route path="/" element=Dashboard
- `frontend/src/types/index.ts` — HealthResponse interface with status and services fields
- `frontend/src/api/client.ts` — base fetch wrapper reading VITE_API_URL, JSON content-type, error unwrapping
- `frontend/src/components/common/Layout.tsx` — header with app name, main slot for page content
- `frontend/src/pages/Dashboard.tsx` — useQuery to GET /api/v1/health, renders service status badges
- `frontend/src/store/.gitkeep` — placeholder; Zustand stores added per story from Story 2
- `frontend/src/hooks/.gitkeep` — placeholder; useWebSocket and useSSE added in Story 4

**Modified Files:**
- none (greenfield)

---

## O — Operations

1. [BE] Create `.gitignore` at repo root — exclude .env, database.db, __pycache__, node_modules, dist, storage/uploads/*, storage/exports/*, storage/temp/*

2. [BE] Create `backend/.env.example` — document every settings field: APP_HOST, APP_PORT, APP_ENV, DATABASE_URL, STORAGE_DIR, LOG_LEVEL, LOG_FILE, CORS_ORIGINS, OLLAMA_BASE_URL, OLLAMA_MODEL, WHISPER_MODEL, MAX_UPLOAD_SIZE_MB

3. [BE] Create `backend/requirements.txt` — pin fastapi, uvicorn[standard], sqlalchemy, pydantic-settings, python-multipart, aiofiles, python-dotenv

4. [BE] Create `backend/app/core/config.py` — BaseSettings subclass with field for every .env variable, env_file=".env", all fields have defaults so missing .env logs a warning but does not crash; expose a module-level `settings` singleton

5. [BE] Create `backend/app/core/database.py` — create SQLite engine from settings.DATABASE_URL using check_same_thread=False, configure SessionLocal with autocommit=False autoflush=False, declare Base, define init_db() that calls create_all() then runs PRAGMA journal_mode=WAL on a raw connection

6. [BE] Create `backend/app/core/logging_config.py` — configure root logger with a StreamHandler for console and a RotatingFileHandler (10 MB max, 5 backups) for file output; format includes timestamp, level, module name, and message; call setup_logging() once

7. [BE] Create `backend/app/core/dependencies.py` — define get_db() as a generator that yields a SessionLocal and closes it in finally; this is the sole DB session provider for all future routers

8. [BE] Create `backend/app/api/v1/health.py` — APIRouter prefix="/health", GET "/" handler that checks: DB by executing a trivial query, FFmpeg by running subprocess to check ffmpeg -version, Ollama by making an HTTP GET to settings.OLLAMA_BASE_URL/api/tags with a short timeout, storage by verifying the uploads/exports/temp paths exist; return HealthResponse with overall status and per-service statuses; never raise an exception — catch all and return "offline" or "error"

9. [BE] Create `backend/app/main.py` — import setup_logging and call it first, define asynccontextmanager lifespan that calls init_db() and creates storage directories on startup, instantiate FastAPI with lifespan and metadata, add CORSMiddleware with origins from settings (expose Content-Range and Accept-Ranges headers for future video streaming), include the health router at prefix /api/v1, add a root GET / returning version info

10. [BE] Create storage directory markers — uploads/.gitkeep, exports/.gitkeep, temp/.gitkeep

11. [FE] Create `frontend/package.json` — declare dependencies: react, react-dom, react-router-dom, @tanstack/react-query, zustand; devDependencies: typescript, vite, @vitejs/plugin-react, tailwindcss, autoprefixer, postcss, @types/react, @types/react-dom; all pinned to exact versions

12. [FE] Create `frontend/vite.config.ts` — defineConfig with react plugin, server.proxy mapping /api to http://localhost:8000 (changeOrigin true), resolve.alias mapping @/ to src/

13. [FE] Create `frontend/tsconfig.json` — compilerOptions strict true, target ESNext, module ESNext, moduleResolution bundler, jsx react-jsx, baseUrl src, paths @/* mapped to ./*

14. [FE] Create `frontend/tailwind.config.ts` and `frontend/postcss.config.js` — Tailwind content paths covering src/**/*.{ts,tsx}, postcss plugins tailwindcss and autoprefixer

15. [FE] Create `frontend/index.html` — standard Vite shell with charset, viewport meta, title "AI Video Editor", single div id="root", script type module src="/src/main.tsx"

16. [FE] Create `frontend/src/types/index.ts` — export HealthResponse interface with status string field and services object containing database, ffmpeg, ollama, storage string fields; export ServiceStatus type as union of "ok" | "offline" | "error"

17. [FE] Create `frontend/src/api/client.ts` — read base URL from import.meta.env.VITE_API_URL, export typed get/post/patch/delete functions that set Content-Type application/json, handle non-ok responses by throwing an error with the response body message

18. [FE] Create `frontend/src/components/common/Layout.tsx` — header with "AI Video Editor" brand name and nav placeholder, main element wrapping children prop, footer with version string; fully typed with React.FC and ReactNode children

19. [FE] Create `frontend/src/pages/Dashboard.tsx` — use TanStack useQuery to call GET /api/v1/health via the API client, render a status card for each service (database, ffmpeg, ollama, storage) with a green/red/grey badge based on status value, show loading skeleton while fetching, show error message if request fails

20. [FE] Create `frontend/src/App.tsx` — import BrowserRouter, Routes, Route from react-router-dom, wrap routes in Layout, define single route path="/" element=Dashboard

21. [FE] Create `frontend/src/main.tsx` — import ReactDOM createRoot, import QueryClient and QueryClientProvider from tanstack/react-query, instantiate QueryClient, render App wrapped in QueryClientProvider into document.getElementById("root")

22. [BE] Create `README.md` at repo root — prerequisites (Python 3.10+, Node 18+, FFmpeg in PATH, Ollama running), backend setup steps (create venv, pip install, copy .env.example to .env, run uvicorn), frontend setup steps (npm install, npm run dev), port override instructions, health check curl example

---

## N — Norms

### API Norms

- FastAPI module path: `backend/app/` with sub-packages core/, api/v1/, models/, schemas/, services/, workers/
- All config values come from the pydantic `settings` singleton — never from os.environ directly
- Database sessions are obtained exclusively via the `get_db()` Depends — never instantiated inline
- All file paths use `pathlib.Path` — no string concatenation with slashes
- Logging uses the configured logger (`logging.getLogger(__name__)`) — no print statements
- Router files define only HTTP handlers — business logic lives in services/
- Health endpoint always returns HTTP 200 — service failures appear in the response body, not as HTTP errors
- SQLAlchemy models are registered on Base before init_db() is called — import order matters in main.py
- WAL mode must be explicitly applied via PRAGMA — never assumed as a default
- New environment variables must be added to both .env.example and config.py Settings class

### Frontend Norms

- All API calls go through `src/api/client.ts` — no raw fetch calls in components
- Environment variables must be prefixed with `VITE_` to be accessible in the browser bundle
- Path imports use the `@/` alias — no relative `../../` chains
- Server state is managed with TanStack React Query — no manual useEffect/useState fetch patterns
- Client state is managed with Zustand stores — no prop drilling for shared state
- All components are typed with explicit prop interfaces — no implicit any
- Components handle loading, empty, and error states explicitly — no silent failures
- Page components are placed in `src/pages/`, reusable UI in `src/components/`
- Stores are placed in `src/store/`, custom hooks in `src/hooks/`

---

## S — Safeguards

### API Safeguards

- Never commit .env or database.db — both must be in .gitignore
- Health check subprocess calls (FFmpeg) must have a timeout — never block the event loop indefinitely
- Health check HTTP call to Ollama must have a short timeout (2 seconds) — Ollama being slow must not delay startup
- Storage directories must be created programmatically at startup — never assumed to exist
- CORS expose_headers must include Content-Range and Accept-Ranges — required by browser video streaming in Story 3; missing this now breaks Story 3
- All SQLAlchemy models must be imported in main.py before init_db() is called — missing imports silently skip table creation
- WAL pragma must be applied after every new engine connection — it is not persisted across reconnects in all SQLite versions
- Python version must be 3.10 or higher — document this prominently in README; do not silently degrade

### Frontend Safeguards

- VITE_API_URL must be read from import.meta.env — never hardcoded to localhost:8000 in source files
- The Vite dev proxy must not be relied on for CORS correctness — the backend CORSMiddleware is the authoritative CORS config
- Dashboard health call must handle network errors gracefully — Ollama or FFmpeg being offline must not crash the page
- All interactive elements must be keyboard accessible
- Do not commit frontend/.env — it must be in .gitignore
- package.json must pin exact versions (no ^ or ~ ranges) — reproducible installs across machines
- The @/ alias must be configured in both vite.config.ts and tsconfig.json — configuring only one causes TS errors or runtime errors respectively

---

## Change Log

- 2026-07-14: Canvas created from analysis/2026-07-14-project-foundation-analysis.md
