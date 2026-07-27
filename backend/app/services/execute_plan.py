from __future__ import annotations

import json
import logging
from typing import AsyncGenerator, List, Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from app.models.filler import FillerDetection as FillerModel
from app.models.silence import SilenceDetection as SilenceModel
from app.models.video import Video
from app.schemas.assistant import EditingCommand
from app.services.export import ExportService
from app.services.filler import FillerService
from app.services.silence import SilenceService
from app.services.subtitle import SubtitleService

logger = logging.getLogger(__name__)


def _sse(payload: dict) -> str:
    return f"data: {json.dumps(payload)}\n\n"


class ExecutePlanService:

    @classmethod
    async def execute(
        cls,
        commands: List[EditingCommand],
        video: Video,
        db: Session,
    ) -> AsyncGenerator[str, None]:
        total = len(commands)
        last_export_url: Optional[str] = None

        for step, cmd in enumerate(commands, start=1):
            action = cmd.action
            skip = False

            yield _sse({"type": "progress", "step": step, "total": total, "action": action, "status": "started"})

            try:
                if action == "remove_silence":
                    # Auto-detect if detection hasn't been run yet
                    if not db.query(SilenceModel).filter(SilenceModel.video_id == video.id).first():
                        await SilenceService.detect(video, db)
                    last_export_url = await SilenceService.remove(video, db)

                elif action == "remove_fillers":
                    # Auto-detect if detection hasn't been run yet
                    if not db.query(FillerModel).filter(FillerModel.video_id == video.id).first():
                        FillerService.detect(video, db)
                    last_export_url = await FillerService.remove(video, db)

                elif action == "generate_subtitles":
                    try:
                        SubtitleService.generate(video.id, db)
                    except HTTPException as exc:
                        if exc.status_code == 409:
                            yield _sse({"type": "warning", "action": action, "detail": exc.detail})
                            skip = True
                        else:
                            raise

                elif action == "export":
                    resolution = str(cmd.params.get("resolution", "1080p")) if cmd.params else "1080p"
                    async for _ in ExportService.encode(video, resolution, db):
                        pass
                    last_export_url = f"/api/v1/videos/{video.id}/export/download"

                else:
                    yield _sse({"type": "warning", "action": action, "detail": f"unknown action '{action}'; skipped"})
                    skip = True

            except HTTPException as exc:
                logger.warning(
                    "Execute plan step failed: action=%s status=%d detail=%s",
                    action, exc.status_code, exc.detail,
                )
                yield _sse({"type": "warning", "action": action, "detail": exc.detail})
                skip = True  # skip this step but continue the plan

            except Exception as exc:
                logger.exception("Execute plan step unexpected error: action=%s", action)
                yield _sse({"type": "warning", "action": action, "detail": str(exc)})
                skip = True  # skip this step but continue the plan

            if not skip:
                yield _sse({"type": "progress", "step": step, "total": total, "action": action, "status": "done"})

        executed_plan_path = last_export_url or f"/api/v1/videos/{video.id}/stream"
        fresh = db.get(Video, video.id) or video
        fresh.executed_plan_path = executed_plan_path
        db.commit()

        logger.info("Execute plan complete: video_id=%s path=%s", video.id, executed_plan_path)
        yield _sse({"type": "done", "executed_plan_path": executed_plan_path})
