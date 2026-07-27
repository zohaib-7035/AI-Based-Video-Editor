from __future__ import annotations

from datetime import datetime
from typing import Optional

from pydantic import BaseModel, ConfigDict


class VideoCreate(BaseModel):
    """Internal DTO — built from FFmpeg probe output before writing the DB record."""
    filename: str
    filepath: str
    file_size: int
    duration: Optional[float] = None
    width: Optional[int] = None
    height: Optional[int] = None
    fps: Optional[float] = None
    codec: Optional[str] = None
    format: Optional[str] = None


class VideoResponse(BaseModel):
    """API-facing schema — serialises a Video ORM instance for HTTP responses."""
    model_config = ConfigDict(from_attributes=True)

    id: str
    filename: str
    filepath: str
    file_size: int
    duration: Optional[float]
    width: Optional[int]
    height: Optional[int]
    fps: Optional[float]
    codec: Optional[str]
    format: Optional[str]
    status: str
    export_path: Optional[str]
    filler_export_path: Optional[str]
    created_at: datetime
    updated_at: datetime
