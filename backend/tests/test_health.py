"""
Tests for GET /api/v1/health.

Overall status logic (from health.py):
  - "ok"    only when BOTH database AND storage are "ok"
  - "error" otherwise
  FFmpeg and Ollama are informational — they never affect the overall status.
"""

from unittest.mock import patch

import pytest
from fastapi.testclient import TestClient

MODULE = "app.api.v1.health"

ALL_OK = dict(
    _check_database=lambda: "ok",
    _check_ffmpeg=lambda: "ok",
    _check_ollama=lambda: "ok",
    _check_storage=lambda: "ok",
)


def _patch_checks(client: TestClient, **overrides) -> dict:
    """Call the health endpoint with all checks mocked; override specific ones."""
    mocks = {**ALL_OK, **overrides}
    patches = [patch(f"{MODULE}.{name}", side_effect=fn) for name, fn in mocks.items()]
    with patches[0], patches[1], patches[2], patches[3]:
        return client.get("/api/v1/health").json(), client.get("/api/v1/health")


# ---------------------------------------------------------------------------
# Happy-path tests
# ---------------------------------------------------------------------------


class TestHealthHappyPath:
    def test_returns_200_when_all_services_ok(self, client: TestClient):
        with (
            patch(f"{MODULE}._check_database", return_value="ok"),
            patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
            patch(f"{MODULE}._check_ollama", return_value="ok"),
            patch(f"{MODULE}._check_storage", return_value="ok"),
        ):
            response = client.get("/api/v1/health")

        assert response.status_code == 200

    def test_response_body_overall_ok_when_all_services_ok(self, client: TestClient):
        with (
            patch(f"{MODULE}._check_database", return_value="ok"),
            patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
            patch(f"{MODULE}._check_ollama", return_value="ok"),
            patch(f"{MODULE}._check_storage", return_value="ok"),
        ):
            data = client.get("/api/v1/health").json()

        assert data["status"] == "ok"

    def test_response_contains_version_string(self, client: TestClient):
        with (
            patch(f"{MODULE}._check_database", return_value="ok"),
            patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
            patch(f"{MODULE}._check_ollama", return_value="ok"),
            patch(f"{MODULE}._check_storage", return_value="ok"),
        ):
            data = client.get("/api/v1/health").json()

        assert isinstance(data["version"], str)
        assert len(data["version"]) > 0

    def test_response_reports_all_four_services(self, client: TestClient):
        with (
            patch(f"{MODULE}._check_database", return_value="ok"),
            patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
            patch(f"{MODULE}._check_ollama", return_value="ok"),
            patch(f"{MODULE}._check_storage", return_value="ok"),
        ):
            data = client.get("/api/v1/health").json()

        assert set(data["services"].keys()) == {"database", "ffmpeg", "ollama", "storage"}
        assert all(v == "ok" for v in data["services"].values())


# ---------------------------------------------------------------------------
# Schema / contract tests
# ---------------------------------------------------------------------------


class TestHealthResponseSchema:
    def test_top_level_keys_present(self, client: TestClient):
        with (
            patch(f"{MODULE}._check_database", return_value="ok"),
            patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
            patch(f"{MODULE}._check_ollama", return_value="ok"),
            patch(f"{MODULE}._check_storage", return_value="ok"),
        ):
            data = client.get("/api/v1/health").json()

        assert "status" in data
        assert "version" in data
        assert "services" in data

    def test_status_values_are_valid_enum_members(self, client: TestClient):
        valid = {"ok", "offline", "error"}
        for db_status in ("ok", "error"):
            with (
                patch(f"{MODULE}._check_database", return_value=db_status),
                patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
                patch(f"{MODULE}._check_ollama", return_value="ok"),
                patch(f"{MODULE}._check_storage", return_value="ok"),
            ):
                data = client.get("/api/v1/health").json()

            assert data["status"] in valid
            for svc_status in data["services"].values():
                assert svc_status in valid


# ---------------------------------------------------------------------------
# Negative-path / error-state tests
# ---------------------------------------------------------------------------


class TestHealthErrorStates:
    def test_overall_status_error_when_database_fails(self, client: TestClient):
        with (
            patch(f"{MODULE}._check_database", return_value="error"),
            patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
            patch(f"{MODULE}._check_ollama", return_value="ok"),
            patch(f"{MODULE}._check_storage", return_value="ok"),
        ):
            data = client.get("/api/v1/health").json()

        assert data["status"] == "error"
        assert data["services"]["database"] == "error"

    def test_overall_status_error_when_storage_fails(self, client: TestClient):
        with (
            patch(f"{MODULE}._check_database", return_value="ok"),
            patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
            patch(f"{MODULE}._check_ollama", return_value="ok"),
            patch(f"{MODULE}._check_storage", return_value="error"),
        ):
            data = client.get("/api/v1/health").json()

        assert data["status"] == "error"
        assert data["services"]["storage"] == "error"

    def test_overall_status_ok_when_ollama_offline(self, client: TestClient):
        """Ollama is optional — its offline state must not degrade overall status."""
        with (
            patch(f"{MODULE}._check_database", return_value="ok"),
            patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
            patch(f"{MODULE}._check_ollama", return_value="offline"),
            patch(f"{MODULE}._check_storage", return_value="ok"),
        ):
            data = client.get("/api/v1/health").json()

        assert data["status"] == "ok"
        assert data["services"]["ollama"] == "offline"

    def test_overall_status_ok_when_ffmpeg_offline(self, client: TestClient):
        """FFmpeg offline is reported but does not change overall status."""
        with (
            patch(f"{MODULE}._check_database", return_value="ok"),
            patch(f"{MODULE}._check_ffmpeg", return_value="offline"),
            patch(f"{MODULE}._check_ollama", return_value="ok"),
            patch(f"{MODULE}._check_storage", return_value="ok"),
        ):
            data = client.get("/api/v1/health").json()

        assert data["status"] == "ok"
        assert data["services"]["ffmpeg"] == "offline"

    def test_http_status_still_200_when_services_degraded(self, client: TestClient):
        """Health endpoint returns HTTP 200 even when services are down."""
        with (
            patch(f"{MODULE}._check_database", return_value="error"),
            patch(f"{MODULE}._check_ffmpeg", return_value="offline"),
            patch(f"{MODULE}._check_ollama", return_value="offline"),
            patch(f"{MODULE}._check_storage", return_value="error"),
        ):
            response = client.get("/api/v1/health")

        assert response.status_code == 200
        assert response.json()["status"] == "error"


# ---------------------------------------------------------------------------
# Edge-case tests
# ---------------------------------------------------------------------------


class TestHealthEdgeCases:
    def test_all_services_simultaneously_down(self, client: TestClient):
        with (
            patch(f"{MODULE}._check_database", return_value="error"),
            patch(f"{MODULE}._check_ffmpeg", return_value="offline"),
            patch(f"{MODULE}._check_ollama", return_value="offline"),
            patch(f"{MODULE}._check_storage", return_value="error"),
        ):
            data = client.get("/api/v1/health").json()

        assert data["status"] == "error"
        assert data["services"]["database"] == "error"
        assert data["services"]["ffmpeg"] == "offline"
        assert data["services"]["ollama"] == "offline"
        assert data["services"]["storage"] == "error"

    def test_database_offline_treated_as_error_in_overall_status(self, client: TestClient):
        """'offline' for database must also make overall status 'error'."""
        with (
            patch(f"{MODULE}._check_database", return_value="offline"),
            patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
            patch(f"{MODULE}._check_ollama", return_value="ok"),
            patch(f"{MODULE}._check_storage", return_value="ok"),
        ):
            data = client.get("/api/v1/health").json()

        assert data["status"] == "error"

    def test_endpoint_is_idempotent_across_multiple_calls(self, client: TestClient):
        """Repeated calls with same service state must return identical responses."""
        with (
            patch(f"{MODULE}._check_database", return_value="ok"),
            patch(f"{MODULE}._check_ffmpeg", return_value="ok"),
            patch(f"{MODULE}._check_ollama", return_value="ok"),
            patch(f"{MODULE}._check_storage", return_value="ok"),
        ):
            first = client.get("/api/v1/health").json()
            second = client.get("/api/v1/health").json()

        assert first == second
