# User Story: Project Foundation
Date: 2026-07-14
Source: Pasted text

---

## Story 1: Scalable Project Foundation for AI Video Editor

**As a** developer,
**I want** a well-structured, scalable project foundation,
**So that** future AI video editing features can be added easily without
architectural rework.

### Scope In
- FastAPI backend with API versioning under `/api/v1/`
- React + TypeScript frontend scaffolded with Vite and Tailwind CSS
- SQLite database with SQLAlchemy ORM (WAL mode enabled)
- Structured logging (console + rotating file)
- Environment variable configuration via `.env` and `pydantic-settings`
- Project folder structure matching the V1 architecture document
- `GET /api/v1/health` endpoint verifying FFmpeg, Ollama, database, and storage
- `requirements.txt` and `package.json` with pinned dependencies
- CORS configured so the frontend can call the backend
- Storage directories auto-created on startup (`uploads/`, `exports/`, `temp/`)
- SQLite database file auto-created on first run
- Optional Docker / `docker-compose.yml` skeleton

### Scope Out
- No video upload logic (Story 2)
- No user authentication or multi-user support (post-V1)
- No Alembic migrations — `create_all()` is sufficient for V1
- No CI/CD pipeline configuration
- No production deployment setup (Nginx, SSL, etc.)
- No frontend routing beyond a placeholder dashboard page

### Acceptance Criteria
- Given the developer clones the repo and installs dependencies,
  when they run `uvicorn app.main:app --reload`,
  then FastAPI starts on port 8000 with no errors.

- Given the backend is running,
  when they call `GET /api/v1/health`,
  then the response is HTTP 200 with a JSON body reporting status of
  database, FFmpeg, Ollama, and storage.

- Given the developer runs `npm run dev` in the frontend folder,
  when the browser opens `localhost:5173`,
  then the React app loads with no console errors.

- Given no `.env` file exists,
  when the backend starts,
  then it loads defaults from `config.py` and logs a warning without crashing.

- Given the backend starts for the first time,
  when SQLite does not yet exist,
  then `database.db` is created automatically with WAL mode enabled.

- Given the backend is running,
  when the frontend makes any API call,
  then CORS headers are present and the browser does not block the request.

- Given a developer sets `APP_PORT=9000` in `.env`,
  when the backend starts,
  then it listens on port 9000.

### Definition of Done
- [ ] FastAPI app starts cleanly with `--reload`
- [ ] React app starts cleanly with `npm run dev`
- [ ] `/api/v1/health` returns correct service statuses
- [ ] SQLite database created automatically on first run
- [ ] All config values sourced from `.env` (no hardcoded values)
- [ ] CORS tested — frontend can call backend without errors
- [ ] Folder structure matches the V1 plan (`plan/plan.md`)
- [ ] `requirements.txt` and `package.json` committed with pinned versions
- [ ] `README.md` documents setup steps for a fresh machine
- [ ] Code reviewed and approved before Story 2 begins

---
