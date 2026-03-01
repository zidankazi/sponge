from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import store
from models.score import Score
from models.session import Session
from scoring.engine import compute_score
from scoring.semantic import evaluate_conversation

router = APIRouter(tags=["submit"])


# ---------- Request / Response schemas ----------

class SubmitRequest(BaseModel):
    session_id: str
    final_code: str             # all edited file contents concatenated / serialised
    username: Optional[str] = None


# ---------- Endpoint ----------

@router.post("/submit", response_model=Score)
async def submit_session(body: SubmitRequest):
    """
    Closes the session, runs the scoring engine, and returns the full score.
    The score is also persisted on the session object for the leaderboard.
    """
    session = store.sessions.get(body.session_id)
    if session is None:
        # Serverless: auto-create so submission works across cold starts
        session = Session(session_id=body.session_id)
        store.sessions[body.session_id] = session

    if session.score is not None:
        # Already scored — return cached result
        return session.score

    session.final_code = body.final_code
    session.completed_at = datetime.now(timezone.utc)
    if body.username:
        session.username = body.username

    # Semantic eval — single Gemini call to score prompt quality and engagement.
    # Returns None on any failure; engine falls back to pure metrics gracefully.
    semantic_eval = await evaluate_conversation(session.conversation_history)

    score = compute_score(session, semantic_eval=semantic_eval)

    session.score = score
    return score
