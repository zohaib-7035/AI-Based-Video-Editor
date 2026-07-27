import logging
import subprocess
from typing import Literal

import httpx
from fastapi import APIRouter
from pydantic import BaseModel
from sqlalchemy import text

from app.core.config import settings
from app.core.database import SessionLocal

logger = logging.getLogger(__name__)

router = APIRouter()

ServiceStatus = Literal["ok", "offline", "error"]


class ServicesStatus(BaseModel):
    database: ServiceStatus
    ffmpeg: ServiceStatus
    ollama: ServiceStatus
    storage: ServiceStatus


class HealthResponse(BaseModel):
    status: ServiceStatus
    version: str
    services: ServicesStatus


def _check_database() -> ServiceStatus:
    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return "ok"
    except Exception as exc:
        logger.warning("Database health check failed: %s", exc)
        return "error"


def _check_ffmpeg() -> ServiceStatus:
    try:
        result = subprocess.run(
            ["ffmpeg", "-version"],
            capture_output=True,
            timeout=5,
        )
        return "ok" if result.returncode == 0 else "error"
    except FileNotFoundError:
        return "offline"
    except Exception as exc:
        logger.warning("FFmpeg health check failed: %s", exc)
        return "error"


def _check_ollama() -> ServiceStatus:
    try:
        with httpx.Client(timeout=2.0) as client:
            response = client.get(f"{settings.ollama_base_url}/api/tags")
            return "ok" if response.status_code == 200 else "error"
    except httpx.ConnectError:
        return "offline"
    except Exception as exc:
        logger.warning("Ollama health check failed: %s", exc)
        return "error"


def _check_storage() -> ServiceStatus:
    try:
        for path in (settings.uploads_path, settings.exports_path, settings.temp_path):
            if not path.exists():
                return "error"
        return "ok"
    except Exception as exc:
        logger.warning("Storage health check failed: %s", exc)
        return "error"


@router.get("", response_model=HealthResponse)
async def health_check() -> HealthResponse:
    services = ServicesStatus(
        database=_check_database(),
        ffmpeg=_check_ffmpeg(),
        ollama=_check_ollama(),
        storage=_check_storage(),
    )
    overall: ServiceStatus = (
        "ok"
        if all(s == "ok" for s in [services.database, services.storage])
        else "error"
    )
    return HealthResponse(
        status=overall,
        version=settings.app_version,
        services=services,
    )
