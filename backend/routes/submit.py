from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import store
from models.score import Score
from scoring.engine import compute_score

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
        raise HTTPException(status_code=404, detail="Session not found")

    if session.score is not None:
        # Already scored — return cached result
        return session.score

    session.final_code = body.final_code
    if body.username:
        session.username = body.username

    # TODO: scoring engine implements real logic; returns placeholder Score for now
    score = compute_score(session)

    session.score = score
    return score
