import asyncio
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import store
from models.score import Score
from models.session import Session
from scoring.engine import compute_score
from scoring.semantic import evaluate_conversation
from scoring.code_analysis import analyze_final_code
from scoring.test_runner import run_correctness_tests

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

    Fires three evaluation sources concurrently:
      1. Conversation semantic eval (12 sub-criteria via Gemini)
      2. Code analysis (B1/B2/B3 + P3 via Gemini)
      3. Correctness tests (12 synthesized tests via sandbox)

    All three return None on failure — engine falls back to metrics.
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

    # Fire all three evals concurrently — each returns None on failure
    conv_eval, code_eval, test_results = await asyncio.gather(
        evaluate_conversation(session.conversation_history),
        analyze_final_code(session.final_code),
        run_correctness_tests(session.final_code, include_hidden=True),
    )

    score = compute_score(
        session,
        semantic_eval=conv_eval,
        conv_eval=conv_eval,
        code_eval=code_eval,
        test_results=test_results,
    )

    session.score = score
    return score
