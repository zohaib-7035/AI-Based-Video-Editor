from __future__ import annotations

import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, JSONResponse, Response
from sqlalchemy.orm import Session

from app.core.dependencies import get_db
from app.models.transcript import Transcript, TranscriptStatus
from app.services.subtitle import SubtitleService
from app.services.video import VideoService

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/{video_id}/subtitles/generate")
def generate_subtitles(
    video_id: str,
    db: Session = Depends(get_db),
) -> JSONResponse:
    VideoService.get_by_id(video_id, db)
    result = SubtitleService.generate(video_id, db)
    logger.info("Subtitles generated: video_id=%s", video_id)
    return JSONResponse(result)


@router.get("/{video_id}/subtitles/srt")
def download_srt(
    video_id: str,
    db: Session = Depends(get_db),
) -> FileResponse:
    video = VideoService.get_by_id(video_id, db)
    transcript = (
        db.query(Transcript)
        .filter(
            Transcript.video_id == video_id,
            Transcript.status == TranscriptStatus.completed,
        )
        .first()
    )
    if not transcript or not transcript.srt_path:
        raise HTTPException(status_code=404, detail="SRT subtitle file not found")

    srt_path = Path(transcript.srt_path)
    if not srt_path.exists():
        raise HTTPException(status_code=404, detail="SRT subtitle file not found on disk")

    stem = Path(video.filename).stem
    return FileResponse(
        path=srt_path,
        media_type="text/plain",
        content_disposition_type="attachment",
        filename=f"{stem}.srt",
    )


@router.get("/{video_id}/subtitles/vtt")
def serve_vtt(
    video_id: str,
    db: Session = Depends(get_db),
) -> Response:
    transcript = (
        db.query(Transcript)
        .filter(
            Transcript.video_id == video_id,
            Transcript.status == TranscriptStatus.completed,
        )
        .first()
    )
    if not transcript or not transcript.vtt_path:
        raise HTTPException(status_code=404, detail="VTT subtitle file not found")

    vtt_path = Path(transcript.vtt_path)
    if not vtt_path.exists():
        raise HTTPException(status_code=404, detail="VTT subtitle file not found on disk")

    return Response(
        content=vtt_path.read_text(encoding="utf-8"),
        media_type="text/vtt",
    )
