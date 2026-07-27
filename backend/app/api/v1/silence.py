from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.video import Video
from app.schemas.silence import SilenceDetectionResponse
from app.services.silence import SilenceService
from app.services.video import VideoService

logger = logging.getLogger(__name__)

router = APIRouter()

_in_flight: set = set()


@router.post("/{video_id}/silence/detect", response_model=SilenceDetectionResponse)
async def detect_silence(
    video_id: str,
    db: Session = Depends(get_db),
) -> SilenceDetectionResponse:
    video = VideoService.get_by_id(video_id, db)
    return await SilenceService.detect(video, db)


@router.get("/{video_id}/silence", response_model=SilenceDetectionResponse)
def get_silence(
    video_id: str,
    db: Session = Depends(get_db),
) -> SilenceDetectionResponse:
    VideoService.get_by_id(video_id, db)
    return SilenceService.get_segments(video_id, db)


@router.post("/{video_id}/silence/remove")
async def remove_silence(
    video_id: str,
    db: Session = Depends(get_db),
) -> JSONResponse:
    if video_id in _in_flight:
        raise HTTPException(status_code=409, detail="Silence removal already in progress for this video.")

    _in_flight.add(video_id)
    try:
        video: Video = VideoService.get_by_id(video_id, db)
        export_url = await SilenceService.remove(video, db)
    finally:
        _in_flight.discard(video_id)

    logger.info("Silence removal complete: video_id=%s", video_id)
    return JSONResponse({"export_url": export_url})


@router.get("/{video_id}/silence/export/stream")
def stream_export(
    video_id: str,
    db: Session = Depends(get_db),
) -> FileResponse:
    video = VideoService.get_by_id(video_id, db)
    if not video.export_path:
        raise HTTPException(status_code=404, detail="No exported file found. Run silence removal first.")

    export_path = Path(video.export_path)
    if not export_path.exists():
        raise HTTPException(status_code=404, detail="Exported file not found on disk.")

    stem = Path(video.filename).stem
    return FileResponse(
        path=export_path,
        media_type="video/mp4",
        content_disposition_type="inline",
        filename=f"{stem}_no_silence.mp4",
    )
