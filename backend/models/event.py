from typing import Optional
from pydantic import BaseModel


class Event(BaseModel):
    session_id: str
    event: str          # "file_open" | "file_edit" | "prompt_sent" | "test_run" | "ai_apply"
    file: Optional[str] = None
    ts: int             # Unix timestamp in milliseconds
    meta: Optional[dict] = None
