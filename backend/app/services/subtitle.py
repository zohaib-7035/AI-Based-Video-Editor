from __future__ import annotations

from typing import Dict, List

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.schemas.transcript import TranscriptSegment


class SubtitleService:

    @classmethod
    def generate(cls, video_id: str, db: Session) -> Dict[str, str]:
        from app.core.config import settings
        from app.models.transcript import Transcript, TranscriptStatus
        from app.schemas.transcript import TranscriptResponse

        record = (
            db.query(Transcript)
            .filter(
                Transcript.video_id == video_id,
                Transcript.status == TranscriptStatus.completed,
            )
            .first()
        )
        if not record:
            raise HTTPException(
                status_code=400,
                detail="No completed transcript found for this video",
            )
        if record.srt_path is not None:
            raise HTTPException(
                status_code=409,
                detail="Subtitles already generated. Delete and regenerate if needed.",
            )

        tr = TranscriptResponse.model_validate(record)
        srt_content = cls.to_srt(tr.segments)
        vtt_content = cls.to_vtt(tr.segments)

        srt_file = settings.subtitles_path / f"{video_id}.srt"
        vtt_file = settings.subtitles_path / f"{video_id}.vtt"
        srt_file.write_bytes(srt_content.encode("utf-8"))
        vtt_file.write_bytes(vtt_content.encode("utf-8"))

        record.srt_path = srt_file.as_posix()
        record.vtt_path = vtt_file.as_posix()
        db.commit()

        return {
            "srt_url": f"/api/v1/videos/{video_id}/subtitles/srt",
            "vtt_url": f"/api/v1/videos/{video_id}/subtitles/vtt",
        }

    @staticmethod
    def _format_ts(seconds: float, sep: str) -> str:
        total_ms = round(seconds * 1000)
        ms = total_ms % 1000
        total_s = total_ms // 1000
        s = total_s % 60
        total_m = total_s // 60
        m = total_m % 60
        h = total_m // 60
        return f"{h:02d}:{m:02d}:{s:02d}{sep}{ms:03d}"

    @classmethod
    def to_srt(cls, segments: List[TranscriptSegment]) -> str:
        if not segments:
            return ""
        lines: List[str] = []
        for i, seg in enumerate(segments, start=1):
            lines.append(str(i))
            lines.append(
                f"{cls._format_ts(seg.start, ',')} --> {cls._format_ts(seg.end, ',')}"
            )
            lines.append(seg.text)
            lines.append("")
        return "\n".join(lines)

    @classmethod
    def to_vtt(cls, segments: List[TranscriptSegment]) -> str:
        if not segments:
            return "WEBVTT\n"
        lines: List[str] = ["WEBVTT", ""]
        for seg in segments:
            lines.append(
                f"{cls._format_ts(seg.start, '.')} --> {cls._format_ts(seg.end, '.')}"
            )
            lines.append(seg.text)
            lines.append("")
        return "\n".join(lines)
