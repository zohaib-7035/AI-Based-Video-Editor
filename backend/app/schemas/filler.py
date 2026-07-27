from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class FillerSegment(BaseModel):
    word: str
    start: float
    end: float
    duration: float


class FillerDetectionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    video_id: str
    segments: List[FillerSegment]
    detected_at: datetime

    @field_validator("segments", mode="before")
    @classmethod
    def decode_segments(cls, v: object) -> List[dict]:
        if isinstance(v, str):
            return json.loads(v)
        if v is None:
            return []
        return v  # type: ignore[return-value]
