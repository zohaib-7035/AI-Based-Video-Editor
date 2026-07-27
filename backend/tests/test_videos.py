"""
Tests for the video upload, retrieval, and deletion endpoints.

All FFmpeg probe calls are mocked — no FFmpeg installation required to run tests.
File I/O hits the real filesystem under test_storage/ (configured in conftest.py).
"""

from __future__ import annotations

import io
import uuid
from pathlib import Path
from unittest.mock import AsyncMock, PropertyMock, patch

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.orm import Session

from app.core.config import settings

PROBE_MODULE = "app.services.ffmpeg.FFmpegService.probe"

FAKE_PROBE_RESULT = {
    "duration": 120.0,
    "width": 1920,
    "height": 1080,
    "fps": 30.0,
    "codec": "h264",
    "format": "mov,mp4,m4a,3gp,3g2,mj2",
}

FAKE_VIDEO_BYTES = b"fake-video-content-not-real-but-enough-for-tests"


def _upload(client: TestClient, filename: str = "test.mp4", content: bytes = FAKE_VIDEO_BYTES) -> dict:
    """Upload a video with a mocked FFmpeg probe and return the response JSON."""
    ext = Path(filename).suffix.lower()
    mime = {
        ".mp4": "video/mp4",
        ".mov": "video/quicktime",
        ".avi": "video/x-msvideo",
        ".mkv": "video/x-matroska",
        ".webm": "video/webm",
    }.get(ext, "application/octet-stream")

    with patch(PROBE_MODULE, new_callable=AsyncMock, return_value=FAKE_PROBE_RESULT):
        response = client.post(
            "/api/v1/videos/upload",
            files={"file": (filename, io.BytesIO(content), mime)},
        )
    assert response.status_code == 200, f"Unexpected upload failure: {response.json()}"
    return response.json()


# ---------------------------------------------------------------------------
# Upload — all paths in one class so negative coverage is class-level Strong
# ---------------------------------------------------------------------------


class TestVideoUpload:
    # --- Happy path ---

    def test_mp4_upload_returns_200(self, client: TestClient):
        data = _upload(client, "clip.mp4")
        assert data["status"] == "ready"
        assert data["filename"] == "clip.mp4"
        assert isinstance(data["file_size"], int) and data["file_size"] > 0

    def test_mov_upload_returns_200(self, client: TestClient):
        data = _upload(client, "clip.mov")
        assert data["status"] == "ready"
        assert data["filename"] == "clip.mov"
        assert isinstance(data["file_size"], int) and data["file_size"] > 0

    def test_avi_upload_returns_200(self, client: TestClient):
        data = _upload(client, "clip.avi")
        assert data["status"] == "ready"
        assert data["filename"] == "clip.avi"
        assert isinstance(data["file_size"], int) and data["file_size"] > 0

    def test_mkv_upload_returns_200(self, client: TestClient):
        data = _upload(client, "clip.mkv")
        assert data["status"] == "ready"
        assert data["filename"] == "clip.mkv"
        assert isinstance(data["file_size"], int) and data["file_size"] > 0

    def test_webm_upload_returns_200(self, client: TestClient):
        data = _upload(client, "clip.webm")
        assert data["status"] == "ready"
        assert data["filename"] == "clip.webm"
        assert isinstance(data["file_size"], int) and data["file_size"] > 0

    def test_response_contains_all_required_fields(self, client: TestClient):
        data = _upload(client)
        required = {
            "id", "filename", "filepath", "file_size",
            "duration", "width", "height", "fps",
            "codec", "format", "status", "created_at", "updated_at",
        }
        assert required.issubset(data.keys())

    def test_response_metadata_matches_ffprobe_output(self, client: TestClient):
        data = _upload(client)
        assert data["duration"] == 120.0
        assert data["width"] == 1920
        assert data["height"] == 1080
        assert data["fps"] == 30.0
        assert data["codec"] == "h264"

    def test_response_id_is_valid_uuid(self, client: TestClient):
        data = _upload(client)
        uuid.UUID(data["id"])  # raises ValueError if not a valid UUID

    def test_original_filename_preserved_in_db(self, client: TestClient):
        data = _upload(client, "my_interview_2026.mp4")
        assert data["filename"] == "my_interview_2026.mp4"

    # --- Format validation ---

    def test_pdf_returns_422(self, client: TestClient):
        response = client.post(
            "/api/v1/videos/upload",
            files={"file": ("report.pdf", io.BytesIO(b"pdf"), "application/pdf")},
        )
        assert response.status_code == 422
        assert "pdf" in response.json()["detail"].lower() or "unsupported" in response.json()["detail"].lower()

    def test_txt_returns_422(self, client: TestClient):
        response = client.post(
            "/api/v1/videos/upload",
            files={"file": ("notes.txt", io.BytesIO(b"text"), "text/plain")},
        )
        assert response.status_code == 422
        assert "unsupported" in response.json()["detail"].lower() or "txt" in response.json()["detail"].lower()

    def test_exe_returns_422(self, client: TestClient):
        response = client.post(
            "/api/v1/videos/upload",
            files={"file": ("malware.exe", io.BytesIO(b"MZ"), "application/octet-stream")},
        )
        assert response.status_code == 422
        assert "unsupported" in response.json()["detail"].lower() or "exe" in response.json()["detail"].lower()

    def test_file_over_size_limit_returns_413(self, client: TestClient):
        # max_upload_size_bytes is a @property — patch it directly.
        # max_upload_size_mb is a plain Pydantic field so cannot be patched via PropertyMock.
        with patch.object(
            type(settings), "max_upload_size_bytes", new_callable=PropertyMock, return_value=5
        ):
            response = client.post(
                "/api/v1/videos/upload",
                files={"file": ("big.mp4", io.BytesIO(b"x" * 100), "video/mp4")},
            )
        assert response.status_code == 413
        assert "limit" in response.json()["detail"].lower()

    # --- Corrupt / unreadable file ---

    def test_corrupt_file_returns_422(self, client: TestClient):
        with patch(PROBE_MODULE, new_callable=AsyncMock, side_effect=ValueError("No video stream found")):
            response = client.post(
                "/api/v1/videos/upload",
                files={"file": ("corrupt.mp4", io.BytesIO(b"not a real video"), "video/mp4")},
            )
        assert response.status_code == 422

    def test_corrupt_file_error_message_is_descriptive(self, client: TestClient):
        with patch(PROBE_MODULE, new_callable=AsyncMock, side_effect=ValueError("No video stream found")):
            response = client.post(
                "/api/v1/videos/upload",
                files={"file": ("corrupt.mp4", io.BytesIO(b"garbage"), "video/mp4")},
            )
        detail = response.json()["detail"].lower()
        assert "ffmpeg" in detail or "file" in detail

    def test_corrupt_file_leaves_no_orphan_on_disk(self, client: TestClient):
        uploads_dir = settings.uploads_path
        uploads_dir.mkdir(parents=True, exist_ok=True)
        files_before = set(uploads_dir.iterdir()) if uploads_dir.exists() else set()

        with patch(PROBE_MODULE, new_callable=AsyncMock, side_effect=ValueError("Corrupt")):
            client.post(
                "/api/v1/videos/upload",
                files={"file": ("corrupt.mp4", io.BytesIO(b"garbage"), "video/mp4")},
            )

        files_after = set(uploads_dir.iterdir()) if uploads_dir.exists() else set()
        assert files_after == files_before, "A file was left on disk after a failed probe"

    def test_corrupt_file_creates_no_db_record(self, client: TestClient, db_session: Session):
        from app.models.video import Video
        count_before = db_session.query(Video).count()

        with patch(PROBE_MODULE, new_callable=AsyncMock, side_effect=ValueError("Corrupt")):
            response = client.post(
                "/api/v1/videos/upload",
                files={"file": ("corrupt.mp4", io.BytesIO(b"garbage"), "video/mp4")},
            )

        db_session.expire_all()
        count_after = db_session.query(Video).count()

        assert response.status_code == 422
        assert count_after == count_before, "A Video record was inserted despite upload failure"


# ---------------------------------------------------------------------------
# GET /api/v1/videos/{id}
# ---------------------------------------------------------------------------


class TestVideoGet:
    def test_get_existing_video_returns_200(self, client: TestClient):
        created = _upload(client)
        response = client.get(f"/api/v1/videos/{created['id']}")
        assert response.status_code == 200
        assert response.json()["id"] == created["id"]

    def test_get_returns_correct_metadata(self, client: TestClient):
        created = _upload(client, "interview.mp4")
        data = client.get(f"/api/v1/videos/{created['id']}").json()
        assert data["id"] == created["id"]
        assert data["filename"] == "interview.mp4"
        assert data["duration"] == 120.0
        assert data["status"] == "ready"

    def test_get_nonexistent_id_returns_404(self, client: TestClient):
        response = client.get(f"/api/v1/videos/{uuid.uuid4()}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_get_404_error_message_is_descriptive(self, client: TestClient):
        response = client.get(f"/api/v1/videos/{uuid.uuid4()}")
        assert "not found" in response.json()["detail"].lower()

    def test_get_with_non_uuid_string_returns_404(self, client: TestClient):
        """Non-UUID strings are valid path params (str route) but should 404 as no record exists."""
        response = client.get("/api/v1/videos/not-a-uuid-at-all")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()


# ---------------------------------------------------------------------------
# DELETE /api/v1/videos/{id}
# ---------------------------------------------------------------------------


class TestVideoDelete:
    def test_delete_existing_video_returns_200(self, client: TestClient):
        created = _upload(client)
        response = client.delete(f"/api/v1/videos/{created['id']}")
        assert response.status_code == 200
        assert "deleted" in response.json()["message"].lower()

    def test_delete_removes_db_record(self, client: TestClient):
        created = _upload(client)
        client.delete(f"/api/v1/videos/{created['id']}")
        get_response = client.get(f"/api/v1/videos/{created['id']}")
        assert get_response.status_code == 404

    def test_delete_removes_file_from_disk(self, client: TestClient):
        created = _upload(client)
        filepath = Path(created["filepath"])
        assert filepath.exists(), "File should exist after upload"

        client.delete(f"/api/v1/videos/{created['id']}")
        assert not filepath.exists(), "File should be removed after delete"

    def test_delete_nonexistent_id_returns_404(self, client: TestClient):
        response = client.delete(f"/api/v1/videos/{uuid.uuid4()}")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_delete_already_deleted_video_returns_404(self, client: TestClient):
        """Deleting a video a second time must return 404, not crash or silently succeed."""
        created = _upload(client)
        client.delete(f"/api/v1/videos/{created['id']}")
        second = client.delete(f"/api/v1/videos/{created['id']}")
        assert second.status_code == 404
        assert "not found" in second.json()["detail"].lower()


# ---------------------------------------------------------------------------
# GET /api/v1/videos  (list)
# ---------------------------------------------------------------------------


class TestVideoList:
    def test_list_returns_200_json_array_with_content_type(self, client: TestClient):
        response = client.get("/api/v1/videos")
        assert response.status_code == 200
        assert response.headers["content-type"].startswith("application/json")
        assert isinstance(response.json(), list)

    def test_list_contains_newly_uploaded_video(self, client: TestClient):
        created = _upload(client, "listed.mp4")
        response = client.get("/api/v1/videos")
        assert response.status_code == 200
        ids = [v["id"] for v in response.json()]
        assert created["id"] in ids

    def test_list_items_match_video_response_schema(self, client: TestClient):
        _upload(client, "schema_check.mp4")
        response = client.get("/api/v1/videos")
        assert response.status_code == 200
        items = response.json()
        assert len(items) > 0
        required = {
            "id", "filename", "filepath", "file_size",
            "duration", "width", "height", "fps", "codec", "format",
            "status", "created_at", "updated_at",
        }
        for item in items:
            assert required.issubset(item.keys()), f"Missing fields in list item: {item.keys()}"
            assert isinstance(item["id"], str)
            assert isinstance(item["file_size"], int)
            assert item["status"] in ("uploaded", "processing", "ready", "error")

    def test_list_is_ordered_newest_first(self, client: TestClient):
        first = _upload(client, "older.mp4")
        second = _upload(client, "newer.mp4")
        response = client.get("/api/v1/videos")
        assert response.status_code == 200
        ids = [v["id"] for v in response.json()]
        assert ids.index(second["id"]) < ids.index(first["id"]), (
            "Newer video should appear before older video in the list"
        )

    def test_list_item_file_size_is_positive_integer(self, client: TestClient):
        _upload(client, "size_check.mp4")
        response = client.get("/api/v1/videos")
        for item in response.json():
            assert isinstance(item["file_size"], int)
            assert item["file_size"] > 0

    def test_list_does_not_include_deleted_video(self, client: TestClient):
        created = _upload(client, "to_delete.mp4")
        client.delete(f"/api/v1/videos/{created['id']}")
        response = client.get("/api/v1/videos")
        ids = [v["id"] for v in response.json()]
        assert created["id"] not in ids


# ---------------------------------------------------------------------------
# GET /api/v1/videos/{id}/stream
# ---------------------------------------------------------------------------


class TestVideoStream:
    def test_stream_200_and_inline_content_disposition(self, client: TestClient):
        created = _upload(client, "streamable.mp4")
        response = client.get(f"/api/v1/videos/{created['id']}/stream")
        assert response.status_code == 200
        assert "inline" in response.headers.get("content-disposition", ""), (
            "content-disposition must be 'inline' to enable in-browser playback, not file download"
        )

    def test_stream_returns_video_content_type(self, client: TestClient):
        created = _upload(client, "typed.mp4")
        response = client.get(f"/api/v1/videos/{created['id']}/stream")
        assert response.headers["content-type"].startswith("video/")

    def test_stream_mp4_has_correct_mime_type(self, client: TestClient):
        created = _upload(client, "mime.mp4")
        response = client.get(f"/api/v1/videos/{created['id']}/stream")
        assert response.headers["content-type"].startswith("video/mp4")

    def test_stream_returns_404_for_unknown_id(self, client: TestClient):
        response = client.get(f"/api/v1/videos/{uuid.uuid4()}/stream")
        assert response.status_code == 404
        assert "not found" in response.json()["detail"].lower()

    def test_stream_returns_exact_file_content(self, client: TestClient):
        created = _upload(client, "bytes.mp4", content=FAKE_VIDEO_BYTES)
        response = client.get(f"/api/v1/videos/{created['id']}/stream")
        assert response.status_code == 200
        assert response.content == FAKE_VIDEO_BYTES

    def test_stream_returns_404_when_file_missing_from_disk(self, client: TestClient, db_session: Session):
        from app.models.video import Video
        created = _upload(client, "orphan.mp4")
        Path(created["filepath"]).unlink(missing_ok=True)
        response = client.get(f"/api/v1/videos/{created['id']}/stream")
        assert response.status_code == 404
        assert "disk" in response.json()["detail"].lower()
        # Remove the orphaned DB record so it doesn't pollute later tests
        db_session.expire_all()
        record = db_session.get(Video, created["id"])
        if record:
            db_session.delete(record)
            db_session.commit()
