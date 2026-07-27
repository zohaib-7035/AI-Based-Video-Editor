from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.video import Video
from app.schemas.export import ExportRequest
from app.services.export import ExportService
from app.services.video import VideoService

logger = logging.getLogger(__name__)

router = APIRouter()

_in_flight: set = set()


async def _stream_with_cleanup(
    video_id: str,
    video: Video,
    resolution: str,
    db: Session,
) -> AsyncGenerator[str, None]:
    try:
        async for chunk in ExportService.encode(video, resolution, db):
            yield chunk
    except Exception as exc:
        logger.exception("Export encode failed: video_id=%s", video_id)
        yield f"data: {json.dumps({'type': 'error', 'message': str(exc)})}\n\n"
    finally:
        _in_flight.discard(video_id)


@router.post("/{video_id}/export")
async def export_video(
    video_id: str,
    body: ExportRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    if video_id in _in_flight:
        raise HTTPException(
            status_code=409,
            detail="Export already in progress for this video.",
        )

    video = VideoService.get_by_id(video_id, db)
    _in_flight.add(video_id)

    return StreamingResponse(
        _stream_with_cleanup(video_id, video, body.resolution, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/{video_id}/export/download")
def download_export(
    video_id: str,
    db: Session = Depends(get_db),
) -> FileResponse:
    video = VideoService.get_by_id(video_id, db)

    if not video.encode_export_path:
        raise HTTPException(
            status_code=404,
            detail="No exported file found. Run export first.",
        )

    export_path = Path(video.encode_export_path)
    if not export_path.exists():
        raise HTTPException(
            status_code=404,
            detail="Exported file not found on disk.",
        )

    stem = Path(video.filename).stem
    return FileResponse(
        path=export_path,
        media_type="video/mp4",
        content_disposition_type="attachment",
        filename=f"{stem}_export.mp4",
    )
