"""
Test runner service — sandbox execution for correctness verification.

Parses user-submitted final_code, overlays it onto a copy of rq-v1.0,
runs the synthesized test suite via pytest subprocess, and returns
TestSuiteResult with per-test pass/fail and core test failures.

Entry point: run_correctness_tests(final_code, include_hidden=False) -> Optional[TestSuiteResult]
"""

import asyncio
import logging
import os
import re
import shutil
import subprocess
import sys
import tempfile
import xml.etree.ElementTree as ET
from typing import Optional

from models.score import TestResult, TestSuiteResult

logger = logging.getLogger(__name__)

# Path to the reference RQ codebase and our synthesized test suite
BACKEND_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RQ_SOURCE = os.path.join(BACKEND_ROOT, "rq-v1.0")
TEST_SUITE_PATH = os.path.join(os.path.dirname(__file__), "tests", "test_submission.py")
HIDDEN_TEST_SUITE_PATH = os.path.join(os.path.dirname(__file__), "tests", "test_hidden.py")

# Core test names from the test suite (P3 triggers)
CORE_TEST_NAMES = {
    "test_enqueue_in_exists",
    "test_enqueue_at_exists",
    "test_existing_enqueue_unchanged",
}

# Hidden test names (only run at submission time)
HIDDEN_TEST_NAMES = [
    "test_enqueue_in_negative_delay",
    "test_scheduled_job_preserves_args_kwargs",
    "test_rapid_successive_scheduling",
    "test_enqueue_in_preserves_enqueue_signature",
    "test_worker_handles_mixed_scheduled_and_regular",
    "test_same_time_scheduling",
    "test_scheduled_job_exception_handling",
    "test_enqueue_at_with_echo_kwargs",
]

# Timeout for pytest subprocess (seconds)
PYTEST_TIMEOUT = 45

# conftest.py written into the temp dir — patches redis.Redis with fakeredis
# so tests run fully in-memory without a real Redis server.
CONFTEST_CONTENT = '''\
import fakeredis
import redis as redis_module

# Shared in-memory server so all Redis(db=N) calls share data
_server = fakeredis.FakeServer()

class _FakeRedis(fakeredis.FakeRedis):
    def __init__(self, host="localhost", port=6379, db=0, **kw):
        kw.pop("decode_responses", None)
        super().__init__(server=_server, db=db, **kw)

redis_module.Redis = _FakeRedis
redis_module.StrictRedis = _FakeRedis

# Patch rq.Worker → rq.SimpleWorker so jobs run in-process (no fork).
# Fork-based execution doesn't work with in-memory fakeredis because
# the child process gets a copy-on-write snapshot and results are lost.
import rq
import rq.worker
rq.Worker = rq.worker.SimpleWorker
rq.worker.Worker = rq.worker.SimpleWorker
'''


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


def _run_tests_sync(final_code: str, include_hidden: bool = False) -> Optional[TestSuiteResult]:
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

        # Write conftest.py to patch redis with fakeredis (no real Redis needed)
        with open(os.path.join(tmpdir, "conftest.py"), "w") as f:
            f.write(CONFTEST_CONTENT)

        # Overlay user's modified files
        for rel_path, content in user_files.items():
            dest = os.path.join(rq_copy, rel_path)
            os.makedirs(os.path.dirname(dest), exist_ok=True)
            with open(dest, "w") as f:
                f.write(content)

        # Copy the test suite into the temp dir
        test_dest = os.path.join(tmpdir, "test_submission.py")
        shutil.copy2(TEST_SUITE_PATH, test_dest)

        test_files_to_run = [test_dest]
        if include_hidden:
            hidden_dest = os.path.join(tmpdir, "test_hidden.py")
            shutil.copy2(HIDDEN_TEST_SUITE_PATH, hidden_dest)
            test_files_to_run.append(hidden_dest)

        # Build the pytest command
        # Set RQ_CODEBASE_PATH so test_submission.py imports from the overlay
        env = os.environ.copy()
        env["RQ_CODEBASE_PATH"] = rq_copy
        extra_paths = rq_copy + os.pathsep + os.path.join(rq_copy, "tests")
        existing = env.get("PYTHONPATH", "")
        env["PYTHONPATH"] = extra_paths + (os.pathsep + existing if existing else "")

        xml_path = os.path.join(tmpdir, "results.xml")
        python_exe = sys.executable
        cmd = [
            python_exe, "-m", "pytest",
            *test_files_to_run,
            f"--junitxml={xml_path}",
            "-q",
            "--no-header",
            f"--ignore={os.path.join(rq_copy, 'tests')}",
            f"--rootdir={tmpdir}",
        ]

        # Run pytest with timeout
        try:
            subprocess.run(
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

        # Parse JUnit XML results
        return _parse_junit_xml(xml_path, include_hidden)

    except Exception:
        logger.exception("test_runner: unexpected error")
        return None
    finally:
        if tmpdir and os.path.exists(tmpdir):
            try:
                shutil.rmtree(tmpdir)
            except Exception:
                logger.warning("test_runner: failed to clean up %s", tmpdir)


def _parse_junit_xml(xml_path: str, include_hidden: bool = False) -> Optional[TestSuiteResult]:
    """Parse JUnit XML produced by pytest --junitxml into TestSuiteResult."""
    if not os.path.exists(xml_path):
        logger.warning("test_runner: JUnit XML not found at %s", xml_path)
        return None

    try:
        tree = ET.parse(xml_path)
    except ET.ParseError:
        logger.warning("test_runner: failed to parse JUnit XML")
        return None

    root = tree.getroot()

    # Extract per-test results from <testcase> elements
    xml_results = {}  # test_name -> (passed, error_message)
    for tc in root.iter("testcase"):
        name = tc.attrib.get("name", "")
        failure = tc.find("failure")
        error = tc.find("error")
        if failure is not None:
            msg = failure.attrib.get("message", "Test failed")
            xml_results[name] = (False, msg)
        elif error is not None:
            msg = error.attrib.get("message", "Test error")
            xml_results[name] = (False, msg)
        else:
            xml_results[name] = (True, None)

    # Known test names in display order
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
    if include_hidden:
        all_test_names.extend(HIDDEN_TEST_NAMES)

    results = []
    total_passed = 0
    total_failed = 0

    for test_name in all_test_names:
        is_core = test_name in CORE_TEST_NAMES
        passed, error_msg = xml_results.get(test_name, (False, "Test not found in output"))
        if passed:
            total_passed += 1
            results.append(TestResult(test_name=test_name, passed=True, is_core=is_core))
        else:
            total_failed += 1
            results.append(TestResult(
                test_name=test_name, passed=False,
                error_message=error_msg, is_core=is_core,
            ))

    total = total_passed + total_failed
    if total == 0:
        logger.warning("test_runner: no test results found in JUnit XML")
        return None

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


async def run_correctness_tests(final_code: str, include_hidden: bool = False) -> Optional[TestSuiteResult]:
    """Run the synthesized test suite against user's submitted code.

    Returns TestSuiteResult or None if execution fails for any reason.
    This function never raises — all errors are caught and logged.
    """
    if not final_code or not final_code.strip():
        logger.warning("test_runner: empty final_code")
        return None

    try:
        return await asyncio.to_thread(_run_tests_sync, final_code, include_hidden)
    except Exception:
        logger.exception("test_runner: failed to run tests")
        return None
