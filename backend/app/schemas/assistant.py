from typing import Any, Dict, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field


class EditingCommand(BaseModel):
    model_config = ConfigDict(extra="ignore")

    action: Literal["remove_silence", "remove_fillers", "generate_subtitles", "export"]
    params: Optional[Dict[str, Any]] = None


class EditingPlan(BaseModel):
    commands: List[EditingCommand] = []
    warnings: List[str] = []


class PlanRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=500)
