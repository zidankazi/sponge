import asyncio
import os
import shutil
import subprocess
import sys
from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel

import store
from models.score import TestSuiteResult
from models.session import Session
from scoring.test_runner import run_correctness_tests, RQ_SOURCE, BACKEND_ROOT

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


@router.get("/run-tests/debug")
async def debug_test_runner():
    """Temporary debug endpoint — remove after confirming tests work."""
    info = {
        "python": sys.executable,
        "version": sys.version,
        "backend_root": BACKEND_ROOT,
        "rq_source": RQ_SOURCE,
        "rq_source_exists": os.path.isdir(RQ_SOURCE),
        "tmp_writable": os.access("/tmp", os.W_OK),
        "cwd": os.getcwd(),
    }
    # Check if pytest is importable
    try:
        result = subprocess.run(
            [sys.executable, "-m", "pytest", "--version"],
            capture_output=True, text=True, timeout=10,
        )
        info["pytest_version"] = result.stdout.strip() or result.stderr.strip()
    except Exception as e:
        info["pytest_error"] = str(e)

    # Check if fakeredis is importable
    try:
        result = subprocess.run(
            [sys.executable, "-c", "import fakeredis; print(fakeredis.__version__)"],
            capture_output=True, text=True, timeout=10,
        )
        info["fakeredis_version"] = result.stdout.strip() or result.stderr.strip()
    except Exception as e:
        info["fakeredis_error"] = str(e)

    # List files in rq_source
    if os.path.isdir(RQ_SOURCE):
        info["rq_source_contents"] = os.listdir(RQ_SOURCE)[:10]
    else:
        # Check what's in BACKEND_ROOT
        try:
            info["backend_root_contents"] = os.listdir(BACKEND_ROOT)[:20]
        except Exception as e:
            info["backend_root_error"] = str(e)

    return info
