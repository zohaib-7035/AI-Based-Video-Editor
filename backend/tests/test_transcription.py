"""Tests for AI Transcription endpoints — Story 4."""
from __future__ import annotations

import io
import json
import uuid
from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

PROBE_MODULE = "app.services.ffmpeg.FFmpegService.probe"
SERVICE_RUN = "app.services.transcription.TranscriptionService.run"

FAKE_PROBE_RESULT = {
    "duration": 10.0,
    "width": 1920,
    "height": 1080,
    "fps": 30.0,
    "codec": "h264",
    "format": "mp4",
}
FAKE_VIDEO_BYTES = b"fake-video-content"

FAKE_SEGMENTS = [
    {"start": 0.0, "end": 2.5, "text": "Hello world"},
    {"start": 2.5, "end": 5.0, "text": "This is a test"},
]
FAKE_RUN_RESULT = {
    "text": "Hello world This is a test",
    "segments": FAKE_SEGMENTS,
    "language": "en",
}


def _upload(client: TestClient, filename: str = "test.mp4") -> dict:
    from unittest.mock import AsyncMock
    with patch(PROBE_MODULE, new_callable=AsyncMock, return_value=FAKE_PROBE_RESULT):
        response = client.post(
            "/api/v1/videos/upload",
            files={"file": (filename, io.BytesIO(FAKE_VIDEO_BYTES), "video/mp4")},
        )
    assert response.status_code == 200
    return response.json()


# ---------------------------------------------------------------------------
# TestTranscribeEndpoint
# ---------------------------------------------------------------------------

class TestTranscribeEndpoint:

    def test_post_returns_202_and_job_started(self, client: TestClient) -> None:
        video = _upload(client)
        video_id = video["id"]

        with patch(SERVICE_RUN, new_callable=MagicMock, return_value=FAKE_RUN_RESULT):
            response = client.post(f"/api/v1/videos/{video_id}/transcribe")

        assert response.status_code == 202
        body = response.json()
        assert body["job"] == "started"
        assert body["video_id"] == video_id

    def test_post_returns_404_for_unknown_video_id(self, client: TestClient) -> None:
        response = client.post(f"/api/v1/videos/{uuid.uuid4()}/transcribe")
        assert response.status_code == 404

    def test_post_returns_409_when_already_in_flight(self, client: TestClient) -> None:
        from app.api.v1 import transcriptions

        video = _upload(client)
        video_id = video["id"]

        transcriptions._in_flight.add(video_id)
        try:
            response = client.post(f"/api/v1/videos/{video_id}/transcribe")
            assert response.status_code == 409
            assert "progress" not in response.json()
            assert "already in progress" in response.json()["detail"].lower()
        finally:
            transcriptions._in_flight.discard(video_id)

    def test_post_sets_video_status_to_processing(self, client: TestClient, db_session: Session) -> None:
        from app.models.video import Video

        video = _upload(client)
        video_id = video["id"]

        with patch(SERVICE_RUN, new_callable=MagicMock, return_value=FAKE_RUN_RESULT):
            client.post(f"/api/v1/videos/{video_id}/transcribe")

        db_session.expire_all()
        record = db_session.get(Video, video_id)
        assert record is not None
        assert record.status in ("processing", "ready")


# ---------------------------------------------------------------------------
# TestTranscriptFetch
# ---------------------------------------------------------------------------

class TestTranscriptFetch:

    def _insert_transcript(
        self,
        db_session: Session,
        video_id: str,
        status: str = "completed",
        error: str | None = None,
    ) -> None:
        from app.models.transcript import Transcript

        record = Transcript(
            id=str(uuid.uuid4()),
            video_id=video_id,
            text=FAKE_RUN_RESULT["text"],
            segments=json.dumps(FAKE_SEGMENTS),
            language="en",
            status=status,
            error=error,
            created_at=datetime.utcnow(),
        )
        db_session.add(record)
        db_session.commit()

    def test_get_returns_404_when_no_transcript_exists(self, client: TestClient) -> None:
        video = _upload(client)
        response = client.get(f"/api/v1/videos/{video['id']}/transcript")
        assert response.status_code == 404
        assert "transcript" in response.json()["detail"].lower()

    def test_get_returns_transcript_after_completion(
        self, client: TestClient, db_session: Session
    ) -> None:
        video = _upload(client)
        self._insert_transcript(db_session, video["id"])

        response = client.get(f"/api/v1/videos/{video['id']}/transcript")
        assert response.status_code == 200
        body = response.json()
        assert body["video_id"] == video["id"]
        assert body["text"] == FAKE_RUN_RESULT["text"]
        assert body["status"] == "completed"
        assert body["language"] == "en"
        assert isinstance(body["segments"], list)
        assert len(body["segments"]) == 2

    def test_get_segments_are_deserialized_as_list(
        self, client: TestClient, db_session: Session
    ) -> None:
        video = _upload(client)
        self._insert_transcript(db_session, video["id"])

        response = client.get(f"/api/v1/videos/{video['id']}/transcript")
        assert response.status_code == 200
        segments = response.json()["segments"]
        assert isinstance(segments, list)
        for seg in segments:
            assert "start" in seg
            assert "end" in seg
            assert "text" in seg
            assert isinstance(seg["start"], float)
            assert isinstance(seg["end"], float)
            assert isinstance(seg["text"], str)

    def test_get_returns_transcript_with_all_required_fields(
        self, client: TestClient, db_session: Session
    ) -> None:
        video = _upload(client)
        self._insert_transcript(db_session, video["id"])

        response = client.get(f"/api/v1/videos/{video['id']}/transcript")
        assert response.status_code == 200
        body = response.json()
        required = {"id", "video_id", "text", "segments", "language", "status", "created_at"}
        assert required.issubset(body.keys())


# ---------------------------------------------------------------------------
# TestTranscriptionErrorState
# ---------------------------------------------------------------------------

class TestTranscriptionErrorState:

    def _insert_error_transcript(self, db_session: Session, video_id: str) -> None:
        from app.models.transcript import Transcript

        record = Transcript(
            id=str(uuid.uuid4()),
            video_id=video_id,
            status="error",
            error="Corrupt audio stream",
            created_at=datetime.utcnow(),
        )
        db_session.add(record)
        db_session.commit()

    def test_error_transcript_has_error_status_and_message(
        self, client: TestClient, db_session: Session
    ) -> None:
        video = _upload(client)
        self._insert_error_transcript(db_session, video["id"])

        response = client.get(f"/api/v1/videos/{video['id']}/transcript")
        assert response.status_code == 200
        body = response.json()
        assert body["status"] == "error"
        assert body["error"] is not None
        assert len(body["error"]) > 0

    def test_error_transcript_segments_default_to_empty_list(
        self, client: TestClient, db_session: Session
    ) -> None:
        video = _upload(client)
        self._insert_error_transcript(db_session, video["id"])

        response = client.get(f"/api/v1/videos/{video['id']}/transcript")
        assert response.status_code == 200
        assert response.json()["segments"] == []

    def test_video_with_error_status_reflected_in_list(
        self, client: TestClient, db_session: Session
    ) -> None:
        from app.models.video import Video, VideoStatus

        video = _upload(client)
        db_session.expire_all()
        record = db_session.get(Video, video["id"])
        assert record is not None
        record.status = VideoStatus.error
        db_session.commit()

        response = client.get("/api/v1/videos")
        assert response.status_code == 200
        items = response.json()
        match = next((v for v in items if v["id"] == video["id"]), None)
        assert match is not None
        assert match["status"] == "error"
