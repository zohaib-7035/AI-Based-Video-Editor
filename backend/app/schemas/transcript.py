from __future__ import annotations

import json
from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, field_validator


class TranscriptSegment(BaseModel):
    start: float
    end: float
    text: str


class TranscriptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    video_id: str
    text: Optional[str]
    segments: List[TranscriptSegment]
    language: Optional[str]
    status: str
    error: Optional[str]
    srt_path: Optional[str]
    vtt_path: Optional[str]
    created_at: datetime

    @field_validator("segments", mode="before")
    @classmethod
    def decode_segments(cls, v: object) -> list:
        if isinstance(v, str) and v:
            return json.loads(v)
        if v is None or v == "":
            return []
        return v  # already a list (e.g. from a test fixture)
