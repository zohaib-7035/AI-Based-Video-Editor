from typing import Literal

from pydantic import BaseModel


class ExportRequest(BaseModel):
    resolution: Literal["720p", "1080p"]
