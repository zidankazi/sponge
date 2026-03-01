import asyncio
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

import store
from models.score import TestSuiteResult
from models.session import Session
from scoring.test_runner import run_correctness_tests

router = APIRouter(tags=["run-tests"])


class RunTestsRequest(BaseModel):
    session_id: str
    file_contents: str  # concatenated // --- path --- format, same as submit


@router.post("/run-tests", response_model=Optional[TestSuiteResult])
async def run_tests(body: RunTestsRequest):
    """Run user-visible test cases against the current code.

    Reuses the same sandbox test runner as submission, but returns
    results immediately without triggering scoring or Gemini evaluation.
    """
    # Ensure session exists (serverless: auto-create across cold starts)
    session = store.sessions.get(body.session_id)
    if session is None:
        session = Session(session_id=body.session_id)
        store.sessions[body.session_id] = session

    result = await run_correctness_tests(body.file_contents)
    return result
