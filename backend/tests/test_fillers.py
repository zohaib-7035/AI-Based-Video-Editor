import io
import json
import uuid
from datetime import datetime
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.filler import FillerDetection
from app.models.transcript import Transcript, TranscriptStatus
from app.models.video import Video, VideoStatus
from app.services.filler import FillerService, _normalise

PROBE_MODULE = "app.services.ffmpeg.FFmpegService.probe"
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

FAKE_TRANSCRIPT_SEGMENTS = [
    {"start": 0.0, "end": 0.5, "text": "um"},
    {"start": 0.5, "end": 3.0, "text": "Hello everyone"},
    {"start": 3.0, "end": 3.4, "text": "uh"},
    {"start": 3.4, "end": 6.0, "text": "welcome to the talk"},
    {"start": 6.0, "end": 6.3, "text": "hmm"},
]

FAKE_FILLER_SEGMENTS = [
    {"word": "um", "start": 0.0, "end": 0.5, "duration": 0.5},
    {"word": "uh", "start": 3.0, "end": 3.4, "duration": 0.4},
    {"word": "hmm", "start": 6.0, "end": 6.3, "duration": 0.3},
]


def _upload(client: TestClient, filename: str = "test.mp4") -> dict:
    with patch(PROBE_MODULE, new_callable=AsyncMock, return_value=FAKE_PROBE):
        resp = client.post(
            "/api/v1/videos/upload",
            files={"file": (filename, io.BytesIO(FAKE_VIDEO_BYTES), "video/mp4")},
        )
    assert resp.status_code == 200
    return resp.json()


def _add_transcript(
    db: Session,
    video_id: str,
    status: str = TranscriptStatus.completed,
    segments: list = None,
) -> Transcript:
    if segments is None:
        segments = FAKE_TRANSCRIPT_SEGMENTS
    record = Transcript(
        id=str(uuid.uuid4()),
        video_id=video_id,
        text=" ".join(s["text"] for s in segments),
        segments=json.dumps(segments),
        language="en",
        status=status,
    )
    db.add(record)
    db.commit()
    return record


def _insert_filler(
    db: Session,
    video_id: str,
    segments: list = None,
) -> FillerDetection:
    if segments is None:
        segments = FAKE_FILLER_SEGMENTS
    record = FillerDetection(
        id=str(uuid.uuid4()),
        video_id=video_id,
        segments=json.dumps(segments),
        detected_at=datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    return record


class TestFillerService:
    def test_normalise_strips_punctuation_and_lowercases(self):
        assert _normalise("Um,") == "um"
        assert _normalise("UH!") == "uh"
        assert _normalise("  Hmm. ") == "hmm"

    def test_detect_returns_filler_segments_from_transcript(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _add_transcript(db_session, video["id"])
        db_session.expire_all()

        video_obj = db_session.query(Video).filter(Video.id == video["id"]).first()
        result = FillerService.detect(video_obj, db_session)

        assert len(result.segments) == 3
        assert result.segments[0].word == "um"
        assert result.segments[1].word == "uh"
        assert result.segments[2].word == "hmm"

    def test_detect_ignores_mixed_segments(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        mixed = [
            {"start": 0.0, "end": 1.0, "text": "um yeah"},
            {"start": 1.0, "end": 2.0, "text": "uh"},
        ]
        _add_transcript(db_session, video["id"], segments=mixed)
        db_session.expire_all()

        video_obj = db_session.query(Video).filter(Video.id == video["id"]).first()
        result = FillerService.detect(video_obj, db_session)

        assert len(result.segments) == 1
        assert result.segments[0].word == "uh"

    def test_detect_returns_empty_list_when_no_fillers(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        clean = [
            {"start": 0.0, "end": 2.0, "text": "Hello everyone"},
            {"start": 2.0, "end": 5.0, "text": "welcome to the talk"},
        ]
        _add_transcript(db_session, video["id"], segments=clean)
        db_session.expire_all()

        video_obj = db_session.query(Video).filter(Video.id == video["id"]).first()
        result = FillerService.detect(video_obj, db_session)

        assert result.segments == []

    def test_compute_non_filler_windows_typical(self):
        windows = FillerService.compute_non_filler_windows(30.0, FAKE_FILLER_SEGMENTS)
        assert len(windows) == 3
        assert windows[0] == (0.5, 3.0)
        assert windows[1] == (3.4, 6.0)
        assert windows[2] == (6.3, 30.0)

    def test_compute_non_filler_windows_no_fillers(self):
        windows = FillerService.compute_non_filler_windows(30.0, [])
        assert windows == [(0.0, 30.0)]

    def test_compute_non_filler_windows_all_fillers(self):
        segments = [{"word": "um", "start": 0.0, "end": 30.0, "duration": 30.0}]
        windows = FillerService.compute_non_filler_windows(30.0, segments)
        assert windows == []


class TestFillerDetect:
    def test_detect_happy_path_returns_200_with_segments(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _add_transcript(db_session, video["id"])

        resp = client.post(f"/api/v1/videos/{video['id']}/fillers/detect")

        assert resp.status_code == 200
        data = resp.json()
        assert data["video_id"] == video["id"]
        assert len(data["segments"]) == 3
        assert data["segments"][0]["word"] == "um"
        assert data["segments"][0]["start"] == 0.0
        assert data["segments"][0]["end"] == 0.5

    def test_detect_stores_segments_in_db(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _add_transcript(db_session, video["id"])

        client.post(f"/api/v1/videos/{video['id']}/fillers/detect")

        db_session.expire_all()
        record = db_session.query(FillerDetection).filter(
            FillerDetection.video_id == video["id"]
        ).first()
        assert record is not None
        stored = json.loads(record.segments)
        assert len(stored) == 3

    def test_detect_returns_400_when_no_transcript(self, client: TestClient):
        video = _upload(client)
        resp = client.post(f"/api/v1/videos/{video['id']}/fillers/detect")
        assert resp.status_code == 400
        assert "transcribe" in resp.json()["detail"].lower()

    def test_detect_returns_400_when_transcript_not_completed(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _add_transcript(db_session, video["id"], status=TranscriptStatus.processing)

        resp = client.post(f"/api/v1/videos/{video['id']}/fillers/detect")
        assert resp.status_code == 400
        assert "transcribe" in resp.json()["detail"].lower()

    def test_detect_returns_404_for_unknown_video(self, client: TestClient):
        resp = client.post(f"/api/v1/videos/{uuid.uuid4()}/fillers/detect")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_detect_overwrites_previous_record(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_filler(db_session, video["id"], segments=[{"word": "er", "start": 1.0, "end": 1.5, "duration": 0.5}])
        _add_transcript(db_session, video["id"])

        resp = client.post(f"/api/v1/videos/{video['id']}/fillers/detect")

        assert resp.status_code == 200
        assert len(resp.json()["segments"]) == 3

        db_session.expire_all()
        records = db_session.query(FillerDetection).filter(
            FillerDetection.video_id == video["id"]
        ).all()
        assert len(records) == 1

    def test_detect_returns_200_with_empty_list_when_no_fillers(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        clean = [{"start": 0.0, "end": 5.0, "text": "Hello everyone welcome"}]
        _add_transcript(db_session, video["id"], segments=clean)

        resp = client.post(f"/api/v1/videos/{video['id']}/fillers/detect")

        assert resp.status_code == 200
        assert resp.json()["segments"] == []


class TestFillerGet:
    def test_get_returns_stored_detection(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_filler(db_session, video["id"])

        resp = client.get(f"/api/v1/videos/{video['id']}/fillers")
        assert resp.status_code == 200
        data = resp.json()
        assert data["video_id"] == video["id"]
        assert len(data["segments"]) == 3
        assert data["segments"][0]["word"] == "um"

    def test_get_returns_404_when_never_detected(self, client: TestClient):
        video = _upload(client)
        resp = client.get(f"/api/v1/videos/{video['id']}/fillers")
        assert resp.status_code == 404
        assert "detection" in resp.json()["detail"].lower()

    def test_get_returns_404_for_unknown_video(self, client: TestClient):
        resp = client.get(f"/api/v1/videos/{uuid.uuid4()}/fillers")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_get_returns_stored_detection_with_empty_segments(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_filler(db_session, video["id"], segments=[])

        resp = client.get(f"/api/v1/videos/{video['id']}/fillers")
        assert resp.status_code == 200
        data = resp.json()
        assert data["video_id"] == video["id"]
        assert data["segments"] == []


class TestFillerRemove:
    def test_remove_returns_400_when_no_detection_stored(self, client: TestClient):
        video = _upload(client)
        resp = client.post(f"/api/v1/videos/{video['id']}/fillers/remove")
        assert resp.status_code == 400
        assert "detection" in resp.json()["detail"].lower()

    def test_remove_returns_400_when_all_fillers(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_filler(
            db_session, video["id"],
            segments=[{"word": "um", "start": 0.0, "end": 30.0, "duration": 30.0}],
        )
        resp = client.post(f"/api/v1/videos/{video['id']}/fillers/remove")
        assert resp.status_code == 400
        assert "filler" in resp.json()["detail"].lower()

    def test_remove_returns_404_for_unknown_video(self, client: TestClient):
        resp = client.post(f"/api/v1/videos/{uuid.uuid4()}/fillers/remove")
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()

    def test_remove_happy_path_returns_export_url(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_filler(db_session, video["id"])

        expected_url = f"/api/v1/videos/{video['id']}/fillers/export/stream"
        with patch(
            "app.api.v1.fillers.FillerService.remove",
            new_callable=AsyncMock,
            return_value=expected_url,
        ):
            resp = client.post(f"/api/v1/videos/{video['id']}/fillers/remove")

        assert resp.status_code == 200
        data = resp.json()
        assert "export_url" in data
        assert video["id"] in data["export_url"]

    def test_remove_returns_409_when_in_flight(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_filler(db_session, video["id"])

        from app.api.v1 import fillers as fillers_module
        fillers_module._in_flight.add(video["id"])
        try:
            resp = client.post(f"/api/v1/videos/{video['id']}/fillers/remove")
            assert resp.status_code == 409
            assert "in progress" in resp.json()["detail"].lower()
        finally:
            fillers_module._in_flight.discard(video["id"])
