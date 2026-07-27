from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.video import Video
from app.schemas.filler import FillerDetectionResponse
from app.services.filler import FillerService
from app.services.video import VideoService

logger = logging.getLogger(__name__)

router = APIRouter()

_in_flight: set = set()


@router.post("/{video_id}/fillers/detect", response_model=FillerDetectionResponse)
def detect_fillers(
    video_id: str,
    db: Session = Depends(get_db),
) -> FillerDetectionResponse:
    video = VideoService.get_by_id(video_id, db)
    return FillerService.detect(video, db)


@router.get("/{video_id}/fillers", response_model=FillerDetectionResponse)
def get_fillers(
    video_id: str,
    db: Session = Depends(get_db),
) -> FillerDetectionResponse:
    VideoService.get_by_id(video_id, db)
    return FillerService.get_segments(video_id, db)


@router.post("/{video_id}/fillers/remove")
async def remove_fillers(
    video_id: str,
    db: Session = Depends(get_db),
) -> JSONResponse:
    if video_id in _in_flight:
        raise HTTPException(status_code=409, detail="Filler removal already in progress for this video.")

    _in_flight.add(video_id)
    try:
        video: Video = VideoService.get_by_id(video_id, db)
        export_url = await FillerService.remove(video, db)
    finally:
        _in_flight.discard(video_id)

    logger.info("Filler removal complete: video_id=%s", video_id)
    return JSONResponse({"export_url": export_url})


@router.get("/{video_id}/fillers/export/stream")
def stream_filler_export(
    video_id: str,
    db: Session = Depends(get_db),
) -> FileResponse:
    video = VideoService.get_by_id(video_id, db)
    if not video.filler_export_path:
        raise HTTPException(status_code=404, detail="No exported file found. Run filler removal first.")

    export_path = Path(video.filler_export_path)
    if not export_path.exists():
        raise HTTPException(status_code=404, detail="Exported file not found on disk.")

    stem = Path(video.filename).stem
    return FileResponse(
        path=export_path,
        media_type="video/mp4",
        content_disposition_type="inline",
        filename=f"{stem}_no_fillers.mp4",
    )
