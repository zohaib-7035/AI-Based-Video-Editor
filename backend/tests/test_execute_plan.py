"""Tests for POST /api/v1/videos/{id}/execute-plan (Story 10)."""
from __future__ import annotations

import io
import json
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi.testclient import TestClient

# ── Helpers ──────────────────────────────────────────────────────────────────

PROBE_MODULE = "app.services.ffmpeg.FFmpegService.probe"
FAKE_VIDEO_BYTES = b"\x00\x01\x02\x03"
FAKE_PROBE_RESULT = {
    "duration": 30.0, "width": 1280, "height": 720,
    "fps": 30.0, "codec": "h264", "format": "mp4",
}

SILENCE_REMOVE = "app.services.execute_plan.SilenceService.remove"
FILLER_REMOVE  = "app.services.execute_plan.FillerService.remove"
SUBTITLE_GEN   = "app.services.execute_plan.SubtitleService.generate"

SILENCE_URL = "/api/v1/videos/test/silence/export/stream"
FILLER_URL  = "/api/v1/videos/test/fillers/export/stream"


def _upload(client: TestClient, filename: str = "test.mp4") -> dict:
    with patch(PROBE_MODULE, new_callable=AsyncMock, return_value=FAKE_PROBE_RESULT):
        resp = client.post(
            "/api/v1/videos/upload",
            files={"file": (filename, io.BytesIO(FAKE_VIDEO_BYTES), "video/mp4")},
        )
    assert resp.status_code == 200
    return resp.json()


def _parse_sse(text: str) -> list:
    events = []
    for line in text.splitlines():
        trimmed = line.strip()
        if trimmed.startswith("data:"):
            events.append(json.loads(trimmed[5:].strip()))
    return events


# ── TestExecutePlanEndpoint ───────────────────────────────────────────────────

class TestExecutePlanEndpoint:

    def test_returns_200_and_event_stream(self, client: TestClient) -> None:
        video = _upload(client)
        with (
            patch(SILENCE_REMOVE, new_callable=AsyncMock, return_value=SILENCE_URL),
        ):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "remove_silence"}]},
            )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")

    def test_cache_control_no_cache(self, client: TestClient) -> None:
        video = _upload(client)
        with patch(SILENCE_REMOVE, new_callable=AsyncMock, return_value=SILENCE_URL):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "remove_silence"}]},
            )
        assert resp.headers.get("cache-control") == "no-cache"

    def test_404_unknown_video(self, client: TestClient) -> None:
        resp = client.post(
            "/api/v1/videos/00000000-0000-0000-0000-000000000000/execute-plan",
            json={"commands": [{"action": "remove_silence"}]},
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_409_in_flight(self, client: TestClient) -> None:
        video = _upload(client)
        from app.api.v1 import execute_plan
        execute_plan._in_flight.add(video["id"])
        try:
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "remove_silence"}]},
            )
            assert resp.status_code == 409
            assert "already in progress" in resp.json()["detail"].lower()
        finally:
            execute_plan._in_flight.discard(video["id"])

    def test_422_empty_commands(self, client: TestClient) -> None:
        video = _upload(client)
        resp = client.post(
            f"/api/v1/videos/{video['id']}/execute-plan",
            json={"commands": []},
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert isinstance(detail, list) and len(detail) > 0
        assert any("commands" in str(e).lower() for e in detail)


# ── TestExecutePlanCommands ───────────────────────────────────────────────────

class TestExecutePlanCommands:

    def test_remove_silence_emits_progress_events(self, client: TestClient) -> None:
        video = _upload(client)
        with patch(SILENCE_REMOVE, new_callable=AsyncMock, return_value=SILENCE_URL):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "remove_silence"}]},
            )
        events = _parse_sse(resp.text)
        started = [e for e in events if e.get("type") == "progress" and e.get("status") == "started"]
        done = [e for e in events if e.get("type") == "progress" and e.get("status") == "done"]
        assert any(e["action"] == "remove_silence" for e in started)
        assert any(e["action"] == "remove_silence" for e in done)

    def test_remove_fillers_emits_progress_events(self, client: TestClient) -> None:
        video = _upload(client)
        with patch(FILLER_REMOVE, new_callable=AsyncMock, return_value=FILLER_URL):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "remove_fillers"}]},
            )
        events = _parse_sse(resp.text)
        assert any(e.get("action") == "remove_fillers" and e.get("status") == "done" for e in events)

    def test_generate_subtitles_emits_progress_events(self, client: TestClient) -> None:
        video = _upload(client)
        with patch(SUBTITLE_GEN, new_callable=MagicMock, return_value={"srt_url": "/srt", "vtt_url": "/vtt"}):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "generate_subtitles"}]},
            )
        events = _parse_sse(resp.text)
        assert any(e.get("action") == "generate_subtitles" and e.get("status") == "done" for e in events)

    def test_export_command_runs_encode_service(self, client: TestClient) -> None:
        video = _upload(client)

        async def _encode_ok(video, resolution, db):
            yield f"data: {json.dumps({'type': 'done', 'download_url': f'/api/v1/videos/{video.id}/export/download'})}\n\n"

        with (
            patch(SILENCE_REMOVE, new_callable=AsyncMock, return_value=SILENCE_URL),
            patch("app.services.execute_plan.ExportService.encode", new=_encode_ok),
        ):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [
                    {"action": "export"},
                    {"action": "remove_silence"},
                ]},
            )
        events = _parse_sse(resp.text)
        assert any(e.get("type") == "done" for e in events), "execute plan should complete after export"
        assert not any(e.get("type") == "error" for e in events), "no errors expected"

    def test_progress_events_have_correct_step_and_total_fields(self, client: TestClient) -> None:
        video = _upload(client)
        with (
            patch(SILENCE_REMOVE, new_callable=AsyncMock, return_value=SILENCE_URL),
            patch(FILLER_REMOVE, new_callable=AsyncMock, return_value=FILLER_URL),
        ):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [
                    {"action": "remove_silence"},
                    {"action": "remove_fillers"},
                ]},
            )
        events = _parse_sse(resp.text)
        progress = [e for e in events if e.get("type") == "progress"]
        assert all("step" in e and "total" in e for e in progress), "every progress event must carry step + total"
        assert all(e["total"] == 2 for e in progress), "total must equal command count"
        started_steps = [e["step"] for e in progress if e.get("status") == "started"]
        assert started_steps == [1, 2], "steps must be numbered sequentially starting at 1"

    def test_single_command_emits_terminal_done_event(self, client: TestClient) -> None:
        video = _upload(client)
        with patch(SILENCE_REMOVE, new_callable=AsyncMock, return_value=SILENCE_URL):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "remove_silence"}]},
            )
        events = _parse_sse(resp.text)
        done_events = [e for e in events if e.get("type") == "done"]
        assert len(done_events) == 1
        assert "executed_plan_path" in done_events[0]

    def test_multiple_commands_execute_in_order(self, client: TestClient) -> None:
        video = _upload(client)
        call_order = []

        async def mock_silence(*_a, **_kw):
            call_order.append("remove_silence")
            return SILENCE_URL

        async def mock_fillers(*_a, **_kw):
            call_order.append("remove_fillers")
            return FILLER_URL

        with (
            patch(SILENCE_REMOVE, side_effect=mock_silence),
            patch(FILLER_REMOVE, side_effect=mock_fillers),
        ):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [
                    {"action": "remove_silence"},
                    {"action": "remove_fillers"},
                ]},
            )
        assert resp.status_code == 200
        assert call_order == ["remove_silence", "remove_fillers"]


# ── TestExecutePlanErrors ─────────────────────────────────────────────────────

class TestExecutePlanErrors:

    def test_silence_failure_emits_error_and_halts(self, client: TestClient) -> None:
        from fastapi import HTTPException
        video = _upload(client)
        with (
            patch(SILENCE_REMOVE, new_callable=AsyncMock,
                  side_effect=HTTPException(status_code=400, detail="No silence detection found.")),
            patch(FILLER_REMOVE, new_callable=AsyncMock, return_value=FILLER_URL),
        ):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [
                    {"action": "remove_silence"},
                    {"action": "remove_fillers"},
                ]},
            )
        events = _parse_sse(resp.text)
        error_events = [e for e in events if e.get("type") == "error"]
        assert len(error_events) == 1
        assert error_events[0]["action"] == "remove_silence"
        assert "no silence detection" in error_events[0]["detail"].lower()
        assert not any(e.get("type") == "done" for e in events), "execution must halt after error"

    def test_filler_failure_emits_error_and_halts(self, client: TestClient) -> None:
        from fastapi import HTTPException
        video = _upload(client)
        with patch(FILLER_REMOVE, new_callable=AsyncMock,
                   side_effect=HTTPException(status_code=400, detail="No filler detection found.")):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "remove_fillers"}]},
            )
        events = _parse_sse(resp.text)
        assert any(e.get("type") == "error" and e.get("action") == "remove_fillers" for e in events)
        assert not any(e.get("type") == "done" for e in events)

    def test_subtitle_failure_emits_error_and_halts(self, client: TestClient) -> None:
        from fastapi import HTTPException
        video = _upload(client)
        with patch(SUBTITLE_GEN, side_effect=HTTPException(status_code=400, detail="No completed transcript found.")):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "generate_subtitles"}]},
            )
        events = _parse_sse(resp.text)
        assert any(e.get("type") == "error" and e.get("action") == "generate_subtitles" for e in events)
        assert not any(e.get("type") == "done" for e in events)

    def test_subtitle_already_generated_emits_warning_not_error(self, client: TestClient) -> None:
        from fastapi import HTTPException
        video = _upload(client)
        with patch(SUBTITLE_GEN,
                   side_effect=HTTPException(status_code=409, detail="Subtitles already generated.")):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "generate_subtitles"}]},
            )
        events = _parse_sse(resp.text)
        assert any(e.get("type") == "warning" and e.get("action") == "generate_subtitles" for e in events)
        assert any(e.get("type") == "done" for e in events), "409 must be a warning, not a halt"

    def test_executed_plan_path_in_done_event_on_success(self, client: TestClient) -> None:
        # The done event is emitted AFTER db.commit(), so its presence proves persistence.
        video = _upload(client)
        with patch(SILENCE_REMOVE, new_callable=AsyncMock, return_value=SILENCE_URL):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "remove_silence"}]},
            )
        events = _parse_sse(resp.text)
        done_events = [e for e in events if e.get("type") == "done"]
        assert len(done_events) == 1
        assert done_events[0]["executed_plan_path"] == SILENCE_URL
        assert not any(e.get("type") == "error" for e in events)


# ── TestExecutePlanSchemas ────────────────────────────────────────────────────

class TestExecutePlanSchemas:

    def test_valid_request_passes_validation(self) -> None:
        from app.schemas.execute_plan import ExecutePlanRequest
        req = ExecutePlanRequest(commands=[{"action": "remove_silence"}])
        assert len(req.commands) == 1
        assert req.commands[0].action == "remove_silence"

    def test_empty_commands_fails_validation(self) -> None:
        from pydantic import ValidationError
        from app.schemas.execute_plan import ExecutePlanRequest
        with pytest.raises(ValidationError):
            ExecutePlanRequest(commands=[])

    def test_generate_subtitles_is_valid_action(self) -> None:
        from app.schemas.execute_plan import ExecutePlanRequest
        req = ExecutePlanRequest(commands=[{"action": "generate_subtitles"}])
        assert req.commands[0].action == "generate_subtitles"

    def test_generate_subtitles_in_known_actions(self) -> None:
        from app.services.assistant import KNOWN_ACTIONS
        assert "generate_subtitles" in KNOWN_ACTIONS
