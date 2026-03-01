# -*- coding: utf-8 -*-
"""
Synthesized test suite for validating delayed job execution submissions.

These tests are run against a user's modified RQ codebase to verify that
enqueue_in() and enqueue_at() are correctly implemented. They follow the
patterns in rq-v1.0/tests/ using RQTestCase as the base class.

3 core tests (P3 triggers — failure means -10 penalty):
  - test_enqueue_in_exists
  - test_enqueue_at_exists
  - test_existing_enqueue_unchanged

9 feature tests (B2 gate — pass rate caps the B2 score):
  - test_enqueue_in_returns_job
  - test_enqueue_at_returns_job
  - test_scheduled_job_not_in_queue_immediately
  - test_scheduled_job_in_scheduled_registry
  - test_enqueue_at_past_datetime
  - test_enqueue_in_zero_delay
  - test_worker_moves_ready_jobs
  - test_multiple_scheduled_jobs_ordering
  - test_job_status_lifecycle
"""

import os
import sys
import time
from datetime import datetime, timedelta

# Add rq-v1.0 to the path so we can import the modified RQ codebase.
# When run by the test runner, this path is set to the temp overlay directory.
# The test runner copies rq-v1.0 and overlays the user's modified files.
RQ_ROOT = os.environ.get("RQ_CODEBASE_PATH", os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "rq-v1.0"
))
if RQ_ROOT not in sys.path:
    sys.path.insert(0, RQ_ROOT)

TESTS_ROOT = os.path.join(RQ_ROOT, "tests")
if TESTS_ROOT not in sys.path:
    sys.path.insert(0, TESTS_ROOT)

from tests import RQTestCase
from tests.fixtures import say_hello, do_nothing
from rq import Queue
from rq.job import Job

# List of core test names (P3 triggers)
CORE_TESTS = [
    "test_enqueue_in_exists",
    "test_enqueue_at_exists",
    "test_existing_enqueue_unchanged",
]


class TestSubmission(RQTestCase):
    """Tests for the delayed job execution feature (enqueue_in, enqueue_at)."""

    # ── Core Requirement Tests (P3 triggers) ─────────────────────────

    def test_enqueue_in_exists(self):
        """Core: Queue class must have an enqueue_in method that is callable."""
        q = Queue(connection=self.testconn)
        self.assertTrue(
            hasattr(q, "enqueue_in"),
            "Queue is missing the enqueue_in method"
        )
        self.assertTrue(
            callable(getattr(q, "enqueue_in")),
            "Queue.enqueue_in exists but is not callable"
        )

    def test_enqueue_at_exists(self):
        """Core: Queue class must have an enqueue_at method that is callable."""
        q = Queue(connection=self.testconn)
        self.assertTrue(
            hasattr(q, "enqueue_at"),
            "Queue is missing the enqueue_at method"
        )
        self.assertTrue(
            callable(getattr(q, "enqueue_at")),
            "Queue.enqueue_at exists but is not callable"
        )

    def test_existing_enqueue_unchanged(self):
        """Core: Regular Queue.enqueue() must still work correctly.

        Enqueue a simple job, verify it appears in the queue, run the
        worker in burst mode, and check the result.
        """
        from rq import Worker

        q = Queue(connection=self.testconn)
        job = q.enqueue(say_hello, "world")

        self.assertIsNotNone(job)
        self.assertIsNotNone(job.id)
        self.assertFalse(q.is_empty(), "Queue should not be empty after enqueue")

        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        # Refresh job data from Redis
        job = Job.fetch(job.id, connection=self.testconn)
        self.assertEqual(job.result, "Hi there, world!")

    # ── Feature Correctness Tests (B2 gate) ──────────────────────────

    def test_enqueue_in_returns_job(self):
        """Feature: enqueue_in(seconds, func) should return a Job object."""
        q = Queue(connection=self.testconn)
        job = q.enqueue_in(timedelta(seconds=60), say_hello)

        self.assertIsNotNone(job, "enqueue_in should return a Job")
        self.assertIsInstance(job, Job, "enqueue_in should return a Job instance")
        self.assertIsNotNone(job.id, "Returned job should have an id")

    def test_enqueue_at_returns_job(self):
        """Feature: enqueue_at(datetime, func) should return a Job object."""
        q = Queue(connection=self.testconn)
        future = datetime.utcnow() + timedelta(minutes=5)
        job = q.enqueue_at(future, say_hello)

        self.assertIsNotNone(job, "enqueue_at should return a Job")
        self.assertIsInstance(job, Job, "enqueue_at should return a Job instance")
        self.assertIsNotNone(job.id, "Returned job should have an id")

    def test_scheduled_job_not_in_queue_immediately(self):
        """Feature: A job scheduled far in the future should not appear
        in the regular queue immediately.

        After enqueue_in(300, ...), the job should not be in the regular
        queue — it should be waiting in a scheduled registry or similar.
        """
        q = Queue(connection=self.testconn)
        initial_count = q.count
        job = q.enqueue_in(timedelta(seconds=300), say_hello)

        # The job should NOT be in the regular queue
        # (it should be in a scheduled registry or deferred state)
        job_ids = q.job_ids
        self.assertNotIn(
            job.id, job_ids,
            "Scheduled job should not be in the regular queue immediately"
        )

    def test_scheduled_job_in_scheduled_registry(self):
        """Feature: A scheduled job should appear in a scheduled registry
        (ScheduledJobRegistry or equivalent sorted set).
        """
        q = Queue(connection=self.testconn)
        job = q.enqueue_in(timedelta(seconds=300), say_hello)

        # Check for ScheduledJobRegistry or equivalent
        found_in_registry = False

        # Try the standard RQ ScheduledJobRegistry pattern
        try:
            from rq.registry import ScheduledJobRegistry
            registry = ScheduledJobRegistry(queue=q, connection=self.testconn)
            job_ids = registry.get_job_ids()
            if job.id in job_ids:
                found_in_registry = True
        except (ImportError, AttributeError):
            pass

        # Fallback: check if the job is in a Redis sorted set
        if not found_in_registry:
            scheduled_key = "rq:scheduled:%s" % q.name
            score = self.testconn.zscore(scheduled_key, job.id)
            if score is not None:
                found_in_registry = True

        # Fallback: check deferred registry
        if not found_in_registry:
            try:
                from rq.registry import DeferredJobRegistry
                registry = DeferredJobRegistry(queue=q, connection=self.testconn)
                job_ids = registry.get_job_ids()
                if job.id in job_ids:
                    found_in_registry = True
            except (ImportError, AttributeError):
                pass

        self.assertTrue(
            found_in_registry,
            "Scheduled job should be tracked in a registry or sorted set"
        )

    def test_enqueue_at_past_datetime(self):
        """Feature: Scheduling a job with a past datetime should result in
        the job being immediately available for execution (either queued
        directly or placed where the worker picks it up promptly).
        """
        q = Queue(connection=self.testconn)
        past = datetime.utcnow() - timedelta(hours=1)
        job = q.enqueue_at(past, say_hello, "past")

        self.assertIsNotNone(job, "enqueue_at with past datetime should return a job")
        self.assertIsNotNone(job.id)

        # The job should be either in the queue or immediately processable
        # We verify by running the worker and checking the result
        from rq import Worker
        w = Worker([q], connection=self.testconn)

        # Give the scheduler a moment if needed
        time.sleep(0.5)
        w.work(burst=True)

        job = Job.fetch(job.id, connection=self.testconn)
        # Job should have run — result should be set
        self.assertIsNotNone(
            job.result,
            "Job scheduled in the past should execute promptly"
        )

    def test_enqueue_in_zero_delay(self):
        """Feature: enqueue_in(0, func) should enqueue the job immediately,
        equivalent to a regular enqueue.
        """
        q = Queue(connection=self.testconn)
        job = q.enqueue_in(timedelta(seconds=0), say_hello, "zero")

        self.assertIsNotNone(job)

        from rq import Worker
        w = Worker([q], connection=self.testconn)
        time.sleep(0.5)
        w.work(burst=True)

        job = Job.fetch(job.id, connection=self.testconn)
        self.assertIsNotNone(
            job.result,
            "Job with zero delay should execute immediately"
        )

    def test_worker_moves_ready_jobs(self):
        """Feature: After scheduling a job with a short delay and waiting
        for that time to pass, the worker should execute the job.
        """
        q = Queue(connection=self.testconn)
        job = q.enqueue_in(timedelta(seconds=1), say_hello, "delayed")

        # Wait for the scheduled time to pass
        time.sleep(2)

        from rq import Worker
        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        job = Job.fetch(job.id, connection=self.testconn)
        self.assertEqual(
            job.result,
            "Hi there, delayed!",
            "Worker should execute scheduled jobs after their delay passes"
        )

    def test_multiple_scheduled_jobs_ordering(self):
        """Feature: When scheduling multiple jobs, they should become
        ready in the correct time order.

        Schedule job_b at t+1s and job_a at t+3s. After 2 seconds,
        job_b should be ready before job_a.
        """
        q = Queue(connection=self.testconn)
        job_a = q.enqueue_in(timedelta(seconds=3), say_hello, "A")
        job_b = q.enqueue_in(timedelta(seconds=1), say_hello, "B")

        # After 2 seconds, job_b should be ready but job_a should not
        time.sleep(2)

        from rq import Worker
        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        job_b_refreshed = Job.fetch(job_b.id, connection=self.testconn)
        job_a_refreshed = Job.fetch(job_a.id, connection=self.testconn)

        # job_b (1s delay) should have executed
        self.assertIsNotNone(
            job_b_refreshed.result,
            "Job B (shorter delay) should have executed"
        )

        # job_a (3s delay) should NOT have executed yet
        # (only 2s have passed, so 3s delay hasn't elapsed)
        self.assertIsNone(
            job_a_refreshed.result,
            "Job A (longer delay) should not have executed yet"
        )

    def test_job_status_lifecycle(self):
        """Feature: A scheduled job should go through an appropriate
        status lifecycle. After scheduling, it should have a status
        indicating it's deferred/scheduled (not queued). After the
        delay passes and the worker runs, it should be finished.
        """
        from rq.job import JobStatus

        q = Queue(connection=self.testconn)
        job = q.enqueue_in(timedelta(seconds=1), say_hello, "lifecycle")

        # Immediately after scheduling, status should NOT be 'queued'
        initial_status = job.get_status()
        self.assertIn(
            initial_status,
            [JobStatus.DEFERRED, JobStatus.SCHEDULED, "scheduled", "deferred"],
            f"Scheduled job initial status should be deferred/scheduled, got: {initial_status}"
        )

        # Wait for delay to pass, then run worker
        time.sleep(2)
        from rq import Worker
        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        job = Job.fetch(job.id, connection=self.testconn)
        final_status = job.get_status()
        self.assertIn(
            final_status,
            [JobStatus.FINISHED, "finished"],
            f"Job should be finished after worker processes it, got: {final_status}"
        )
