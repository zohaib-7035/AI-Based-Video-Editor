import io
import json
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.silence import SilenceDetection
from app.models.transcript import Transcript, TranscriptStatus
from app.models.video import Video, VideoStatus
from app.services.silence import SilenceService

PROBE_MODULE = "app.services.ffmpeg.FFmpegService.probe"
DETECT_MODULE = "app.services.ffmpeg.FFmpegService.detect_silence"
CONCAT_MODULE = "app.services.ffmpeg.FFmpegService.concat_segments"

FAKE_PROBE = {
    "duration": 30.0,
    "width": 1920,
    "height": 1080,
    "fps": 30.0,
    "codec": "h264",
    "format": "mp4",
}
FAKE_VIDEO_BYTES = b"\x00" * 1024

FAKE_SEGMENTS = [
    {"start": 2.0, "end": 5.0, "duration": 3.0},
    {"start": 10.0, "end": 12.5, "duration": 2.5},
]


def _upload(client: TestClient, filename: str = "test.mp4") -> dict:
    with patch(PROBE_MODULE, new_callable=AsyncMock, return_value=FAKE_PROBE):
        resp = client.post(
            "/api/v1/videos/upload",
            files={"file": (filename, io.BytesIO(FAKE_VIDEO_BYTES), "video/mp4")},
        )
    assert resp.status_code == 200
    return resp.json()


def _insert_silence(
    db: Session,
    video_id: str,
    segments: list = None,
) -> SilenceDetection:
    if segments is None:
        segments = FAKE_SEGMENTS
    record = SilenceDetection(
        id=str(uuid.uuid4()),
        video_id=video_id,
        segments=json.dumps(segments),
        detected_at=datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    return record


class TestSilenceService:
    def test_compute_non_silent_windows_typical(self):
        windows = SilenceService.compute_non_silent_windows(30.0, FAKE_SEGMENTS)
        assert len(windows) == 3
        assert windows[0] == (0.0, 2.0)
        assert windows[1] == (5.0, 10.0)
        assert windows[2] == (12.5, 30.0)

    def test_compute_non_silent_windows_all_silence(self):
        segments = [{"start": 0.0, "end": 30.0, "duration": 30.0}]
        windows = SilenceService.compute_non_silent_windows(30.0, segments)
        assert windows == []

    def test_compute_non_silent_windows_no_silence(self):
        windows = SilenceService.compute_non_silent_windows(30.0, [])
        assert windows == [(0.0, 30.0)]

    def test_compute_non_silent_windows_silence_at_start(self):
        segments = [{"start": 0.0, "end": 3.0, "duration": 3.0}]
        windows = SilenceService.compute_non_silent_windows(10.0, segments)
        assert windows == [(3.0, 10.0)]

    def test_compute_non_silent_windows_silence_at_end(self):
        segments = [{"start": 8.0, "end": 10.0, "duration": 2.0}]
        windows = SilenceService.compute_non_silent_windows(10.0, segments)
        assert windows == [(0.0, 8.0)]

    def test_compute_non_silent_windows_adjacent_silence(self):
        segments = [
            {"start": 1.0, "end": 3.0, "duration": 2.0},
            {"start": 3.0, "end": 5.0, "duration": 2.0},
        ]
        windows = SilenceService.compute_non_silent_windows(10.0, segments)
        assert windows[0] == (0.0, 1.0)
        assert windows[-1] == (5.0, 10.0)


class TestSilenceDetect:
    def test_detect_happy_path_returns_200_with_segments(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        with patch(DETECT_MODULE, new_callable=AsyncMock, return_value=FAKE_SEGMENTS):
            resp = client.post(f"/api/v1/videos/{video['id']}/silence/detect")

        assert resp.status_code == 200
        data = resp.json()
        assert data["video_id"] == video["id"]
        assert len(data["segments"]) == 2
        assert data["segments"][0]["start"] == 2.0
        assert data["segments"][0]["end"] == 5.0
        assert data["segments"][0]["duration"] == 3.0

    def test_detect_stores_segments_in_db(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        with patch(DETECT_MODULE, new_callable=AsyncMock, return_value=FAKE_SEGMENTS):
            client.post(f"/api/v1/videos/{video['id']}/silence/detect")

        db_session.expire_all()
        record = db_session.query(SilenceDetection).filter(
            SilenceDetection.video_id == video["id"]
        ).first()
        assert record is not None
        stored = json.loads(record.segments)
        assert len(stored) == 2

    def test_detect_returns_404_for_unknown_video(self, client: TestClient):
        resp = client.post(f"/api/v1/videos/{uuid.uuid4()}/silence/detect")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_detect_overwrites_previous_record(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_silence(db_session, video["id"], [{"start": 0.0, "end": 1.0, "duration": 1.0}])

        new_segments = [{"start": 5.0, "end": 8.0, "duration": 3.0}]
        with patch(DETECT_MODULE, new_callable=AsyncMock, return_value=new_segments):
            resp = client.post(f"/api/v1/videos/{video['id']}/silence/detect")

        assert resp.status_code == 200
        data = resp.json()
        assert len(data["segments"]) == 1
        assert data["segments"][0]["start"] == 5.0

        db_session.expire_all()
        records = db_session.query(SilenceDetection).filter(
            SilenceDetection.video_id == video["id"]
        ).all()
        assert len(records) == 1

    def test_detect_empty_video_returns_200_with_empty_list(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        with patch(DETECT_MODULE, new_callable=AsyncMock, return_value=[]):
            resp = client.post(f"/api/v1/videos/{video['id']}/silence/detect")

        assert resp.status_code == 200
        assert resp.json()["segments"] == []


class TestSilenceGet:
    def test_get_returns_stored_detection(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_silence(db_session, video["id"])

        resp = client.get(f"/api/v1/videos/{video['id']}/silence")
        assert resp.status_code == 200
        data = resp.json()
        assert data["video_id"] == video["id"]
        assert len(data["segments"]) == 2

    def test_get_returns_404_when_never_detected(self, client: TestClient):
        video = _upload(client)
        resp = client.get(f"/api/v1/videos/{video['id']}/silence")
        assert resp.status_code == 404
        assert "detection" in resp.json()["detail"].lower()

    def test_get_returns_404_for_unknown_video(self, client: TestClient):
        resp = client.get(f"/api/v1/videos/{uuid.uuid4()}/silence")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_get_returns_stored_detection_with_empty_segments(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_silence(db_session, video["id"], segments=[])

        resp = client.get(f"/api/v1/videos/{video['id']}/silence")
        assert resp.status_code == 200
        data = resp.json()
        assert data["video_id"] == video["id"]
        assert data["segments"] == []


class TestSilenceRemove:
    def test_remove_returns_400_when_no_detection_stored(
        self, client: TestClient
    ):
        video = _upload(client)
        resp = client.post(f"/api/v1/videos/{video['id']}/silence/remove")
        assert resp.status_code == 400
        assert "detection" in resp.json()["detail"].lower()

    def test_remove_returns_400_when_all_silence(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_silence(
            db_session, video["id"],
            [{"start": 0.0, "end": 30.0, "duration": 30.0}],
        )
        resp = client.post(f"/api/v1/videos/{video['id']}/silence/remove")
        assert resp.status_code == 400
        assert "silent" in resp.json()["detail"].lower()

    def test_remove_returns_404_for_unknown_video(self, client: TestClient):
        resp = client.post(f"/api/v1/videos/{uuid.uuid4()}/silence/remove")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_remove_happy_path_returns_export_url(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_silence(db_session, video["id"])

        expected_url = f"/api/v1/videos/{video['id']}/silence/export/stream"
        with patch(
            "app.api.v1.silence.SilenceService.remove",
            new_callable=AsyncMock,
            return_value=expected_url,
        ):
            resp = client.post(f"/api/v1/videos/{video['id']}/silence/remove")

        assert resp.status_code == 200
        data = resp.json()
        assert "export_url" in data
        assert video["id"] in data["export_url"]

    def test_remove_returns_409_when_in_flight(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_silence(db_session, video["id"])

        from app.api.v1 import silence as silence_module
        silence_module._in_flight.add(video["id"])
        try:
            resp = client.post(f"/api/v1/videos/{video['id']}/silence/remove")
            assert resp.status_code == 409
            assert "in progress" in resp.json()["detail"].lower()
        finally:
            silence_module._in_flight.discard(video["id"])
