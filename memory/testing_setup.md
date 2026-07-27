---
name: testing-setup
description: "Test infrastructure, conftest pattern, fixture catalogue, Stories 1–7 coverage (130 tests), and quality lessons"
metadata:
  node_type: memory
  type: project
  originSessionId: 0c3d0380-d2de-4ff0-945f-238c6c3b5845
---

## Test Stack

- `pytest==8.3.4` + `pytest-asyncio==0.24.0` + `httpx==0.28.0`
- Installed via `backend/requirements-test.txt`
- Python version in use: **3.9.12**
- FastAPI `TestClient` (from `httpx`) used for all API tests — no real HTTP server needed
- Run with: `.\.venv\Scripts\python.exe -m pytest tests/ -v`

## Test Location

```
backend/tests/
├── __init__.py              ← empty package marker
├── conftest.py              ← env override + session client + session cleanup + function db_session
├── test_health.py           ← 14 tests (Story 1)
├── test_videos.py           ← 39 tests (Stories 2+3)
├── test_transcription.py    ← 11 tests (Story 4)
├── test_subtitles.py        ← 23 tests (Story 5)
├── test_silence.py          ← 20 tests (Story 6) — 97.4% Strong
└── test_fillers.py          ← 23 tests (Story 7)
```

**Total: 130 tests passing**

---

## conftest.py Pattern (critical — read before touching)

```python
# Must be at module level, BEFORE any app import
# pydantic-settings reads env vars at instantiation — if app is imported first, it's too late
import os
os.environ.setdefault("DATABASE_URL", "sqlite:///./test_database.db")
os.environ.setdefault("STORAGE_DIR", "./test_storage")
os.environ.setdefault("LOG_FILE", "./logs/test_app.log")

from app.main import app

@pytest.fixture(scope="session")
def client() -> TestClient:
    with TestClient(app) as c:
        yield c

@pytest.fixture                          # function-scoped: use when a test needs direct DB reads
def db_session():
    from app.core.database import SessionLocal
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@pytest.fixture(scope="session", autouse=True)
def cleanup_test_artifacts():
    yield
    from app.core.database import engine
    engine.dispose()   # ← REQUIRED on Windows: SQLite file stays locked otherwise (WinError 32)
    for path in ("test_database.db", "test_storage"):
        try:
            ...remove...
        except OSError:
            pass
```

**Why `engine.dispose()` matters:** SQLAlchemy keeps the SQLite connection open across the session. On Windows, an open file handle blocks deletion (WinError 32).

**Why env vars before import:** `settings = Settings()` is a module-level singleton in `app/core/config.py`. Once `app.main` is imported anywhere, Settings() is already instantiated and env changes have no effect.

---

## Fixture Catalogue

| Fixture | Scope | Purpose |
|---|---|---|
| `client` | session | Shared `TestClient` for all tests; avoids recreating FastAPI app per test |
| `db_session` | function | Direct SQLAlchemy `Session` for DB-state assertions; `expire_all()` needed after client call |
| `cleanup_test_artifacts` | session / autouse | Removes `test_database.db` and `test_storage/` after the full test run |

---

## Story 1 — `test_health.py` (14 tests, 100% Strong)

4 classes: `TestHealthHappyPath`, `TestHealthResponseSchema`, `TestHealthErrorStates`, `TestHealthEdgeCases`

**Mock pattern:**
```python
MODULE = "app.api.v1.health"
with (
    patch(f"{MODULE}._check_database", return_value="ok"),
    patch(f"{MODULE}._check_ffmpeg",   return_value="ok"),
    patch(f"{MODULE}._check_ollama",   return_value="ok"),
    patch(f"{MODULE}._check_storage",  return_value="ok"),
):
    response = client.get("/api/v1/health")
```

---

## Stories 2+3 — `test_videos.py` (39 tests)

| Class | Methods | Coverage |
|---|---|---|
| `TestVideoUpload` | 17 | All upload paths: 5 formats, pdf/txt/exe/size validation, corrupt file |
| `TestVideoGet` | 5 | 200+content, metadata, 404, 404 message, non-UUID edge case |
| `TestVideoDelete` | 5 | 200+message, DB removal, disk removal, 404, double-delete |
| `TestVideoList` | 6 | content-type, schema (13 fields), ordering, deleted-item exclusion |
| `TestVideoStream` | 6 | 200+inline, MIME, exact bytes, 404 unknown, 404 file-missing-from-disk |

**Key patterns:**
```python
PROBE_MODULE = "app.services.ffmpeg.FFmpegService.probe"  # NOT app.services.video.FFmpegService.probe
def _upload(client, filename="test.mp4"):
    with patch(PROBE_MODULE, new_callable=AsyncMock, return_value=FAKE_PROBE_RESULT):
        resp = client.post("/api/v1/videos/upload", files={"file": (filename, io.BytesIO(FAKE_VIDEO_BYTES), mime)})
    return resp.json()

# Size limit: max_upload_size_bytes is a @property — use PropertyMock
with patch.object(type(settings), "max_upload_size_bytes", new_callable=PropertyMock, return_value=5):
    ...

# Inline disposition check (caught production bug)
assert "inline" in response.headers.get("content-disposition", "")
```

---

## Story 4 — `test_transcription.py` (11 tests)

| Class | Methods | Coverage |
|---|---|---|
| `TestTranscribeEndpoint` | 4 | POST 202, 404 unknown, 409 in-flight, DB status→processing |
| `TestTranscriptFetch` | 4 | GET 404 no transcript, 200 full schema, segments list, required fields |
| `TestTranscriptionErrorState` | 3 | Error status+message, empty segments default, error in list |

**Key patterns:**
```python
# Sync method called via to_thread — plain MagicMock (NOT AsyncMock)
with patch(SERVICE_RUN, new_callable=MagicMock, return_value=FAKE_RUN_RESULT):
    resp = client.post(f"/api/v1/videos/{video_id}/transcribe")

# 409 guard
from app.api.v1 import transcriptions
transcriptions._in_flight.add(video_id)
try:
    resp = client.post(...)
    assert resp.status_code == 409
finally:
    transcriptions._in_flight.discard(video_id)
```

---

## Story 5 — `test_subtitles.py` (23 tests)

| Class | Methods | Coverage |
|---|---|---|
| `TestSubtitleService` | 5 | Unit: to_srt(), to_vtt(), _format_ts(), empty segments, multi-segment |
| `TestSubtitleGenerate` | 8 | POST generate: happy path, 400 no transcript, 400 not completed, 404 unknown, overwrites |
| `TestSubtitleSrt` | 5 | GET /srt: 200 attachment, content-type, SRT format, 404 no subs, 404 unknown |
| `TestSubtitleVtt` | 5 | GET /vtt: 200, content-type text/vtt, VTT format, 404 no subs, 404 unknown |

```python
# SRT format validation
lines = resp.text.strip().splitlines()
assert lines[0] == "1"          # sequence number
assert " --> " in lines[1]      # timestamp line
assert lines[2] != ""           # text line

# VTT format validation
assert resp.text.startswith("WEBVTT")
```

---

## Story 6 — `test_silence.py` (20 tests, 97.4% Strong)

| Class | Methods | Coverage |
|---|---|---|
| `TestSilenceService` | 3 | Unit: parse_ffmpeg_output(), compute_non_silence_windows(), all-silence edge |
| `TestSilenceDetect` | 6 | POST detect: 200+segments, stores DB, 404+detail, ffmpeg error 500, overwrites, empty |
| `TestSilenceGet` | 5 | GET: stored, 404 never detected+detail, 404 unknown+detail, empty segments stored |
| `TestSilenceRemove` | 6 | POST remove: 400 no detection, 400 all-silence, 404+detail, happy path, 409 in-flight+detail |

```python
# Mock ffmpeg subprocess
with patch("app.services.silence.asyncio.create_subprocess_exec", new_callable=AsyncMock) as mock_proc:
    mock_proc.return_value.communicate = AsyncMock(return_value=(b"", FAKE_FFMPEG_OUTPUT))
    mock_proc.return_value.returncode = 0
    resp = client.post(f"/api/v1/videos/{video_id}/silence/detect")

# Mock remove — patch at API layer, NOT asyncio internals
with patch("app.api.v1.silence.SilenceService.remove", new_callable=AsyncMock, return_value=url):
    resp = client.post(f"/api/v1/videos/{video_id}/silence/remove")

# Detail assertion
assert "not found" in resp.json()["detail"].lower()
assert "detection" in resp.json()["detail"].lower()  # for "never detected" 404
```

**AsyncMock fix:** Always patch async service methods at the API layer (`app.api.v1.X.ServiceClass.method`), not by patching asyncio internals. Patching asyncio internals causes AttributeError.

---

## Story 7 — `test_fillers.py` (23 tests)

| Class | Methods | Coverage |
|---|---|---|
| `TestFillerService` | 7 | Unit: _normalise(), detect() mixed/clean, compute_non_filler_windows() typical/empty/all |
| `TestFillerDetect` | 7 | POST detect: 200+segments, stores DB, 400 no transcript, 400 not completed, 404+detail, overwrites, empty |
| `TestFillerGet` | 4 | GET: stored, 404 never detected+detail, 404 unknown+detail, empty segments |
| `TestFillerRemove` | 5 | POST remove: 400 no detection, 400 all-fillers, 404+detail, happy path AsyncMock, 409 in-flight |

```python
# Unit test FillerService.detect() directly
video_obj = db_session.query(Video).filter(Video.id == video["id"]).first()
result = FillerService.detect(video_obj, db_session)
assert len(result.segments) == 3
assert result.segments[0].word == "um"

# compute_non_filler_windows
windows = FillerService.compute_non_filler_windows(30.0, FAKE_FILLER_SEGMENTS)
assert windows[0] == (0.5, 3.0)   # gap between um and uh
assert windows == []               # all-filler edge case
```

---

## Quality Convention for All Story Tests

- **Class per endpoint group:** ensures negative-path coverage counted at class level
- **Target >96% Strong** per story file
- **Assertion depth for Strong:** status code + specific field value + type check (minimum)
- **Detail message assertions:** `assert "not found" in resp.json()["detail"].lower()` — tests error semantics, not just status code
- **All-silence / all-filler edge case:** always test the "entire content is X" boundary in remove tests
- **AsyncMock for async service methods:** patch at `app.api.v1.X.ServiceClass.method` — not at asyncio level
- **Module-level state cleanup:** `try/finally` for `_in_flight` mutations — restores state even on assertion failure
- **DB record count check after upsert:** `db_session.expire_all()` then `assert len(records) == 1`
- **`db_session.expire_all()`:** required after any client call before DB queries (flushes stale cache)
- **DB-insert-then-fetch:** for background-task results, insert via `db_session` then call GET endpoint — don't run real tasks
- **Orphan cleanup:** if a test inserts a DB record that won't be auto-cleaned, clean it manually at test end

---

## Python 3.9 Gotchas

| Problem | Bad | Good |
|---|---|---|
| SQLAlchemy Mapped nullable | `Mapped[float \| None]` | `Mapped[Optional[float]]` from typing |
| String enum | `class X(StrEnum)` | `class X(str, Enum)` — StrEnum added in 3.11 |
| `from __future__ import annotations` | Does NOT help SA 2.0 (`eval()` at class creation) | Use `Optional[X]` in all ORM model files |
