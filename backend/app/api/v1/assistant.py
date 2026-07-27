from __future__ import annotations

import logging
from typing import AsyncGenerator

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.schemas.assistant import PlanRequest
from app.services.assistant import AssistantService
from app.services.video import VideoService

logger = logging.getLogger(__name__)

router = APIRouter()

_in_flight: set = set()


async def _stream_with_cleanup(video_id: str, prompt: str) -> AsyncGenerator[str, None]:
    try:
        async for chunk in AssistantService.generate_stream(prompt, video_id):
            yield chunk
    finally:
        _in_flight.discard(video_id)


@router.post("/{video_id}/assistant/plan")
async def generate_editing_plan(
    video_id: str,
    body: PlanRequest,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    if video_id in _in_flight:
        raise HTTPException(
            status_code=409,
            detail="Plan generation already in progress for this video.",
        )

    VideoService.get_by_id(video_id, db)

    _in_flight.add(video_id)

    return StreamingResponse(
        _stream_with_cleanup(video_id, body.prompt),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "X-Accel-Buffering": "no",
        },
    )
