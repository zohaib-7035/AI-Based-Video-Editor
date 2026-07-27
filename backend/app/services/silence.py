from __future__ import annotations

import json
import logging
import uuid
from pathlib import Path
from typing import List, Optional, Tuple

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.silence import SilenceDetection
from app.models.video import Video
from app.schemas.silence import SilenceDetectionResponse
from app.services.ffmpeg import FFmpegService

logger = logging.getLogger(__name__)


class SilenceService:

    @classmethod
    async def detect(cls, video: Video, db: Session) -> SilenceDetectionResponse:
        segments = await FFmpegService.detect_silence(video.filepath)

        existing = (
            db.query(SilenceDetection)
            .filter(SilenceDetection.video_id == video.id)
            .first()
        )
        if existing:
            db.delete(existing)
            db.flush()

        record = SilenceDetection(
            id=str(uuid.uuid4()),
            video_id=video.id,
            segments=json.dumps(segments),
        )
        db.add(record)
        db.commit()
        db.refresh(record)

        logger.info("Silence detected: video_id=%s segments=%d", video.id, len(segments))
        return SilenceDetectionResponse.model_validate(record)

    @classmethod
    def get_segments(cls, video_id: str, db: Session) -> SilenceDetectionResponse:
        record = (
            db.query(SilenceDetection)
            .filter(SilenceDetection.video_id == video_id)
            .first()
        )
        if not record:
            raise HTTPException(
                status_code=404,
                detail="No silence detection found for this video. Run detection first.",
            )
        return SilenceDetectionResponse.model_validate(record)

    @staticmethod
    def compute_non_silent_windows(
        video_duration: float,
        silence_segments: List[dict],
    ) -> List[Tuple[float, float]]:
        """Invert silence ranges to produce non-silent (start, end) windows."""
        windows: List[Tuple[float, float]] = []
        cursor = 0.0

        for seg in sorted(silence_segments, key=lambda s: s["start"]):
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
            db.query(SilenceDetection)
            .filter(SilenceDetection.video_id == video.id)
            .first()
        )
        if not record:
            raise HTTPException(
                status_code=400,
                detail="No silence segments found. Run silence detection first.",
            )

        silence_segments: List[dict] = json.loads(record.segments or "[]")
        video_duration: float = video.duration or 0.0

        windows = cls.compute_non_silent_windows(video_duration, silence_segments)
        if not windows:
            raise HTTPException(
                status_code=400,
                detail="The entire video is silent — no non-silent segments to keep.",
            )

        segment_paths: List[Path] = []
        try:
            for i, (start, end) in enumerate(windows):
                seg_path = settings.temp_path / f"{video.id}_seg_{i}.mp4"
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
            output_path = settings.exports_path / f"{video.id}_{stem}_no_silence.mp4"
            await FFmpegService.concat_segments(segment_paths, output_path)

        except (ValueError, Exception) as exc:
            raise HTTPException(status_code=500, detail=f"Silence removal failed: {exc}") from exc
        finally:
            for p in segment_paths:
                p.unlink(missing_ok=True)

        video = db.get(Video, video.id) or video
        video.export_path = output_path.as_posix()
        db.commit()

        logger.info("Silence removed: video_id=%s export=%s", video.id, output_path)
        return f"/api/v1/videos/{video.id}/silence/export/stream"
