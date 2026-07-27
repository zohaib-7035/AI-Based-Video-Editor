import io
import json
from unittest.mock import AsyncMock, patch

import pytest

FAKE_VIDEO_BYTES = b"\x00" * 100
FAKE_PROBE_RESULT = {
    "duration": 10.0,
    "width": 1920,
    "height": 1080,
    "fps": 30.0,
    "codec": "h264",
    "format": "mp4",
}
PROBE_MODULE = "app.services.ffmpeg.FFmpegService.probe"
GENERATE_MODULE = "app.api.v1.assistant.AssistantService.generate_stream"


def _upload(client, filename="test.mp4"):
    with patch(PROBE_MODULE, new_callable=AsyncMock, return_value=FAKE_PROBE_RESULT):
        resp = client.post(
            "/api/v1/videos/upload",
            files={"file": (filename, io.BytesIO(FAKE_VIDEO_BYTES), "video/mp4")},
        )
    assert resp.status_code == 200
    return resp.json()


def _parse_sse_events(text: str) -> list:
    events = []
    for line in text.splitlines():
        line = line.strip()
        if not line.startswith("data:"):
            continue
        json_str = line[5:].strip()
        if not json_str:
            continue
        try:
            events.append(json.loads(json_str))
        except json.JSONDecodeError:
            pass
    return events


async def _stream_valid(*args, **kwargs):
    yield f'data: {json.dumps({"type": "delta", "content": "{"})}\n\n'
    yield (
        f'data: {json.dumps({"type": "plan", "commands": [{"action": "remove_silence", "params": None}], "warnings": []})}\n\n'
    )


async def _stream_error_json(*args, **kwargs):
    yield (
        f'data: {json.dumps({"type": "error", "message": "AI response was not valid JSON. Please rephrase your prompt."})}\n\n'
    )


async def _stream_with_warnings(*args, **kwargs):
    yield (
        f'data: {json.dumps({"type": "plan", "commands": [{"action": "remove_fillers", "params": None}], "warnings": ["fly_through_edit"]})}\n\n'
    )


async def _stream_ollama_down(*args, **kwargs):
    yield (
        f'data: {json.dumps({"type": "error", "message": "AI service unavailable — is Ollama running?"})}\n\n'
    )


async def _stream_multi_command(*args, **kwargs):
    yield (
        f'data: {json.dumps({"type": "plan", "commands": [{"action": "remove_silence", "params": None}, {"action": "remove_fillers", "params": None}, {"action": "export", "params": {"format": "mp4", "resolution": "720p"}}], "warnings": []})}\n\n'
    )


class TestAssistantPlan:

    def test_plan_unknown_video_returns_404(self, client):
        resp = client.post(
            "/api/v1/videos/00000000-0000-0000-0000-000000000000/assistant/plan",
            json={"prompt": "remove all silences"},
        )
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_plan_409_when_in_flight(self, client):
        from app.api.v1 import assistant

        video = _upload(client)
        video_id = video["id"]
        assistant._in_flight.add(video_id)
        try:
            resp = client.post(
                f"/api/v1/videos/{video_id}/assistant/plan",
                json={"prompt": "remove all silences"},
            )
            assert resp.status_code == 409
            assert "in progress" in resp.json()["detail"].lower()
        finally:
            assistant._in_flight.discard(video_id)

    def test_plan_returns_event_stream_content_type(self, client):
        video = _upload(client)
        with patch(GENERATE_MODULE, new=_stream_valid):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/assistant/plan",
                json={"prompt": "remove all silences"},
            )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers["content-type"]
        assert resp.headers.get("cache-control") == "no-cache"

    def test_plan_valid_stream_emits_delta_then_plan_event(self, client):
        video = _upload(client)
        with patch(GENERATE_MODULE, new=_stream_valid):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/assistant/plan",
                json={"prompt": "remove all silences"},
            )
        events = _parse_sse_events(resp.text)
        assert len(events) == 2

        assert events[0]["type"] == "delta"
        assert "content" in events[0]

        assert events[1]["type"] == "plan"
        assert len(events[1]["commands"]) == 1
        assert events[1]["commands"][0]["action"] == "remove_silence"
        assert events[1]["warnings"] == []

    def test_plan_malformed_json_yields_error_event(self, client):
        video = _upload(client)
        with patch(GENERATE_MODULE, new=_stream_error_json):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/assistant/plan",
                json={"prompt": "do something weird"},
            )
        events = _parse_sse_events(resp.text)
        assert len(events) == 1
        assert events[0]["type"] == "error"
        assert "json" in events[0]["message"].lower() or "rephrase" in events[0]["message"].lower()

    def test_plan_unknown_action_appears_in_warnings(self, client):
        video = _upload(client)
        with patch(GENERATE_MODULE, new=_stream_with_warnings):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/assistant/plan",
                json={"prompt": "use a fly-through edit"},
            )
        events = _parse_sse_events(resp.text)
        plan_event = next(e for e in events if e["type"] == "plan")
        assert "fly_through_edit" in plan_event["warnings"]
        assert any(c["action"] == "remove_fillers" for c in plan_event["commands"])

    def test_plan_ollama_offline_yields_error_event(self, client):
        video = _upload(client)
        with patch(GENERATE_MODULE, new=_stream_ollama_down):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/assistant/plan",
                json={"prompt": "remove all silences"},
            )
        events = _parse_sse_events(resp.text)
        assert len(events) == 1
        assert events[0]["type"] == "error"
        msg = events[0]["message"].lower()
        assert "ollama" in msg or "unavailable" in msg or "ai service" in msg

    def test_plan_multi_command_order_preserved(self, client):
        video = _upload(client)
        with patch(GENERATE_MODULE, new=_stream_multi_command):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/assistant/plan",
                json={"prompt": "remove silences and fillers then export at 720p"},
            )
        events = _parse_sse_events(resp.text)
        plan_event = next(e for e in events if e["type"] == "plan")
        actions = [c["action"] for c in plan_event["commands"]]
        assert actions == ["remove_silence", "remove_fillers", "export"]
        export_cmd = plan_event["commands"][2]
        assert export_cmd["params"]["resolution"] == "720p"

    def test_plan_400_on_empty_prompt(self, client):
        video = _upload(client)
        resp = client.post(
            f"/api/v1/videos/{video['id']}/assistant/plan",
            json={"prompt": ""},
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert isinstance(detail, list) and len(detail) > 0
        assert any("prompt" in str(e).lower() for e in detail)

    def test_plan_400_on_prompt_over_500_chars(self, client):
        video = _upload(client)
        resp = client.post(
            f"/api/v1/videos/{video['id']}/assistant/plan",
            json={"prompt": "x" * 501},
        )
        assert resp.status_code == 422
        detail = resp.json()["detail"]
        assert isinstance(detail, list) and len(detail) > 0
        assert any("prompt" in str(e).lower() for e in detail)


class TestAssistantSchemas:

    def test_editing_command_drops_extra_fields(self):
        from app.schemas.assistant import EditingCommand

        cmd = EditingCommand.model_validate(
            {"action": "remove_silence", "unknown_field": "should_be_ignored"}
        )
        assert cmd.action == "remove_silence"
        assert not hasattr(cmd, "unknown_field")

    def test_editing_command_accepts_all_valid_actions(self):
        from app.schemas.assistant import EditingCommand

        for action in ("remove_silence", "remove_fillers", "export"):
            cmd = EditingCommand(action=action)  # type: ignore[arg-type]
            assert cmd.action == action

    def test_editing_command_rejects_unknown_action(self):
        from pydantic import ValidationError

        from app.schemas.assistant import EditingCommand

        with pytest.raises(ValidationError):
            EditingCommand(action="fly_through_edit")  # type: ignore[arg-type]

    def test_plan_request_rejects_empty_prompt(self):
        from pydantic import ValidationError

        from app.schemas.assistant import PlanRequest

        with pytest.raises(ValidationError):
            PlanRequest(prompt="")

    def test_plan_request_rejects_prompt_over_500_chars(self):
        from pydantic import ValidationError

        from app.schemas.assistant import PlanRequest

        with pytest.raises(ValidationError):
            PlanRequest(prompt="x" * 501)

    def test_plan_request_accepts_valid_prompt(self):
        from app.schemas.assistant import PlanRequest

        req = PlanRequest(prompt="remove all silences and filler words")
        assert req.prompt == "remove all silences and filler words"

    def test_editing_plan_defaults_to_empty_lists(self):
        from app.schemas.assistant import EditingPlan

        plan = EditingPlan()
        assert plan.commands == []
        assert plan.warnings == []
