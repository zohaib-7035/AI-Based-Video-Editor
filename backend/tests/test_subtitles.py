import io
import json
import uuid
from datetime import datetime
from pathlib import Path
from unittest.mock import AsyncMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.models.transcript import Transcript, TranscriptStatus
from app.schemas.transcript import TranscriptSegment
from app.services.subtitle import SubtitleService

PROBE_MODULE = "app.services.ffmpeg.FFmpegService.probe"
FAKE_PROBE = {
    "duration": 10.0,
    "width": 1920,
    "height": 1080,
    "fps": 30.0,
    "codec": "h264",
    "format": "mp4",
}
FAKE_VIDEO_BYTES = b"\x00" * 1024

FAKE_SEGMENTS = [
    TranscriptSegment(start=0.0, end=2.5, text="Hello world"),
    TranscriptSegment(start=2.5, end=5.0, text="This is a test"),
    TranscriptSegment(start=5.0, end=8.3, text="Done"),
]


def _upload(client: TestClient, filename: str = "test.mp4") -> dict:
    with patch(PROBE_MODULE, new_callable=AsyncMock, return_value=FAKE_PROBE):
        resp = client.post(
            "/api/v1/videos/upload",
            files={"file": (filename, io.BytesIO(FAKE_VIDEO_BYTES), "video/mp4")},
        )
    assert resp.status_code == 200
    return resp.json()


def _insert_transcript(
    db: Session,
    video_id: str,
    status: str = "completed",
    srt_path: str = None,
    vtt_path: str = None,
) -> Transcript:
    record = Transcript(
        id=str(uuid.uuid4()),
        video_id=video_id,
        text="Hello world This is a test Done",
        segments=json.dumps([
            {"start": 0.0, "end": 2.5, "text": "Hello world"},
            {"start": 2.5, "end": 5.0, "text": "This is a test"},
            {"start": 5.0, "end": 8.3, "text": "Done"},
        ]),
        language="en",
        status=status,
        srt_path=srt_path,
        vtt_path=vtt_path,
        created_at=datetime.utcnow(),
    )
    db.add(record)
    db.commit()
    return record


class TestSubtitleService:
    def test_to_srt_three_segments_exact_format(self):
        result = SubtitleService.to_srt(FAKE_SEGMENTS)
        lines = result.split("\n")
        assert lines[0] == "1"
        assert lines[1] == "00:00:00,000 --> 00:00:02,500"
        assert lines[2] == "Hello world"
        assert lines[3] == ""
        assert lines[4] == "2"
        assert lines[5] == "00:00:02,500 --> 00:00:05,000"
        assert lines[6] == "This is a test"
        assert lines[7] == ""
        assert lines[8] == "3"
        assert lines[9] == "00:00:05,000 --> 00:00:08,300"
        assert lines[10] == "Done"

    def test_to_vtt_three_segments_exact_format(self):
        result = SubtitleService.to_vtt(FAKE_SEGMENTS)
        assert result.startswith("WEBVTT\n\n")
        assert "00:00:00.000 --> 00:00:02.500" in result
        assert "00:00:02.500 --> 00:00:05.000" in result
        assert "00:00:05.000 --> 00:00:08.300" in result
        assert "Hello world" in result
        assert "This is a test" in result

    def test_to_vtt_uses_period_not_comma_in_timestamps(self):
        result = SubtitleService.to_vtt(FAKE_SEGMENTS)
        # Strip header; verify no comma appears in any timestamp line
        for line in result.splitlines():
            if "-->" in line:
                assert "," not in line

    def test_to_srt_empty_segments_returns_empty_string(self):
        assert SubtitleService.to_srt([]) == ""

    def test_to_vtt_empty_segments_returns_webvtt_header(self):
        assert SubtitleService.to_vtt([]) == "WEBVTT\n"

    def test_timestamp_rounded_to_milliseconds(self):
        seg = TranscriptSegment(start=2.9999998, end=5.0000001, text="Hi")
        result = SubtitleService.to_srt([seg])
        assert "00:00:03,000 --> 00:00:05,000" in result

    def test_to_srt_single_segment(self):
        seg = TranscriptSegment(start=0.0, end=1.0, text="Hello")
        result = SubtitleService.to_srt([seg])
        assert result.startswith("1\n")
        assert "00:00:00,000 --> 00:00:01,000" in result
        assert "Hello" in result

    def test_format_ts_hours_minutes_seconds(self):
        seg = TranscriptSegment(start=3723.5, end=3724.0, text="Late")
        result = SubtitleService.to_srt([seg])
        assert "01:02:03,500 --> 01:02:04,000" in result


class TestSubtitleGenerate:
    def test_generate_happy_path_returns_200_with_urls(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_transcript(db_session, video["id"])

        resp = client.post(f"/api/v1/videos/{video['id']}/subtitles/generate")
        assert resp.status_code == 200
        data = resp.json()
        assert data["srt_url"] == f"/api/v1/videos/{video['id']}/subtitles/srt"
        assert data["vtt_url"] == f"/api/v1/videos/{video['id']}/subtitles/vtt"

    def test_generate_writes_files_to_disk(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_transcript(db_session, video["id"])

        client.post(f"/api/v1/videos/{video['id']}/subtitles/generate")

        db_session.expire_all()
        tr = db_session.query(Transcript).filter(
            Transcript.video_id == video["id"]
        ).first()
        assert tr is not None
        assert tr.srt_path is not None
        assert tr.vtt_path is not None
        assert Path(tr.srt_path).exists()
        assert Path(tr.vtt_path).exists()

    def test_generate_persists_db_columns(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_transcript(db_session, video["id"])

        client.post(f"/api/v1/videos/{video['id']}/subtitles/generate")

        db_session.expire_all()
        tr = db_session.query(Transcript).filter(
            Transcript.video_id == video["id"]
        ).first()
        assert tr.srt_path is not None
        assert tr.srt_path.endswith(".srt")
        assert tr.vtt_path is not None
        assert tr.vtt_path.endswith(".vtt")

    def test_generate_returns_400_when_no_completed_transcript(
        self, client: TestClient
    ):
        video = _upload(client)
        resp = client.post(f"/api/v1/videos/{video['id']}/subtitles/generate")
        assert resp.status_code == 400
        assert "transcript" in resp.json()["detail"].lower()

    def test_generate_returns_400_when_transcript_is_not_completed(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_transcript(db_session, video["id"], status="error")

        resp = client.post(f"/api/v1/videos/{video['id']}/subtitles/generate")
        assert resp.status_code == 400

    def test_generate_returns_409_when_subtitles_already_exist(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_transcript(db_session, video["id"], srt_path="/some/path.srt")

        resp = client.post(f"/api/v1/videos/{video['id']}/subtitles/generate")
        assert resp.status_code == 409
        assert "already generated" in resp.json()["detail"].lower()

    def test_generate_returns_404_for_unknown_video(self, client: TestClient):
        resp = client.post(f"/api/v1/videos/{uuid.uuid4()}/subtitles/generate")
        assert resp.status_code == 404


class TestSubtitleDownload:
    def _generate(self, client: TestClient, db_session: Session, filename: str = "test.mp4") -> dict:
        video = _upload(client, filename)
        _insert_transcript(db_session, video["id"])
        client.post(f"/api/v1/videos/{video['id']}/subtitles/generate")
        return video

    def test_download_srt_returns_200_with_correct_content_type(
        self, client: TestClient, db_session: Session
    ):
        video = self._generate(client, db_session)
        resp = client.get(f"/api/v1/videos/{video['id']}/subtitles/srt")
        assert resp.status_code == 200
        assert "text/plain" in resp.headers.get("content-type", "")

    def test_download_srt_has_attachment_content_disposition(
        self, client: TestClient, db_session: Session
    ):
        video = self._generate(client, db_session, "my_video.mp4")
        resp = client.get(f"/api/v1/videos/{video['id']}/subtitles/srt")
        disposition = resp.headers.get("content-disposition", "")
        assert "attachment" in disposition
        assert "my_video.srt" in disposition

    def test_download_srt_body_is_valid_srt(
        self, client: TestClient, db_session: Session
    ):
        video = self._generate(client, db_session)
        resp = client.get(f"/api/v1/videos/{video['id']}/subtitles/srt")
        body = resp.text
        assert body.startswith("1\n")
        assert "-->" in body
        assert "," in body  # SRT uses comma as millisecond separator

    def test_download_vtt_returns_200_with_text_vtt_content_type(
        self, client: TestClient, db_session: Session
    ):
        video = self._generate(client, db_session)
        resp = client.get(f"/api/v1/videos/{video['id']}/subtitles/vtt")
        assert resp.status_code == 200
        assert "text/vtt" in resp.headers.get("content-type", "")

    def test_download_vtt_body_starts_with_webvtt(
        self, client: TestClient, db_session: Session
    ):
        video = self._generate(client, db_session)
        resp = client.get(f"/api/v1/videos/{video['id']}/subtitles/vtt")
        assert resp.text.startswith("WEBVTT")

    def test_download_srt_returns_404_when_no_transcript(self, client: TestClient):
        video = _upload(client)
        resp = client.get(f"/api/v1/videos/{video['id']}/subtitles/srt")
        assert resp.status_code == 404

    def test_download_vtt_returns_404_when_no_transcript(self, client: TestClient):
        video = _upload(client)
        resp = client.get(f"/api/v1/videos/{video['id']}/subtitles/vtt")
        assert resp.status_code == 404

    def test_download_srt_returns_404_when_file_missing_from_disk(
        self, client: TestClient, db_session: Session
    ):
        video = _upload(client)
        _insert_transcript(db_session, video["id"], srt_path="/nonexistent/path.srt")

        resp = client.get(f"/api/v1/videos/{video['id']}/subtitles/srt")
        assert resp.status_code == 404
