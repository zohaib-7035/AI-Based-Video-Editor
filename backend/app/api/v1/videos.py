from __future__ import annotations

import logging
from pathlib import Path
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Request, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.dependencies import get_db
from app.schemas.video import VideoResponse
from app.services.video import VideoService

logger = logging.getLogger(__name__)

router = APIRouter()

MIME_TYPES: dict = {
    ".mp4": "video/mp4",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
}


@router.get("", response_model=List[VideoResponse])
def list_videos(db: Session = Depends(get_db)) -> List[VideoResponse]:
    videos = VideoService.list_all(db)
    return [VideoResponse.model_validate(v) for v in videos]


@router.get("/{video_id}/stream")
def stream_video(video_id: str, db: Session = Depends(get_db)) -> FileResponse:
    video = VideoService.get_by_id(video_id, db)
    filepath = Path(video.filepath)
    if not filepath.exists():
        raise HTTPException(status_code=404, detail="Video file not found on disk.")
    mime_type = MIME_TYPES.get(filepath.suffix.lower(), "video/mp4")
    return FileResponse(
        str(filepath),
        media_type=mime_type,
        filename=video.filename,
        content_disposition_type="inline",
    )


@router.post("/upload", response_model=VideoResponse, status_code=200)
async def upload_video(
    request: Request,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
) -> VideoResponse:
    # Early rejection before the body is read — avoids buffering a huge file.
    raw_length = request.headers.get("content-length")
    if raw_length and raw_length.isdigit():
        if int(raw_length) > settings.max_upload_size_bytes:
            raise HTTPException(
                status_code=413,
                detail=f"File exceeds the {settings.max_upload_size_mb} MB upload limit.",
            )

    return await VideoService.upload(file, db)


@router.get("/{video_id}", response_model=VideoResponse)
def get_video(video_id: str, db: Session = Depends(get_db)) -> VideoResponse:
    video = VideoService.get_by_id(video_id, db)
    return VideoResponse.model_validate(video)


@router.delete("/{video_id}")
def delete_video(video_id: str, db: Session = Depends(get_db)) -> dict:
    VideoService.delete(video_id, db)
    return {"message": "Video deleted."}
