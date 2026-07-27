from __future__ import annotations

import asyncio
import json
import logging
from typing import Dict, Optional

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.database import SessionLocal
from app.core.dependencies import get_db
from app.models.transcript import Transcript, TranscriptStatus
from app.models.video import Video, VideoStatus
from app.schemas.transcript import TranscriptResponse
from app.services.transcription import TranscriptionService
from app.services.video import VideoService

logger = logging.getLogger(__name__)

router = APIRouter()

# Per-video asyncio queues for WebSocket progress streaming.
# Created in the POST handler before background task dispatch so the queue
# exists by the time any WebSocket client connects.
_queues: Dict[str, asyncio.Queue] = {}

# Tracks video IDs with an active transcription job; guards against 409.
_in_flight: set = set()


@router.post("/{video_id}/transcribe", status_code=202)
async def start_transcription(
    video_id: str,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
) -> JSONResponse:
    video = VideoService.get_by_id(video_id, db)

    if video_id in _in_flight:
        raise HTTPException(status_code=409, detail="Transcription already in progress")

    _in_flight.add(video_id)
    _queues[video_id] = asyncio.Queue()

    video.status = VideoStatus.processing
    db.commit()

    background_tasks.add_task(_run_transcription_task, video_id, video.filepath, video.duration)

    logger.info("Transcription queued: video_id=%s", video_id)
    return JSONResponse({"job": "started", "video_id": video_id}, status_code=202)


@router.get("/{video_id}/transcript", response_model=TranscriptResponse)
def get_transcript(video_id: str, db: Session = Depends(get_db)) -> TranscriptResponse:
    record = (
        db.query(Transcript)
        .filter(Transcript.video_id == video_id)
        .order_by(Transcript.created_at.desc())
        .first()
    )
    if not record:
        raise HTTPException(status_code=404, detail="No transcript found for this video")
    return TranscriptResponse.model_validate(record)


@router.websocket("/{video_id}/transcribe/ws")
async def websocket_transcription_progress(
    websocket: WebSocket,
    video_id: str,
    db: Session = Depends(get_db),
) -> None:
    await websocket.accept()

    queue = _queues.get(video_id)
    if queue is None:
        # Queue is gone — either transcription finished before the WS connected,
        # or the server restarted and wiped in-memory state. Check DB for truth.
        video = db.get(Video, video_id)
        if video and video.status == VideoStatus.ready:
            await websocket.send_json({"progress": 100, "status": "completed"})
        elif video and video.status == VideoStatus.error:
            await websocket.send_json({"progress": 0, "status": "error", "detail": "Transcription failed"})
        else:
            await websocket.send_json({"status": "error", "detail": "No active transcription"})
        await websocket.close()
        return

    try:
        while True:
            msg = await queue.get()
            await websocket.send_json(msg)
            if msg.get("status") in ("completed", "error"):
                break
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected: video_id=%s", video_id)


async def _run_transcription_task(video_id: str, filepath: str, duration: Optional[float]) -> None:
    loop = asyncio.get_event_loop()
    queue = _queues.get(video_id)

    def progress_callback(pct: int) -> None:
        if queue is not None:
            loop.call_soon_threadsafe(queue.put_nowait, {"progress": pct, "status": "processing"})

    db = SessionLocal()
    transcript: Optional[Transcript] = None

    try:
        result = await asyncio.to_thread(
            TranscriptionService.run,
            video_id,
            filepath,
            duration,
            settings.whisper_model,
            progress_callback,
        )

        transcript = Transcript(
            video_id=video_id,
            text=result["text"],
            segments=json.dumps(result["segments"]),
            language=result["language"],
            status=TranscriptStatus.completed,
        )
        db.add(transcript)
        db.commit()

        video = db.get(Video, video_id)
        if video:
            video.status = VideoStatus.ready
            db.commit()

        if queue is not None:
            loop.call_soon_threadsafe(queue.put_nowait, {"progress": 100, "status": "completed"})

        logger.info("Transcription completed: video_id=%s", video_id)

    except Exception as exc:
        logger.exception("Transcription failed: video_id=%s error=%s", video_id, exc)

        if queue is not None:
            loop.call_soon_threadsafe(
                queue.put_nowait,
                {"progress": 0, "status": "error", "detail": str(exc)},
            )

        try:
            video = db.get(Video, video_id)
            if video:
                # Video itself is still valid — only the transcription failed.
                # Restore to ready so the user can play the video and retry.
                video.status = VideoStatus.ready
            if transcript is not None:
                transcript.status = TranscriptStatus.error
                transcript.error = str(exc)
            else:
                transcript = Transcript(
                    video_id=video_id,
                    status=TranscriptStatus.error,
                    error=str(exc),
                )
                db.add(transcript)
            db.commit()
        except Exception:
            logger.exception("Failed to persist error state: video_id=%s", video_id)

    finally:
        db.close()
        _in_flight.discard(video_id)
        _queues.pop(video_id, None)
