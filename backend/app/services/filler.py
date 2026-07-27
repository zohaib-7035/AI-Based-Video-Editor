from __future__ import annotations

import json
import logging
import re
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.filler import FillerDetection
from app.models.transcript import Transcript, TranscriptStatus
from app.models.video import Video
from app.schemas.filler import FillerDetectionResponse
from app.services.ffmpeg import FFmpegService

logger = logging.getLogger(__name__)

FILLER_WORDS = frozenset({
    "um", "uh", "hmm", "hm", "uh-huh", "mm-hmm", "mmm",
    "like", "you know", "so", "er", "ah", "uhh", "umm",
})

_PUNCT_RE = re.compile(r"[^\w\s-]")


def _normalise(text: str) -> str:
    return _PUNCT_RE.sub("", text.strip().lower())


class FillerService:

    @classmethod
    def detect(cls, video: Video, db: Session) -> FillerDetectionResponse:
        transcript = (
            db.query(Transcript)
            .filter(Transcript.video_id == video.id)
            .first()
        )
        if not transcript or transcript.status != TranscriptStatus.completed:
            raise HTTPException(
                status_code=400,
                detail="Transcribe the video first before detecting filler words.",
            )

        raw_segments: List[dict] = json.loads(transcript.segments or "[]")
        filler_segments: List[dict] = []
        for seg in raw_segments:
            normalised = _normalise(seg.get("text", ""))
            if normalised in FILLER_WORDS:
                start = float(seg["start"])
                end = float(seg["end"])
                filler_segments.append({
                    "word": normalised,
                    "start": round(start, 6),
                    "end": round(end, 6),
                    "duration": round(end - start, 6),
                })

        existing = (
            db.query(FillerDetection)
            .filter(FillerDetection.video_id == video.id)
            .first()
        )
        if existing:
            db.delete(existing)
            db.flush()

        record = FillerDetection(
            id=str(uuid.uuid4()),
            video_id=video.id,
            segments=json.dumps(filler_segments),
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        logger.info("Filler words detected: video_id=%s count=%d", video.id, len(filler_segments))
        return FillerDetectionResponse.model_validate(record)

    @classmethod
    def get_segments(cls, video_id: str, db: Session) -> FillerDetectionResponse:
        record = (
            db.query(FillerDetection)
            .filter(FillerDetection.video_id == video_id)
            .first()
        )
        if not record:
            raise HTTPException(
                status_code=404,
                detail="No filler detection found for this video. Run detection first.",
            )
        return FillerDetectionResponse.model_validate(record)

    @staticmethod
    def compute_non_filler_windows(
        video_duration: float,
        filler_segments: List[dict],
    ) -> List[Tuple[float, float]]:
        windows: List[Tuple[float, float]] = []
        cursor = 0.0

        for seg in sorted(filler_segments, key=lambda s: s["start"]):
            s_start = seg["start"]
            s_end = seg["end"]
            if s_start > cursor:
                windows.append((round(cursor, 6), round(s_start, 6)))
            cursor = max(cursor, s_end)

        if cursor < video_duration:
            windows.append((round(cursor, 6), round(video_duration, 6)))

        return windows

    @classmethod
    async def remove(cls, video: Video, db: Session) -> str:
        record = (
            db.query(FillerDetection)
            .filter(FillerDetection.video_id == video.id)
            .first()
        )
        if not record:
            raise HTTPException(
                status_code=400,
                detail="No filler segments found. Run filler detection first.",
            )

        filler_segments: List[dict] = json.loads(record.segments or "[]")
        video_duration: float = video.duration or 0.0

        windows = cls.compute_non_filler_windows(video_duration, filler_segments)
        if not windows:
            raise HTTPException(
                status_code=400,
                detail="The entire video consists of filler words — no segments to keep.",
            )

        segment_paths: List[Path] = []
        try:
            for i, (start, end) in enumerate(windows):
                seg_path = settings.temp_path / f"{video.id}_filler_seg_{i}.mp4"
                cmd_parts = [
                    "ffmpeg", "-y",
                    "-ss", str(start),
                    "-to", str(end),
                    "-i", video.filepath,
                    "-c", "copy",
                    seg_path.as_posix(),
                ]
                import asyncio
                import subprocess

                def _run(cmd: list) -> subprocess.CompletedProcess:
                    return subprocess.run(cmd, capture_output=True, timeout=120)

                result = await asyncio.to_thread(_run, cmd_parts)
                if result.returncode != 0:
                    raise ValueError(
                        f"FFmpeg failed extracting segment {i}: "
                        + result.stderr.decode(errors="replace")[-200:]
                    )
                segment_paths.append(seg_path)

            stem = Path(video.filename).stem
            output_path = settings.exports_path / f"{video.id}_{stem}_no_fillers.mp4"
            await FFmpegService.concat_segments(segment_paths, output_path)

        except (ValueError, Exception) as exc:
            raise HTTPException(status_code=500, detail=f"Filler removal failed: {exc}") from exc
        finally:
            for p in segment_paths:
                p.unlink(missing_ok=True)

        video = db.get(Video, video.id) or video
        video.filler_export_path = output_path.as_posix()
        db.commit()

        logger.info("Fillers removed: video_id=%s export=%s", video.id, output_path)
        return f"/api/v1/videos/{video.id}/fillers/export/stream"
