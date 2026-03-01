# -*- coding: utf-8 -*-
"""
Hidden test suite — additional edge-case and robustness tests for delayed
job execution. These tests run ONLY during submission (not during "Run Tests")
and are not visible to the candidate in the frontend.

8 hidden tests covering:
  - Negative delay handling
  - Argument/kwargs preservation through scheduling
  - Rapid successive scheduling
  - enqueue_in doesn't break Queue.enqueue signature
  - Worker handles mix of scheduled and regular jobs
  - Jobs scheduled at exact same time both execute
  - Scheduled job function exception handling
  - enqueue_at arg/kwarg passthrough
"""

import os
import sys
import time
from datetime import datetime, timedelta

RQ_ROOT = os.environ.get("RQ_CODEBASE_PATH", os.path.join(
    os.path.dirname(__file__), "..", "..", "..", "rq-v1.0"
))
if RQ_ROOT not in sys.path:
    sys.path.insert(0, RQ_ROOT)

TESTS_ROOT = os.path.join(RQ_ROOT, "tests")
if TESTS_ROOT not in sys.path:
    sys.path.insert(0, TESTS_ROOT)

from tests import RQTestCase
from tests.fixtures import say_hello, do_nothing, some_calculation, div_by_zero, echo
from rq import Queue
from rq.job import Job


class TestHidden(RQTestCase):
    """Hidden tests — edge cases and robustness for delayed job execution."""

    def test_enqueue_in_negative_delay(self):
        """Hidden: enqueue_in with negative timedelta should behave like
        immediate enqueue (equivalent to scheduling in the past).
        """
        from rq import Worker

        q = Queue(connection=self.testconn)
        job = q.enqueue_in(timedelta(seconds=-10), say_hello, "negative")

        self.assertIsNotNone(job)
        self.assertIsNotNone(job.id)

        # Should be processable immediately
        time.sleep(0.5)
        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        job = Job.fetch(job.id, connection=self.testconn)
        self.assertIsNotNone(
            job.result,
            "Job with negative delay should execute immediately"
        )

    def test_scheduled_job_preserves_args_kwargs(self):
        """Hidden: Scheduled jobs must preserve positional args and keyword
        args correctly through the scheduling pipeline.
        """
        from rq import Worker

        q = Queue(connection=self.testconn)
        job = q.enqueue_in(
            timedelta(seconds=1),
            some_calculation,
            2, 3, z=4,
        )

        self.assertIsNotNone(job)

        time.sleep(2)
        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        job = Job.fetch(job.id, connection=self.testconn)
        # some_calculation(2, 3, z=4) = 2 * 3 / 4 = 1.5
        self.assertEqual(
            job.result, 1.5,
            "Scheduled job should preserve args and kwargs: expected 1.5, got %r" % job.result
        )

    def test_rapid_successive_scheduling(self):
        """Hidden: Scheduling 10+ jobs in rapid succession should not lose
        any jobs. All should be tracked.
        """
        q = Queue(connection=self.testconn)
        jobs = []
        for i in range(10):
            job = q.enqueue_in(timedelta(seconds=300), say_hello, str(i))
            jobs.append(job)

        # All 10 jobs should have unique IDs and be tracked somewhere
        job_ids = [j.id for j in jobs]
        self.assertEqual(len(set(job_ids)), 10, "All 10 jobs should have unique IDs")

        # Verify each job is fetchable from Redis
        for jid in job_ids:
            fetched = Job.fetch(jid, connection=self.testconn)
            self.assertIsNotNone(fetched, "Job %s should be fetchable" % jid)

    def test_enqueue_in_preserves_enqueue_signature(self):
        """Hidden: Adding enqueue_in must not break the existing
        Queue.enqueue() method signature or behavior.
        """
        from rq import Worker

        q = Queue(connection=self.testconn)

        # Test enqueue with various argument patterns
        job1 = q.enqueue(say_hello, "test1")
        job2 = q.enqueue(some_calculation, 6, 7, z=2)
        job3 = q.enqueue(do_nothing)

        self.assertIsNotNone(job1)
        self.assertIsNotNone(job2)
        self.assertIsNotNone(job3)

        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        job1 = Job.fetch(job1.id, connection=self.testconn)
        job2 = Job.fetch(job2.id, connection=self.testconn)

        self.assertEqual(job1.result, "Hi there, test1!")
        self.assertEqual(job2.result, 21.0)  # 6 * 7 / 2

    def test_worker_handles_mixed_scheduled_and_regular(self):
        """Hidden: Worker should process both regular enqueued jobs AND
        scheduled jobs that have become ready.
        """
        from rq import Worker

        q = Queue(connection=self.testconn)

        # Enqueue a regular job
        regular_job = q.enqueue(say_hello, "regular")

        # Schedule a job with short delay
        scheduled_job = q.enqueue_in(timedelta(seconds=1), say_hello, "scheduled")

        time.sleep(2)

        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        regular_job = Job.fetch(regular_job.id, connection=self.testconn)
        scheduled_job = Job.fetch(scheduled_job.id, connection=self.testconn)

        self.assertEqual(
            regular_job.result, "Hi there, regular!",
            "Regular job should still execute when scheduled jobs exist"
        )
        self.assertEqual(
            scheduled_job.result, "Hi there, scheduled!",
            "Scheduled job should execute after its delay"
        )

    def test_same_time_scheduling(self):
        """Hidden: Two jobs scheduled at the exact same datetime should
        both be tracked and eventually executed.
        """
        from rq import Worker

        q = Queue(connection=self.testconn)
        target_time = datetime.utcnow() + timedelta(seconds=1)

        job_a = q.enqueue_at(target_time, say_hello, "A")
        job_b = q.enqueue_at(target_time, say_hello, "B")

        self.assertNotEqual(job_a.id, job_b.id, "Jobs should have different IDs")

        time.sleep(2)

        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        job_a = Job.fetch(job_a.id, connection=self.testconn)
        job_b = Job.fetch(job_b.id, connection=self.testconn)

        self.assertIsNotNone(job_a.result, "Job A should have executed")
        self.assertIsNotNone(job_b.result, "Job B should have executed")

    def test_scheduled_job_exception_handling(self):
        """Hidden: A scheduled job that raises an exception should be
        handled gracefully (moved to failed registry, not lost).
        """
        from rq import Worker

        q = Queue(connection=self.testconn)
        job = q.enqueue_in(timedelta(seconds=1), div_by_zero, 5)

        time.sleep(2)

        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        job = Job.fetch(job.id, connection=self.testconn)
        # Job should be in failed state, not lost
        status = job.get_status()
        self.assertIn(
            status,
            ["failed"],
            "Failed scheduled job should have failed status, got: %s" % status
        )

    def test_enqueue_at_with_echo_kwargs(self):
        """Hidden: enqueue_at with the echo fixture should correctly
        pass through both args and kwargs to prove the scheduling layer
        doesn't drop or mangle function arguments.
        """
        from rq import Worker

        q = Queue(connection=self.testconn)
        future = datetime.utcnow() + timedelta(seconds=1)
        job = q.enqueue_at(future, echo, "hello", 42, key="value")

        time.sleep(2)

        w = Worker([q], connection=self.testconn)
        w.work(burst=True)

        job = Job.fetch(job.id, connection=self.testconn)
        self.assertIsNotNone(job.result, "echo job should have a result")
        args_result, kwargs_result = job.result
        self.assertIn("hello", args_result)
        self.assertIn(42, args_result)
        self.assertEqual(kwargs_result.get("key"), "value")
