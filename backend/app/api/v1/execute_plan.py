from __future__ import annotations

import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.video import Video
from app.schemas.execute_plan import ExecutePlanRequest
from app.services.execute_plan import ExecutePlanService
from app.services.video import VideoService

logger = logging.getLogger(__name__)

router = APIRouter()

_in_flight: set = set()


async def _stream_with_cleanup(
    video_id: str,
    body: ExecutePlanRequest,
    video: Video,
    db: Session,
) -> AsyncGenerator[str, None]:
    try:
        async for chunk in ExecutePlanService.execute(body.commands, video, db):
            yield chunk
    finally:
        _in_flight.discard(video_id)


@router.post("/{video_id}/execute-plan")
async def execute_plan(
    video_id: str,
    body: ExecutePlanRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    if video_id in _in_flight:
        raise HTTPException(
            status_code=409,
            detail="Execution already in progress for this video.",
        )

    video = VideoService.get_by_id(video_id, db)
    _in_flight.add(video_id)

    return StreamingResponse(
        _stream_with_cleanup(video_id, body, video, db),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
