from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path
from typing import AsyncGenerator, List, Optional

from sqlalchemy.orm import Session

from app.core.config import settings
from app.models.video import Video

logger = logging.getLogger(__name__)

_RESOLUTION_SCALE: dict = {
    "720p": "scale=-2:720",
    "1080p": "scale=-2:1080",
}


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


class ExportService:

    @classmethod
    async def encode(
        cls,
        video: Video,
        resolution: str,
        db: Session,
    ) -> AsyncGenerator[str, None]:
        source_path: Optional[str] = (
            video.executed_plan_path
            or video.filler_export_path
            or video.export_path
            or video.filepath
        )
        if not source_path:
            raise ValueError("No source file available for export.")

        source = Path(source_path)
        if not source.exists():
            raise ValueError("Source file not found on disk.")

        scale_filter = _RESOLUTION_SCALE.get(resolution)
        if scale_filter is None:
            raise ValueError(f"Unsupported resolution: {resolution}")

        output_name = f"{uuid.uuid4()}_export_{resolution}.mp4"
        output_path = settings.exports_path / output_name

        cmd = [
            "ffmpeg", "-y",
            "-loglevel", "error",
            "-i", str(source),
            "-vf", scale_filter,
            "-c:v", "libx264",
            "-c:a", "aac",
            "-progress", "pipe:1",
            "-nostats",
            str(output_path),
        ]

        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )

        duration = video.duration
        assert proc.stdout is not None

        try:
            while True:
                line_bytes = await proc.stdout.readline()
                if not line_bytes:
                    break
                line = line_bytes.decode(errors="replace").strip()

                if line.startswith("out_time_ms="):
                    raw = line.split("=", 1)[1]
                    if raw and raw != "N/A":
                        try:
                            elapsed_s = int(raw) / 1_000_000
                            if duration and duration > 0:
                                percent = min(100, int(elapsed_s / duration * 100))
                            else:
                                percent = -1
                            yield _sse({"type": "progress", "percent": percent})
                        except ValueError:
                            pass

                elif line == "progress=end":
                    yield _sse({"type": "progress", "percent": 100})
                    break

        except BaseException:
            proc.kill()
            await proc.wait()
            raise

        # Read remaining stderr and wait for process exit.
        # Using communicate() to drain stdout remainder + all stderr; deadlock
        # is avoided because stdout is nearly exhausted after the loop above.
        _, stderr_bytes = await proc.communicate()

        if proc.returncode != 0:
            error_msg = stderr_bytes.decode(errors="replace").strip()
            raise ValueError(f"ffmpeg encode failed: {error_msg[-300:]}")

        download_url = f"/api/v1/videos/{video.id}/export/download"
        video.encode_export_path = str(output_path)
        db.commit()

        logger.info("Export complete: video_id=%s resolution=%s", video.id, resolution)
        yield _sse({"type": "done", "download_url": download_url})
