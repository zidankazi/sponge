from datetime import datetime
from typing import Optional
from pydantic import BaseModel, Field

from models.event import Event
from models.score import Score


class Session(BaseModel):
    session_id: str
    username: Optional[str] = None
    started_at: datetime = Field(default_factory=datetime.utcnow)
    events: list[Event] = Field(default_factory=list)
    conversation_history: list[dict] = Field(default_factory=list)
    final_code: Optional[str] = None
    score: Optional[Score] = None
