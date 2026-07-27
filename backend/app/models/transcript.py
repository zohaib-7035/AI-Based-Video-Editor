import uuid
from datetime import datetime
from enum import Enum
from typing import Optional

from sqlalchemy import DateTime, ForeignKey, Text
from sqlalchemy.orm import Mapped, mapped_column

from app.core.database import Base


class TranscriptStatus(str, Enum):
    processing = "processing"
    completed = "completed"
    error = "error"


class Transcript(Base):
    __tablename__ = "transcripts"

    id: Mapped[str] = mapped_column(Text, primary_key=True, default=lambda: str(uuid.uuid4()))
    video_id: Mapped[str] = mapped_column(Text, ForeignKey("videos.id", ondelete="CASCADE"), nullable=False)
    text: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    segments: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    language: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(Text, nullable=False, default=TranscriptStatus.processing)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    srt_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    vtt_path: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow, nullable=False)
