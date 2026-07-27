import io
import json
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest

ENCODE_SERVICE = "app.api.v1.export.ExportService.encode"
ENCODE_IN_PLAN = "app.services.execute_plan.ExportService.encode"
PROBE_MODULE = "app.services.ffmpeg.FFmpegService.probe"

FAKE_VIDEO_BYTES = b"\x00\x01\x02\x03" * 256
FAKE_PROBE_RESULT = {
    "duration": 10.0,
    "width": 1920,
    "height": 1080,
    "fps": 30.0,
    "codec": "h264",
    "format": "mp4",
}


def _upload(client, filename="test.mp4"):
    with patch(PROBE_MODULE, new_callable=AsyncMock, return_value=FAKE_PROBE_RESULT):
        resp = client.post(
            "/api/v1/videos/upload",
            files={"file": (filename, io.BytesIO(FAKE_VIDEO_BYTES), "video/mp4")},
        )
    return resp.json()


def _parse_sse(text: str) -> list:
    events = []
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith("data:"):
            try:
                events.append(json.loads(stripped[5:].strip()))
            except json.JSONDecodeError:
                pass
    return events


async def _encode_ok(video, resolution, db):
    yield f"data: {json.dumps({'type': 'progress', 'percent': 50})}\n\n"
    download_url = f"/api/v1/videos/{video.id}/export/download"
    yield f"data: {json.dumps({'type': 'done', 'download_url': download_url})}\n\n"


async def _encode_fail(video, resolution, db):
    yield f"data: {json.dumps({'type': 'progress', 'percent': 10})}\n\n"
    raise ValueError("ffmpeg encode failed: codec error")


# ── Service unit tests ────────────────────────────────────────────────────────

class TestExportService:

    def test_resolution_scale_720p(self):
        from app.services.export import _RESOLUTION_SCALE
        assert _RESOLUTION_SCALE["720p"] == "scale=-2:720"

    def test_resolution_scale_1080p(self):
        from app.services.export import _RESOLUTION_SCALE
        assert _RESOLUTION_SCALE["1080p"] == "scale=-2:1080"

    def test_source_priority_executed_plan_path_wins(self, client, db_session):
        from app.models.video import Video

        video = _upload(client)
        db_session.expire_all()
        vid_obj = db_session.query(Video).filter(Video.id == video["id"]).first()

        vid_obj.executed_plan_path = "/plan.mp4"
        vid_obj.filler_export_path = "/filler.mp4"
        vid_obj.export_path = "/silence.mp4"
        db_session.commit()
        db_session.expire_all()

        fresh = db_session.query(Video).filter(Video.id == video["id"]).first()
        source = (
            fresh.executed_plan_path
            or fresh.filler_export_path
            or fresh.export_path
            or fresh.filepath
        )
        assert source == "/plan.mp4"

    def test_source_priority_filler_export_path_second(self, client, db_session):
        from app.models.video import Video

        video = _upload(client)
        db_session.expire_all()
        vid_obj = db_session.query(Video).filter(Video.id == video["id"]).first()

        vid_obj.executed_plan_path = None
        vid_obj.filler_export_path = "/filler.mp4"
        vid_obj.export_path = "/silence.mp4"
        db_session.commit()
        db_session.expire_all()

        fresh = db_session.query(Video).filter(Video.id == video["id"]).first()
        source = (
            fresh.executed_plan_path
            or fresh.filler_export_path
            or fresh.export_path
            or fresh.filepath
        )
        assert source == "/filler.mp4"

    def test_source_priority_falls_back_to_filepath(self, client, db_session):
        from app.models.video import Video

        video = _upload(client)
        db_session.expire_all()
        vid_obj = db_session.query(Video).filter(Video.id == video["id"]).first()

        source = (
            vid_obj.executed_plan_path
            or vid_obj.filler_export_path
            or vid_obj.export_path
            or vid_obj.filepath
        )
        assert source == vid_obj.filepath
        assert source is not None

    def test_sse_helper_format(self):
        from app.services.export import _sse
        result = _sse({"type": "progress", "percent": 42})
        assert result.startswith("data:")
        payload = json.loads(result.replace("data:", "", 1).strip())
        assert payload["percent"] == 42

    def test_sse_done_format(self):
        from app.services.export import _sse
        result = _sse({"type": "done", "download_url": "/api/v1/videos/abc/export/download"})
        payload = json.loads(result.replace("data:", "", 1).strip())
        assert payload["type"] == "done"
        assert "download_url" in payload


# ── Export endpoint tests ─────────────────────────────────────────────────────

class TestExportEndpoint:

    def test_export_streams_progress_and_done(self, client):
        video = _upload(client)
        with patch(ENCODE_SERVICE, new=_encode_ok):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/export",
                json={"resolution": "720p"},
            )
        assert resp.status_code == 200
        events = _parse_sse(resp.text)
        assert any(e.get("type") == "progress" for e in events)
        assert any(e.get("type") == "done" for e in events)

    def test_export_done_event_has_download_url(self, client):
        video = _upload(client)
        with patch(ENCODE_SERVICE, new=_encode_ok):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/export",
                json={"resolution": "1080p"},
            )
        events = _parse_sse(resp.text)
        done = [e for e in events if e.get("type") == "done"]
        assert len(done) == 1
        assert "download_url" in done[0]
        assert done[0]["download_url"] != ""

    def test_export_content_type_is_event_stream(self, client):
        video = _upload(client)
        with patch(ENCODE_SERVICE, new=_encode_ok):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/export",
                json={"resolution": "720p"},
            )
        assert "text/event-stream" in resp.headers.get("content-type", "")

    def test_export_progress_has_percent_field(self, client):
        video = _upload(client)
        with patch(ENCODE_SERVICE, new=_encode_ok):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/export",
                json={"resolution": "720p"},
            )
        events = _parse_sse(resp.text)
        progress = [e for e in events if e.get("type") == "progress"]
        assert len(progress) >= 1
        assert "percent" in progress[0]
        assert isinstance(progress[0]["percent"], int)

    def test_export_404_unknown_video(self, client):
        resp = client.post(
            "/api/v1/videos/00000000-0000-0000-0000-000000000000/export",
            json={"resolution": "720p"},
        )
        assert resp.status_code == 404

    def test_export_404_detail_message(self, client):
        resp = client.post(
            "/api/v1/videos/00000000-0000-0000-0000-000000000000/export",
            json={"resolution": "720p"},
        )
        assert "detail" in resp.json()
        assert resp.json()["detail"] != ""

    def test_export_409_in_flight(self, client):
        video = _upload(client)
        from app.api.v1 import export as export_module
        export_module._in_flight.add(video["id"])
        try:
            resp = client.post(
                f"/api/v1/videos/{video['id']}/export",
                json={"resolution": "720p"},
            )
            assert resp.status_code == 409
            assert "export" in resp.json()["detail"].lower()
        finally:
            export_module._in_flight.discard(video["id"])

    def test_export_422_invalid_resolution(self, client):
        video = _upload(client)
        resp = client.post(
            f"/api/v1/videos/{video['id']}/export",
            json={"resolution": "4k"},
        )
        assert resp.status_code == 422

    def test_export_422_missing_resolution(self, client):
        video = _upload(client)
        resp = client.post(
            f"/api/v1/videos/{video['id']}/export",
            json={},
        )
        assert resp.status_code == 422

    def test_export_error_event_on_encode_failure(self, client):
        video = _upload(client)
        with patch(ENCODE_SERVICE, new=_encode_fail):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/export",
                json={"resolution": "720p"},
            )
        assert resp.status_code == 200
        events = _parse_sse(resp.text)
        assert any(e.get("type") == "error" for e in events)

    def test_export_error_event_has_message(self, client):
        video = _upload(client)
        with patch(ENCODE_SERVICE, new=_encode_fail):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/export",
                json={"resolution": "720p"},
            )
        events = _parse_sse(resp.text)
        errors = [e for e in events if e.get("type") == "error"]
        assert len(errors) == 1
        assert "message" in errors[0]
        assert errors[0]["message"] != ""

    def test_export_in_flight_guard_released_after_completion(self, client):
        video = _upload(client)
        from app.api.v1 import export as export_module
        with patch(ENCODE_SERVICE, new=_encode_ok):
            client.post(
                f"/api/v1/videos/{video['id']}/export",
                json={"resolution": "720p"},
            )
        assert video["id"] not in export_module._in_flight

    def test_export_cache_control_header(self, client):
        video = _upload(client)
        with patch(ENCODE_SERVICE, new=_encode_ok):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/export",
                json={"resolution": "720p"},
            )
        assert resp.headers.get("cache-control") == "no-cache"


# ── Download endpoint tests ───────────────────────────────────────────────────

class TestExportDownload:

    def _set_encode_path(self, db_session, video_id: str, path: str) -> None:
        from app.models.video import Video
        vid = db_session.query(Video).filter(Video.id == video_id).first()
        vid.encode_export_path = path
        db_session.commit()

    def test_download_200_attachment_disposition(self, client, db_session, tmp_path):
        video = _upload(client)
        fake_file = tmp_path / "encoded.mp4"
        fake_file.write_bytes(b"\x00" * 100)
        self._set_encode_path(db_session, video["id"], str(fake_file))

        resp = client.get(f"/api/v1/videos/{video['id']}/export/download")
        assert resp.status_code == 200
        assert "attachment" in resp.headers.get("content-disposition", "")

    def test_download_filename_has_export_suffix(self, client, db_session, tmp_path):
        video = _upload(client)
        fake_file = tmp_path / "encoded.mp4"
        fake_file.write_bytes(b"\x00" * 100)
        self._set_encode_path(db_session, video["id"], str(fake_file))

        resp = client.get(f"/api/v1/videos/{video['id']}/export/download")
        assert "_export" in resp.headers.get("content-disposition", "")

    def test_download_content_type_mp4(self, client, db_session, tmp_path):
        video = _upload(client)
        fake_file = tmp_path / "encoded.mp4"
        fake_file.write_bytes(b"\x00" * 100)
        self._set_encode_path(db_session, video["id"], str(fake_file))

        resp = client.get(f"/api/v1/videos/{video['id']}/export/download")
        assert "video/mp4" in resp.headers.get("content-type", "")

    def test_download_404_no_encode_yet(self, client):
        video = _upload(client)
        resp = client.get(f"/api/v1/videos/{video['id']}/export/download")
        assert resp.status_code == 404
        assert "export" in resp.json()["detail"].lower()

    def test_download_404_unknown_video(self, client):
        resp = client.get(
            "/api/v1/videos/00000000-0000-0000-0000-000000000000/export/download"
        )
        assert resp.status_code == 404

    def test_download_404_file_missing_from_disk(self, client, db_session):
        video = _upload(client)
        self._set_encode_path(db_session, video["id"], "/nonexistent/encoded.mp4")

        resp = client.get(f"/api/v1/videos/{video['id']}/export/download")
        assert resp.status_code == 404


# ── Execute-plan integration tests ────────────────────────────────────────────

class TestExportExecutePlan:

    def test_export_action_with_resolution_param(self, client):
        video = _upload(client)
        received = {}

        async def _capture_encode(video, resolution, db):
            received["resolution"] = resolution
            yield f"data: {json.dumps({'type': 'done', 'download_url': '/dl'})}\n\n"

        with patch(ENCODE_IN_PLAN, new=_capture_encode):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "export", "params": {"resolution": "720p"}}]},
            )
        assert resp.status_code == 200
        assert received.get("resolution") == "720p"

    def test_export_action_without_params_defaults_to_1080p(self, client):
        video = _upload(client)
        received = {}

        async def _capture_encode(video, resolution, db):
            received["resolution"] = resolution
            yield f"data: {json.dumps({'type': 'done', 'download_url': '/dl'})}\n\n"

        with patch(ENCODE_IN_PLAN, new=_capture_encode):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "export"}]},
            )
        assert resp.status_code == 200
        assert received.get("resolution") == "1080p"

    def test_export_action_completes_execute_plan_done_event(self, client):
        video = _upload(client)

        async def _encode_plan(video, resolution, db):
            yield f"data: {json.dumps({'type': 'done', 'download_url': f'/api/v1/videos/{video.id}/export/download'})}\n\n"

        with patch(ENCODE_IN_PLAN, new=_encode_plan):
            resp = client.post(
                f"/api/v1/videos/{video['id']}/execute-plan",
                json={"commands": [{"action": "export", "params": {"resolution": "1080p"}}]},
            )
        events = _parse_sse(resp.text)
        done_events = [e for e in events if e.get("type") == "done"]
        assert len(done_events) == 1
        assert "executed_plan_path" in done_events[0]
        assert "export/download" in done_events[0]["executed_plan_path"]
