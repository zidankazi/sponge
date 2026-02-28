import uuid
from typing import Optional

from fastapi import APIRouter, Body, HTTPException
from pydantic import BaseModel

import store
from models.event import Event
from models.session import Session

router = APIRouter(tags=["session"])


# ---------- Request / Response schemas ----------

class StartSessionRequest(BaseModel):
    username: Optional[str] = None


class StartSessionResponse(BaseModel):
    session_id: str


class LogEventRequest(BaseModel):
    session_id: str
    event: str          # "file_open" | "file_edit" | "prompt_sent" | "test_run"
    file: Optional[str] = None
    ts: int             # Unix timestamp in milliseconds


# ---------- Endpoints ----------

@router.post("/session/start", response_model=StartSessionResponse)
async def start_session(body: Optional[StartSessionRequest] = Body(default=None)):
    """
    Creates a new session.
    Returns a unique session_id that the frontend uses for all subsequent calls.
    """
    session_id = f"sponge_{uuid.uuid4().hex[:8]}"

    username = body.username if body else None
    session = Session(session_id=session_id, username=username)
    store.sessions[session_id] = session

    return StartSessionResponse(session_id=session_id)


@router.post("/session/event", status_code=200)
async def log_event(body: LogEventRequest):
    """
    Logs a frontend event (file_open, file_edit, prompt_sent, test_run).
    Events are stored on the session and consumed later by the scoring engine.
    """
    session = store.sessions.get(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    event = Event(
        session_id=body.session_id,
        event=body.event,
        file=body.file,
        ts=body.ts,
    )
    session.events.append(event)

    return {}
