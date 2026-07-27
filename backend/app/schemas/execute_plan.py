from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field

from app.schemas.assistant import EditingCommand


class ExecutePlanRequest(BaseModel):
    commands: List[EditingCommand] = Field(..., min_length=1)
