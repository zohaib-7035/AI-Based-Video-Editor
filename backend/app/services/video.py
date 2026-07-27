from __future__ import annotations

import logging
import uuid
from pathlib import Path
from typing import List, Optional

import aiofiles
from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.video import Video, VideoStatus
from app.schemas.video import VideoResponse
from app.services.ffmpeg import FFmpegService

logger = logging.getLogger(__name__)

ALLOWED_EXTENSIONS = frozenset({".mp4", ".mov", ".avi", ".mkv", ".webm"})
CHUNK_SIZE = 1024 * 1024  # 1 MB chunks


class VideoService:

    @staticmethod
    def validate_format(filename: str) -> None:
        ext = Path(filename).suffix.lower()
        if ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(
                status_code=422,
                detail=(
                    f"Unsupported file format '{ext}'. "
                    f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}"
                ),
            )

    @staticmethod
    async def _write_upload(file: UploadFile, dest: Path) -> int:
        total = 0
        async with aiofiles.open(dest, "wb") as out:
            while True:
                chunk = await file.read(CHUNK_SIZE)
                if not chunk:
                    break
                await out.write(chunk)
                total += len(chunk)
        return total

    @staticmethod
    async def upload(file: UploadFile, db: Session) -> VideoResponse:
        VideoService.validate_format(file.filename or "")

        ext = Path(file.filename or "").suffix.lower()
        storage_name = f"{uuid.uuid4()}{ext}"
        dest = settings.uploads_path / storage_name

        bytes_written = await VideoService._write_upload(file, dest)

        # Secondary size guard: catches cases where Content-Length was absent or spoofed.
        if bytes_written > settings.max_upload_size_bytes:
            dest.unlink(missing_ok=True)
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds the {settings.max_upload_size_mb} MB upload limit.",
            )

        try:
            metadata = await FFmpegService.probe(dest)
        except Exception as exc:
            dest.unlink(missing_ok=True)
            raise HTTPException(
                status_code=422,
                detail=f"File could not be read by FFmpeg: {exc}",
            ) from exc

        video_id = str(uuid.uuid4())
        video = Video(
            id=video_id,
            filename=file.filename or storage_name,
            filepath=dest.as_posix(),
            file_size=bytes_written,
            duration=metadata.get("duration"),
            width=metadata.get("width"),
            height=metadata.get("height"),
            fps=metadata.get("fps"),
            codec=metadata.get("codec"),
            format=metadata.get("format"),
            status=VideoStatus.ready,
        )
        db.add(video)
        db.commit()
        db.refresh(video)

        logger.info("Video uploaded: id=%s filename=%s size=%d", video.id, video.filename, bytes_written)
        return VideoResponse.model_validate(video)

    @staticmethod
    def list_all(db: Session) -> List[Video]:
        return db.query(Video).order_by(Video.created_at.desc()).all()

    @staticmethod
    def get_by_id(video_id: str, db: Session) -> Video:
        video = db.get(Video, video_id)
        if not video:
            raise HTTPException(status_code=404, detail="Video not found.")
        return video

    @staticmethod
    def delete(video_id: str, db: Session) -> None:
        video = VideoService.get_by_id(video_id, db)
        Path(video.filepath).unlink(missing_ok=True)
        db.delete(video)
        db.commit()
        logger.info("Video deleted: id=%s", video_id)
