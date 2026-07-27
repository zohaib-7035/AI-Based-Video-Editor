from contextlib import asynccontextmanager
from collections.abc import AsyncGenerator

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.database import engine, init_db
from app.core.logging_config import setup_logging
import app.models  # noqa: F401 — registers all ORM models with Base.metadata before init_db
from app.api.v1 import health, videos, transcriptions, subtitles, silence, fillers, assistant, execute_plan, export

setup_logging()

import logging
logger = logging.getLogger(__name__)


def _migrate_filler_columns() -> None:
    """Add filler_export_path to videos if it does not exist yet."""
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError

    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE videos ADD COLUMN filler_export_path TEXT"))
            conn.commit()
            logger.info("Added column videos.filler_export_path")
        except OperationalError:
            pass


def _migrate_executed_plan_column() -> None:
    """Add executed_plan_path to videos if it does not exist yet."""
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError

    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE videos ADD COLUMN executed_plan_path TEXT"))
            conn.commit()
            logger.info("Added column videos.executed_plan_path")
        except OperationalError:
            pass


def _migrate_silence_columns() -> None:
    """Add export_path to videos if it does not exist yet."""
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError

    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE videos ADD COLUMN export_path TEXT"))
            conn.commit()
            logger.info("Added column videos.export_path")
        except OperationalError:
            pass


def _migrate_transcript_subtitle_columns() -> None:
    """Add srt_path and vtt_path to transcripts if they don't exist yet.

    create_all() does not alter existing tables, so new columns need an
    idempotent ALTER TABLE guard on first startup after this story ships.
    """
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError

    with engine.connect() as conn:
        for col in ("srt_path", "vtt_path"):
            try:
                conn.execute(text(f"ALTER TABLE transcripts ADD COLUMN {col} TEXT"))
                conn.commit()
                logger.info("Added column transcripts.%s", col)
            except OperationalError:
                pass  # column already exists — safe to ignore


def _migrate_encode_export_path_column() -> None:
    """Add encode_export_path to videos if it does not exist yet."""
    from sqlalchemy import text
    from sqlalchemy.exc import OperationalError

    with engine.connect() as conn:
        try:
            conn.execute(text("ALTER TABLE videos ADD COLUMN encode_export_path TEXT"))
            conn.commit()
            logger.info("Added column videos.encode_export_path")
        except OperationalError:
            pass


def _reset_stuck_videos() -> None:
    """On startup, fix videos whose state was corrupted by a previous server exit.

    - 'processing' with no live queue → reset to 'ready' (transcription lost on restart)
    - 'error' → reset to 'ready' (error only ever means a transcription failed;
      the video file itself is still valid and playable)
    """
    from app.core.database import SessionLocal
    from app.models.video import Video, VideoStatus

    db = SessionLocal()
    try:
        stuck = db.query(Video).filter(
            Video.status.in_([VideoStatus.processing, VideoStatus.error])
        ).all()
        if stuck:
            for v in stuck:
                v.status = VideoStatus.ready
            db.commit()
            logger.warning("Reset %d video(s) from stuck state to ready", len(stuck))
    except Exception:
        logger.exception("Failed to reset stuck videos on startup")
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    logger.info("Starting AI Video Editor API v%s", settings.app_version)

    settings.uploads_path.mkdir(parents=True, exist_ok=True)
    settings.exports_path.mkdir(parents=True, exist_ok=True)
    settings.temp_path.mkdir(parents=True, exist_ok=True)
    settings.subtitles_path.mkdir(parents=True, exist_ok=True)

    init_db()
    _migrate_transcript_subtitle_columns()
    _migrate_silence_columns()
    _migrate_filler_columns()
    _migrate_executed_plan_column()
    _migrate_encode_export_path_column()
    _reset_stuck_videos()

    logger.info("Startup complete — listening on %s:%s", settings.app_host, settings.app_port)
    yield

    logger.info("Shutting down")


app = FastAPI(
    title="AI Video Editor",
    description="Open-source AI-powered video editor — local, free, no cloud.",
    version=settings.app_version,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Range", "Accept-Ranges", "Content-Length", "Content-Disposition"],
)

app.include_router(health.router, prefix="/api/v1/health", tags=["health"])
app.include_router(videos.router, prefix="/api/v1/videos", tags=["videos"])
app.include_router(transcriptions.router, prefix="/api/v1/videos", tags=["transcription"])
app.include_router(subtitles.router, prefix="/api/v1/videos", tags=["subtitles"])
app.include_router(silence.router, prefix="/api/v1/videos", tags=["silence"])
app.include_router(fillers.router, prefix="/api/v1/videos", tags=["fillers"])
app.include_router(assistant.router, prefix="/api/v1/videos", tags=["assistant"])
app.include_router(execute_plan.router, prefix="/api/v1/videos", tags=["execute-plan"])
app.include_router(export.router, prefix="/api/v1/videos", tags=["export"])


@app.get("/", tags=["root"])
async def root() -> dict:
    return {
        "name": "AI Video Editor API",
        "version": settings.app_version,
        "docs": "/docs",
        "health": "/api/v1/health",
    }
