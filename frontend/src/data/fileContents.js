// Real file contents from the codebase — hardcoded from the local repo
// Only includes files likely to be opened/edited during the interview task.

const fileContents = {}

fileContents['rq/job.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import inspect
import warnings
import zlib
from functools import partial
from uuid import uuid4

from rq.compat import as_text, decode_redis_hash, string_types, text_type

from .connections import resolve_connection
from .exceptions import NoSuchJobError, UnpickleError
from .local import LocalStack
from .utils import enum, import_attribute, utcformat, utcnow, utcparse, parse_timeout

try:
    import cPickle as pickle
except ImportError:  # noqa  # pragma: no cover
    import pickle


# Serialize pickle dumps using the highest pickle protocol (binary, default
# uses ascii)
dumps = partial(pickle.dumps, protocol=pickle.HIGHEST_PROTOCOL)
loads = pickle.loads

JobStatus = enum(
    'JobStatus',
    QUEUED='queued',
    FINISHED='finished',
    FAILED='failed',
    STARTED='started',
    DEFERRED='deferred'
)

# Sentinel value to mark that some of our lazily evaluated properties have not
# yet been evaluated.
UNEVALUATED = object()


def unpickle(pickled_string):
    """Unpickles a string, but raises a unified UnpickleError in case anything
    fails.

    This is a helper method to not have to deal with the fact that \`loads()\`
    potentially raises many types of exceptions (e.g. AttributeError,
    IndexError, TypeError, KeyError, etc.)
    """
    try:
        obj = loads(pickled_string)
    except Exception as e:
        raise UnpickleError('Could not unpickle', pickled_string, e)
    return obj


def cancel_job(job_id, connection=None):
    """Cancels the job with the given job ID, preventing execution.  Discards
    any job info (i.e. it can't be requeued later).
    """
    Job.fetch(job_id, connection=connection).cancel()


def get_current_job(connection=None, job_class=None):
    """Returns the Job instance that is currently being executed.  If this
    function is invoked from outside a job context, None is returned.
    """
    if job_class:
        warnings.warn("job_class argument for get_current_job is deprecated.",
                      DeprecationWarning)
    return _job_stack.top


def requeue_job(job_id, connection):
    job = Job.fetch(job_id, connection=connection)
    return job.requeue()


class Job(object):
    """A Job is just a convenient datastructure to pass around job (meta) data.
    """
    redis_job_namespace_prefix = 'rq:job:'

    # Job construction
    @classmethod
    def create(cls, func, args=None, kwargs=None, connection=None,
               result_ttl=None, ttl=None, status=None, description=None,
               depends_on=None, timeout=None, id=None, origin=None, meta=None,
               failure_ttl=None):
        """Creates a new Job instance for the given function, arguments, and
        keyword arguments.
        """
        if args is None:
            args = ()
        if kwargs is None:
            kwargs = {}

        if not isinstance(args, (tuple, list)):
            raise TypeError('{0!r} is not a valid args list'.format(args))
        if not isinstance(kwargs, dict):
            raise TypeError('{0!r} is not a valid kwargs dict'.format(kwargs))

        job = cls(connection=connection)
        if id is not None:
            job.set_id(id)

        if origin is not None:
            job.origin = origin

        # Set the core job tuple properties
        job._instance = None
        if inspect.ismethod(func):
            job._instance = func.__self__
            job._func_name = func.__name__
        elif inspect.isfunction(func) or inspect.isbuiltin(func):
            job._func_name = '{0}.{1}'.format(func.__module__, func.__name__)
        elif isinstance(func, string_types):
            job._func_name = as_text(func)
        elif not inspect.isclass(func) and hasattr(func, '__call__'):  # a callable class instance
            job._instance = func
            job._func_name = '__call__'
        else:
            raise TypeError('Expected a callable or a string, but got: {0}'.format(func))
        job._args = args
        job._kwargs = kwargs

        # Extra meta data
        job.description = description or job.get_call_string()
        job.result_ttl = result_ttl
        job.failure_ttl = failure_ttl
        job.ttl = ttl
        job.timeout = parse_timeout(timeout)
        job._status = status
        job.meta = meta or {}

        # dependency could be job instance or id
        if depends_on is not None:
            job._dependency_id = depends_on.id if isinstance(depends_on, Job) else depends_on
        return job

    def get_status(self):
        self._status = as_text(self.connection.hget(self.key, 'status'))
        return self._status

    def set_status(self, status, pipeline=None):
        self._status = status
        connection = pipeline or self.connection
        connection.hset(self.key, 'status', self._status)

    @property
    def is_finished(self):
        return self.get_status() == JobStatus.FINISHED

    @property
    def is_queued(self):
        return self.get_status() == JobStatus.QUEUED

    @property
    def is_failed(self):
        return self.get_status() == JobStatus.FAILED

    @property
    def is_started(self):
        return self.get_status() == JobStatus.STARTED

    @property
    def is_deferred(self):
        return self.get_status() == JobStatus.DEFERRED

    @property
    def dependency(self):
        """Returns a job's dependency. To avoid repeated Redis fetches, we cache
        job.dependency as job._dependency.
        """
        if self._dependency_id is None:
            return None
        if hasattr(self, '_dependency'):
            return self._dependency
        job = self.fetch(self._dependency_id, connection=self.connection)
        self._dependency = job
        return job

    @property
    def dependent_ids(self):
        """Returns a list of ids of jobs whose execution depends on this
        job's successful execution."""
        return list(map(as_text, self.connection.smembers(self.dependents_key)))

    @property
    def func(self):
        func_name = self.func_name
        if func_name is None:
            return None

        if self.instance:
            return getattr(self.instance, func_name)

        return import_attribute(self.func_name)

    def _unpickle_data(self):
        self._func_name, self._instance, self._args, self._kwargs = unpickle(self.data)

    @property
    def data(self):
        if self._data is UNEVALUATED:
            if self._func_name is UNEVALUATED:
                raise ValueError('Cannot build the job data')

            if self._instance is UNEVALUATED:
                self._instance = None

            if self._args is UNEVALUATED:
                self._args = ()

            if self._kwargs is UNEVALUATED:
                self._kwargs = {}

            job_tuple = self._func_name, self._instance, self._args, self._kwargs
            self._data = dumps(job_tuple)
        return self._data

    @data.setter
    def data(self, value):
        self._data = value
        self._func_name = UNEVALUATED
        self._instance = UNEVALUATED
        self._args = UNEVALUATED
        self._kwargs = UNEVALUATED

    @property
    def func_name(self):
        if self._func_name is UNEVALUATED:
            self._unpickle_data()
        return self._func_name

    @func_name.setter
    def func_name(self, value):
        self._func_name = value
        self._data = UNEVALUATED

    @property
    def instance(self):
        if self._instance is UNEVALUATED:
            self._unpickle_data()
        return self._instance

    @instance.setter
    def instance(self, value):
        self._instance = value
        self._data = UNEVALUATED

    @property
    def args(self):
        if self._args is UNEVALUATED:
            self._unpickle_data()
        return self._args

    @args.setter
    def args(self, value):
        self._args = value
        self._data = UNEVALUATED

    @property
    def kwargs(self):
        if self._kwargs is UNEVALUATED:
            self._unpickle_data()
        return self._kwargs

    @kwargs.setter
    def kwargs(self, value):
        self._kwargs = value
        self._data = UNEVALUATED

    @classmethod
    def exists(cls, job_id, connection=None):
        """Returns whether a job hash exists for the given job ID."""
        conn = resolve_connection(connection)
        return conn.exists(cls.key_for(job_id))

    @classmethod
    def fetch(cls, id, connection=None):
        """Fetches a persisted job from its corresponding Redis key and
        instantiates it.
        """
        job = cls(id, connection=connection)
        job.refresh()
        return job

    def __init__(self, id=None, connection=None):
        self.connection = resolve_connection(connection)
        self._id = id
        self.created_at = utcnow()
        self._data = UNEVALUATED
        self._func_name = UNEVALUATED
        self._instance = UNEVALUATED
        self._args = UNEVALUATED
        self._kwargs = UNEVALUATED
        self.description = None
        self.origin = None
        self.enqueued_at = None
        self.started_at = None
        self.ended_at = None
        self._result = None
        self.exc_info = None
        self.timeout = None
        self.result_ttl = None
        self.failure_ttl = None
        self.ttl = None
        self._status = None
        self._dependency_id = None
        self.meta = {}

    def __repr__(self):  # noqa  # pragma: no cover
        return '{0}({1!r}, enqueued_at={2!r})'.format(self.__class__.__name__,
                                                      self._id,
                                                      self.enqueued_at)

    def __str__(self):
        return '<{0} {1}: {2}>'.format(self.__class__.__name__,
                                       self.id,
                                       self.description)

    # Job equality
    def __eq__(self, other):  # noqa
        return isinstance(other, self.__class__) and self.id == other.id

    def __hash__(self):  # pragma: no cover
        return hash(self.id)

    # Data access
    def get_id(self):  # noqa
        """The job ID for this job instance. Generates an ID lazily the
        first time the ID is requested.
        """
        if self._id is None:
            self._id = text_type(uuid4())
        return self._id

    def set_id(self, value):
        """Sets a job ID for the given job."""
        if not isinstance(value, string_types):
            raise TypeError('id must be a string, not {0}'.format(type(value)))
        self._id = value

    id = property(get_id, set_id)

    @classmethod
    def key_for(cls, job_id):
        """The Redis key that is used to store job hash under."""
        return (cls.redis_job_namespace_prefix + job_id).encode('utf-8')

    @classmethod
    def dependents_key_for(cls, job_id):
        """The Redis key that is used to store job dependents hash under."""
        return '{0}{1}:dependents'.format(cls.redis_job_namespace_prefix, job_id)

    @property
    def key(self):
        """The Redis key that is used to store job hash under."""
        return self.key_for(self.id)

    @property
    def dependents_key(self):
        """The Redis key that is used to store job dependents hash under."""
        return self.dependents_key_for(self.id)

    @property
    def result(self):
        """Returns the return value of the job.

        Initially, right after enqueueing a job, the return value will be
        None.  But when the job has been executed, and had a return value or
        exception, this will return that value or exception.

        Note that, when the job has no return value (i.e. returns None), the
        ReadOnlyJob object is useless, as the result won't be written back to
        Redis.

        Also note that you cannot draw the conclusion that a job has _not_
        been executed when its return value is None, since return values
        written back to Redis will expire after a given amount of time (500
        seconds by default).
        """
        if self._result is None:
            rv = self.connection.hget(self.key, 'result')
            if rv is not None:
                # cache the result
                self._result = loads(rv)
        return self._result

    """Backwards-compatibility accessor property \`return_value\`."""
    return_value = result

    # Persistence
    def refresh(self):  # noqa
        """Overwrite the current instance's properties with the values in the
        corresponding Redis key.

        Will raise a NoSuchJobError if no corresponding Redis key exists.
        """
        key = self.key
        obj = decode_redis_hash(self.connection.hgetall(key))
        if len(obj) == 0:
            raise NoSuchJobError('No such job: {0}'.format(key))

        def to_date(date_str):
            if date_str is None:
                return
            else:
                return utcparse(as_text(date_str))

        try:
            raw_data = obj['data']
        except KeyError:
            raise NoSuchJobError('Unexpected job format: {0}'.format(obj))

        try:
            self.data = zlib.decompress(raw_data)
        except zlib.error:
            # Fallback to uncompressed string
            self.data = raw_data

        self.created_at = to_date(as_text(obj.get('created_at')))
        self.origin = as_text(obj.get('origin'))
        self.description = as_text(obj.get('description'))
        self.enqueued_at = to_date(as_text(obj.get('enqueued_at')))
        self.started_at = to_date(as_text(obj.get('started_at')))
        self.ended_at = to_date(as_text(obj.get('ended_at')))
        self._result = unpickle(obj.get('result')) if obj.get('result') else None  # noqa
        self.timeout = parse_timeout(as_text(obj.get('timeout'))) if obj.get('timeout') else None
        self.result_ttl = int(obj.get('result_ttl')) if obj.get('result_ttl') else None  # noqa
        self.failure_ttl = int(obj.get('failure_ttl')) if obj.get('failure_ttl') else None  # noqa
        self._status = as_text(obj.get('status') if obj.get('status') else None)
        self._dependency_id = as_text(obj.get('dependency_id', None))
        self.ttl = int(obj.get('ttl')) if obj.get('ttl') else None
        self.meta = unpickle(obj.get('meta')) if obj.get('meta') else {}

        raw_exc_info = obj.get('exc_info')
        if raw_exc_info:
            try:
                self.exc_info = as_text(zlib.decompress(raw_exc_info))
            except zlib.error:
                # Fallback to uncompressed string
                self.exc_info = as_text(raw_exc_info)

    def to_dict(self, include_meta=True):
        """
        Returns a serialization of the current job instance

        You can exclude serializing the \`meta\` dictionary by setting
        \`include_meta=False\`.
        """
        obj = {}
        obj['created_at'] = utcformat(self.created_at or utcnow())
        obj['data'] = zlib.compress(self.data)

        if self.origin is not None:
            obj['origin'] = self.origin
        if self.description is not None:
            obj['description'] = self.description
        if self.enqueued_at is not None:
            obj['enqueued_at'] = utcformat(self.enqueued_at)
        if self.started_at is not None:
            obj['started_at'] = utcformat(self.started_at)
        if self.ended_at is not None:
            obj['ended_at'] = utcformat(self.ended_at)
        if self._result is not None:
            try:
                obj['result'] = dumps(self._result)
            except:
                obj['result'] = 'Unpickleable return value'
        if self.exc_info is not None:
            obj['exc_info'] = zlib.compress(str(self.exc_info).encode('utf-8'))
        if self.timeout is not None:
            obj['timeout'] = self.timeout
        if self.result_ttl is not None:
            obj['result_ttl'] = self.result_ttl
        if self.failure_ttl is not None:
            obj['failure_ttl'] = self.failure_ttl
        if self._status is not None:
            obj['status'] = self._status
        if self._dependency_id is not None:
            obj['dependency_id'] = self._dependency_id
        if self.meta and include_meta:
            obj['meta'] = dumps(self.meta)
        if self.ttl:
            obj['ttl'] = self.ttl

        return obj

    def save(self, pipeline=None, include_meta=True):
        """
        Dumps the current job instance to its corresponding Redis key.

        Exclude saving the \`meta\` dictionary by setting
        \`include_meta=False\`. This is useful to prevent clobbering
        user metadata without an expensive \`refresh()\` call first.

        Redis key persistence may be altered by \`cleanup()\` method.
        """
        key = self.key
        connection = pipeline if pipeline is not None else self.connection

        connection.hmset(key, self.to_dict(include_meta=include_meta))

    def save_meta(self):
        """Stores job meta from the job instance to the corresponding Redis key."""
        meta = dumps(self.meta)
        self.connection.hset(self.key, 'meta', meta)

    def cancel(self, pipeline=None):
        """Cancels the given job, which will prevent the job from ever being
        ran (or inspected).

        This method merely exists as a high-level API call to cancel jobs
        without worrying about the internals required to implement job
        cancellation.
        """
        from .queue import Queue
        pipeline = pipeline or self.connection.pipeline()
        if self.origin:
            q = Queue(name=self.origin, connection=self.connection)
            q.remove(self, pipeline=pipeline)
        pipeline.execute()

    def requeue(self):
        """Requeues job."""
        self.failed_job_registry.requeue(self)

    def delete(self, pipeline=None, remove_from_queue=True,
               delete_dependents=False):
        """Cancels the job and deletes the job hash from Redis. Jobs depending
        on this job can optionally be deleted as well."""
        if remove_from_queue:
            self.cancel(pipeline=pipeline)
        connection = pipeline if pipeline is not None else self.connection

        if self.is_finished:
            from .registry import FinishedJobRegistry
            registry = FinishedJobRegistry(self.origin,
                                           connection=self.connection,
                                           job_class=self.__class__)
            registry.remove(self, pipeline=pipeline)

        elif self.is_deferred:
            from .registry import DeferredJobRegistry
            registry = DeferredJobRegistry(self.origin,
                                           connection=self.connection,
                                           job_class=self.__class__)
            registry.remove(self, pipeline=pipeline)

        elif self.is_started:
            from .registry import StartedJobRegistry
            registry = StartedJobRegistry(self.origin,
                                          connection=self.connection,
                                          job_class=self.__class__)
            registry.remove(self, pipeline=pipeline)

        elif self.is_failed:
            self.failed_job_registry.remove(self, pipeline=pipeline)

        if delete_dependents:
            self.delete_dependents(pipeline=pipeline)

        connection.delete(self.key)
        connection.delete(self.dependents_key)

    def delete_dependents(self, pipeline=None):
        """Delete jobs depending on this job."""
        connection = pipeline if pipeline is not None else self.connection
        for dependent_id in self.dependent_ids:
            try:
                job = Job.fetch(dependent_id, connection=self.connection)
                job.delete(pipeline=pipeline,
                           remove_from_queue=False)
            except NoSuchJobError:
                # It could be that the dependent job was never saved to redis
                pass
        connection.delete(self.dependents_key)

    # Job execution
    def perform(self):  # noqa
        """Invokes the job function with the job arguments."""
        self.connection.persist(self.key)
        _job_stack.push(self)
        try:
            self._result = self._execute()
        finally:
            assert self is _job_stack.pop()
        return self._result

    def _execute(self):
        return self.func(*self.args, **self.kwargs)

    def get_ttl(self, default_ttl=None):
        """Returns ttl for a job that determines how long a job will be
        persisted. In the future, this method will also be responsible
        for determining ttl for repeated jobs.
        """
        return default_ttl if self.ttl is None else self.ttl

    def get_result_ttl(self, default_ttl=None):
        """Returns ttl for a job that determines how long a jobs result will
        be persisted. In the future, this method will also be responsible
        for determining ttl for repeated jobs.
        """
        return default_ttl if self.result_ttl is None else self.result_ttl

    # Representation
    def get_call_string(self):  # noqa
        """Returns a string representation of the call, formatted as a regular
        Python function invocation statement.
        """
        if self.func_name is None:
            return None

        arg_list = [as_text(repr(arg)) for arg in self.args]

        kwargs = ['{0}={1}'.format(k, as_text(repr(v))) for k, v in self.kwargs.items()]
        # Sort here because python 3.3 & 3.4 makes different call_string
        arg_list += sorted(kwargs)
        args = ', '.join(arg_list)

        return '{0}({1})'.format(self.func_name, args)

    def cleanup(self, ttl=None, pipeline=None, remove_from_queue=True):
        """Prepare job for eventual deletion (if needed). This method is usually
        called after successful execution. How long we persist the job and its
        result depends on the value of ttl:
        - If ttl is 0, cleanup the job immediately.
        - If it's a positive number, set the job to expire in X seconds.
        - If ttl is negative, don't set an expiry to it (persist
          forever)
        """
        if ttl == 0:
            self.delete(pipeline=pipeline, remove_from_queue=remove_from_queue)
        elif not ttl:
            return
        elif ttl > 0:
            connection = pipeline if pipeline is not None else self.connection
            connection.expire(self.key, ttl)

    @property
    def failed_job_registry(self):
        from .registry import FailedJobRegistry
        return FailedJobRegistry(self.origin, connection=self.connection,
                                 job_class=self.__class__)

    def register_dependency(self, pipeline=None):
        """Jobs may have dependencies. Jobs are enqueued only if the job they
        depend on is successfully performed. We record this relation as
        a reverse dependency (a Redis set), with a key that looks something
        like:

            rq:job:job_id:dependents = {'job_id_1', 'job_id_2'}

        This method adds the job in its dependency's dependents set
        and adds the job to DeferredJobRegistry.
        """
        from .registry import DeferredJobRegistry

        registry = DeferredJobRegistry(self.origin,
                                       connection=self.connection,
                                       job_class=self.__class__)
        registry.add(self, pipeline=pipeline)

        connection = pipeline if pipeline is not None else self.connection
        connection.sadd(self.dependents_key_for(self._dependency_id), self.id)


_job_stack = LocalStack()
`

fileContents['rq/worker.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import errno
import logging
import os
import random
import signal
import socket
import sys
import time
import traceback
import warnings
from datetime import timedelta
from uuid import uuid4

try:
    from signal import SIGKILL
except ImportError:
    from signal import SIGTERM as SIGKILL

from redis import WatchError

from . import worker_registration
from .compat import PY2, as_text, string_types, text_type
from .connections import get_current_connection, push_connection, pop_connection

from .defaults import (DEFAULT_RESULT_TTL,
                       DEFAULT_WORKER_TTL, DEFAULT_JOB_MONITORING_INTERVAL,
                       DEFAULT_LOGGING_FORMAT, DEFAULT_LOGGING_DATE_FORMAT)
from .exceptions import DequeueTimeout, ShutDownImminentException
from .job import Job, JobStatus
from .logutils import setup_loghandlers
from .queue import Queue
from .registry import (FailedJobRegistry, FinishedJobRegistry,
                       StartedJobRegistry, clean_registries)
from .suspension import is_suspended
from .timeouts import JobTimeoutException, HorseMonitorTimeoutException, UnixSignalDeathPenalty
from .utils import (backend_class, ensure_list, enum,
                    make_colorizer, utcformat, utcnow, utcparse)
from .version import VERSION
from .worker_registration import clean_worker_registry, get_keys

try:
    from procname import setprocname
except ImportError:
    def setprocname(*args, **kwargs):  # noqa
        pass

green = make_colorizer('darkgreen')
yellow = make_colorizer('darkyellow')
blue = make_colorizer('darkblue')


logger = logging.getLogger(__name__)


class StopRequested(Exception):
    pass


def compact(l):
    return [x for x in l if x is not None]


_signames = dict((getattr(signal, signame), signame)
                 for signame in dir(signal)
                 if signame.startswith('SIG') and '_' not in signame)


def signal_name(signum):
    try:
        if sys.version_info[:2] >= (3, 5):
            return signal.Signals(signum).name
        else:
            return _signames[signum]

    except KeyError:
        return 'SIG_UNKNOWN'
    except ValueError:
        return 'SIG_UNKNOWN'


WorkerStatus = enum(
    'WorkerStatus',
    STARTED='started',
    SUSPENDED='suspended',
    BUSY='busy',
    IDLE='idle'
)


class Worker(object):
    redis_worker_namespace_prefix = 'rq:worker:'
    redis_workers_keys = worker_registration.REDIS_WORKER_KEYS
    death_penalty_class = UnixSignalDeathPenalty
    queue_class = Queue
    job_class = Job
    log_result_lifespan = True
    log_job_description = True

    @classmethod
    def all(cls, connection=None, job_class=None, queue_class=None, queue=None):
        """Returns an iterable of all Workers."""
        if queue:
            connection = queue.connection
        elif connection is None:
            connection = get_current_connection()

        worker_keys = get_keys(queue=queue, connection=connection)
        workers = [cls.find_by_key(as_text(key),
                                   connection=connection,
                                   job_class=job_class,
                                   queue_class=queue_class)
                   for key in worker_keys]
        return compact(workers)

    # ... (truncated for brevity — full file available in editor)

    def handle_job_failure(self, job, started_job_registry=None,
                           exc_string=''):
        """Handles the failure or an executing job by:
            1. Setting the job status to failed
            2. Removing the job from StartedJobRegistry
            3. Setting the workers current job to None
            4. Add the job to FailedJobRegistry
        """
        with self.connection.pipeline() as pipeline:
            if started_job_registry is None:
                started_job_registry = StartedJobRegistry(
                    job.origin,
                    self.connection,
                    job_class=self.job_class
                )
            job.set_status(JobStatus.FAILED, pipeline=pipeline)
            started_job_registry.remove(job, pipeline=pipeline)

            if not self.disable_default_exception_handler:
                failed_job_registry = FailedJobRegistry(job.origin, job.connection,
                                                        job_class=self.job_class)
                failed_job_registry.add(job, ttl=job.failure_ttl,
                                        exc_string=exc_string, pipeline=pipeline)

            self.set_current_job_id(None, pipeline=pipeline)
            self.increment_failed_job_count(pipeline)
            if job.started_at and job.ended_at:
                self.increment_total_working_time(
                    job.ended_at - job.started_at,
                    pipeline
                )

            try:
                pipeline.execute()
            except Exception:
                pass

    def perform_job(self, job, queue, heartbeat_ttl=None):
        """Performs the actual work of a job.  Will/should only be called
        inside the work horse's process.
        """
        self.prepare_job_execution(job, heartbeat_ttl)
        push_connection(self.connection)

        started_job_registry = StartedJobRegistry(job.origin,
                                                  self.connection,
                                                  job_class=self.job_class)

        try:
            job.started_at = utcnow()
            timeout = job.timeout or self.queue_class.DEFAULT_TIMEOUT
            with self.death_penalty_class(timeout, JobTimeoutException, job_id=job.id):
                rv = job.perform()

            job.ended_at = utcnow()

            # Pickle the result in the same try-except block since we need
            # to use the same exc handling when pickling fails
            job._result = rv
            self.handle_job_success(job=job,
                                    queue=queue,
                                    started_job_registry=started_job_registry)
        except:
            job.ended_at = utcnow()
            exc_info = sys.exc_info()
            exc_string = self._get_safe_exception_string(
                traceback.format_exception(*exc_info)
            )
            self.handle_job_failure(job=job, exc_string=exc_string,
                                    started_job_registry=started_job_registry)
            self.handle_exception(job, *exc_info)
            return False

        finally:
            pop_connection()

        self.log.info('%s: %s (%s)', green(job.origin), blue('Job OK'), job.id)
        if rv is not None:
            log_result = "{0!r}".format(as_text(text_type(rv)))
            self.log.debug('Result: %s', yellow(log_result))

        if self.log_result_lifespan:
            result_ttl = job.get_result_ttl(self.default_result_ttl)
            if result_ttl == 0:
                self.log.info('Result discarded immediately')
            elif result_ttl > 0:
                self.log.info('Result is kept for %s seconds', result_ttl)
            else:
                self.log.info('Result will never expire, clean up result key manually')

        return True
`

fileContents['rq/queue.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import uuid
import warnings

from redis import WatchError

from .compat import as_text, string_types, total_ordering
from .connections import resolve_connection
from .defaults import DEFAULT_RESULT_TTL
from .exceptions import (DequeueTimeout, InvalidJobDependency, NoSuchJobError,
                         UnpickleError)
from .job import Job, JobStatus
from .utils import backend_class, import_attribute, utcnow, parse_timeout


def compact(lst):
    return [item for item in lst if item is not None]


@total_ordering
class Queue(object):
    job_class = Job
    DEFAULT_TIMEOUT = 180  # Default timeout seconds.
    redis_queue_namespace_prefix = 'rq:queue:'
    redis_queues_keys = 'rq:queues'

    @classmethod
    def all(cls, connection=None, job_class=None):
        """Returns an iterable of all Queues."""
        connection = resolve_connection(connection)

        def to_queue(queue_key):
            return cls.from_queue_key(as_text(queue_key),
                                      connection=connection,
                                      job_class=job_class)
        return [to_queue(rq_key)
                for rq_key in connection.smembers(cls.redis_queues_keys)
                if rq_key]

    @classmethod
    def from_queue_key(cls, queue_key, connection=None, job_class=None):
        """Returns a Queue instance, based on the naming conventions for naming
        the internal Redis keys."""
        prefix = cls.redis_queue_namespace_prefix
        if not queue_key.startswith(prefix):
            raise ValueError('Not a valid RQ queue key: {0}'.format(queue_key))
        name = queue_key[len(prefix):]
        return cls(name, connection=connection, job_class=job_class)

    def __init__(self, name='default', default_timeout=None, connection=None,
                 is_async=True, job_class=None, **kwargs):
        self.connection = resolve_connection(connection)
        prefix = self.redis_queue_namespace_prefix
        self.name = name
        self._key = '{0}{1}'.format(prefix, name)
        self._default_timeout = parse_timeout(default_timeout) or self.DEFAULT_TIMEOUT
        self._is_async = is_async

        if 'async' in kwargs:
            self._is_async = kwargs['async']
            warnings.warn('The \\\`async\\\` keyword is deprecated. Use \\\`is_async\\\` instead', DeprecationWarning)

        if job_class is not None:
            if isinstance(job_class, string_types):
                job_class = import_attribute(job_class)
            self.job_class = job_class

    def enqueue_call(self, func, args=None, kwargs=None, timeout=None,
                     result_ttl=None, ttl=None, failure_ttl=None,
                     description=None, depends_on=None, job_id=None,
                     at_front=False, meta=None):
        """Creates a job to represent the delayed function call and enqueues it."""
        timeout = parse_timeout(timeout) or self._default_timeout
        result_ttl = parse_timeout(result_ttl)
        failure_ttl = parse_timeout(failure_ttl)
        ttl = parse_timeout(ttl)

        job = self.job_class.create(
            func, args=args, kwargs=kwargs, connection=self.connection,
            result_ttl=result_ttl, ttl=ttl, failure_ttl=failure_ttl,
            status=JobStatus.QUEUED, description=description,
            depends_on=depends_on, timeout=timeout, id=job_id,
            origin=self.name, meta=meta)

        if depends_on is not None:
            if not isinstance(depends_on, self.job_class):
                depends_on = self.job_class(id=depends_on,
                                            connection=self.connection)
            with self.connection.pipeline() as pipe:
                while True:
                    try:
                        pipe.watch(depends_on.key)
                        if not self.job_class.exists(depends_on.id,
                                                     self.connection):
                            raise InvalidJobDependency('Job {0} does not exist'.format(depends_on.id))

                        if depends_on.get_status() != JobStatus.FINISHED:
                            pipe.multi()
                            job.set_status(JobStatus.DEFERRED)
                            job.register_dependency(pipeline=pipe)
                            job.save(pipeline=pipe)
                            job.cleanup(ttl=job.ttl, pipeline=pipe)
                            pipe.execute()
                            return job
                        break
                    except WatchError:
                        continue

        job = self.enqueue_job(job, at_front=at_front)
        return job

    def enqueue(self, f, *args, **kwargs):
        """Creates a job to represent the delayed function call and enqueues it."""
        if not isinstance(f, string_types) and f.__module__ == '__main__':
            raise ValueError('Functions from the __main__ module cannot be processed '
                             'by workers')

        timeout = kwargs.pop('job_timeout', None)
        description = kwargs.pop('description', None)
        result_ttl = kwargs.pop('result_ttl', None)
        ttl = kwargs.pop('ttl', None)
        failure_ttl = kwargs.pop('failure_ttl', None)
        depends_on = kwargs.pop('depends_on', None)
        job_id = kwargs.pop('job_id', None)
        at_front = kwargs.pop('at_front', False)
        meta = kwargs.pop('meta', None)

        if 'args' in kwargs or 'kwargs' in kwargs:
            assert args == (), 'Extra positional arguments cannot be used when using explicit args and kwargs'
            args = kwargs.pop('args', None)
            kwargs = kwargs.pop('kwargs', None)

        return self.enqueue_call(
            func=f, args=args, kwargs=kwargs, timeout=timeout,
            result_ttl=result_ttl, ttl=ttl, failure_ttl=failure_ttl,
            description=description, depends_on=depends_on, job_id=job_id,
            at_front=at_front, meta=meta
        )

    def enqueue_job(self, job, pipeline=None, at_front=False):
        """Enqueues a job for delayed execution."""
        pipe = pipeline if pipeline is not None else self.connection.pipeline()

        pipe.sadd(self.redis_queues_keys, self.key)
        job.set_status(JobStatus.QUEUED, pipeline=pipe)

        job.origin = self.name
        job.enqueued_at = utcnow()

        if job.timeout is None:
            job.timeout = self._default_timeout
        job.save(pipeline=pipe)
        job.cleanup(ttl=job.ttl, pipeline=pipe)

        if self._is_async:
            self.push_job_id(job.id, pipeline=pipe, at_front=at_front)

        if pipeline is None:
            pipe.execute()

        if not self._is_async:
            job = self.run_job(job)

        return job
`

fileContents['rq/__init__.py'] = `# -*- coding: utf-8 -*-
# flake8: noqa
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from .connections import (Connection, get_current_connection, pop_connection,
                          push_connection, use_connection)
from .job import cancel_job, get_current_job, requeue_job
from .queue import Queue
from .version import VERSION
from .worker import SimpleWorker, Worker

__version__ = VERSION
`

fileContents['rq/connections.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from contextlib import contextmanager

from redis import Redis

from .local import LocalStack, release_local


class NoRedisConnectionException(Exception):
    pass


@contextmanager
def Connection(connection=None):  # noqa
    if connection is None:
        connection = Redis()
    push_connection(connection)
    try:
        yield
    finally:
        popped = pop_connection()
        assert popped == connection, \\
            'Unexpected Redis connection was popped off the stack. ' \\
            'Check your Redis connection setup.'


def push_connection(redis):
    """Pushes the given connection on the stack."""
    _connection_stack.push(redis)


def pop_connection():
    """Pops the topmost connection from the stack."""
    return _connection_stack.pop()


def use_connection(redis=None):
    """Clears the stack and uses the given connection.  Protects against mixed
    use of use_connection() and stacked connection contexts.
    """
    assert len(_connection_stack) <= 1, \\
        'You should not mix Connection contexts with use_connection()'
    release_local(_connection_stack)

    if redis is None:
        redis = Redis()
    push_connection(redis)


def get_current_connection():
    """Returns the current Redis connection (i.e. the topmost on the
    connection stack).
    """
    return _connection_stack.top


def resolve_connection(connection=None):
    """Convenience function to resolve the given or the current connection.
    Raises an exception if it cannot resolve a connection now.
    """
    if connection is not None:
        return connection

    connection = get_current_connection()
    if connection is None:
        raise NoRedisConnectionException('Could not resolve a Redis connection')
    return connection


_connection_stack = LocalStack()

__all__ = ['Connection', 'get_current_connection', 'push_connection',
           'pop_connection', 'use_connection']
`

fileContents['rq/exceptions.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)


class NoSuchJobError(Exception):
    pass


class InvalidJobDependency(Exception):
    pass


class InvalidJobOperationError(Exception):
    pass


class InvalidJobOperation(Exception):
    pass


class UnpickleError(Exception):
    def __init__(self, message, raw_data, inner_exception=None):
        super(UnpickleError, self).__init__(message, inner_exception)
        self.raw_data = raw_data


class DequeueTimeout(Exception):
    pass


class ShutDownImminentException(Exception):
    def __init__(self, msg, extra_info):
        self.extra_info = extra_info
        super(ShutDownImminentException, self).__init__(msg)


class TimeoutFormatError(Exception):
    pass
`

fileContents['rq/utils.py'] = `# -*- coding: utf-8 -*-
"""
Miscellaneous helper functions.

The formatter for ANSI colored console output is heavily based on Pygments
terminal colorizing code, originally by Georg Brandl.
"""
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import calendar
import datetime
import importlib
import logging
import numbers
import sys
try:
    from collections.abc import Iterable
except ImportError:
    from collections import Iterable

from .compat import as_text, is_python_version, string_types
from .exceptions import TimeoutFormatError


class _Colorizer(object):
    def __init__(self):
        esc = "\\x1b["
        self.codes = {}
        self.codes[""] = ""
        self.codes["reset"] = esc + "39;49;00m"
        self.codes["bold"] = esc + "01m"
        self.codes["faint"] = esc + "02m"
        self.codes["standout"] = esc + "03m"
        self.codes["underline"] = esc + "04m"
        self.codes["blink"] = esc + "05m"
        self.codes["overline"] = esc + "06m"

        dark_colors = ["black", "darkred", "darkgreen", "brown", "darkblue",
                       "purple", "teal", "lightgray"]
        light_colors = ["darkgray", "red", "green", "yellow", "blue",
                        "fuchsia", "turquoise", "white"]

        x = 30
        for d, l in zip(dark_colors, light_colors):
            self.codes[d] = esc + "%im" % x
            self.codes[l] = esc + "%i;01m" % x
            x += 1

        del d, l, x

        self.codes["darkteal"] = self.codes["turquoise"]
        self.codes["darkyellow"] = self.codes["brown"]
        self.codes["fuscia"] = self.codes["fuchsia"]
        self.codes["white"] = self.codes["bold"]

        if hasattr(sys.stdout, "isatty"):
            self.notty = not sys.stdout.isatty()
        else:
            self.notty = True

    def reset_color(self):
        return self.codes["reset"]

    def colorize(self, color_key, text):
        if self.notty:
            return text
        else:
            return self.codes[color_key] + text + self.codes["reset"]


colorizer = _Colorizer()


def make_colorizer(color):
    """Creates a function that colorizes text with the given color."""
    def inner(text):
        return colorizer.colorize(color, text)
    return inner


def import_attribute(name):
    """Return an attribute from a dotted path name (e.g. "path.to.func")."""
    module_name, attribute = name.rsplit('.', 1)
    module = importlib.import_module(module_name)
    return getattr(module, attribute)


def utcnow():
    return datetime.datetime.utcnow()


_TIMESTAMP_FORMAT = '%Y-%m-%dT%H:%M:%S.%fZ'


def utcformat(dt):
    return dt.strftime(as_text(_TIMESTAMP_FORMAT))


def utcparse(string):
    try:
        return datetime.datetime.strptime(string, _TIMESTAMP_FORMAT)
    except ValueError:
        return datetime.datetime.strptime(string, '%Y-%m-%dT%H:%M:%SZ')


def ensure_list(obj):
    """When passed an iterable of objects, does nothing, otherwise, it returns
    a list with just that object in it."""
    from collections.abc import Iterable as Iter
    return obj if isinstance(obj, Iter) and not isinstance(obj, str) else [obj]


def current_timestamp():
    """Returns current UTC timestamp"""
    return calendar.timegm(datetime.datetime.utcnow().utctimetuple())


def enum(name, *sequential, **named):
    values = dict(zip(sequential, range(len(sequential))), **named)
    return type(str(name), (), values)


def backend_class(holder, default_name, override=None):
    """Get a backend class using its default attribute name or an override"""
    if override is None:
        return getattr(holder, default_name)
    elif isinstance(override, str):
        return import_attribute(override)
    else:
        return override


def parse_timeout(timeout):
    """Transfer all kinds of timeout format to an integer representing seconds"""
    if not isinstance(timeout, numbers.Integral) and timeout is not None:
        try:
            timeout = int(timeout)
        except ValueError:
            digit, unit = timeout[:-1], (timeout[-1:]).lower()
            unit_second = {'d': 86400, 'h': 3600, 'm': 60, 's': 1}
            try:
                timeout = int(digit) * unit_second[unit]
            except (ValueError, KeyError):
                raise TimeoutFormatError('Timeout must be an integer or a string representing an integer, or '
                                         'a string with format: digits + unit, unit can be "d", "h", "m", "s", '
                                         'such as "1h", "23m".')
    return timeout
`

fileContents['rq/__init__.py'] = `# -*- coding: utf-8 -*-
# flake8: noqa
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from .connections import (Connection, get_current_connection, pop_connection,
                          push_connection, use_connection)
from .job import cancel_job, get_current_job, requeue_job
from .queue import Queue
from .version import VERSION
from .worker import SimpleWorker, Worker

__version__ = VERSION
`
fileContents['rq/cli/cli.py'] = `# -*- coding: utf-8 -*-
"""
RQ command line tool
"""
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from functools import update_wrapper
import os
import sys

import click
from redis.exceptions import ConnectionError

from rq import Connection, __version__ as version
from rq.cli.helpers import (read_config_file, refresh,
                            setup_loghandlers_from_args,
                            show_both, show_queues, show_workers, CliConfig)
from rq.contrib.legacy import cleanup_ghosts
from rq.defaults import (DEFAULT_CONNECTION_CLASS, DEFAULT_JOB_CLASS,
                         DEFAULT_QUEUE_CLASS, DEFAULT_WORKER_CLASS,
                         DEFAULT_RESULT_TTL, DEFAULT_WORKER_TTL,
                         DEFAULT_JOB_MONITORING_INTERVAL,
                         DEFAULT_LOGGING_FORMAT, DEFAULT_LOGGING_DATE_FORMAT)
from rq.exceptions import InvalidJobOperationError
from rq.registry import FailedJobRegistry
from rq.utils import import_attribute
from rq.suspension import (suspend as connection_suspend,
                           resume as connection_resume, is_suspended)


# Disable the warning that Click displays (as of Click version 5.0) when users
# use unicode_literals in Python 2.
# See http://click.pocoo.org/dev/python3/#unicode-literals for more details.
click.disable_unicode_literals_warning = True


shared_options = [
    click.option('--url', '-u',
                 envvar='RQ_REDIS_URL',
                 help='URL describing Redis connection details.'),
    click.option('--config', '-c',
                 envvar='RQ_CONFIG',
                 help='Module containing RQ settings.'),
    click.option('--worker-class', '-w',
                 envvar='RQ_WORKER_CLASS',
                 default=DEFAULT_WORKER_CLASS,
                 help='RQ Worker class to use'),
    click.option('--job-class', '-j',
                 envvar='RQ_JOB_CLASS',
                 default=DEFAULT_JOB_CLASS,
                 help='RQ Job class to use'),
    click.option('--queue-class',
                 envvar='RQ_QUEUE_CLASS',
                 default=DEFAULT_QUEUE_CLASS,
                 help='RQ Queue class to use'),
    click.option('--connection-class',
                 envvar='RQ_CONNECTION_CLASS',
                 default=DEFAULT_CONNECTION_CLASS,
                 help='Redis client class to use'),
    click.option('--path', '-P',
                 default='.',
                 help='Specify the import path.',
                 multiple=True)
]


def pass_cli_config(func):
    # add all the shared options to the command
    for option in shared_options:
        func = option(func)

    # pass the cli config object into the command
    def wrapper(*args, **kwargs):
        ctx = click.get_current_context()
        cli_config = CliConfig(**kwargs)
        return ctx.invoke(func, cli_config, *args[1:], **kwargs)

    return update_wrapper(wrapper, func)


@click.group()
@click.version_option(version)
def main():
    """RQ command line tool."""
    pass


@main.command()
@click.option('--all', '-a', is_flag=True, help='Empty all queues')
@click.argument('queues', nargs=-1)
@pass_cli_config
def empty(cli_config, all, queues, **options):
    """Empty given queues."""

    if all:
        queues = cli_config.queue_class.all(connection=cli_config.connection,
                                            job_class=cli_config.job_class)
    else:
        queues = [cli_config.queue_class(queue,
                                         connection=cli_config.connection,
                                         job_class=cli_config.job_class)
                  for queue in queues]

    if not queues:
        click.echo('Nothing to do')
        sys.exit(0)

    for queue in queues:
        num_jobs = queue.empty()
        click.echo('{0} jobs removed from {1} queue'.format(num_jobs, queue.name))


@main.command()
@click.option('--all', '-a', is_flag=True, help='Requeue all failed jobs')
@click.option('--queue', required=True, type=str)
@click.argument('job_ids', nargs=-1)
@pass_cli_config
def requeue(cli_config, queue, all, job_class, job_ids,  **options):
    """Requeue failed jobs."""

    failed_job_registry = FailedJobRegistry(queue,
                                            connection=cli_config.connection)
    if all:
        job_ids = failed_job_registry.get_job_ids()

    if not job_ids:
        click.echo('Nothing to do')
        sys.exit(0)

    click.echo('Requeueing {0} jobs from failed queue'.format(len(job_ids)))
    fail_count = 0
    with click.progressbar(job_ids) as job_ids:
        for job_id in job_ids:
            try:
                failed_job_registry.requeue(job_id)
            except InvalidJobOperationError:
                fail_count += 1

    if fail_count > 0:
        click.secho('Unable to requeue {0} jobs from failed job registry'.format(fail_count), fg='red')


@main.command()
@click.option('--interval', '-i', type=float, help='Updates stats every N seconds (default: don\\'t poll)')
@click.option('--raw', '-r', is_flag=True, help='Print only the raw numbers, no bar charts')
@click.option('--only-queues', '-Q', is_flag=True, help='Show only queue info')
@click.option('--only-workers', '-W', is_flag=True, help='Show only worker info')
@click.option('--by-queue', '-R', is_flag=True, help='Shows workers by queue')
@click.argument('queues', nargs=-1)
@pass_cli_config
def info(cli_config, interval, raw, only_queues, only_workers, by_queue, queues,
         **options):
    """RQ command-line monitor."""

    if only_queues:
        func = show_queues
    elif only_workers:
        func = show_workers
    else:
        func = show_both

    try:
        with Connection(cli_config.connection):
            refresh(interval, func, queues, raw, by_queue,
                    cli_config.queue_class, cli_config.worker_class)
    except ConnectionError as e:
        click.echo(e)
        sys.exit(1)
    except KeyboardInterrupt:
        click.echo()
        sys.exit(0)


@main.command()
@click.option('--burst', '-b', is_flag=True, help='Run in burst mode (quit after all work is done)')
@click.option('--logging_level', type=str, default="INFO", help='Set logging level')
@click.option('--log-format', type=str, default=DEFAULT_LOGGING_FORMAT, help='Set the format of the logs')
@click.option('--date-format', type=str, default=DEFAULT_LOGGING_DATE_FORMAT, help='Set the date format of the logs')
@click.option('--name', '-n', help='Specify a different name')
@click.option('--results-ttl', type=int, default=DEFAULT_RESULT_TTL , help='Default results timeout to be used')
@click.option('--worker-ttl', type=int, default=DEFAULT_WORKER_TTL , help='Default worker timeout to be used')
@click.option('--job-monitoring-interval', type=int, default=DEFAULT_JOB_MONITORING_INTERVAL , help='Default job monitoring interval to be used')
@click.option('--disable-job-desc-logging', is_flag=True, help='Turn off description logging.')
@click.option('--verbose', '-v', is_flag=True, help='Show more output')
@click.option('--quiet', '-q', is_flag=True, help='Show less output')
@click.option('--sentry-dsn', envvar='RQ_SENTRY_DSN', help='Report exceptions to this Sentry DSN')
@click.option('--exception-handler', help='Exception handler(s) to use', multiple=True)
@click.option('--pid', help='Write the process ID number to a file at the specified path')
@click.option('--disable-default-exception-handler', '-d', is_flag=True, help='Disable RQ\\'s default exception handler')
@click.argument('queues', nargs=-1)
@pass_cli_config
def worker(cli_config, burst, logging_level, name, results_ttl,
           worker_ttl, job_monitoring_interval, verbose, quiet, sentry_dsn,
           exception_handler, pid, disable_default_exception_handler, queues,
           log_format, date_format, **options):
    """Starts an RQ worker."""
    settings = read_config_file(cli_config.config) if cli_config.config else {}
    # Worker specific default arguments
    queues = queues or settings.get('QUEUES', ['default'])
    sentry_dsn = sentry_dsn or settings.get('SENTRY_DSN')
    name = name or settings.get('NAME')

    if pid:
        with open(os.path.expanduser(pid), "w") as fp:
            fp.write(str(os.getpid()))

    setup_loghandlers_from_args(verbose, quiet, date_format, log_format)

    try:

        cleanup_ghosts(cli_config.connection)
        exception_handlers = []
        for h in exception_handler:
            exception_handlers.append(import_attribute(h))

        if is_suspended(cli_config.connection):
            click.secho('RQ is currently suspended, to resume job execution run "rq resume"', fg='red')
            sys.exit(1)

        queues = [cli_config.queue_class(queue,
                                         connection=cli_config.connection,
                                         job_class=cli_config.job_class)
                  for queue in queues]
        worker = cli_config.worker_class(
            queues, name=name, connection=cli_config.connection,
            default_worker_ttl=worker_ttl, default_result_ttl=results_ttl,
            job_monitoring_interval=job_monitoring_interval,
            job_class=cli_config.job_class, queue_class=cli_config.queue_class,
            exception_handlers=exception_handlers or None,
            disable_default_exception_handler=disable_default_exception_handler
        )

        # Should we configure Sentry?
        if sentry_dsn:
            from rq.contrib.sentry import register_sentry
            register_sentry(sentry_dsn)

        worker.work(burst=burst, logging_level=logging_level, date_format=date_format, log_format=log_format)
    except ConnectionError as e:
        print(e)
        sys.exit(1)


@main.command()
@click.option('--duration', help='Seconds you want the workers to be suspended.  Default is forever.', type=int)
@pass_cli_config
def suspend(cli_config, duration, **options):
    """Suspends all workers, to resume run \`rq resume\`"""

    if duration is not None and duration < 1:
        click.echo("Duration must be an integer greater than 1")
        sys.exit(1)

    connection_suspend(cli_config.connection, duration)

    if duration:
        msg = """Suspending workers for {0} seconds.  No new jobs will be started during that time, but then will
        automatically resume""".format(duration)
        click.echo(msg)
    else:
        click.echo("Suspending workers.  No new jobs will be started.  But current jobs will be completed")


@main.command()
@pass_cli_config
def resume(cli_config, **options):
    """Resumes processing of queues, that where suspended with \`rq suspend\`"""
    connection_resume(cli_config.connection)
    click.echo("Resuming workers.")
`
fileContents['rq/cli/helpers.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import sys
import importlib
import time
from functools import partial

import click
import redis
from redis import Redis
from redis.sentinel import Sentinel
from rq.defaults import (DEFAULT_CONNECTION_CLASS, DEFAULT_JOB_CLASS,
                         DEFAULT_QUEUE_CLASS, DEFAULT_WORKER_CLASS)
from rq.logutils import setup_loghandlers
from rq.utils import import_attribute
from rq.worker import WorkerStatus

red = partial(click.style, fg='red')
green = partial(click.style, fg='green')
yellow = partial(click.style, fg='yellow')


def read_config_file(module):
    """Reads all UPPERCASE variables defined in the given module file."""
    settings = importlib.import_module(module)
    return dict([(k, v)
                 for k, v in settings.__dict__.items()
                 if k.upper() == k])


def get_redis_from_config(settings, connection_class=Redis):
    """Returns a StrictRedis instance from a dictionary of settings.
       To use redis sentinel, you must specify a dictionary in the configuration file.
       Example of a dictionary with keys without values:
       SENTINEL: {'INSTANCES':, 'SOCKET_TIMEOUT':, 'PASSWORD':,'DB':, 'MASTER_NAME':}
    """
    if settings.get('REDIS_URL') is not None:
        return connection_class.from_url(settings['REDIS_URL'])

    elif settings.get('SENTINEL') is not None:
        instances = settings['SENTINEL'].get('INSTANCES', [('localhost', 26379)])
        socket_timeout = settings['SENTINEL'].get('SOCKET_TIMEOUT', None)
        password = settings['SENTINEL'].get('PASSWORD', None)
        db = settings['SENTINEL'].get('DB', 0)
        master_name = settings['SENTINEL'].get('MASTER_NAME', 'mymaster')
        sn = Sentinel(instances, socket_timeout=socket_timeout, password=password, db=db)
        return sn.master_for(master_name)

    kwargs = {
        'host': settings.get('REDIS_HOST', 'localhost'),
        'port': settings.get('REDIS_PORT', 6379),
        'db': settings.get('REDIS_DB', 0),
        'password': settings.get('REDIS_PASSWORD', None),
        'ssl': settings.get('REDIS_SSL', False),
    }

    return connection_class(**kwargs)


def pad(s, pad_to_length):
    """Pads the given string to the given length."""
    return ('%-' + '%ds' % pad_to_length) % (s,)


def get_scale(x):
    """Finds the lowest scale where x <= scale."""
    scales = [20, 50, 100, 200, 400, 600, 800, 1000]
    for scale in scales:
        if x <= scale:
            return scale
    return x


def state_symbol(state):
    symbols = {
        WorkerStatus.BUSY: red('busy'),
        WorkerStatus.IDLE: green('idle'),
        WorkerStatus.SUSPENDED: yellow('suspended'),
    }
    try:
        return symbols[state]
    except KeyError:
        return state


def show_queues(queues, raw, by_queue, queue_class, worker_class):
    if queues:
        qs = list(map(queue_class, queues))
    else:
        qs = queue_class.all()

    num_jobs = 0
    termwidth, _ = click.get_terminal_size()
    chartwidth = min(20, termwidth - 20)

    max_count = 0
    counts = dict()
    for q in qs:
        count = q.count
        counts[q] = count
        max_count = max(max_count, count)
    scale = get_scale(max_count)
    ratio = chartwidth * 1.0 / scale

    for q in qs:
        count = counts[q]
        if not raw:
            chart = green('|' + '█' * int(ratio * count))
            line = '%-12s %s %d' % (q.name, chart, count)
        else:
            line = 'queue %s %d' % (q.name, count)
        click.echo(line)

        num_jobs += count

    # print summary when not in raw mode
    if not raw:
        click.echo('%d queues, %d jobs total' % (len(qs), num_jobs))


def show_workers(queues, raw, by_queue, queue_class, worker_class):
    if queues:
        qs = list(map(queue_class, queues))

        workers = set()
        for queue in qs:
            for worker in worker_class.all(queue=queue):
                workers.add(worker)

    else:
        qs = queue_class.all()
        workers = worker_class.all()

    if not by_queue:

        for worker in workers:
            queue_names = ', '.join(worker.queue_names())
            name = '%s (%s %s)' % (worker.name, worker.hostname, worker.pid)
            if not raw:
                click.echo('%s: %s %s' % (name, state_symbol(worker.get_state()), queue_names))
            else:
                click.echo('worker %s %s %s' % (name, worker.get_state(), queue_names))

    else:
        # Display workers by queue
        queue_dict = {}
        for queue in qs:
            queue_dict[queue] = worker_class.all(queue=queue)

        if queue_dict:
            max_length = max([len(q.name) for q, in queue_dict.keys()])
        else:
            max_length = 0

        for queue in queue_dict:
            if queue_dict[queue]:
                queues_str = ", ".join(
                    sorted(
                        map(lambda w: '%s (%s)' % (w.name, state_symbol(w.get_state())), queue_dict[queue])
                    )
                )
            else:
                queues_str = '–'
            click.echo('%s %s' % (pad(queue.name + ':', max_length + 1), queues_str))

    if not raw:
        click.echo('%d workers, %d queues' % (len(workers), len(qs)))


def show_both(queues, raw, by_queue, queue_class, worker_class):
    show_queues(queues, raw, by_queue, queue_class, worker_class)
    if not raw:
        click.echo('')
    show_workers(queues, raw, by_queue, queue_class, worker_class)
    if not raw:
        click.echo('')
        import datetime
        click.echo('Updated: %s' % datetime.datetime.now())


def refresh(interval, func, *args):
    while True:
        if interval:
            click.clear()
        func(*args)
        if interval:
            time.sleep(interval)
        else:
            break


def setup_loghandlers_from_args(verbose, quiet, date_format, log_format):
    if verbose and quiet:
        raise RuntimeError("Flags --verbose and --quiet are mutually exclusive.")

    if verbose:
        level = 'DEBUG'
    elif quiet:
        level = 'WARNING'
    else:
        level = 'INFO'
    setup_loghandlers(level, date_format=date_format, log_format=log_format)


class CliConfig(object):
    """A helper class to be used with click commands, to handle shared options"""
    def __init__(self, url=None, config=None, worker_class=DEFAULT_WORKER_CLASS,
                 job_class=DEFAULT_JOB_CLASS, queue_class=DEFAULT_QUEUE_CLASS,
                 connection_class=DEFAULT_CONNECTION_CLASS, path=None, *args, **kwargs):
        self._connection = None
        self.url = url
        self.config = config

        if path:
            for pth in path:
                sys.path.append(pth)

        try:
            self.worker_class = import_attribute(worker_class)
        except (ImportError, AttributeError) as exc:
            raise click.BadParameter(str(exc), param_hint='--worker-class')
        try:
            self.job_class = import_attribute(job_class)
        except (ImportError, AttributeError) as exc:
            raise click.BadParameter(str(exc), param_hint='--job-class')

        try:
            self.queue_class = import_attribute(queue_class)
        except (ImportError, AttributeError) as exc:
            raise click.BadParameter(str(exc), param_hint='--queue-class')

        try:
            self.connection_class = import_attribute(connection_class)
        except (ImportError, AttributeError) as exc:
            raise click.BadParameter(str(exc), param_hint='--connection-class')

    @property
    def connection(self):
        if self._connection is None:
            if self.url:
                self._connection = self.connection_class.from_url(self.url)
            else:
                settings = read_config_file(self.config) if self.config else {}
                self._connection = get_redis_from_config(settings,
                                                         self.connection_class)
        return self._connection
`
fileContents['rq/compat/__init__.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import sys


def is_python_version(*versions):
    for version in versions:
        if (sys.version_info[0] == version[0] and
                sys.version_info >= version):
            return True
    return False


try:
    from functools import total_ordering
except ImportError:
    def total_ordering(cls):  # noqa
        """Class decorator that fills in missing ordering methods"""
        convert = {
            '__lt__': [('__gt__', lambda self, other: other < self),
                       ('__le__', lambda self, other: not other < self),
                       ('__ge__', lambda self, other: not self < other)],
            '__le__': [('__ge__', lambda self, other: other <= self),
                       ('__lt__', lambda self, other: not other <= self),
                       ('__gt__', lambda self, other: not self <= other)],
            '__gt__': [('__lt__', lambda self, other: other > self),
                       ('__ge__', lambda self, other: not other > self),
                       ('__le__', lambda self, other: not self > other)],
            '__ge__': [('__le__', lambda self, other: other >= self),
                       ('__gt__', lambda self, other: not other >= self),
                       ('__lt__', lambda self, other: not self >= other)]
        }
        roots = set(dir(cls)) & set(convert)
        if not roots:
            raise ValueError('must define at least one ordering operation: < > <= >=')  # noqa
        root = max(roots)  # prefer __lt__ to __le__ to __gt__ to __ge__
        for opname, opfunc in convert[root]:
            if opname not in roots:
                opfunc.__name__ = str(opname)
                opfunc.__doc__ = getattr(int, opname).__doc__
                setattr(cls, opname, opfunc)
        return cls


PY2 = sys.version_info[0] == 2
if not PY2:
    # Python 3.x and up
    text_type = str
    string_types = (str,)

    def as_text(v):
        if v is None:
            return None
        elif isinstance(v, bytes):
            return v.decode('utf-8')
        elif isinstance(v, str):
            return v
        else:
            raise ValueError('Unknown type %r' % type(v))

    def decode_redis_hash(h):
        return dict((as_text(k), h[k]) for k in h)
else:
    # Python 2.x
    def text_type(v):
        try:
            return unicode(v)  # noqa
        except Exception:
            return unicode(v, "utf-8", errors="ignore")  # noqa

    string_types = (str, unicode)  # noqa

    def as_text(v):
        if v is None:
            return None
        elif isinstance(v, str):
            return v.decode('utf-8')
        elif isinstance(v, unicode):  # noqa
            return v
        else:
            raise Exception("Input cannot be decoded into literal thing.")

    def decode_redis_hash(h):
        return h
`
fileContents['rq/compat/connections.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from functools import partial

from redis import Redis


def fix_return_type(func):
    # deliberately no functools.wraps() call here, since the function being
    # wrapped is a partial, which has no module
    def _inner(*args, **kwargs):
        value = func(*args, **kwargs)
        if value is None:
            value = -1
        return value
    return _inner
`
fileContents['rq/connections.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from contextlib import contextmanager

from redis import Redis

from .local import LocalStack, release_local


class NoRedisConnectionException(Exception):
    pass


@contextmanager
def Connection(connection=None):  # noqa
    if connection is None:
        connection = Redis()
    push_connection(connection)
    try:
        yield
    finally:
        popped = pop_connection()
        assert popped == connection, \\
            'Unexpected Redis connection was popped off the stack. ' \\
            'Check your Redis connection setup.'


def push_connection(redis):
    """Pushes the given connection on the stack."""
    _connection_stack.push(redis)


def pop_connection():
    """Pops the topmost connection from the stack."""
    return _connection_stack.pop()


def use_connection(redis=None):
    """Clears the stack and uses the given connection.  Protects against mixed
    use of use_connection() and stacked connection contexts.
    """
    assert len(_connection_stack) <= 1, \\
        'You should not mix Connection contexts with use_connection()'
    release_local(_connection_stack)

    if redis is None:
        redis = Redis()
    push_connection(redis)


def get_current_connection():
    """Returns the current Redis connection (i.e. the topmost on the
    connection stack).
    """
    return _connection_stack.top


def resolve_connection(connection=None):
    """Convenience function to resolve the given or the current connection.
    Raises an exception if it cannot resolve a connection now.
    """
    if connection is not None:
        return connection

    connection = get_current_connection()
    if connection is None:
        raise NoRedisConnectionException('Could not resolve a Redis connection')
    return connection


_connection_stack = LocalStack()

__all__ = ['Connection', 'get_current_connection', 'push_connection',
           'pop_connection', 'use_connection']
`
fileContents['rq/contrib/legacy.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)


import logging
from rq import get_current_connection
from rq import Worker


logger = logging.getLogger(__name__)


def cleanup_ghosts(conn=None):
    """
    RQ versions < 0.3.6 suffered from a race condition where workers, when
    abruptly terminated, did not have a chance to clean up their worker
    registration, leading to reports of ghosted workers in \`rqinfo\`.  Since
    0.3.6, new worker registrations automatically expire, and the worker will
    make sure to refresh the registrations as long as it's alive.

    This function will clean up any of such legacy ghosted workers.
    """
    conn = conn if conn else get_current_connection()
    for worker in Worker.all(connection=conn):
        if conn.ttl(worker.key) == -1:
            ttl = worker.default_worker_ttl
            conn.expire(worker.key, ttl)
            logger.info('Marked ghosted worker {0} to expire in {1} seconds.'.format(worker.name, ttl))
`
fileContents['rq/contrib/sentry.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)


def register_sentry(sentry_dsn):
    """Given a Raven client and an RQ worker, registers exception handlers
    with the worker so exceptions are logged to Sentry.
    """
    import sentry_sdk
    from sentry_sdk.integrations.rq import RqIntegration
    sentry_sdk.init(sentry_dsn, integrations=[RqIntegration()])
`
fileContents['rq/decorators.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from functools import wraps

from rq.compat import string_types

from .defaults import DEFAULT_RESULT_TTL
from .queue import Queue
from .utils import backend_class


class job(object):  # noqa
    queue_class = Queue

    def __init__(self, queue, connection=None, timeout=None,
                 result_ttl=DEFAULT_RESULT_TTL, ttl=None,
                 queue_class=None, depends_on=None, at_front=None, meta=None,
                 description=None):
        """A decorator that adds a \`\`delay\`\` method to the decorated function,
        which in turn creates a RQ job when called. Accepts a required
        \`\`queue\`\` argument that can be either a \`\`Queue\`\` instance or a string
        denoting the queue name.  For example:

            @job(queue='default')
            def simple_add(x, y):
                return x + y

            simple_add.delay(1, 2) # Puts simple_add function into queue
        """
        self.queue = queue
        self.queue_class = backend_class(self, 'queue_class', override=queue_class)
        self.connection = connection
        self.timeout = timeout
        self.result_ttl = result_ttl
        self.ttl = ttl
        self.meta = meta
        self.depends_on = depends_on
        self.at_front = at_front
        self.description = description

    def __call__(self, f):
        @wraps(f)
        def delay(*args, **kwargs):
            if isinstance(self.queue, string_types):
                queue = self.queue_class(name=self.queue,
                                         connection=self.connection)
            else:
                queue = self.queue

            depends_on = kwargs.pop('depends_on', None)
            at_front = kwargs.pop('at_front', False)

            if not depends_on:
                depends_on = self.depends_on

            if not at_front:
                at_front = self.at_front

            return queue.enqueue_call(f, args=args, kwargs=kwargs,
                                      timeout=self.timeout, result_ttl=self.result_ttl,
                                      ttl=self.ttl, depends_on=depends_on, at_front=at_front,
                                      meta=self.meta, description=self.description)
        f.delay = delay
        return f
`
fileContents['rq/defaults.py'] = `DEFAULT_JOB_CLASS = 'rq.job.Job'
DEFAULT_QUEUE_CLASS = 'rq.Queue'
DEFAULT_WORKER_CLASS = 'rq.Worker'
DEFAULT_CONNECTION_CLASS = 'redis.Redis'
DEFAULT_WORKER_TTL = 420
DEFAULT_JOB_MONITORING_INTERVAL = 30
DEFAULT_RESULT_TTL = 500
DEFAULT_FAILURE_TTL = 31536000  # 1 year in seconds
DEFAULT_LOGGING_DATE_FORMAT = '%H:%M:%S'
DEFAULT_LOGGING_FORMAT = '%(asctime)s %(message)s'
`
fileContents['rq/dummy.py'] = `# -*- coding: utf-8 -*-
"""
Some dummy tasks that are well-suited for generating load for testing purposes.
"""
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import random
import time


def do_nothing():
    pass


def sleep(secs):
    time.sleep(secs)


def endless_loop():
    while True:
        time.sleep(1)


def div_by_zero():
    1 / 0


def fib(n):
    if n <= 1:
        return 1
    else:
        return fib(n - 2) + fib(n - 1)


def random_failure():
    if random.choice([True, False]):
        class RandomError(Exception):
            pass
        raise RandomError('Ouch!')
    return 'OK'
`
fileContents['rq/exceptions.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)


class NoSuchJobError(Exception):
    pass


class InvalidJobDependency(Exception):
    pass


class InvalidJobOperationError(Exception):
    pass


class InvalidJobOperation(Exception):
    pass


class UnpickleError(Exception):
    def __init__(self, message, raw_data, inner_exception=None):
        super(UnpickleError, self).__init__(message, inner_exception)
        self.raw_data = raw_data


class DequeueTimeout(Exception):
    pass


class ShutDownImminentException(Exception):
    def __init__(self, msg, extra_info):
        self.extra_info = extra_info
        super(ShutDownImminentException, self).__init__(msg)


class TimeoutFormatError(Exception):
    pass
`
fileContents['rq/local.py'] = `# -*- coding: utf-8 -*-
# flake8: noqa
"""
    werkzeug.local
    ~~~~~~~~~~~~~~

    This module implements context-local objects.

    :copyright: (c) 2011 by the Werkzeug Team, see AUTHORS for more details.
    :license: BSD, see LICENSE for more details.
"""
# Since each thread has its own greenlet we can just use those as identifiers
# for the context.  If greenlets are not available we fall back to the
# current thread ident.
try:
    from greenlet import getcurrent as get_ident
except ImportError:  # noqa
    try:
        from thread import get_ident  # noqa
    except ImportError:  # noqa
        try:
            from _thread import get_ident  # noqa
        except ImportError:  # noqa
            from dummy_thread import get_ident  # noqa


def release_local(local):
    """Releases the contents of the local for the current context.
    This makes it possible to use locals without a manager.

    Example::

        >>> loc = Local()
        >>> loc.foo = 42
        >>> release_local(loc)
        >>> hasattr(loc, 'foo')
        False

    With this function one can release :class:\`Local\` objects as well
    as :class:\`StackLocal\` objects.  However it is not possible to
    release data held by proxies that way, one always has to retain
    a reference to the underlying local object in order to be able
    to release it.

    .. versionadded:: 0.6.1
    """
    local.__release_local__()


class Local(object):
    __slots__ = ('__storage__', '__ident_func__')

    def __init__(self):
        object.__setattr__(self, '__storage__', {})
        object.__setattr__(self, '__ident_func__', get_ident)

    def __iter__(self):
        return iter(self.__storage__.items())

    def __call__(self, proxy):
        """Create a proxy for a name."""
        return LocalProxy(self, proxy)

    def __release_local__(self):
        self.__storage__.pop(self.__ident_func__(), None)

    def __getattr__(self, name):
        try:
            return self.__storage__[self.__ident_func__()][name]
        except KeyError:
            raise AttributeError(name)

    def __setattr__(self, name, value):
        ident = self.__ident_func__()
        storage = self.__storage__
        try:
            storage[ident][name] = value
        except KeyError:
            storage[ident] = {name: value}

    def __delattr__(self, name):
        try:
            del self.__storage__[self.__ident_func__()][name]
        except KeyError:
            raise AttributeError(name)


class LocalStack(object):
    """This class works similar to a :class:\`Local\` but keeps a stack
    of objects instead.  This is best explained with an example::

        >>> ls = LocalStack()
        >>> ls.push(42)
        >>> ls.top
        42
        >>> ls.push(23)
        >>> ls.top
        23
        >>> ls.pop()
        23
        >>> ls.top
        42

    They can be force released by using a :class:\`LocalManager\` or with
    the :func:\`release_local\` function but the correct way is to pop the
    item from the stack after using.  When the stack is empty it will
    no longer be bound to the current context (and as such released).

    By calling the stack without arguments it returns a proxy that resolves to
    the topmost item on the stack.

    .. versionadded:: 0.6.1
    """

    def __init__(self):
        self._local = Local()

    def __release_local__(self):
        self._local.__release_local__()

    def _get__ident_func__(self):
        return self._local.__ident_func__

    def _set__ident_func__(self, value):  # noqa
        object.__setattr__(self._local, '__ident_func__', value)
    __ident_func__ = property(_get__ident_func__, _set__ident_func__)
    del _get__ident_func__, _set__ident_func__

    def __call__(self):
        def _lookup():
            rv = self.top
            if rv is None:
                raise RuntimeError('object unbound')
            return rv
        return LocalProxy(_lookup)

    def push(self, obj):
        """Pushes a new item to the stack"""
        rv = getattr(self._local, 'stack', None)
        if rv is None:
            self._local.stack = rv = []
        rv.append(obj)
        return rv

    def pop(self):
        """Removes the topmost item from the stack, will return the
        old value or \`None\` if the stack was already empty.
        """
        stack = getattr(self._local, 'stack', None)
        if stack is None:
            return None
        elif len(stack) == 1:
            release_local(self._local)
            return stack[-1]
        else:
            return stack.pop()

    @property
    def top(self):
        """The topmost item on the stack.  If the stack is empty,
        \`None\` is returned.
        """
        try:
            return self._local.stack[-1]
        except (AttributeError, IndexError):
            return None

    def __len__(self):
        stack = getattr(self._local, 'stack', None)
        if stack is None:
            return 0
        return len(stack)


class LocalManager(object):
    """Local objects cannot manage themselves. For that you need a local
    manager.  You can pass a local manager multiple locals or add them later
    by appending them to \`manager.locals\`.  Everytime the manager cleans up
    it, will clean up all the data left in the locals for this context.

    The \`ident_func\` parameter can be added to override the default ident
    function for the wrapped locals.

    .. versionchanged:: 0.6.1
       Instead of a manager the :func:\`release_local\` function can be used
       as well.

    .. versionchanged:: 0.7
       \`ident_func\` was added.
    """

    def __init__(self, locals=None, ident_func=None):
        if locals is None:
            self.locals = []
        elif isinstance(locals, Local):
            self.locals = [locals]
        else:
            self.locals = list(locals)
        if ident_func is not None:
            self.ident_func = ident_func
            for local in self.locals:
                object.__setattr__(local, '__ident_func__', ident_func)
        else:
            self.ident_func = get_ident

    def get_ident(self):
        """Return the context identifier the local objects use internally for
        this context.  You cannot override this method to change the behavior
        but use it to link other context local objects (such as SQLAlchemy's
        scoped sessions) to the Werkzeug locals.

        .. versionchanged:: 0.7
           You can pass a different ident function to the local manager that
           will then be propagated to all the locals passed to the
           constructor.
        """
        return self.ident_func()

    def cleanup(self):
        """Manually clean up the data in the locals for this context.  Call
        this at the end of the request or use \`make_middleware()\`.
        """
        for local in self.locals:
            release_local(local)

    def __repr__(self):
        return '<%s storages: %d>' % (
            self.__class__.__name__,
            len(self.locals)
        )


class LocalProxy(object):
    """Acts as a proxy for a werkzeug local.  Forwards all operations to
    a proxied object.  The only operations not supported for forwarding
    are right handed operands and any kind of assignment.

    Example usage::

        from werkzeug.local import Local
        l = Local()

        # these are proxies
        request = l('request')
        user = l('user')


        from werkzeug.local import LocalStack
        _response_local = LocalStack()

        # this is a proxy
        response = _response_local()

    Whenever something is bound to l.user / l.request the proxy objects
    will forward all operations.  If no object is bound a :exc:\`RuntimeError\`
    will be raised.

    To create proxies to :class:\`Local\` or :class:\`LocalStack\` objects,
    call the object as shown above.  If you want to have a proxy to an
    object looked up by a function, you can (as of Werkzeug 0.6.1) pass
    a function to the :class:\`LocalProxy\` constructor::

        session = LocalProxy(lambda: get_current_request().session)

    .. versionchanged:: 0.6.1
       The class can be instanciated with a callable as well now.
    """
    __slots__ = ('__local', '__dict__', '__name__')

    def __init__(self, local, name=None):
        object.__setattr__(self, '_LocalProxy__local', local)
        object.__setattr__(self, '__name__', name)

    def _get_current_object(self):
        """Return the current object.  This is useful if you want the real
        object behind the proxy at a time for performance reasons or because
        you want to pass the object into a different context.
        """
        if not hasattr(self.__local, '__release_local__'):
            return self.__local()
        try:
            return getattr(self.__local, self.__name__)
        except AttributeError:
            raise RuntimeError('no object bound to %s' % self.__name__)

    @property
    def __dict__(self):
        try:
            return self._get_current_object().__dict__
        except RuntimeError:
            raise AttributeError('__dict__')

    def __repr__(self):
        try:
            obj = self._get_current_object()
        except RuntimeError:
            return '<%s unbound>' % self.__class__.__name__
        return repr(obj)

    def __nonzero__(self):
        try:
            return bool(self._get_current_object())
        except RuntimeError:
            return False

    def __unicode__(self):
        try:
            return unicode(self._get_current_object())
        except RuntimeError:
            return repr(self)

    def __dir__(self):
        try:
            return dir(self._get_current_object())
        except RuntimeError:
            return []

    def __getattr__(self, name):
        if name == '__members__':
            return dir(self._get_current_object())
        return getattr(self._get_current_object(), name)

    def __setitem__(self, key, value):
        self._get_current_object()[key] = value

    def __delitem__(self, key):
        del self._get_current_object()[key]

    def __setslice__(self, i, j, seq):
        self._get_current_object()[i:j] = seq

    def __delslice__(self, i, j):
        del self._get_current_object()[i:j]

    __setattr__ = lambda x, n, v: setattr(x._get_current_object(), n, v)
    __delattr__ = lambda x, n: delattr(x._get_current_object(), n)
    __str__ = lambda x: str(x._get_current_object())
    __lt__ = lambda x, o: x._get_current_object() < o
    __le__ = lambda x, o: x._get_current_object() <= o
    __eq__ = lambda x, o: x._get_current_object() == o
    __ne__ = lambda x, o: x._get_current_object() != o
    __gt__ = lambda x, o: x._get_current_object() > o
    __ge__ = lambda x, o: x._get_current_object() >= o
    __cmp__ = lambda x, o: cmp(x._get_current_object(), o)
    __hash__ = lambda x: hash(x._get_current_object())
    __call__ = lambda x, *a, **kw: x._get_current_object()(*a, **kw)
    __len__ = lambda x: len(x._get_current_object())
    __getitem__ = lambda x, i: x._get_current_object()[i]
    __iter__ = lambda x: iter(x._get_current_object())
    __contains__ = lambda x, i: i in x._get_current_object()
    __getslice__ = lambda x, i, j: x._get_current_object()[i:j]
    __add__ = lambda x, o: x._get_current_object() + o
    __sub__ = lambda x, o: x._get_current_object() - o
    __mul__ = lambda x, o: x._get_current_object() * o
    __floordiv__ = lambda x, o: x._get_current_object() // o
    __mod__ = lambda x, o: x._get_current_object() % o
    __divmod__ = lambda x, o: x._get_current_object().__divmod__(o)
    __pow__ = lambda x, o: x._get_current_object() ** o
    __lshift__ = lambda x, o: x._get_current_object() << o
    __rshift__ = lambda x, o: x._get_current_object() >> o
    __and__ = lambda x, o: x._get_current_object() & o
    __xor__ = lambda x, o: x._get_current_object() ^ o
    __or__ = lambda x, o: x._get_current_object() | o
    __div__ = lambda x, o: x._get_current_object().__div__(o)
    __truediv__ = lambda x, o: x._get_current_object().__truediv__(o)
    __neg__ = lambda x: -(x._get_current_object())
    __pos__ = lambda x: +(x._get_current_object())
    __abs__ = lambda x: abs(x._get_current_object())
    __invert__ = lambda x: ~(x._get_current_object())
    __complex__ = lambda x: complex(x._get_current_object())
    __int__ = lambda x: int(x._get_current_object())
    __long__ = lambda x: long(x._get_current_object())
    __float__ = lambda x: float(x._get_current_object())
    __oct__ = lambda x: oct(x._get_current_object())
    __hex__ = lambda x: hex(x._get_current_object())
    __index__ = lambda x: x._get_current_object().__index__()
    __coerce__ = lambda x, o: x._get_current_object().__coerce__(x, o)
    __enter__ = lambda x: x._get_current_object().__enter__()
    __exit__ = lambda x, *a, **kw: x._get_current_object().__exit__(*a, **kw)
`
fileContents['rq/logutils.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import logging

from rq.utils import ColorizingStreamHandler
from rq.defaults import (DEFAULT_LOGGING_FORMAT,
                         DEFAULT_LOGGING_DATE_FORMAT)


def setup_loghandlers(level=None, date_format=DEFAULT_LOGGING_DATE_FORMAT,
                      log_format=DEFAULT_LOGGING_FORMAT):
    logger = logging.getLogger('rq.worker')

    if not _has_effective_handler(logger):
        formatter = logging.Formatter(fmt=log_format, datefmt=date_format)
        handler = ColorizingStreamHandler()
        handler.setFormatter(formatter)
        logger.addHandler(handler)

    if level is not None:
        logger.setLevel(level)


def _has_effective_handler(logger):
    """
    Checks if a logger has a handler that will catch its messages in its logger hierarchy.
    :param \`logging.Logger\` logger: The logger to be checked.
    :return: True if a handler is found for the logger, False otherwise.
    :rtype: bool
    """
    while True:
        if logger.handlers:
            return True
        if not logger.parent:
            return False
        logger = logger.parent
`
fileContents['rq/suspension.py'] = `WORKERS_SUSPENDED = 'rq:suspended'


def is_suspended(connection, worker=None):
    with connection.pipeline() as pipeline:
        if worker is not None:
            worker.heartbeat(pipeline=pipeline)
        pipeline.exists(WORKERS_SUSPENDED)
        # pipeline returns a list of responses
        # https://github.com/andymccurdy/redis-py#pipelines
        return pipeline.execute()[-1]


def suspend(connection, ttl=None):
    """ttl = time to live in seconds.  Default is no expiration
       Note:  If you pass in 0 it will invalidate right away
    """
    connection.set(WORKERS_SUSPENDED, 1)
    if ttl is not None:
        connection.expire(WORKERS_SUSPENDED, ttl)


def resume(connection):
    return connection.delete(WORKERS_SUSPENDED)
`
fileContents['rq/timeouts.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import signal


class BaseTimeoutException(Exception):
    """Base exception for timeouts."""
    pass


class JobTimeoutException(BaseTimeoutException):
    """Raised when a job takes longer to complete than the allowed maximum
    timeout value.
    """
    pass


class HorseMonitorTimeoutException(BaseTimeoutException):
    """Raised when waiting for a horse exiting takes longer than the maximum
    timeout value.
    """
    pass


class BaseDeathPenalty(object):
    """Base class to setup job timeouts."""

    def __init__(self, timeout, exception=JobTimeoutException, **kwargs):
        self._timeout = timeout
        self._exception = exception

    def __enter__(self):
        self.setup_death_penalty()

    def __exit__(self, type, value, traceback):
        # Always cancel immediately, since we're done
        try:
            self.cancel_death_penalty()
        except BaseTimeoutException:
            # Weird case: we're done with the with body, but now the alarm is
            # fired.  We may safely ignore this situation and consider the
            # body done.
            pass

        # __exit__ may return True to supress further exception handling.  We
        # don't want to suppress any exceptions here, since all errors should
        # just pass through, BaseTimeoutException being handled normally to the
        # invoking context.
        return False

    def setup_death_penalty(self):
        raise NotImplementedError()

    def cancel_death_penalty(self):
        raise NotImplementedError()


class UnixSignalDeathPenalty(BaseDeathPenalty):

    def handle_death_penalty(self, signum, frame):
        raise self._exception('Task exceeded maximum timeout value '
                              '({0} seconds)'.format(self._timeout))

    def setup_death_penalty(self):
        """Sets up an alarm signal and a signal handler that raises
        an exception after the timeout amount (expressed in seconds).
        """
        signal.signal(signal.SIGALRM, self.handle_death_penalty)
        signal.alarm(self._timeout)

    def cancel_death_penalty(self):
        """Removes the death penalty alarm and puts back the system into
        default signal handling.
        """
        signal.alarm(0)
        signal.signal(signal.SIGALRM, signal.SIG_DFL)
`
fileContents['rq/utils.py'] = `# -*- coding: utf-8 -*-
"""
Miscellaneous helper functions.

The formatter for ANSI colored console output is heavily based on Pygments
terminal colorizing code, originally by Georg Brandl.
"""
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import calendar
import datetime
import importlib
import logging
import numbers
import sys
try:
    from collections.abc import Iterable
except ImportError:
    from collections import Iterable

from .compat import as_text, is_python_version, string_types
from .exceptions import TimeoutFormatError


class _Colorizer(object):
    def __init__(self):
        esc = "\\x1b["

        self.codes = {}
        self.codes[""] = ""
        self.codes["reset"] = esc + "39;49;00m"

        self.codes["bold"] = esc + "01m"
        self.codes["faint"] = esc + "02m"
        self.codes["standout"] = esc + "03m"
        self.codes["underline"] = esc + "04m"
        self.codes["blink"] = esc + "05m"
        self.codes["overline"] = esc + "06m"

        dark_colors = ["black", "darkred", "darkgreen", "brown", "darkblue",
                       "purple", "teal", "lightgray"]
        light_colors = ["darkgray", "red", "green", "yellow", "blue",
                        "fuchsia", "turquoise", "white"]

        x = 30
        for d, l in zip(dark_colors, light_colors):
            self.codes[d] = esc + "%im" % x
            self.codes[l] = esc + "%i;01m" % x
            x += 1

        del d, l, x

        self.codes["darkteal"] = self.codes["turquoise"]
        self.codes["darkyellow"] = self.codes["brown"]
        self.codes["fuscia"] = self.codes["fuchsia"]
        self.codes["white"] = self.codes["bold"]

        if hasattr(sys.stdout, "isatty"):
            self.notty = not sys.stdout.isatty()
        else:
            self.notty = True

    def reset_color(self):
        return self.codes["reset"]

    def colorize(self, color_key, text):
        if self.notty:
            return text
        else:
            return self.codes[color_key] + text + self.codes["reset"]

    def ansiformat(self, attr, text):
        """
        Format \`\`text\`\` with a color and/or some attributes::

            color       normal color
            *color*     bold color
            _color_     underlined color
            +color+     blinking color
        """
        result = []
        if attr[:1] == attr[-1:] == '+':
            result.append(self.codes['blink'])
            attr = attr[1:-1]
        if attr[:1] == attr[-1:] == '*':
            result.append(self.codes['bold'])
            attr = attr[1:-1]
        if attr[:1] == attr[-1:] == '_':
            result.append(self.codes['underline'])
            attr = attr[1:-1]
        result.append(self.codes[attr])
        result.append(text)
        result.append(self.codes['reset'])
        return ''.join(result)


colorizer = _Colorizer()


def make_colorizer(color):
    """Creates a function that colorizes text with the given color.

    For example:

        green = make_colorizer('darkgreen')
        red = make_colorizer('red')

    Then, you can use:

        print "It's either " + green('OK') + ' or ' + red('Oops')
    """
    def inner(text):
        return colorizer.colorize(color, text)
    return inner


class ColorizingStreamHandler(logging.StreamHandler):

    levels = {
        logging.WARNING: make_colorizer('darkyellow'),
        logging.ERROR: make_colorizer('darkred'),
        logging.CRITICAL: make_colorizer('darkred'),
    }

    def __init__(self, exclude=None, *args, **kwargs):
        self.exclude = exclude
        if is_python_version((2, 6)):
            logging.StreamHandler.__init__(self, *args, **kwargs)
        else:
            super(ColorizingStreamHandler, self).__init__(*args, **kwargs)

    @property
    def is_tty(self):
        isatty = getattr(self.stream, 'isatty', None)
        return isatty and isatty()

    def format(self, record):
        message = logging.StreamHandler.format(self, record)
        if self.is_tty:
            colorize = self.levels.get(record.levelno, lambda x: x)

            # Don't colorize any traceback
            parts = message.split('\\n', 1)
            parts[0] = " ".join([parts[0].split(" ", 1)[0], colorize(parts[0].split(" ", 1)[1])])

            message = '\\n'.join(parts)

        return message


def import_attribute(name):
    """Return an attribute from a dotted path name (e.g. "path.to.func")."""
    module_name, attribute = name.rsplit('.', 1)
    module = importlib.import_module(module_name)
    return getattr(module, attribute)


def utcnow():
    return datetime.datetime.utcnow()


_TIMESTAMP_FORMAT = '%Y-%m-%dT%H:%M:%S.%fZ'


def utcformat(dt):
    return dt.strftime(as_text(_TIMESTAMP_FORMAT))


def utcparse(string):
    try:
        return datetime.datetime.strptime(string, _TIMESTAMP_FORMAT)
    except ValueError:
        # This catches any jobs remain with old datetime format
        return datetime.datetime.strptime(string, '%Y-%m-%dT%H:%M:%SZ')


def first(iterable, default=None, key=None):
    """
    Return first element of \`iterable\` that evaluates true, else return None
    (or an optional default value).

    >>> first([0, False, None, [], (), 42])
    42

    >>> first([0, False, None, [], ()]) is None
    True

    >>> first([0, False, None, [], ()], default='ohai')
    'ohai'

    >>> import re
    >>> m = first(re.match(regex, 'abc') for regex in ['b.*', 'a(.*)'])
    >>> m.group(1)
    'bc'

    The optional \`key\` argument specifies a one-argument predicate function
    like that used for \`filter()\`.  The \`key\` argument, if supplied, must be
    in keyword form.  For example:

    >>> first([1, 1, 3, 4, 5], key=lambda x: x % 2 == 0)
    4

    """
    if key is None:
        for el in iterable:
            if el:
                return el
    else:
        for el in iterable:
            if key(el):
                return el

    return default


def is_nonstring_iterable(obj):
    """Returns whether the obj is an iterable, but not a string"""
    return isinstance(obj, Iterable) and not isinstance(obj, string_types)


def ensure_list(obj):
    """
    When passed an iterable of objects, does nothing, otherwise, it returns
    a list with just that object in it.
    """
    return obj if is_nonstring_iterable(obj) else [obj]


def current_timestamp():
    """Returns current UTC timestamp"""
    return calendar.timegm(datetime.datetime.utcnow().utctimetuple())


def enum(name, *sequential, **named):
    values = dict(zip(sequential, range(len(sequential))), **named)

    # NOTE: Yes, we *really* want to cast using str() here.
    # On Python 2 type() requires a byte string (which is str() on Python 2).
    # On Python 3 it does not matter, so we'll use str(), which acts as
    # a no-op.
    return type(str(name), (), values)


def backend_class(holder, default_name, override=None):
    """Get a backend class using its default attribute name or an override"""
    if override is None:
        return getattr(holder, default_name)
    elif isinstance(override, string_types):
        return import_attribute(override)
    else:
        return override


def parse_timeout(timeout):
    """Transfer all kinds of timeout format to an integer representing seconds"""
    if not isinstance(timeout, numbers.Integral) and timeout is not None:
        try:
            timeout = int(timeout)
        except ValueError:
            digit, unit = timeout[:-1], (timeout[-1:]).lower()
            unit_second = {'d': 86400, 'h': 3600, 'm': 60, 's': 1}
            try:
                timeout = int(digit) * unit_second[unit]
            except (ValueError, KeyError):
                raise TimeoutFormatError('Timeout must be an integer or a string representing an integer, or '
                                         'a string with format: digits + unit, unit can be "d", "h", "m", "s", '
                                         'such as "1h", "23m".')

    return timeout
`
fileContents['rq/version.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

VERSION = '1.0'
`
fileContents['rq/worker_registration.py'] = `from .compat import as_text


WORKERS_BY_QUEUE_KEY = 'rq:workers:%s'
REDIS_WORKER_KEYS = 'rq:workers'


def register(worker, pipeline=None):
    """Store worker key in Redis so we can easily discover active workers."""
    connection = pipeline if pipeline is not None else worker.connection
    connection.sadd(worker.redis_workers_keys, worker.key)
    for name in worker.queue_names():
        redis_key = WORKERS_BY_QUEUE_KEY % name
        connection.sadd(redis_key, worker.key)


def unregister(worker, pipeline=None):
    """Remove worker key from Redis."""
    if pipeline is None:
        connection = worker.connection.pipeline()
    else:
        connection = pipeline

    connection.srem(worker.redis_workers_keys, worker.key)
    for name in worker.queue_names():
        redis_key = WORKERS_BY_QUEUE_KEY % name
        connection.srem(redis_key, worker.key)

    if pipeline is None:
        connection.execute()


def get_keys(queue=None, connection=None):
    """Returnes a list of worker keys for a queue"""
    if queue is None and connection is None:
        raise ValueError('"queue" or "connection" argument is required')

    if queue:
        redis = queue.connection
        redis_key = WORKERS_BY_QUEUE_KEY % queue.name
    else:
        redis = connection
        redis_key = REDIS_WORKER_KEYS

    return {as_text(key) for key in redis.smembers(redis_key)}


def clean_worker_registry(queue):
    """Delete invalid worker keys in registry"""
    keys = list(get_keys(queue))

    with queue.connection.pipeline() as pipeline:

        for key in keys:
            pipeline.exists(key)
        results = pipeline.execute()

        invalid_keys = []

        for i, key_exists in enumerate(results):
            if not key_exists:
                invalid_keys.append(keys[i])

        if invalid_keys:
            pipeline.srem(WORKERS_BY_QUEUE_KEY % queue.name, *invalid_keys)
            pipeline.srem(REDIS_WORKER_KEYS, *invalid_keys)
            pipeline.execute()
`
fileContents['README.md'] = `A simple Python library for queueing jobs and processing them in the
background with workers. It is backed by Redis and designed to have a
low barrier to entry.

Requires Redis >= 3.0.0.


## Getting started

First, run a Redis server:

\`\`\`console
$ redis-server
\`\`\`

Define your function:

\`\`\`python
import requests

def count_words_at_url(url):
    """Just an example function that's called async."""
    resp = requests.get(url)
    return len(resp.text.split())
\`\`\`

Create a queue:

\`\`\`python
from redis import Redis
from rq import Queue

q = Queue(connection=Redis())
\`\`\`

Enqueue the function call:

\`\`\`python
from my_module import count_words_at_url
job = q.enqueue(count_words_at_url, 'http://example.com')
\`\`\`


### The worker

Start a worker from your project's directory:

\`\`\`console
$ rq worker
*** Listening for work on default
Got count_words_at_url('http://example.com') from default
Job result = 818
*** Listening for work on default
\`\`\`
`
fileContents['requirements.txt'] = `redis>=3.0
click>=3.0.0
`
fileContents['setup.py'] = `"""
rq is a simple, lightweight, library for creating background jobs, and
processing them.
"""
import os
from setuptools import setup, find_packages


def get_version():
    basedir = os.path.dirname(__file__)
    try:
        with open(os.path.join(basedir, 'rq/version.py')) as f:
            locals = {}
            exec(f.read(), locals)
            return locals['VERSION']
    except FileNotFoundError:
        raise RuntimeError('No version info found.')


setup(
    name='rq',
    version=get_version(),
    license='BSD',
    description='RQ is a simple, lightweight, library for creating background '
                'jobs, and processing them.',
    long_description=__doc__,
    packages=find_packages(exclude=['tests']),
    include_package_data=True,
    zip_safe=False,
    platforms='any',
    install_requires=[
        'redis >= 3.0.0',
        'click >= 5.0'
    ],
    python_requires='>=2.7',
    entry_points={
        'console_scripts': [
            'rq = rq.cli:main',

            # NOTE: rqworker/rqinfo are kept for backward-compatibility,
            # remove eventually (TODO)
            'rqinfo = rq.cli:info',
            'rqworker = rq.cli:worker',
        ],
    },
    classifiers=[
        # As from http://pypi.python.org/pypi?%3Aaction=list_classifiers
        # 'Development Status :: 1 - Planning',
        # 'Development Status :: 2 - Pre-Alpha',
        # 'Development Status :: 3 - Alpha',
        # 'Development Status :: 4 - Beta',
        'Development Status :: 5 - Production/Stable',
        # 'Development Status :: 6 - Mature',
        # 'Development Status :: 7 - Inactive',
        'Intended Audience :: Developers',
        'Intended Audience :: End Users/Desktop',
        'Intended Audience :: Information Technology',
        'Intended Audience :: Science/Research',
        'Intended Audience :: System Administrators',
        'License :: OSI Approved :: BSD License',
        'Operating System :: POSIX',
        'Operating System :: MacOS',
        'Operating System :: Unix',
        'Programming Language :: Python',
        'Programming Language :: Python :: 2',
        'Programming Language :: Python :: 2.7',
        'Programming Language :: Python :: 3',
        'Programming Language :: Python :: 3.4',
        'Programming Language :: Python :: 3.5',
        'Programming Language :: Python :: 3.6',
        'Programming Language :: Python :: 3.7',
        'Topic :: Software Development :: Libraries :: Python Modules',
        'Topic :: Internet',
        'Topic :: Scientific/Engineering',
        'Topic :: System :: Distributed Computing',
        'Topic :: System :: Systems Administration',
        'Topic :: System :: Monitoring',

    ]
)
`

export default fileContents
