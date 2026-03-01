"""
Test runner service — sandbox execution for correctness verification.

Parses user-submitted final_code, overlays it onto a copy of rq-v1.0,
runs the synthesized test suite via pytest subprocess, and returns
TestSuiteResult with per-test pass/fail and core test failures.

Entry point: run_correctness_tests(final_code: str) -> Optional[TestSuiteResult]
"""

import asyncio
import json
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
from typing import Optional

from models.score import TestResult, TestSuiteResult

logger = logging.getLogger(__name__)

# Path to the reference RQ codebase and our synthesized test suite
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
RQ_SOURCE = os.path.join(PROJECT_ROOT, "rq-v1.0")
TEST_SUITE_PATH = os.path.join(os.path.dirname(__file__), "tests", "test_submission.py")

# Core test names from the test suite (P3 triggers)
CORE_TEST_NAMES = {
    "test_enqueue_in_exists",
    "test_enqueue_at_exists",
    "test_existing_enqueue_unchanged",
}

# Timeout for pytest subprocess (seconds)
PYTEST_TIMEOUT = 30


def parse_final_code(final_code: str) -> dict[str, str]:
    """Parse concatenated final_code into individual files.

    Expected format:
        // --- rq/queue.py ---
        <file contents>
        // --- rq/worker.py ---
        <file contents>

    Returns dict mapping relative paths to file contents.
    """
    files = {}
    current_file = None
    current_lines = []

    for line in final_code.split("\n"):
        # Match file header: // --- rq/queue.py ---
        match = re.match(r"^//\s*---\s*(.+?)\s*---\s*$", line)
        if match:
            # Save previous file
            if current_file is not None:
                files[current_file] = "\n".join(current_lines)
            current_file = match.group(1).strip()
            current_lines = []
        else:
            current_lines.append(line)

    # Save last file
    if current_file is not None:
        files[current_file] = "\n".join(current_lines)

    return files


def _run_tests_sync(final_code: str) -> Optional[TestSuiteResult]:
    """Synchronous test execution — called via asyncio.to_thread."""
    tmpdir = None
    try:
        # Parse user's code into files
        user_files = parse_final_code(final_code)
        if not user_files:
            logger.warning("test_runner: No files parsed from final_code")
            return None

        # Create temp directory and copy rq-v1.0 into it
        tmpdir = tempfile.mkdtemp(prefix="sponge_test_")
        rq_copy = os.path.join(tmpdir, "rq-v1.0")
        shutil.copytree(RQ_SOURCE, rq_copy)

        # Overlay user's modified files
        for rel_path, content in user_files.items():
            dest = os.path.join(rq_copy, rel_path)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "w") as f:
                f.write(content)

        # Copy the test suite into the temp dir
        test_dest = os.path.join(tmpdir, "test_submission.py")
        shutil.copy2(TEST_SUITE_PATH, test_dest)

        # Build the pytest command
        # Set RQ_CODEBASE_PATH so test_submission.py imports from the overlay
        env = os.environ.copy()
        env["RQ_CODEBASE_PATH"] = rq_copy
        env["PYTHONPATH"] = rq_copy + os.pathsep + os.path.join(rq_copy, "tests")

        python_exe = sys.executable
        cmd = [
            python_exe, "-m", "pytest",
            test_dest,
            "--tb=line",
            "-q",
            "--no-header",
        ]

        # Run pytest with timeout
        try:
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=PYTEST_TIMEOUT,
                cwd=tmpdir,
                env=env,
            )
        except subprocess.TimeoutExpired:
            logger.warning("test_runner: pytest timed out after %ds", PYTEST_TIMEOUT)
            return None

        # Parse pytest output
        return _parse_pytest_output(result.stdout, result.stderr)

    except Exception:
        logger.exception("test_runner: unexpected error")
        return None
    finally:
        if tmpdir and os.path.exists(tmpdir):
            try:
                shutil.rmtree(tmpdir)
            except Exception:
                logger.warning("test_runner: failed to clean up %s", tmpdir)


def _parse_pytest_output(stdout: str, stderr: str) -> Optional[TestSuiteResult]:
    """Parse pytest -q output into TestSuiteResult.

    pytest -q output format:
        test_submission.py .F.F..FF....  [100%]
        FAILED test_submission.py::TestSubmission::test_name - AssertionError: msg
        ...
        4 failed, 8 passed in 2.34s
    """
    results = []
    lines = stdout.strip().split("\n")

    # Collect FAILED lines for error messages
    failures = {}
    for line in lines:
        match = re.match(r"FAILED\s+\S+::(\w+)::(\w+)\s*[-–]\s*(.*)", line)
        if match:
            test_name = match.group(2)
            error_msg = match.group(3).strip()
            failures[test_name] = error_msg
        # Also match simpler format: FAILED test_submission.py::TestSubmission::test_name
        match2 = re.match(r"FAILED\s+\S+::(\w+)::(\w+)\s*$", line)
        if match2:
            test_name = match2.group(2)
            failures.setdefault(test_name, "Test failed")

    # Parse the summary line: "4 failed, 8 passed in 2.34s"
    total_passed = 0
    total_failed = 0
    for line in lines:
        summary_match = re.search(r"(\d+)\s+passed", line)
        if summary_match:
            total_passed = int(summary_match.group(1))
        fail_match = re.search(r"(\d+)\s+failed", line)
        if fail_match:
            total_failed = int(fail_match.group(1))

    # Also check for "12 passed" only (no failures)
    if total_passed == 0 and total_failed == 0:
        for line in lines:
            match = re.search(r"(\d+)\s+passed", line)
            if match:
                total_passed = int(match.group(1))

    total = total_passed + total_failed
    if total == 0:
        # Couldn't parse output — check stderr for errors
        logger.warning("test_runner: couldn't parse pytest output. stdout=%r stderr=%r",
                       stdout[:500], stderr[:500])
        return None

    # Build per-test results from what we know
    # We know which tests failed (from FAILED lines), the rest passed
    all_test_names = [
        "test_enqueue_in_exists",
        "test_enqueue_at_exists",
        "test_existing_enqueue_unchanged",
        "test_enqueue_in_returns_job",
        "test_enqueue_at_returns_job",
        "test_scheduled_job_not_in_queue_immediately",
        "test_scheduled_job_in_scheduled_registry",
        "test_enqueue_at_past_datetime",
        "test_enqueue_in_zero_delay",
        "test_worker_moves_ready_jobs",
        "test_multiple_scheduled_jobs_ordering",
        "test_job_status_lifecycle",
    ]

    for test_name in all_test_names:
        is_core = test_name in CORE_TEST_NAMES
        if test_name in failures:
            results.append(TestResult(
                test_name=test_name,
                passed=False,
                error_message=failures[test_name],
                is_core=is_core,
            ))
        else:
            results.append(TestResult(
                test_name=test_name,
                passed=True,
                is_core=is_core,
            ))

    core_failures = [r.test_name for r in results if r.is_core and not r.passed]
    pass_rate = total_passed / total if total > 0 else 0.0

    return TestSuiteResult(
        total=total,
        passed=total_passed,
        failed=total_failed,
        pass_rate=round(pass_rate, 2),
        results=results,
        core_failures=core_failures,
    )


async def run_correctness_tests(final_code: str) -> Optional[TestSuiteResult]:
    """Run the synthesized test suite against user's submitted code.

    Returns TestSuiteResult or None if execution fails for any reason.
    This function never raises — all errors are caught and logged.
    """
    if not final_code or not final_code.strip():
        logger.warning("test_runner: empty final_code")
        return None

    try:
        return await asyncio.to_thread(_run_tests_sync, final_code)
    except Exception:
        logger.exception("test_runner: failed to run tests")
        return None
