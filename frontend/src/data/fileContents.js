// Auto-generated from backend/rq-v1.0 source files
// Do not edit manually — run generate_file_contents.py to regenerate

const fileContents = {}

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

fileContents['rq/cli/__init__.py'] = `# flake8: noqa
from .cli import main

# TODO: the following imports can be removed when we drop the \`rqinfo\` and
# \`rqworkers\` commands in favor of just shipping the \`rq\` command.
from .cli import info, worker
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

fileContents['rq/compat/dictconfig.py'] = `# flake8: noqa
# This is a copy of the Python logging.config.dictconfig module.  It is
# provided here for backwards compatibility for Python versions prior to 2.7.
#
# Copyright 2009-2010 by Vinay Sajip. All Rights Reserved.
#
# Permission to use, copy, modify, and distribute this software and its
# documentation for any purpose and without fee is hereby granted,
# provided that the above copyright notice appear in all copies and that
# both that copyright notice and this permission notice appear in
# supporting documentation, and that the name of Vinay Sajip
# not be used in advertising or publicity pertaining to distribution
# of the software without specific, written prior permission.
# VINAY SAJIP DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE, INCLUDING
# ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL
# VINAY SAJIP BE LIABLE FOR ANY SPECIAL, INDIRECT OR CONSEQUENTIAL DAMAGES OR
# ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER
# IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT
# OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

import logging.handlers
import re
import sys
import types
from rq.compat import string_types

IDENTIFIER = re.compile('^[a-z_][a-z0-9_]*$', re.I)

def valid_ident(s):
    m = IDENTIFIER.match(s)
    if not m:
        raise ValueError('Not a valid Python identifier: %r' % s)
    return True

#
# This function is defined in logging only in recent versions of Python
#
try:
    from logging import _checkLevel
except ImportError:
    def _checkLevel(level):
        if isinstance(level, int):
            rv = level
        elif str(level) == level:
            if level not in logging._levelNames:
                raise ValueError('Unknown level: %r' % level)
            rv = logging._levelNames[level]
        else:
            raise TypeError('Level not an integer or a '
                            'valid string: %r' % level)
        return rv

# The ConvertingXXX classes are wrappers around standard Python containers,
# and they serve to convert any suitable values in the container. The
# conversion converts base dicts, lists and tuples to their wrapped
# equivalents, whereas strings which match a conversion format are converted
# appropriately.
#
# Each wrapper should have a configurator attribute holding the actual
# configurator to use for conversion.

class ConvertingDict(dict):
    """A converting dictionary wrapper."""

    def __getitem__(self, key):
        value = dict.__getitem__(self, key)
        result = self.configurator.convert(value)
        #If the converted value is different, save for next time
        if value is not result:
            self[key] = result
            if type(result) in (ConvertingDict, ConvertingList,
                                ConvertingTuple):
                result.parent = self
                result.key = key
        return result

    def get(self, key, default=None):
        value = dict.get(self, key, default)
        result = self.configurator.convert(value)
        #If the converted value is different, save for next time
        if value is not result:
            self[key] = result
            if type(result) in (ConvertingDict, ConvertingList,
                                ConvertingTuple):
                result.parent = self
                result.key = key
        return result

    def pop(self, key, default=None):
        value = dict.pop(self, key, default)
        result = self.configurator.convert(value)
        if value is not result:
            if type(result) in (ConvertingDict, ConvertingList,
                                ConvertingTuple):
                result.parent = self
                result.key = key
        return result

class ConvertingList(list):
    """A converting list wrapper."""
    def __getitem__(self, key):
        value = list.__getitem__(self, key)
        result = self.configurator.convert(value)
        #If the converted value is different, save for next time
        if value is not result:
            self[key] = result
            if type(result) in (ConvertingDict, ConvertingList,
                                ConvertingTuple):
                result.parent = self
                result.key = key
        return result

    def pop(self, idx=-1):
        value = list.pop(self, idx)
        result = self.configurator.convert(value)
        if value is not result:
            if type(result) in (ConvertingDict, ConvertingList,
                                ConvertingTuple):
                result.parent = self
        return result

class ConvertingTuple(tuple):
    """A converting tuple wrapper."""
    def __getitem__(self, key):
        value = tuple.__getitem__(self, key)
        result = self.configurator.convert(value)
        if value is not result:
            if type(result) in (ConvertingDict, ConvertingList,
                                ConvertingTuple):
                result.parent = self
                result.key = key
        return result

class BaseConfigurator(object):
    """
    The configurator base class which defines some useful defaults.
    """

    CONVERT_PATTERN = re.compile(r'^(?P<prefix>[a-z]+)://(?P<suffix>.*)$')

    WORD_PATTERN = re.compile(r'^\\s*(\\w+)\\s*')
    DOT_PATTERN = re.compile(r'^\\.\\s*(\\w+)\\s*')
    INDEX_PATTERN = re.compile(r'^\\[\\s*(\\w+)\\s*\\]\\s*')
    DIGIT_PATTERN = re.compile(r'^\\d+$')

    value_converters = {
        'ext' : 'ext_convert',
        'cfg' : 'cfg_convert',
    }

    # We might want to use a different one, e.g. importlib
    importer = __import__

    def __init__(self, config):
        self.config = ConvertingDict(config)
        self.config.configurator = self

    def resolve(self, s):
        """
        Resolve strings to objects using standard import and attribute
        syntax.
        """
        name = s.split('.')
        used = name.pop(0)
        try:
            found = self.importer(used)
            for frag in name:
                used += '.' + frag
                try:
                    found = getattr(found, frag)
                except AttributeError:
                    self.importer(used)
                    found = getattr(found, frag)
            return found
        except ImportError:
            e, tb = sys.exc_info()[1:]
            v = ValueError('Cannot resolve %r: %s' % (s, e))
            v.__cause__, v.__traceback__ = e, tb
            raise v

    def ext_convert(self, value):
        """Default converter for the ext:// protocol."""
        return self.resolve(value)

    def cfg_convert(self, value):
        """Default converter for the cfg:// protocol."""
        rest = value
        m = self.WORD_PATTERN.match(rest)
        if m is None:
            raise ValueError("Unable to convert %r" % value)
        else:
            rest = rest[m.end():]
            d = self.config[m.groups()[0]]
            #print d, rest
            while rest:
                m = self.DOT_PATTERN.match(rest)
                if m:
                    d = d[m.groups()[0]]
                else:
                    m = self.INDEX_PATTERN.match(rest)
                    if m:
                        idx = m.groups()[0]
                        if not self.DIGIT_PATTERN.match(idx):
                            d = d[idx]
                        else:
                            try:
                                n = int(idx) # try as number first (most likely)
                                d = d[n]
                            except TypeError:
                                d = d[idx]
                if m:
                    rest = rest[m.end():]
                else:
                    raise ValueError('Unable to convert '
                                     '%r at %r' % (value, rest))
        #rest should be empty
        return d

    def convert(self, value):
        """
        Convert values to an appropriate type. dicts, lists and tuples are
        replaced by their converting alternatives. Strings are checked to
        see if they have a conversion format and are converted if they do.
        """
        if not isinstance(value, ConvertingDict) and isinstance(value, dict):
            value = ConvertingDict(value)
            value.configurator = self
        elif not isinstance(value, ConvertingList) and isinstance(value, list):
            value = ConvertingList(value)
            value.configurator = self
        elif not isinstance(value, ConvertingTuple) and\\
                 isinstance(value, tuple):
            value = ConvertingTuple(value)
            value.configurator = self
        elif isinstance(value, string_types): # str for py3k
            m = self.CONVERT_PATTERN.match(value)
            if m:
                d = m.groupdict()
                prefix = d['prefix']
                converter = self.value_converters.get(prefix, None)
                if converter:
                    suffix = d['suffix']
                    converter = getattr(self, converter)
                    value = converter(suffix)
        return value

    def configure_custom(self, config):
        """Configure an object with a user-supplied factory."""
        c = config.pop('()')
        if not hasattr(c, '__call__') and type(c) != type:
            c = self.resolve(c)
        props = config.pop('.', None)
        # Check for valid identifiers
        kwargs = dict([(k, config[k]) for k in config if valid_ident(k)])
        result = c(**kwargs)
        if props:
            for name, value in props.items():
                setattr(result, name, value)
        return result

    def as_tuple(self, value):
        """Utility function which converts lists to tuples."""
        if isinstance(value, list):
            value = tuple(value)
        return value

class DictConfigurator(BaseConfigurator):
    """
    Configure logging using a dictionary-like object to describe the
    configuration.
    """

    def configure(self):
        """Do the configuration."""

        config = self.config
        if 'version' not in config:
            raise ValueError("dictionary doesn't specify a version")
        if config['version'] != 1:
            raise ValueError("Unsupported version: %s" % config['version'])
        incremental = config.pop('incremental', False)
        EMPTY_DICT = {}
        logging._acquireLock()
        try:
            if incremental:
                handlers = config.get('handlers', EMPTY_DICT)
                # incremental handler config only if handler name
                # ties in to logging._handlers (Python 2.7)
                if sys.version_info[:2] == (2, 7):
                    for name in handlers:
                        if name not in logging._handlers:
                            raise ValueError('No handler found with '
                                             'name %r'  % name)
                        else:
                            try:
                                handler = logging._handlers[name]
                                handler_config = handlers[name]
                                level = handler_config.get('level', None)
                                if level:
                                    handler.setLevel(_checkLevel(level))
                            except Exception as e:
                                raise ValueError('Unable to configure handler '
                                                 '%r: %s' % (name, e))
                loggers = config.get('loggers', EMPTY_DICT)
                for name in loggers:
                    try:
                        self.configure_logger(name, loggers[name], True)
                    except Exception as e:
                        raise ValueError('Unable to configure logger '
                                         '%r: %s' % (name, e))
                root = config.get('root', None)
                if root:
                    try:
                        self.configure_root(root, True)
                    except Exception as e:
                        raise ValueError('Unable to configure root '
                                         'logger: %s' % e)
            else:
                disable_existing = config.pop('disable_existing_loggers', True)

                logging._handlers.clear()
                del logging._handlerList[:]

                # Do formatters first - they don't refer to anything else
                formatters = config.get('formatters', EMPTY_DICT)
                for name in formatters:
                    try:
                        formatters[name] = self.configure_formatter(
                                                            formatters[name])
                    except Exception as e:
                        raise ValueError('Unable to configure '
                                         'formatter %r: %s' % (name, e))
                # Next, do filters - they don't refer to anything else, either
                filters = config.get('filters', EMPTY_DICT)
                for name in filters:
                    try:
                        filters[name] = self.configure_filter(filters[name])
                    except Exception as e:
                        raise ValueError('Unable to configure '
                                         'filter %r: %s' % (name, e))

                # Next, do handlers - they refer to formatters and filters
                # As handlers can refer to other handlers, sort the keys
                # to allow a deterministic order of configuration
                handlers = config.get('handlers', EMPTY_DICT)
                for name in sorted(handlers):
                    try:
                        handler = self.configure_handler(handlers[name])
                        handler.name = name
                        handlers[name] = handler
                    except Exception as e:
                        raise ValueError('Unable to configure handler '
                                         '%r: %s' % (name, e))
                # Next, do loggers - they refer to handlers and filters

                #we don't want to lose the existing loggers,
                #since other threads may have pointers to them.
                #existing is set to contain all existing loggers,
                #and as we go through the new configuration we
                #remove any which are configured. At the end,
                #what's left in existing is the set of loggers
                #which were in the previous configuration but
                #which are not in the new configuration.
                root = logging.root
                existing = root.manager.loggerDict.keys()
                #The list needs to be sorted so that we can
                #avoid disabling child loggers of explicitly
                #named loggers. With a sorted list it is easier
                #to find the child loggers.
                existing.sort()
                #We'll keep the list of existing loggers
                #which are children of named loggers here...
                child_loggers = []
                #now set up the new ones...
                loggers = config.get('loggers', EMPTY_DICT)
                for name in loggers:
                    if name in existing:
                        i = existing.index(name)
                        prefixed = name + "."
                        pflen = len(prefixed)
                        num_existing = len(existing)
                        i = i + 1 # look at the entry after name
                        while (i < num_existing) and\\
                              (existing[i][:pflen] == prefixed):
                            child_loggers.append(existing[i])
                            i = i + 1
                        existing.remove(name)
                    try:
                        self.configure_logger(name, loggers[name])
                    except Exception as e:
                        raise ValueError('Unable to configure logger '
                                         '%r: %s' % (name, e))

                #Disable any old loggers. There's no point deleting
                #them as other threads may continue to hold references
                #and by disabling them, you stop them doing any logging.
                #However, don't disable children of named loggers, as that's
                #probably not what was intended by the user.
                for log in existing:
                    logger = root.manager.loggerDict[log]
                    if log in child_loggers:
                        logger.level = logging.NOTSET
                        logger.handlers = []
                        logger.propagate = True
                    elif disable_existing:
                        logger.disabled = True

                # And finally, do the root logger
                root = config.get('root', None)
                if root:
                    try:
                        self.configure_root(root)
                    except Exception as e:
                        raise ValueError('Unable to configure root '
                                         'logger: %s' % e)
        finally:
            logging._releaseLock()

    def configure_formatter(self, config):
        """Configure a formatter from a dictionary."""
        if '()' in config:
            factory = config['()'] # for use in exception handler
            try:
                result = self.configure_custom(config)
            except TypeError as te:
                if "'format'" not in str(te):
                    raise
                #Name of parameter changed from fmt to format.
                #Retry with old name.
                #This is so that code can be used with older Python versions
                #(e.g. by Django)
                config['fmt'] = config.pop('format')
                config['()'] = factory
                result = self.configure_custom(config)
        else:
            fmt = config.get('format', None)
            dfmt = config.get('datefmt', None)
            result = logging.Formatter(fmt, dfmt)
        return result

    def configure_filter(self, config):
        """Configure a filter from a dictionary."""
        if '()' in config:
            result = self.configure_custom(config)
        else:
            name = config.get('name', '')
            result = logging.Filter(name)
        return result

    def add_filters(self, filterer, filters):
        """Add filters to a filterer from a list of names."""
        for f in filters:
            try:
                filterer.addFilter(self.config['filters'][f])
            except Exception as e:
                raise ValueError('Unable to add filter %r: %s' % (f, e))

    def configure_handler(self, config):
        """Configure a handler from a dictionary."""
        formatter = config.pop('formatter', None)
        if formatter:
            try:
                formatter = self.config['formatters'][formatter]
            except Exception as e:
                raise ValueError('Unable to set formatter '
                                 '%r: %s' % (formatter, e))
        level = config.pop('level', None)
        filters = config.pop('filters', None)
        if '()' in config:
            c = config.pop('()')
            if not hasattr(c, '__call__') and type(c) != type:
                c = self.resolve(c)
            factory = c
        else:
            klass = self.resolve(config.pop('class'))
            #Special case for handler which refers to another handler
            if issubclass(klass, logging.handlers.MemoryHandler) and\\
                'target' in config:
                try:
                    config['target'] = self.config['handlers'][config['target']]
                except Exception as e:
                    raise ValueError('Unable to set target handler '
                                     '%r: %s' % (config['target'], e))
            elif issubclass(klass, logging.handlers.SMTPHandler) and\\
                'mailhost' in config:
                config['mailhost'] = self.as_tuple(config['mailhost'])
            elif issubclass(klass, logging.handlers.SysLogHandler) and\\
                'address' in config:
                config['address'] = self.as_tuple(config['address'])
            factory = klass
        kwargs = dict([(str(k), config[k]) for k in config if valid_ident(k)])
        try:
            result = factory(**kwargs)
        except TypeError as te:
            if "'stream'" not in str(te):
                raise
            #The argument name changed from strm to stream
            #Retry with old name.
            #This is so that code can be used with older Python versions
            #(e.g. by Django)
            kwargs['strm'] = kwargs.pop('stream')
            result = factory(**kwargs)
        if formatter:
            result.setFormatter(formatter)
        if level is not None:
            result.setLevel(_checkLevel(level))
        if filters:
            self.add_filters(result, filters)
        return result

    def add_handlers(self, logger, handlers):
        """Add handlers to a logger from a list of names."""
        for h in handlers:
            try:
                logger.addHandler(self.config['handlers'][h])
            except Exception as e:
                raise ValueError('Unable to add handler %r: %s' % (h, e))

    def common_logger_config(self, logger, config, incremental=False):
        """
        Perform configuration which is common to root and non-root loggers.
        """
        level = config.get('level', None)
        if level is not None:
            logger.setLevel(_checkLevel(level))
        if not incremental:
            #Remove any existing handlers
            for h in logger.handlers[:]:
                logger.removeHandler(h)
            handlers = config.get('handlers', None)
            if handlers:
                self.add_handlers(logger, handlers)
            filters = config.get('filters', None)
            if filters:
                self.add_filters(logger, filters)

    def configure_logger(self, name, config, incremental=False):
        """Configure a non-root logger from a dictionary."""
        logger = logging.getLogger(name)
        self.common_logger_config(logger, config, incremental)
        propagate = config.get('propagate', None)
        if propagate is not None:
            logger.propagate = propagate

    def configure_root(self, config, incremental=False):
        """Configure a root logger from a dictionary."""
        root = logging.getLogger()
        self.common_logger_config(root, config, incremental)

dictConfigClass = DictConfigurator

def dictConfig(config):
    """Configure logging using a dictionary."""
    dictConfigClass(config).configure()
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

fileContents['rq/contrib/__init__.py'] = ``

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
        """Returns an iterable of all Queues.
        """
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
        the internal Redis keys.  Can be used to reverse-lookup Queues by their
        Redis keys.
        """
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
            warnings.warn('The \`async\` keyword is deprecated. Use \`is_async\` instead', DeprecationWarning)

        # override class attribute job_class if one was passed
        if job_class is not None:
            if isinstance(job_class, string_types):
                job_class = import_attribute(job_class)
            self.job_class = job_class

    def __len__(self):
        return self.count

    def __nonzero__(self):
        return True

    def __bool__(self):
        return True

    def __iter__(self):
        yield self

    @property
    def key(self):
        """Returns the Redis key for this Queue."""
        return self._key

    @property
    def registry_cleaning_key(self):
        """Redis key used to indicate this queue has been cleaned."""
        return 'rq:clean_registries:%s' % self.name

    def acquire_cleaning_lock(self):
        """Returns a boolean indicating whether a lock to clean this queue
        is acquired. A lock expires in 899 seconds (15 minutes - 1 second)
        """
        return self.connection.set(self.registry_cleaning_key, 1, nx=1, ex=899)

    def empty(self):
        """Removes all messages on the queue."""
        script = """
            local prefix = "{0}"
            local q = KEYS[1]
            local count = 0
            while true do
                local job_id = redis.call("lpop", q)
                if job_id == false then
                    break
                end

                -- Delete the relevant keys
                redis.call("del", prefix..job_id)
                redis.call("del", prefix..job_id..":dependents")
                count = count + 1
            end
            return count
        """.format(self.job_class.redis_job_namespace_prefix).encode("utf-8")
        script = self.connection.register_script(script)
        return script(keys=[self.key])

    def delete(self, delete_jobs=True):
        """Deletes the queue. If delete_jobs is true it removes all the associated messages on the queue first."""
        if delete_jobs:
            self.empty()

        with self.connection.pipeline() as pipeline:
            pipeline.srem(self.redis_queues_keys, self._key)
            pipeline.delete(self._key)
            pipeline.execute()

    def is_empty(self):
        """Returns whether the current queue is empty."""
        return self.count == 0

    @property
    def is_async(self):
        """Returns whether the current queue is async."""
        return bool(self._is_async)

    def fetch_job(self, job_id):
        try:
            job = self.job_class.fetch(job_id, connection=self.connection)
        except NoSuchJobError:
            self.remove(job_id)
        else:
            if job.origin == self.name:
                return job

    def get_job_ids(self, offset=0, length=-1):
        """Returns a slice of job IDs in the queue."""
        start = offset
        if length >= 0:
            end = offset + (length - 1)
        else:
            end = length
        return [as_text(job_id) for job_id in
                self.connection.lrange(self.key, start, end)]

    def get_jobs(self, offset=0, length=-1):
        """Returns a slice of jobs in the queue."""
        job_ids = self.get_job_ids(offset, length)
        return compact([self.fetch_job(job_id) for job_id in job_ids])

    @property
    def job_ids(self):
        """Returns a list of all job IDS in the queue."""
        return self.get_job_ids()

    @property
    def jobs(self):
        """Returns a list of all (valid) jobs in the queue."""
        return self.get_jobs()

    @property
    def count(self):
        """Returns a count of all messages in the queue."""
        return self.connection.llen(self.key)

    @property
    def failed_job_registry(self):
        """Returns this queue's FailedJobRegistry."""
        from rq.registry import FailedJobRegistry
        return FailedJobRegistry(queue=self)

    def remove(self, job_or_id, pipeline=None):
        """Removes Job from queue, accepts either a Job instance or ID."""
        job_id = job_or_id.id if isinstance(job_or_id, self.job_class) else job_or_id

        if pipeline is not None:
            pipeline.lrem(self.key, 1, job_id)
            return

        return self.connection.lrem(self.key, 1, job_id)

    def compact(self):
        """Removes all "dead" jobs from the queue by cycling through it, while
        guaranteeing FIFO semantics.
        """
        COMPACT_QUEUE = '{0}_compact:{1}'.format(
            self.redis_queue_namespace_prefix, uuid.uuid4())  # noqa

        self.connection.rename(self.key, COMPACT_QUEUE)
        while True:
            job_id = as_text(self.connection.lpop(COMPACT_QUEUE))
            if job_id is None:
                break
            if self.job_class.exists(job_id, self.connection):
                self.connection.rpush(self.key, job_id)

    def push_job_id(self, job_id, pipeline=None, at_front=False):
        """Pushes a job ID on the corresponding Redis queue.
        'at_front' allows you to push the job onto the front instead of the back of the queue"""
        connection = pipeline if pipeline is not None else self.connection
        if at_front:
            connection.lpush(self.key, job_id)
        else:
            connection.rpush(self.key, job_id)

    def enqueue_call(self, func, args=None, kwargs=None, timeout=None,
                     result_ttl=None, ttl=None, failure_ttl=None,
                     description=None, depends_on=None, job_id=None,
                     at_front=False, meta=None):
        """Creates a job to represent the delayed function call and enqueues
        it.

        It is much like \`.enqueue()\`, except that it takes the function's args
        and kwargs as explicit arguments.  Any kwargs passed to this function
        contain options for RQ itself.
        """
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

        # If job depends on an unfinished job, register itself on it's
        # parent's dependents instead of enqueueing it.
        # If WatchError is raised in the process, that means something else is
        # modifying the dependency. In this case we simply retry
        if depends_on is not None:
            if not isinstance(depends_on, self.job_class):
                depends_on = self.job_class(id=depends_on,
                                            connection=self.connection)
            with self.connection.pipeline() as pipe:
                while True:
                    try:
                        pipe.watch(depends_on.key)

                        # If the dependency does not exist, raise an
                        # exception to avoid creating an orphaned job.
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

    def run_job(self, job):
        job.perform()
        job.set_status(JobStatus.FINISHED)
        job.save(include_meta=False)
        job.cleanup(DEFAULT_RESULT_TTL)
        return job

    def enqueue(self, f, *args, **kwargs):
        """Creates a job to represent the delayed function call and enqueues
        it.

        Expects the function to call, along with the arguments and keyword
        arguments.

        The function argument \`f\` may be any of the following:

        * A reference to a function
        * A reference to an object's instance method
        * A string, representing the location of a function (must be
          meaningful to the import context of the workers)
        """
        if not isinstance(f, string_types) and f.__module__ == '__main__':
            raise ValueError('Functions from the __main__ module cannot be processed '
                             'by workers')

        # Detect explicit invocations, i.e. of the form:
        #     q.enqueue(foo, args=(1, 2), kwargs={'a': 1}, job_timeout=30)
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
            assert args == (), 'Extra positional arguments cannot be used when using explicit args and kwargs'  # noqa
            args = kwargs.pop('args', None)
            kwargs = kwargs.pop('kwargs', None)

        return self.enqueue_call(
            func=f, args=args, kwargs=kwargs, timeout=timeout,
            result_ttl=result_ttl, ttl=ttl, failure_ttl=failure_ttl,
            description=description, depends_on=depends_on, job_id=job_id,
            at_front=at_front, meta=meta
        )

    def enqueue_job(self, job, pipeline=None, at_front=False):
        """Enqueues a job for delayed execution.

        If Queue is instantiated with is_async=False, job is executed immediately.
        """
        pipe = pipeline if pipeline is not None else self.connection.pipeline()

        # Add Queue key set
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

    def enqueue_dependents(self, job, pipeline=None):
        """Enqueues all jobs in the given job's dependents set and clears it.

        When called without a pipeline, this method uses WATCH/MULTI/EXEC.
        If you pass a pipeline, only MULTI is called. The rest is up to the
        caller.
        """
        from .registry import DeferredJobRegistry

        pipe = pipeline if pipeline is not None else self.connection.pipeline()
        dependents_key = job.dependents_key

        while True:
            try:
                # if a pipeline is passed, the caller is responsible for calling WATCH
                # to ensure all jobs are enqueued
                if pipeline is None:
                    pipe.watch(dependents_key)

                dependent_jobs = [self.job_class.fetch(as_text(job_id), connection=self.connection)
                                  for job_id in pipe.smembers(dependents_key)]

                pipe.multi()

                for dependent in dependent_jobs:
                    registry = DeferredJobRegistry(dependent.origin,
                                                   self.connection,
                                                   job_class=self.job_class)
                    registry.remove(dependent, pipeline=pipe)
                    if dependent.origin == self.name:
                        self.enqueue_job(dependent, pipeline=pipe)
                    else:
                        queue = Queue(name=dependent.origin, connection=self.connection)
                        queue.enqueue_job(dependent, pipeline=pipe)

                pipe.delete(dependents_key)

                if pipeline is None:
                    pipe.execute()

                break
            except WatchError:
                if pipeline is None:
                    continue
                else:
                    # if the pipeline comes from the caller, we re-raise the
                    # exception as it it the responsibility of the caller to
                    # handle it
                    raise

    def pop_job_id(self):
        """Pops a given job ID from this Redis queue."""
        return as_text(self.connection.lpop(self.key))

    @classmethod
    def lpop(cls, queue_keys, timeout, connection=None):
        """Helper method.  Intermediate method to abstract away from some
        Redis API details, where LPOP accepts only a single key, whereas BLPOP
        accepts multiple.  So if we want the non-blocking LPOP, we need to
        iterate over all queues, do individual LPOPs, and return the result.

        Until Redis receives a specific method for this, we'll have to wrap it
        this way.

        The timeout parameter is interpreted as follows:
            None - non-blocking (return immediately)
             > 0 - maximum number of seconds to block
        """
        connection = resolve_connection(connection)
        if timeout is not None:  # blocking variant
            if timeout == 0:
                raise ValueError('RQ does not support indefinite timeouts. Please pick a timeout value > 0')
            result = connection.blpop(queue_keys, timeout)
            if result is None:
                raise DequeueTimeout(timeout, queue_keys)
            queue_key, job_id = result
            return queue_key, job_id
        else:  # non-blocking variant
            for queue_key in queue_keys:
                blob = connection.lpop(queue_key)
                if blob is not None:
                    return queue_key, blob
            return None

    @classmethod
    def dequeue_any(cls, queues, timeout, connection=None, job_class=None):
        """Class method returning the job_class instance at the front of the given
        set of Queues, where the order of the queues is important.

        When all of the Queues are empty, depending on the \`timeout\` argument,
        either blocks execution of this function for the duration of the
        timeout or until new messages arrive on any of the queues, or returns
        None.

        See the documentation of cls.lpop for the interpretation of timeout.
        """
        job_class = backend_class(cls, 'job_class', override=job_class)

        while True:
            queue_keys = [q.key for q in queues]
            result = cls.lpop(queue_keys, timeout, connection=connection)
            if result is None:
                return None
            queue_key, job_id = map(as_text, result)
            queue = cls.from_queue_key(queue_key,
                                       connection=connection,
                                       job_class=job_class)
            try:
                job = job_class.fetch(job_id, connection=connection)
            except NoSuchJobError:
                # Silently pass on jobs that don't exist (anymore),
                # and continue in the look
                continue
            except UnpickleError as e:
                # Attach queue information on the exception for improved error
                # reporting
                e.job_id = job_id
                e.queue = queue
                raise e
            return job, queue
        return None, None

    # Total ordering defition (the rest of the required Python methods are
    # auto-generated by the @total_ordering decorator)
    def __eq__(self, other):  # noqa
        if not isinstance(other, Queue):
            raise TypeError('Cannot compare queues to other objects')
        return self.name == other.name

    def __lt__(self, other):
        if not isinstance(other, Queue):
            raise TypeError('Cannot compare queues to other objects')
        return self.name < other.name

    def __hash__(self):  # pragma: no cover
        return hash(self.name)

    def __repr__(self):  # noqa  # pragma: no cover
        return '{0}({1!r})'.format(self.__class__.__name__, self.name)

    def __str__(self):
        return '<{0} {1}>'.format(self.__class__.__name__, self.name)
`

fileContents['rq/registry.py'] = `from .compat import as_text
from .connections import resolve_connection
from .defaults import DEFAULT_FAILURE_TTL
from .exceptions import InvalidJobOperation, NoSuchJobError
from .job import Job, JobStatus
from .queue import Queue
from .utils import backend_class, current_timestamp


class BaseRegistry(object):
    """
    Base implementation of a job registry, implemented in Redis sorted set.
    Each job is stored as a key in the registry, scored by expiration time
    (unix timestamp).
    """
    job_class = Job
    key_template = 'rq:registry:{0}'

    def __init__(self, name='default', connection=None, job_class=None,
                 queue=None):
        if queue:
            self.name = queue.name
            self.connection = resolve_connection(queue.connection)
        else:
            self.name = name
            self.connection = resolve_connection(connection)

        self.key = self.key_template.format(self.name)
        self.job_class = backend_class(self, 'job_class', override=job_class)

    def __len__(self):
        """Returns the number of jobs in this registry"""
        return self.count

    def __contains__(self, item):
        """
        Returns a boolean indicating registry contains the given
        job instance or job id.
        """
        job_id = item
        if isinstance(item, self.job_class):
            job_id = item.id
        return self.connection.zscore(self.key, job_id) is not None

    @property
    def count(self):
        """Returns the number of jobs in this registry"""
        self.cleanup()
        return self.connection.zcard(self.key)

    def add(self, job, ttl=0, pipeline=None):
        """Adds a job to a registry with expiry time of now + ttl, unless it's -1 which is set to +inf"""
        score = ttl if ttl < 0 else current_timestamp() + ttl
        if score == -1:
            score = '+inf'
        if pipeline is not None:
            return pipeline.zadd(self.key, {job.id: score})

        return self.connection.zadd(self.key, {job.id: score})

    def remove(self, job, pipeline=None):
        connection = pipeline if pipeline is not None else self.connection
        return connection.zrem(self.key, job.id)

    def get_expired_job_ids(self, timestamp=None):
        """Returns job ids whose score are less than current timestamp.

        Returns ids for jobs with an expiry time earlier than timestamp,
        specified as seconds since the Unix epoch. timestamp defaults to call
        time if unspecified.
        """
        score = timestamp if timestamp is not None else current_timestamp()
        return [as_text(job_id) for job_id in
                self.connection.zrangebyscore(self.key, 0, score)]

    def get_job_ids(self, start=0, end=-1):
        """Returns list of all job ids."""
        self.cleanup()
        return [as_text(job_id) for job_id in
                self.connection.zrange(self.key, start, end)]

    def get_queue(self):
        """Returns Queue object associated with this registry."""
        return Queue(self.name, connection=self.connection)


class StartedJobRegistry(BaseRegistry):
    """
    Registry of currently executing jobs. Each queue maintains a
    StartedJobRegistry. Jobs in this registry are ones that are currently
    being executed.

    Jobs are added to registry right before they are executed and removed
    right after completion (success or failure).
    """
    key_template = 'rq:wip:{0}'

    def cleanup(self, timestamp=None):
        """Remove expired jobs from registry and add them to FailedJobRegistry.

        Removes jobs with an expiry time earlier than timestamp, specified as
        seconds since the Unix epoch. timestamp defaults to call time if
        unspecified. Removed jobs are added to the global failed job queue.
        """
        score = timestamp if timestamp is not None else current_timestamp()
        job_ids = self.get_expired_job_ids(score)

        if job_ids:
            failed_job_registry = FailedJobRegistry(self.name, self.connection)

            with self.connection.pipeline() as pipeline:
                for job_id in job_ids:
                    try:
                        job = self.job_class.fetch(job_id,
                                                   connection=self.connection)
                        job.set_status(JobStatus.FAILED)
                        job.save(pipeline=pipeline, include_meta=False)
                        job.cleanup(ttl=-1, pipeline=pipeline)
                        failed_job_registry.add(job, job.failure_ttl)
                    except NoSuchJobError:
                        pass

                pipeline.zremrangebyscore(self.key, 0, score)
                pipeline.execute()

        return job_ids


class FinishedJobRegistry(BaseRegistry):
    """
    Registry of jobs that have been completed. Jobs are added to this
    registry after they have successfully completed for monitoring purposes.
    """
    key_template = 'rq:finished:{0}'

    def cleanup(self, timestamp=None):
        """Remove expired jobs from registry.

        Removes jobs with an expiry time earlier than timestamp, specified as
        seconds since the Unix epoch. timestamp defaults to call time if
        unspecified.
        """
        score = timestamp if timestamp is not None else current_timestamp()
        self.connection.zremrangebyscore(self.key, 0, score)


class FailedJobRegistry(BaseRegistry):
    """
    Registry of containing failed jobs.
    """
    key_template = 'rq:failed:{0}'

    def cleanup(self, timestamp=None):
        """Remove expired jobs from registry.

        Removes jobs with an expiry time earlier than timestamp, specified as
        seconds since the Unix epoch. timestamp defaults to call time if
        unspecified.
        """
        score = timestamp if timestamp is not None else current_timestamp()
        self.connection.zremrangebyscore(self.key, 0, score)

    def add(self, job, ttl=None, exc_string='', pipeline=None):
        """
        Adds a job to a registry with expiry time of now + ttl.
        \`ttl\` defaults to DEFAULT_FAILURE_TTL if not specified.
        """
        if ttl is None:
            ttl = DEFAULT_FAILURE_TTL
        score = ttl if ttl < 0 else current_timestamp() + ttl

        if pipeline:
            p = pipeline
        else:
            p = self.connection.pipeline()

        job.exc_info = exc_string
        job.save(pipeline=p, include_meta=False)
        job.cleanup(ttl=-1, pipeline=p)  # failed job won't expire
        p.zadd(self.key, {job.id: score})

        if not pipeline:
            p.execute()

    def requeue(self, job_or_id):
        """Requeues the job with the given job ID."""
        if isinstance(job_or_id, self.job_class):
            job = job_or_id
        else:
            job = self.job_class.fetch(job_or_id, connection=self.connection)

        result = self.connection.zrem(self.key, job.id)
        if not result:
            raise InvalidJobOperation

        queue = Queue(job.origin, connection=self.connection,
                      job_class=self.job_class)

        return queue.enqueue_job(job)


class DeferredJobRegistry(BaseRegistry):
    """
    Registry of deferred jobs (waiting for another job to finish).
    """
    key_template = 'rq:deferred:{0}'

    def cleanup(self):
        """This method is only here to prevent errors because this method is
        automatically called by \`count()\` and \`get_job_ids()\` methods
        implemented in BaseRegistry."""
        pass


def clean_registries(queue):
    """Cleans StartedJobRegistry and FinishedJobRegistry of a queue."""
    registry = FinishedJobRegistry(name=queue.name,
                                   connection=queue.connection,
                                   job_class=queue.job_class)
    registry.cleanup()
    registry = StartedJobRegistry(name=queue.name,
                                  connection=queue.connection,
                                  job_class=queue.job_class)
    registry.cleanup()

    registry = FailedJobRegistry(name=queue.name,
                                 connection=queue.connection,
                                 job_class=queue.job_class)
    registry.cleanup()
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
    # \`log_result_lifespan\` controls whether "Result is kept for XXX seconds"
    # messages are logged after every job, by default they are.
    log_result_lifespan = True
    # \`log_job_description\` is used to toggle logging an entire jobs description.
    log_job_description = True

    @classmethod
    def all(cls, connection=None, job_class=None, queue_class=None, queue=None):
        """Returns an iterable of all Workers.
        """
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

    @classmethod
    def all_keys(cls, connection=None, queue=None):
        return [as_text(key)
                for key in get_keys(queue=queue, connection=connection)]

    @classmethod
    def count(cls, connection=None, queue=None):
        """Returns the number of workers by queue or connection"""
        return len(get_keys(queue=queue, connection=connection))

    @classmethod
    def find_by_key(cls, worker_key, connection=None, job_class=None,
                    queue_class=None):
        """Returns a Worker instance, based on the naming conventions for
        naming the internal Redis keys.  Can be used to reverse-lookup Workers
        by their Redis keys.
        """
        prefix = cls.redis_worker_namespace_prefix
        if not worker_key.startswith(prefix):
            raise ValueError('Not a valid RQ worker key: %s' % worker_key)

        if connection is None:
            connection = get_current_connection()
        if not connection.exists(worker_key):
            connection.srem(cls.redis_workers_keys, worker_key)
            return None

        name = worker_key[len(prefix):]
        worker = cls([], name, connection=connection, job_class=job_class,
                     queue_class=queue_class, prepare_for_work=False)

        worker.refresh()

        return worker

    def __init__(self, queues, name=None, default_result_ttl=DEFAULT_RESULT_TTL,
                 connection=None, exc_handler=None, exception_handlers=None,
                 default_worker_ttl=DEFAULT_WORKER_TTL, job_class=None,
                 queue_class=None, log_job_description=True,
                 job_monitoring_interval=DEFAULT_JOB_MONITORING_INTERVAL,
                 disable_default_exception_handler=False,
                 prepare_for_work=True):  # noqa
        if connection is None:
            connection = get_current_connection()
        self.connection = connection

        if prepare_for_work:
            self.hostname = socket.gethostname()
            self.pid = os.getpid()
        else:
            self.hostname = None
            self.pid = None

        self.job_class = backend_class(self, 'job_class', override=job_class)
        self.queue_class = backend_class(self, 'queue_class', override=queue_class)

        queues = [self.queue_class(name=q,
                                   connection=connection,
                                   job_class=self.job_class)
                  if isinstance(q, string_types) else q
                  for q in ensure_list(queues)]

        self.name = name or uuid4().hex
        self.queues = queues
        self.validate_queues()
        self._exc_handlers = []

        self.default_result_ttl = default_result_ttl
        self.default_worker_ttl = default_worker_ttl
        self.job_monitoring_interval = job_monitoring_interval

        self._state = 'starting'
        self._is_horse = False
        self._horse_pid = 0
        self._stop_requested = False
        self.log = logger
        self.log_job_description = log_job_description
        self.last_cleaned_at = None
        self.successful_job_count = 0
        self.failed_job_count = 0
        self.total_working_time = 0
        self.birth_date = None

        self.disable_default_exception_handler = disable_default_exception_handler

        if isinstance(exception_handlers, list):
            for handler in exception_handlers:
                self.push_exc_handler(handler)
        elif exception_handlers is not None:
            self.push_exc_handler(exception_handlers)

    def validate_queues(self):
        """Sanity check for the given queues."""
        for queue in self.queues:
            if not isinstance(queue, self.queue_class):
                raise TypeError('{0} is not of type {1} or string types'.format(queue, self.queue_class))

    def queue_names(self):
        """Returns the queue names of this worker's queues."""
        return list(map(lambda q: q.name, self.queues))

    def queue_keys(self):
        """Returns the Redis keys representing this worker's queues."""
        return list(map(lambda q: q.key, self.queues))

    @property
    def key(self):
        """Returns the worker's Redis hash key."""
        return self.redis_worker_namespace_prefix + self.name

    @property
    def horse_pid(self):
        """The horse's process ID.  Only available in the worker.  Will return
        0 in the horse part of the fork.
        """
        return self._horse_pid

    @property
    def is_horse(self):
        """Returns whether or not this is the worker or the work horse."""
        return self._is_horse

    def procline(self, message):
        """Changes the current procname for the process.

        This can be used to make \`ps -ef\` output more readable.
        """
        setprocname('rq: {0}'.format(message))

    def register_birth(self):
        """Registers its own birth."""
        self.log.debug('Registering birth of worker %s', self.name)
        if self.connection.exists(self.key) and \\
                not self.connection.hexists(self.key, 'death'):
            msg = 'There exists an active worker named {0!r} already'
            raise ValueError(msg.format(self.name))
        key = self.key
        queues = ','.join(self.queue_names())
        with self.connection.pipeline() as p:
            p.delete(key)
            now = utcnow()
            now_in_string = utcformat(utcnow())
            self.birth_date = now
            p.hset(key, 'birth', now_in_string)
            p.hset(key, 'last_heartbeat', now_in_string)
            p.hset(key, 'queues', queues)
            p.hset(key, 'pid', self.pid)
            p.hset(key, 'hostname', self.hostname)
            worker_registration.register(self, p)
            p.expire(key, self.default_worker_ttl)
            p.execute()

    def register_death(self):
        """Registers its own death."""
        self.log.debug('Registering death')
        with self.connection.pipeline() as p:
            # We cannot use self.state = 'dead' here, because that would
            # rollback the pipeline
            worker_registration.unregister(self, p)
            p.hset(self.key, 'death', utcformat(utcnow()))
            p.expire(self.key, 60)
            p.execute()

    def set_shutdown_requested_date(self):
        """Sets the date on which the worker received a (warm) shutdown request"""
        self.connection.hset(self.key, 'shutdown_requested_date', utcformat(utcnow()))

    # @property
    # def birth_date(self):
    #     """Fetches birth date from Redis."""
    #     birth_timestamp = self.connection.hget(self.key, 'birth')
    #     if birth_timestamp is not None:
    #         return utcparse(as_text(birth_timestamp))

    @property
    def shutdown_requested_date(self):
        """Fetches shutdown_requested_date from Redis."""
        shutdown_requested_timestamp = self.connection.hget(self.key, 'shutdown_requested_date')
        if shutdown_requested_timestamp is not None:
            return utcparse(as_text(shutdown_requested_timestamp))

    @property
    def death_date(self):
        """Fetches death date from Redis."""
        death_timestamp = self.connection.hget(self.key, 'death')
        if death_timestamp is not None:
            return utcparse(as_text(death_timestamp))

    def set_state(self, state, pipeline=None):
        self._state = state
        connection = pipeline if pipeline is not None else self.connection
        connection.hset(self.key, 'state', state)

    def _set_state(self, state):
        """Raise a DeprecationWarning if \`\`worker.state = X\`\` is used"""
        warnings.warn(
            "worker.state is deprecated, use worker.set_state() instead.",
            DeprecationWarning
        )
        self.set_state(state)

    def get_state(self):
        return self._state

    def _get_state(self):
        """Raise a DeprecationWarning if \`\`worker.state == X\`\` is used"""
        warnings.warn(
            "worker.state is deprecated, use worker.get_state() instead.",
            DeprecationWarning
        )
        return self.get_state()

    state = property(_get_state, _set_state)

    def set_current_job_id(self, job_id, pipeline=None):
        connection = pipeline if pipeline is not None else self.connection

        if job_id is None:
            connection.hdel(self.key, 'current_job')
        else:
            connection.hset(self.key, 'current_job', job_id)

    def get_current_job_id(self, pipeline=None):
        connection = pipeline if pipeline is not None else self.connection
        return as_text(connection.hget(self.key, 'current_job'))

    def get_current_job(self):
        """Returns the job id of the currently executing job."""
        job_id = self.get_current_job_id()

        if job_id is None:
            return None

        return self.job_class.fetch(job_id, self.connection)

    def _install_signal_handlers(self):
        """Installs signal handlers for handling SIGINT and SIGTERM
        gracefully.
        """

        signal.signal(signal.SIGINT, self.request_stop)
        signal.signal(signal.SIGTERM, self.request_stop)

    def kill_horse(self, sig=SIGKILL):
        """
        Kill the horse but catch "No such process" error has the horse could already be dead.
        """
        try:
            os.kill(self.horse_pid, sig)
        except OSError as e:
            if e.errno == errno.ESRCH:
                # "No such process" is fine with us
                self.log.debug('Horse already dead')
            else:
                raise

    def request_force_stop(self, signum, frame):
        """Terminates the application (cold shutdown).
        """
        self.log.warning('Cold shut down')

        # Take down the horse with the worker
        if self.horse_pid:
            self.log.debug('Taking down horse %s with me', self.horse_pid)
            self.kill_horse()
        raise SystemExit()

    def request_stop(self, signum, frame):
        """Stops the current worker loop but waits for child processes to
        end gracefully (warm shutdown).
        """
        self.log.debug('Got signal %s', signal_name(signum))

        signal.signal(signal.SIGINT, self.request_force_stop)
        signal.signal(signal.SIGTERM, self.request_force_stop)

        self.handle_warm_shutdown_request()

        # If shutdown is requested in the middle of a job, wait until
        # finish before shutting down and save the request in redis
        if self.get_state() == WorkerStatus.BUSY:
            self._stop_requested = True
            self.set_shutdown_requested_date()
            self.log.debug('Stopping after current horse is finished. '
                           'Press Ctrl+C again for a cold shutdown.')
        else:
            raise StopRequested()

    def handle_warm_shutdown_request(self):
        self.log.info('Warm shut down requested')

    def check_for_suspension(self, burst):
        """Check to see if workers have been suspended by \`rq suspend\`"""

        before_state = None
        notified = False

        while not self._stop_requested and is_suspended(self.connection, self):

            if burst:
                self.log.info('Suspended in burst mode, exiting')
                self.log.info('Note: There could still be unfinished jobs on the queue')
                raise StopRequested

            if not notified:
                self.log.info('Worker suspended, run \`rq resume\` to resume')
                before_state = self.get_state()
                self.set_state(WorkerStatus.SUSPENDED)
                notified = True
            time.sleep(1)

        if before_state:
            self.set_state(before_state)

    def work(self, burst=False, logging_level="INFO", date_format=DEFAULT_LOGGING_DATE_FORMAT,
             log_format=DEFAULT_LOGGING_FORMAT):
        """Starts the work loop.

        Pops and performs all jobs on the current list of queues.  When all
        queues are empty, block and wait for new jobs to arrive on any of the
        queues, unless \`burst\` mode is enabled.

        The return value indicates whether any jobs were processed.
        """
        setup_loghandlers(logging_level, date_format, log_format)
        self._install_signal_handlers()
        did_perform_work = False
        self.register_birth()
        self.log.info("RQ worker %r started, version %s", self.key, VERSION)
        self.set_state(WorkerStatus.STARTED)
        qnames = self.queue_names()
        self.log.info('*** Listening on %s...', green(', '.join(qnames)))

        try:
            while True:
                try:
                    self.check_for_suspension(burst)

                    if self.should_run_maintenance_tasks:
                        self.clean_registries()

                    if self._stop_requested:
                        self.log.info('Stopping on request')
                        break

                    timeout = None if burst else max(1, self.default_worker_ttl - 15)

                    result = self.dequeue_job_and_maintain_ttl(timeout)
                    if result is None:
                        if burst:
                            self.log.info("RQ worker %r done, quitting", self.key)
                        break

                    job, queue = result
                    self.execute_job(job, queue)
                    self.heartbeat()

                    did_perform_work = True

                except StopRequested:
                    break

                except SystemExit:
                    # Cold shutdown detected
                    raise

                except:  # noqa
                    self.log.error(
                        'Worker %s: found an unhandled exception, quitting...',
                        self.name, exc_info=True
                    )
                    break
        finally:
            if not self.is_horse:
                self.register_death()
        return did_perform_work

    def dequeue_job_and_maintain_ttl(self, timeout):
        result = None
        qnames = ','.join(self.queue_names())

        self.set_state(WorkerStatus.IDLE)
        self.procline('Listening on ' + qnames)
        self.log.debug('*** Listening on %s...', green(qnames))

        while True:
            self.heartbeat()

            try:
                result = self.queue_class.dequeue_any(self.queues, timeout,
                                                      connection=self.connection,
                                                      job_class=self.job_class)
                if result is not None:

                    job, queue = result
                    if self.log_job_description:
                        self.log.info(
                            '%s: %s (%s)', green(queue.name),
                            blue(job.description), job.id)
                    else:
                        self.log.info('%s:%s', green(queue.name), job.id)

                break
            except DequeueTimeout:
                pass

        self.heartbeat()
        return result

    def heartbeat(self, timeout=None, pipeline=None):
        """Specifies a new worker timeout, typically by extending the
        expiration time of the worker, effectively making this a "heartbeat"
        to not expire the worker until the timeout passes.

        The next heartbeat should come before this time, or the worker will
        die (at least from the monitoring dashboards).

        If no timeout is given, the default_worker_ttl will be used to update
        the expiration time of the worker.
        """
        timeout = timeout or self.default_worker_ttl
        connection = pipeline if pipeline is not None else self.connection
        connection.expire(self.key, timeout)
        connection.hset(self.key, 'last_heartbeat', utcformat(utcnow()))
        self.log.debug('Sent heartbeat to prevent worker timeout. '
                       'Next one should arrive within %s seconds.', timeout)

    def refresh(self):
        data = self.connection.hmget(
            self.key, 'queues', 'state', 'current_job', 'last_heartbeat',
            'birth', 'failed_job_count', 'successful_job_count',
            'total_working_time', 'hostname', 'pid'
        )
        (queues, state, job_id, last_heartbeat, birth, failed_job_count,
         successful_job_count, total_working_time, hostname, pid) = data
        queues = as_text(queues)
        self.hostname = hostname
        self.pid = int(pid) if pid else None
        self._state = as_text(state or '?')
        self._job_id = job_id or None
        if last_heartbeat:
            self.last_heartbeat = utcparse(as_text(last_heartbeat))
        else:
            self.last_heartbeat = None
        if birth:
            self.birth_date = utcparse(as_text(birth))
        else:
            self.birth_date = None
        if failed_job_count:
            self.failed_job_count = int(as_text(failed_job_count))
        if successful_job_count:
            self.successful_job_count = int(as_text(successful_job_count))
        if total_working_time:
            self.total_working_time = float(as_text(total_working_time))

        if queues:
            self.queues = [self.queue_class(queue,
                                            connection=self.connection,
                                            job_class=self.job_class)
                           for queue in queues.split(',')]

    def increment_failed_job_count(self, pipeline=None):
        connection = pipeline if pipeline is not None else self.connection
        connection.hincrby(self.key, 'failed_job_count', 1)

    def increment_successful_job_count(self, pipeline=None):
        connection = pipeline if pipeline is not None else self.connection
        connection.hincrby(self.key, 'successful_job_count', 1)

    def increment_total_working_time(self, job_execution_time, pipeline):
        pipeline.hincrbyfloat(self.key, 'total_working_time',
                              job_execution_time.total_seconds())

    def fork_work_horse(self, job, queue):
        """Spawns a work horse to perform the actual work and passes it a job.
        """
        child_pid = os.fork()
        os.environ['RQ_WORKER_ID'] = self.name
        os.environ['RQ_JOB_ID'] = job.id
        if child_pid == 0:
            self.main_work_horse(job, queue)
        else:
            self._horse_pid = child_pid
            self.procline('Forked {0} at {1}'.format(child_pid, time.time()))

    def monitor_work_horse(self, job):
        """The worker will monitor the work horse and make sure that it
        either executes successfully or the status of the job is set to
        failed
        """
        while True:
            try:
                with UnixSignalDeathPenalty(self.job_monitoring_interval, HorseMonitorTimeoutException):
                    retpid, ret_val = os.waitpid(self._horse_pid, 0)
                break
            except HorseMonitorTimeoutException:
                # Horse has not exited yet and is still running.
                # Send a heartbeat to keep the worker alive.
                self.heartbeat(self.job_monitoring_interval + 5)
            except OSError as e:
                # In case we encountered an OSError due to EINTR (which is
                # caused by a SIGINT or SIGTERM signal during
                # os.waitpid()), we simply ignore it and enter the next
                # iteration of the loop, waiting for the child to end.  In
                # any other case, this is some other unexpected OS error,
                # which we don't want to catch, so we re-raise those ones.
                if e.errno != errno.EINTR:
                    raise
                # Send a heartbeat to keep the worker alive.
                self.heartbeat()

        if ret_val == os.EX_OK:  # The process exited normally.
            return
        job_status = job.get_status()
        if job_status is None:  # Job completed and its ttl has expired
            return
        if job_status not in [JobStatus.FINISHED, JobStatus.FAILED]:

            if not job.ended_at:
                job.ended_at = utcnow()

            # Unhandled failure: move the job to the failed queue
            self.log.warning((
                'Moving job to FailedJobRegistry '
                '(work-horse terminated unexpectedly; waitpid returned {})'
            ).format(ret_val))

            exc_string = "Work-horse process was terminated unexpectedly " + "(waitpid returned %s)" % ret_val
            self.handle_job_failure(
                job,
                exc_string="Work-horse process was terminated unexpectedly "
                           "(waitpid returned %s)" % ret_val
            )

    def execute_job(self, job, queue):
        """Spawns a work horse to perform the actual work and passes it a job.
        The worker will wait for the work horse and make sure it executes
        within the given timeout bounds, or will end the work horse with
        SIGALRM.
        """
        self.set_state(WorkerStatus.BUSY)
        self.fork_work_horse(job, queue)
        self.monitor_work_horse(job)
        self.set_state(WorkerStatus.IDLE)

    def main_work_horse(self, job, queue):
        """This is the entry point of the newly spawned work horse."""
        # After fork()'ing, always assure we are generating random sequences
        # that are different from the worker.
        random.seed()

        try:
            self.setup_work_horse_signals()
            self._is_horse = True
            self.log = logger
            self.perform_job(job, queue)
        except Exception as e:  # noqa
            # Horse does not terminate properly
            raise e
            os._exit(1)

        # os._exit() is the way to exit from childs after a fork(), in
        # constrast to the regular sys.exit()
        os._exit(0)

    def setup_work_horse_signals(self):
        """Setup signal handing for the newly spawned work horse."""
        # Always ignore Ctrl+C in the work horse, as it might abort the
        # currently running job.
        # The main worker catches the Ctrl+C and requests graceful shutdown
        # after the current work is done.  When cold shutdown is requested, it
        # kills the current job anyway.
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_DFL)

    def prepare_job_execution(self, job, heartbeat_ttl=None):
        """Performs misc bookkeeping like updating states prior to
        job execution.
        """
        timeout = (job.timeout or 180) + 60

        if heartbeat_ttl is None:
            heartbeat_ttl = self.job_monitoring_interval + 5

        with self.connection.pipeline() as pipeline:
            self.set_state(WorkerStatus.BUSY, pipeline=pipeline)
            self.set_current_job_id(job.id, pipeline=pipeline)
            self.heartbeat(heartbeat_ttl, pipeline=pipeline)
            registry = StartedJobRegistry(job.origin, self.connection,
                                          job_class=self.job_class)
            registry.add(job, timeout, pipeline=pipeline)
            job.set_status(JobStatus.STARTED, pipeline=pipeline)
            pipeline.hset(job.key, 'started_at', utcformat(utcnow()))
            pipeline.execute()

        msg = 'Processing {0} from {1} since {2}'
        self.procline(msg.format(job.func_name, job.origin, time.time()))

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
                # Ensure that custom exception handlers are called
                # even if Redis is down
                pass

    def handle_job_success(self, job, queue, started_job_registry):

        with self.connection.pipeline() as pipeline:
            while True:
                try:
                    # if dependencies are inserted after enqueue_dependents
                    # a WatchError is thrown by execute()
                    pipeline.watch(job.dependents_key)
                    # enqueue_dependents calls multi() on the pipeline!
                    queue.enqueue_dependents(job, pipeline=pipeline)

                    self.set_current_job_id(None, pipeline=pipeline)
                    self.increment_successful_job_count(pipeline=pipeline)
                    self.increment_total_working_time(
                        job.ended_at - job.started_at, pipeline
                    )

                    result_ttl = job.get_result_ttl(self.default_result_ttl)
                    if result_ttl != 0:
                        job.set_status(JobStatus.FINISHED, pipeline=pipeline)
                        # Don't clobber the user's meta dictionary!
                        job.save(pipeline=pipeline, include_meta=False)

                        finished_job_registry = FinishedJobRegistry(job.origin,
                                                                    self.connection,
                                                                    job_class=self.job_class)
                        finished_job_registry.add(job, result_ttl, pipeline)

                    job.cleanup(result_ttl, pipeline=pipeline,
                                remove_from_queue=False)
                    started_job_registry.remove(job, pipeline=pipeline)

                    pipeline.execute()
                    break
                except WatchError:
                    continue

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

    def handle_exception(self, job, *exc_info):
        """Walks the exception handler stack to delegate exception handling."""
        exc_string = Worker._get_safe_exception_string(
            traceback.format_exception_only(*exc_info[:2]) + traceback.format_exception(*exc_info)
        )
        self.log.error(exc_string, exc_info=True, extra={
            'func': job.func_name,
            'arguments': job.args,
            'kwargs': job.kwargs,
            'queue': job.origin,
        })

        for handler in self._exc_handlers:
            self.log.debug('Invoking exception handler %s', handler)
            fallthrough = handler(job, *exc_info)

            # Only handlers with explicit return values should disable further
            # exc handling, so interpret a None return value as True.
            if fallthrough is None:
                fallthrough = True

            if not fallthrough:
                break

    @staticmethod
    def _get_safe_exception_string(exc_strings):
        """Ensure list of exception strings is decoded on Python 2 and joined as one string safely."""
        if sys.version_info[0] < 3:
            try:
                exc_strings = [exc.decode("utf-8") for exc in exc_strings]
            except ValueError:
                exc_strings = [exc.decode("latin-1") for exc in exc_strings]
        return ''.join(exc_strings)

    def push_exc_handler(self, handler_func):
        """Pushes an exception handler onto the exc handler stack."""
        self._exc_handlers.append(handler_func)

    def pop_exc_handler(self):
        """Pops the latest exception handler off of the exc handler stack."""
        return self._exc_handlers.pop()

    def __eq__(self, other):
        """Equality does not take the database/connection into account"""
        if not isinstance(other, self.__class__):
            raise TypeError('Cannot compare workers to other types (of workers)')
        return self.name == other.name

    def __hash__(self):
        """The hash does not take the database/connection into account"""
        return hash(self.name)

    def clean_registries(self):
        """Runs maintenance jobs on each Queue's registries."""
        for queue in self.queues:
            # If there are multiple workers running, we only want 1 worker
            # to run clean_registries().
            if queue.acquire_cleaning_lock():
                self.log.info('Cleaning registries for queue: %s', queue.name)
                clean_registries(queue)
                clean_worker_registry(queue)
        self.last_cleaned_at = utcnow()

    @property
    def should_run_maintenance_tasks(self):
        """Maintenance tasks should run on first startup or 15 minutes."""
        if self.last_cleaned_at is None:
            return True
        if (utcnow() - self.last_cleaned_at) > timedelta(minutes=15):
            return True
        return False


class SimpleWorker(Worker):
    def main_work_horse(self, *args, **kwargs):
        raise NotImplementedError("Test worker does not implement this method")

    def execute_job(self, job, queue):
        """Execute job in same thread/process, do not fork()"""
        timeout = (job.timeout or DEFAULT_WORKER_TTL) + 5
        return self.perform_job(job, queue, heartbeat_ttl=timeout)


class HerokuWorker(Worker):
    """
    Modified version of rq worker which:
    * stops work horses getting killed with SIGTERM
    * sends SIGRTMIN to work horses on SIGTERM to the main process which in turn
    causes the horse to crash \`imminent_shutdown_delay\` seconds later
    """
    imminent_shutdown_delay = 6

    frame_properties = ['f_code', 'f_lasti', 'f_lineno', 'f_locals', 'f_trace']
    if PY2:
        frame_properties.extend(
            ['f_exc_traceback', 'f_exc_type', 'f_exc_value', 'f_restricted']
        )

    def setup_work_horse_signals(self):
        """Modified to ignore SIGINT and SIGTERM and only handle SIGRTMIN"""
        signal.signal(signal.SIGRTMIN, self.request_stop_sigrtmin)
        signal.signal(signal.SIGINT, signal.SIG_IGN)
        signal.signal(signal.SIGTERM, signal.SIG_IGN)

    def handle_warm_shutdown_request(self):
        """If horse is alive send it SIGRTMIN"""
        if self.horse_pid != 0:
            self.log.info('Warm shut down requested, sending horse SIGRTMIN signal')
            self.kill_horse(sig=signal.SIGRTMIN)
        else:
            self.log.warning('Warm shut down requested, no horse found')

    def request_stop_sigrtmin(self, signum, frame):
        if self.imminent_shutdown_delay == 0:
            self.log.warning('Imminent shutdown, raising ShutDownImminentException immediately')
            self.request_force_stop_sigrtmin(signum, frame)
        else:
            self.log.warning('Imminent shutdown, raising ShutDownImminentException in %d seconds',
                             self.imminent_shutdown_delay)
            signal.signal(signal.SIGRTMIN, self.request_force_stop_sigrtmin)
            signal.signal(signal.SIGALRM, self.request_force_stop_sigrtmin)
            signal.alarm(self.imminent_shutdown_delay)

    def request_force_stop_sigrtmin(self, signum, frame):
        info = dict((attr, getattr(frame, attr)) for attr in self.frame_properties)
        self.log.warning('raising ShutDownImminentException to cancel job...')
        raise ShutDownImminentException('shut down imminent (signal: %s)' % signal_name(signum), info)
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

fileContents['tests/__init__.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import logging

from redis import Redis
from rq import pop_connection, push_connection

try:
    import unittest
except ImportError:
    import unittest2 as unittest  # noqa


def find_empty_redis_database():
    """Tries to connect to a random Redis database (starting from 4), and
    will use/connect it when no keys are in there.
    """
    for dbnum in range(4, 17):
        testconn = Redis(db=dbnum)
        empty = testconn.dbsize() == 0
        if empty:
            return testconn
    assert False, 'No empty Redis database found to run tests in.'


def slow(f):
    import os
    from functools import wraps

    @wraps(f)
    def _inner(*args, **kwargs):
        if os.environ.get('RUN_SLOW_TESTS_TOO'):
            f(*args, **kwargs)

    return _inner


class RQTestCase(unittest.TestCase):
    """Base class to inherit test cases from for RQ.

    It sets up the Redis connection (available via self.testconn), turns off
    logging to the terminal and flushes the Redis database before and after
    running each test.

    Also offers assertQueueContains(queue, that_func) assertion method.
    """

    @classmethod
    def setUpClass(cls):
        # Set up connection to Redis
        testconn = find_empty_redis_database()
        push_connection(testconn)

        # Store the connection (for sanity checking)
        cls.testconn = testconn

        # Shut up logging
        logging.disable(logging.ERROR)

    def setUp(self):
        # Flush beforewards (we like our hygiene)
        self.testconn.flushdb()

    def tearDown(self):
        # Flush afterwards
        self.testconn.flushdb()

    # Implement assertIsNotNone for Python runtimes < 2.7 or < 3.1
    if not hasattr(unittest.TestCase, 'assertIsNotNone'):
        def assertIsNotNone(self, value, *args):  # noqa
            self.assertNotEqual(value, None, *args)

    @classmethod
    def tearDownClass(cls):
        logging.disable(logging.NOTSET)

        # Pop the connection to Redis
        testconn = pop_connection()
        assert testconn == cls.testconn, \\
            'Wow, something really nasty happened to the Redis connection stack. Check your setup.'
`

fileContents['tests/config_files/__init__.py'] = ``

fileContents['tests/config_files/dummy.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

REDIS_HOST = "testhost.example.com"
`

fileContents['tests/config_files/dummy_override.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

REDIS_HOST = "testhost.example.com"
REDIS_PORT = 6378
REDIS_DB = 2
REDIS_PASSWORD = '123'
`

fileContents['tests/config_files/sentry.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

REDIS_HOST = "testhost.example.com"
SENTRY_DSN = 'https://123@sentry.io/123'
`

fileContents['tests/fixtures.py'] = `# -*- coding: utf-8 -*-
"""
This file contains all jobs that are used in tests.  Each of these test
fixtures has a slighty different characteristics.
"""
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import os
import time
import sys

from rq import Connection, get_current_job, get_current_connection, Queue
from rq.decorators import job
from rq.compat import PY2, text_type
from rq.worker import HerokuWorker


def say_pid():
    return os.getpid()


def say_hello(name=None):
    """A job with a single argument and a return value."""
    if name is None:
        name = 'Stranger'
    return 'Hi there, %s!' % (name,)


def say_hello_unicode(name=None):
    """A job with a single argument and a return value."""
    return text_type(say_hello(name))  # noqa


def do_nothing():
    """The best job in the world."""
    pass


def div_by_zero(x):
    """Prepare for a division-by-zero exception."""
    return x / 0


def some_calculation(x, y, z=1):
    """Some arbitrary calculation with three numbers.  Choose z smartly if you
    want a division by zero exception.
    """
    return x * y / z


def create_file(path):
    """Creates a file at the given path.  Actually, leaves evidence that the
    job ran."""
    with open(path, 'w') as f:
        f.write('Just a sentinel.')


def create_file_after_timeout(path, timeout):
    time.sleep(timeout)
    create_file(path)


def access_self():
    assert get_current_connection() is not None
    assert get_current_job() is not None


def modify_self(meta):
    j = get_current_job()
    j.meta.update(meta)
    j.save()


def modify_self_and_error(meta):
    j = get_current_job()
    j.meta.update(meta)
    j.save()
    return 1 / 0


def echo(*args, **kwargs):
    return args, kwargs


class Number(object):
    def __init__(self, value):
        self.value = value

    @classmethod
    def divide(cls, x, y):
        return x * y

    def div(self, y):
        return self.value / y


class CallableObject(object):
    def __call__(self):
        return u"I'm callable"


class UnicodeStringObject(object):
    def __repr__(self):
        if PY2:
            return u'é'.encode('utf-8')
        else:
            return u'é'


with Connection():
    @job(queue='default')
    def decorated_job(x, y):
        return x + y


def black_hole(job, *exc_info):
    # Don't fall through to default behaviour (moving to failed queue)
    return False


def add_meta(job, *exc_info):
    job.meta = {'foo': 1}
    job.save()
    return True


def save_key_ttl(key):
    # Stores key ttl in meta
    job = get_current_job()
    ttl = job.connection.ttl(key)
    job.meta = {'ttl': ttl}
    job.save_meta()


def long_running_job(timeout=10):
    time.sleep(timeout)
    return 'Done sleeping...'


def run_dummy_heroku_worker(sandbox, _imminent_shutdown_delay):
    """
    Run the work horse for a simplified heroku worker where perform_job just
    creates two sentinel files 2 seconds apart.
    :param sandbox: directory to create files in
    :param _imminent_shutdown_delay: delay to use for HerokuWorker
    """
    sys.stderr = open(os.path.join(sandbox, 'stderr.log'), 'w')

    class TestHerokuWorker(HerokuWorker):
        imminent_shutdown_delay = _imminent_shutdown_delay

        def perform_job(self, job, queue):
            create_file(os.path.join(sandbox, 'started'))
            # have to loop here rather than one sleep to avoid holding the GIL
            # and preventing signals being received
            for i in range(20):
                time.sleep(0.1)
            create_file(os.path.join(sandbox, 'finished'))

    w = TestHerokuWorker(Queue('dummy'))
    w.main_work_horse(None, None)


class DummyQueue(object):
    pass
`

fileContents['tests/test_cli.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from click.testing import CliRunner
from redis import Redis

from rq import Queue
from rq.cli import main
from rq.cli.helpers import read_config_file, CliConfig
from rq.job import Job
from rq.registry import FailedJobRegistry
from rq.worker import Worker, WorkerStatus

import pytest

from tests import RQTestCase
from tests.fixtures import div_by_zero, say_hello


class TestRQCli(RQTestCase):

    @pytest.fixture(autouse=True)
    def set_tmpdir(self, tmpdir):
        self.tmpdir = tmpdir

    def assert_normal_execution(self, result):
        if result.exit_code == 0:
            return True
        else:
            print("Non normal execution")
            print("Exit Code: {}".format(result.exit_code))
            print("Output: {}".format(result.output))
            print("Exception: {}".format(result.exception))
            self.assertEqual(result.exit_code, 0)

    """Test rq_cli script"""
    def setUp(self):
        super(TestRQCli, self).setUp()
        db_num = self.testconn.connection_pool.connection_kwargs['db']
        self.redis_url = 'redis://127.0.0.1:6379/%d' % db_num
        self.connection = Redis.from_url(self.redis_url)

        job = Job.create(func=div_by_zero, args=(1, 2, 3))
        job.origin = 'fake'
        job.save()

    def test_config_file(self):
        settings = read_config_file('tests.config_files.dummy')
        self.assertIn('REDIS_HOST', settings)
        self.assertEqual(settings['REDIS_HOST'], 'testhost.example.com')

    def test_config_file_option(self):
        """"""
        cli_config = CliConfig(config='tests.config_files.dummy')
        self.assertEqual(
            cli_config.connection.connection_pool.connection_kwargs['host'],
            'testhost.example.com',
        )
        runner = CliRunner()
        result = runner.invoke(main, ['info', '--config', cli_config.config])
        self.assertEqual(result.exit_code, 1)

    def test_config_file_default_options(self):
        """"""
        cli_config = CliConfig(config='tests.config_files.dummy')

        self.assertEqual(
            cli_config.connection.connection_pool.connection_kwargs['host'],
            'testhost.example.com',
        )
        self.assertEqual(
            cli_config.connection.connection_pool.connection_kwargs['port'],
            6379
        )
        self.assertEqual(
            cli_config.connection.connection_pool.connection_kwargs['db'],
            0
        )
        self.assertEqual(
            cli_config.connection.connection_pool.connection_kwargs['password'],
            None
        )

    def test_config_file_default_options_override(self):
        """"""
        cli_config = CliConfig(config='tests.config_files.dummy_override')

        self.assertEqual(
            cli_config.connection.connection_pool.connection_kwargs['host'],
            'testhost.example.com',
        )
        self.assertEqual(
            cli_config.connection.connection_pool.connection_kwargs['port'],
            6378
        )
        self.assertEqual(
            cli_config.connection.connection_pool.connection_kwargs['db'],
            2
        )
        self.assertEqual(
            cli_config.connection.connection_pool.connection_kwargs['password'],
            '123'
        )

    def test_empty_nothing(self):
        """rq empty -u <url>"""
        runner = CliRunner()
        result = runner.invoke(main, ['empty', '-u', self.redis_url])
        self.assert_normal_execution(result)
        self.assertEqual(result.output.strip(), 'Nothing to do')

    def test_requeue(self):
        """rq requeue -u <url> --all"""
        connection = Redis.from_url(self.redis_url)
        queue = Queue('requeue', connection=connection)
        registry = queue.failed_job_registry

        runner = CliRunner()

        job = queue.enqueue(div_by_zero)
        job2 = queue.enqueue(div_by_zero)
        job3 = queue.enqueue(div_by_zero)

        worker = Worker([queue])
        worker.work(burst=True)

        self.assertIn(job, registry)
        self.assertIn(job2, registry)
        self.assertIn(job3, registry)

        result = runner.invoke(
            main,
            ['requeue', '-u', self.redis_url, '--queue', 'requeue', job.id]
        )
        self.assert_normal_execution(result)

        # Only the first specified job is requeued
        self.assertNotIn(job, registry)
        self.assertIn(job2, registry)
        self.assertIn(job3, registry)

        result = runner.invoke(
            main,
            ['requeue', '-u', self.redis_url, '--queue', 'requeue', '--all']
        )
        self.assert_normal_execution(result)
        # With --all flag, all failed jobs are requeued
        self.assertNotIn(job2, registry)
        self.assertNotIn(job3, registry)

    def test_info(self):
        """rq info -u <url>"""
        runner = CliRunner()
        result = runner.invoke(main, ['info', '-u', self.redis_url])
        self.assert_normal_execution(result)
        self.assertIn('0 queues, 0 jobs total', result.output)

        queue = Queue(connection=self.connection)
        queue.enqueue(say_hello)

        result = runner.invoke(main, ['info', '-u', self.redis_url])
        self.assert_normal_execution(result)
        self.assertIn('1 queues, 1 jobs total', result.output)

    def test_info_only_queues(self):
        """rq info -u <url> --only-queues (-Q)"""
        runner = CliRunner()
        result = runner.invoke(main, ['info', '-u', self.redis_url, '--only-queues'])
        self.assert_normal_execution(result)
        self.assertIn('0 queues, 0 jobs total', result.output)

        queue = Queue(connection=self.connection)
        queue.enqueue(say_hello)

        result = runner.invoke(main, ['info', '-u', self.redis_url])
        self.assert_normal_execution(result)
        self.assertIn('1 queues, 1 jobs total', result.output)

    def test_info_only_workers(self):
        """rq info -u <url> --only-workers (-W)"""
        runner = CliRunner()
        result = runner.invoke(main, ['info', '-u', self.redis_url, '--only-workers'])
        self.assert_normal_execution(result)
        self.assertIn('0 workers, 0 queue', result.output)

        queue = Queue(connection=self.connection)
        queue.enqueue(say_hello)
        result = runner.invoke(main, ['info', '-u', self.redis_url, '--only-workers'])
        self.assert_normal_execution(result)
        self.assertIn('0 workers, 1 queues', result.output)

        foo_queue = Queue(name='foo', connection=self.connection)
        foo_queue.enqueue(say_hello)

        bar_queue = Queue(name='bar', connection=self.connection)
        bar_queue.enqueue(say_hello)

        worker = Worker([foo_queue, bar_queue], connection=self.connection)
        worker.register_birth()

        worker_2 = Worker([foo_queue, bar_queue], connection=self.connection)
        worker_2.register_birth()
        worker_2.set_state(WorkerStatus.BUSY)

        result = runner.invoke(main, ['info', 'foo', 'bar',
                                      '-u', self.redis_url, '--only-workers'])

        self.assert_normal_execution(result)
        self.assertIn('2 workers, 2 queues', result.output)

        result = runner.invoke(main, ['info', 'foo', 'bar', '--by-queue',
                                      '-u', self.redis_url, '--only-workers'])

        self.assert_normal_execution(result)
        # Ensure both queues' workers are shown
        self.assertIn('foo:', result.output)
        self.assertIn('bar:', result.output)
        self.assertIn('2 workers, 2 queues', result.output)

    def test_worker(self):
        """rq worker -u <url> -b"""
        runner = CliRunner()
        result = runner.invoke(main, ['worker', '-u', self.redis_url, '-b'])
        self.assert_normal_execution(result)

    def test_worker_pid(self):
        """rq worker -u <url> /tmp/.."""
        pid = self.tmpdir.join('rq.pid')
        runner = CliRunner()
        result = runner.invoke(main, ['worker', '-u', self.redis_url, '-b', '--pid', str(pid)])
        self.assertTrue(len(pid.read()) > 0)
        self.assert_normal_execution(result)

    def test_exception_handlers(self):
        """rq worker -u <url> -b --exception-handler <handler>"""
        connection = Redis.from_url(self.redis_url)
        q = Queue('default', connection=connection)
        runner = CliRunner()

        # If exception handler is not given, no custom exception handler is run
        job = q.enqueue(div_by_zero)
        runner.invoke(main, ['worker', '-u', self.redis_url, '-b'])
        registry = FailedJobRegistry(queue=q)
        self.assertTrue(job in registry)

        # If disable-default-exception-handler is given, job is not moved to FailedJobRegistry
        job = q.enqueue(div_by_zero)
        runner.invoke(main, ['worker', '-u', self.redis_url, '-b',
                             '--disable-default-exception-handler'])
        registry = FailedJobRegistry(queue=q)
        self.assertFalse(job in registry)

        # Both default and custom exception handler is run
        job = q.enqueue(div_by_zero)
        runner.invoke(main, ['worker', '-u', self.redis_url, '-b',
                             '--exception-handler', 'tests.fixtures.add_meta'])
        registry = FailedJobRegistry(queue=q)
        self.assertTrue(job in registry)
        job.refresh()
        self.assertEqual(job.meta, {'foo': 1})

        # Only custom exception handler is run
        job = q.enqueue(div_by_zero)
        runner.invoke(main, ['worker', '-u', self.redis_url, '-b',
                             '--exception-handler', 'tests.fixtures.add_meta',
                             '--disable-default-exception-handler'])
        registry = FailedJobRegistry(queue=q)
        self.assertFalse(job in registry)
        job.refresh()
        self.assertEqual(job.meta, {'foo': 1})

    def test_suspend_and_resume(self):
        """rq suspend -u <url>
           rq worker -u <url> -b
           rq resume -u <url>
        """
        runner = CliRunner()
        result = runner.invoke(main, ['suspend', '-u', self.redis_url])
        self.assert_normal_execution(result)

        result = runner.invoke(main, ['worker', '-u', self.redis_url, '-b'])
        self.assertEqual(result.exit_code, 1)
        self.assertEqual(
            result.output.strip(),
            'RQ is currently suspended, to resume job execution run "rq resume"'
        )

        result = runner.invoke(main, ['resume', '-u', self.redis_url])
        self.assert_normal_execution(result)

    def test_suspend_with_ttl(self):
        """rq suspend -u <url> --duration=2
        """
        runner = CliRunner()
        result = runner.invoke(main, ['suspend', '-u', self.redis_url, '--duration', 1])
        self.assert_normal_execution(result)

    def test_suspend_with_invalid_ttl(self):
        """rq suspend -u <url> --duration=0
        """
        runner = CliRunner()
        result = runner.invoke(main, ['suspend', '-u', self.redis_url, '--duration', 0])

        self.assertEqual(result.exit_code, 1)
        self.assertIn("Duration must be an integer greater than 1", result.output)
`

fileContents['tests/test_connection.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from rq import Connection, Queue, use_connection, get_current_connection, pop_connection
from rq.connections import NoRedisConnectionException

from tests import find_empty_redis_database, RQTestCase
from tests.fixtures import do_nothing


def new_connection():
    return find_empty_redis_database()


class TestConnectionInheritance(RQTestCase):
    def test_connection_detection(self):
        """Automatic detection of the connection."""
        q = Queue()
        self.assertEqual(q.connection, self.testconn)

    def test_connection_stacking(self):
        """Connection stacking."""
        conn1 = new_connection()
        conn2 = new_connection()

        with Connection(conn1):
            q1 = Queue()
            with Connection(conn2):
                q2 = Queue()
        self.assertNotEqual(q1.connection, q2.connection)

    def test_connection_pass_thru(self):
        """Connection passed through from queues to jobs."""
        q1 = Queue()
        with Connection(new_connection()):
            q2 = Queue()
        job1 = q1.enqueue(do_nothing)
        job2 = q2.enqueue(do_nothing)
        self.assertEqual(q1.connection, job1.connection)
        self.assertEqual(q2.connection, job2.connection)


class TestConnectionHelpers(RQTestCase):
    def test_use_connection(self):
        """Test function use_connection works as expected."""
        conn = new_connection()
        use_connection(conn)

        self.assertEqual(conn, get_current_connection())

        use_connection()

        self.assertNotEqual(conn, get_current_connection())

        use_connection(self.testconn)  # Restore RQTestCase connection

        with self.assertRaises(AssertionError):
            with Connection(new_connection()):
                use_connection()
                with Connection(new_connection()):
                    use_connection()

    def test_resolve_connection_raises_on_no_connection(self):
        """Test function resolve_connection raises if there is no connection."""
        pop_connection()
        with self.assertRaises(NoRedisConnectionException):
            Queue()
`

fileContents['tests/test_decorator.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import mock
from redis import Redis
from rq.decorators import job
from rq.job import Job
from rq.worker import DEFAULT_RESULT_TTL
from rq.queue import Queue

from tests import RQTestCase
from tests.fixtures import decorated_job


class TestDecorator(RQTestCase):

    def setUp(self):
        super(TestDecorator, self).setUp()

    def test_decorator_preserves_functionality(self):
        """Ensure that a decorated function's functionality is still preserved.
        """
        self.assertEqual(decorated_job(1, 2), 3)

    def test_decorator_adds_delay_attr(self):
        """Ensure that decorator adds a delay attribute to function that returns
        a Job instance when called.
        """
        self.assertTrue(hasattr(decorated_job, 'delay'))
        result = decorated_job.delay(1, 2)
        self.assertTrue(isinstance(result, Job))
        # Ensure that job returns the right result when performed
        self.assertEqual(result.perform(), 3)

    def test_decorator_accepts_queue_name_as_argument(self):
        """Ensure that passing in queue name to the decorator puts the job in
        the right queue.
        """
        @job(queue='queue_name')
        def hello():
            return 'Hi'
        result = hello.delay()
        self.assertEqual(result.origin, 'queue_name')

    def test_decorator_accepts_result_ttl_as_argument(self):
        """Ensure that passing in result_ttl to the decorator sets the
        result_ttl on the job
        """
        # Ensure default
        result = decorated_job.delay(1, 2)
        self.assertEqual(result.result_ttl, DEFAULT_RESULT_TTL)

        @job('default', result_ttl=10)
        def hello():
            return 'Why hello'
        result = hello.delay()
        self.assertEqual(result.result_ttl, 10)

    def test_decorator_accepts_ttl_as_argument(self):
        """Ensure that passing in ttl to the decorator sets the ttl on the job
        """
        # Ensure default
        result = decorated_job.delay(1, 2)
        self.assertEqual(result.ttl, None)

        @job('default', ttl=30)
        def hello():
            return 'Hello'
        result = hello.delay()
        self.assertEqual(result.ttl, 30)

    def test_decorator_accepts_meta_as_argument(self):
        """Ensure that passing in meta to the decorator sets the meta on the job
        """
        # Ensure default
        result = decorated_job.delay(1, 2)
        self.assertEqual(result.meta, {})

        test_meta = {
            'metaKey1': 1,
            'metaKey2': 2,
        }

        @job('default', meta=test_meta)
        def hello():
            return 'Hello'
        result = hello.delay()
        self.assertEqual(result.meta, test_meta)

    def test_decorator_accepts_result_depends_on_as_argument(self):
        """Ensure that passing in depends_on to the decorator sets the
        correct dependency on the job
        """
        # Ensure default
        result = decorated_job.delay(1, 2)
        self.assertEqual(result.dependency, None)
        self.assertEqual(result._dependency_id, None)

        @job(queue='queue_name')
        def foo():
            return 'Firstly'

        foo_job = foo.delay()

        @job(queue='queue_name', depends_on=foo_job)
        def bar():
            return 'Secondly'

        bar_job = bar.delay()

        self.assertIsNone(foo_job._dependency_id)

        self.assertEqual(bar_job.dependency, foo_job)

        self.assertEqual(bar_job._dependency_id, foo_job.id)

    def test_decorator_delay_accepts_depends_on_as_argument(self):
        """Ensure that passing in depends_on to the delay method of
        a decorated function overrides the depends_on set in the
        constructor.
        """
        # Ensure default
        result = decorated_job.delay(1, 2)
        self.assertEqual(result.dependency, None)
        self.assertEqual(result._dependency_id, None)

        @job(queue='queue_name')
        def foo():
            return 'Firstly'

        @job(queue='queue_name')
        def bar():
            return 'Firstly'

        foo_job = foo.delay()
        bar_job = bar.delay()

        @job(queue='queue_name', depends_on=foo_job)
        def baz():
            return 'Secondly'

        baz_job = bar.delay(depends_on=bar_job)

        self.assertIsNone(foo_job._dependency_id)
        self.assertIsNone(bar_job._dependency_id)

        self.assertEqual(baz_job.dependency, bar_job)
        self.assertEqual(baz_job._dependency_id, bar_job.id)

    @mock.patch('rq.queue.resolve_connection')
    def test_decorator_connection_laziness(self, resolve_connection):
        """Ensure that job decorator resolve connection in \`lazy\` way """

        resolve_connection.return_value = Redis()

        @job(queue='queue_name')
        def foo():
            return 'do something'

        self.assertEqual(resolve_connection.call_count, 0)

        foo()

        self.assertEqual(resolve_connection.call_count, 0)

        foo.delay()

        self.assertEqual(resolve_connection.call_count, 1)

    def test_decorator_custom_queue_class(self):
        """Ensure that a custom queue class can be passed to the job decorator"""
        class CustomQueue(Queue):
            pass
        CustomQueue.enqueue_call = mock.MagicMock(
            spec=lambda *args, **kwargs: None,
            name='enqueue_call'
        )

        custom_decorator = job(queue='default', queue_class=CustomQueue)
        self.assertIs(custom_decorator.queue_class, CustomQueue)

        @custom_decorator
        def custom_queue_class_job(x, y):
            return x + y

        custom_queue_class_job.delay(1, 2)
        self.assertEqual(CustomQueue.enqueue_call.call_count, 1)

    def test_decorate_custom_queue(self):
        """Ensure that a custom queue instance can be passed to the job decorator"""
        class CustomQueue(Queue):
            pass
        CustomQueue.enqueue_call = mock.MagicMock(
            spec=lambda *args, **kwargs: None,
            name='enqueue_call'
        )
        queue = CustomQueue()

        @job(queue=queue)
        def custom_queue_job(x, y):
            return x + y

        custom_queue_job.delay(1, 2)
        self.assertEqual(queue.enqueue_call.call_count, 1)
`

fileContents['tests/test_helpers.py'] = `from rq.cli.helpers import get_redis_from_config

from tests import RQTestCase


class TestHelpers(RQTestCase):

    def test_get_redis_from_config(self):
        """Ensure Redis connection params are properly parsed"""
        settings = {
            'REDIS_URL': 'redis://localhost:1/1'
        }

        # Ensure REDIS_URL is read
        redis = get_redis_from_config(settings)
        connection_kwargs = redis.connection_pool.connection_kwargs
        self.assertEqual(connection_kwargs['db'], 1)
        self.assertEqual(connection_kwargs['port'], 1)

        settings = {
            'REDIS_URL': 'redis://localhost:1/1',
            'REDIS_HOST': 'foo',
            'REDIS_DB': 2,
            'REDIS_PORT': 2,
            'REDIS_PASSWORD': 'bar'
        }

        # Ensure REDIS_URL is preferred
        redis = get_redis_from_config(settings)
        connection_kwargs = redis.connection_pool.connection_kwargs
        self.assertEqual(connection_kwargs['db'], 1)
        self.assertEqual(connection_kwargs['port'], 1)

        # Ensure fall back to regular connection parameters
        settings['REDIS_URL'] = None
        redis = get_redis_from_config(settings)
        connection_kwargs = redis.connection_pool.connection_kwargs
        self.assertEqual(connection_kwargs['host'], 'foo')
        self.assertEqual(connection_kwargs['db'], 2)
        self.assertEqual(connection_kwargs['port'], 2)
        self.assertEqual(connection_kwargs['password'], 'bar')
`

fileContents['tests/test_job.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from datetime import datetime

import time
import sys
import zlib

is_py2 = sys.version[0] == '2'
if is_py2:
    import Queue as queue
else:
    import queue as queue

from tests import fixtures, RQTestCase

from rq.compat import PY2, as_text
from rq.exceptions import NoSuchJobError, UnpickleError
from rq.job import Job, get_current_job, JobStatus, cancel_job
from rq.queue import Queue
from rq.registry import (DeferredJobRegistry, FailedJobRegistry,
                         FinishedJobRegistry, StartedJobRegistry)
from rq.utils import utcformat
from rq.worker import Worker

try:
    from cPickle import loads, dumps
except ImportError:
    from pickle import loads, dumps


class TestJob(RQTestCase):
    def test_unicode(self):
        """Unicode in job description [issue405]"""
        job = Job.create(
            'myfunc',
            args=[12, "☃"],
            kwargs=dict(snowman="☃", null=None),
        )

        if not PY2:
            # Python 3
            expected_string = "myfunc(12, '☃', null=None, snowman='☃')"
        else:
            # Python 2
            expected_string = u"myfunc(12, u'\\\\u2603', null=None, snowman=u'\\\\u2603')".decode('utf-8')

        self.assertEqual(
            job.description,
            expected_string,
        )

    def test_create_empty_job(self):
        """Creation of new empty jobs."""
        job = Job()
        job.description = 'test job'

        # Jobs have a random UUID and a creation date
        self.assertIsNotNone(job.id)
        self.assertIsNotNone(job.created_at)
        self.assertEqual(str(job), "<Job %s: test job>" % job.id)

        # ...and nothing else
        self.assertIsNone(job.origin)
        self.assertIsNone(job.enqueued_at)
        self.assertIsNone(job.started_at)
        self.assertIsNone(job.ended_at)
        self.assertIsNone(job.result)
        self.assertIsNone(job.exc_info)

        with self.assertRaises(ValueError):
            job.func
        with self.assertRaises(ValueError):
            job.instance
        with self.assertRaises(ValueError):
            job.args
        with self.assertRaises(ValueError):
            job.kwargs

    def test_create_param_errors(self):
        """Creation of jobs may result in errors"""
        self.assertRaises(TypeError, Job.create, fixtures.say_hello, args="string")
        self.assertRaises(TypeError, Job.create, fixtures.say_hello, kwargs="string")
        self.assertRaises(TypeError, Job.create, func=42)

    def test_create_typical_job(self):
        """Creation of jobs for function calls."""
        job = Job.create(func=fixtures.some_calculation, args=(3, 4), kwargs=dict(z=2))

        # Jobs have a random UUID
        self.assertIsNotNone(job.id)
        self.assertIsNotNone(job.created_at)
        self.assertIsNotNone(job.description)
        self.assertIsNone(job.instance)

        # Job data is set...
        self.assertEqual(job.func, fixtures.some_calculation)
        self.assertEqual(job.args, (3, 4))
        self.assertEqual(job.kwargs, {'z': 2})

        # ...but metadata is not
        self.assertIsNone(job.origin)
        self.assertIsNone(job.enqueued_at)
        self.assertIsNone(job.result)

    def test_create_instance_method_job(self):
        """Creation of jobs for instance methods."""
        n = fixtures.Number(2)
        job = Job.create(func=n.div, args=(4,))

        # Job data is set
        self.assertEqual(job.func, n.div)
        self.assertEqual(job.instance, n)
        self.assertEqual(job.args, (4,))

    def test_create_job_from_string_function(self):
        """Creation of jobs using string specifier."""
        job = Job.create(func='tests.fixtures.say_hello', args=('World',))

        # Job data is set
        self.assertEqual(job.func, fixtures.say_hello)
        self.assertIsNone(job.instance)
        self.assertEqual(job.args, ('World',))

    def test_create_job_from_callable_class(self):
        """Creation of jobs using a callable class specifier."""
        kallable = fixtures.CallableObject()
        job = Job.create(func=kallable)

        self.assertEqual(job.func, kallable.__call__)
        self.assertEqual(job.instance, kallable)

    def test_job_properties_set_data_property(self):
        """Data property gets derived from the job tuple."""
        job = Job()
        job.func_name = 'foo'
        fname, instance, args, kwargs = loads(job.data)

        self.assertEqual(fname, job.func_name)
        self.assertEqual(instance, None)
        self.assertEqual(args, ())
        self.assertEqual(kwargs, {})

    def test_data_property_sets_job_properties(self):
        """Job tuple gets derived lazily from data property."""
        job = Job()
        job.data = dumps(('foo', None, (1, 2, 3), {'bar': 'qux'}))

        self.assertEqual(job.func_name, 'foo')
        self.assertEqual(job.instance, None)
        self.assertEqual(job.args, (1, 2, 3))
        self.assertEqual(job.kwargs, {'bar': 'qux'})

    def test_save(self):  # noqa
        """Storing jobs."""
        job = Job.create(func=fixtures.some_calculation, args=(3, 4), kwargs=dict(z=2))

        # Saving creates a Redis hash
        self.assertEqual(self.testconn.exists(job.key), False)
        job.save()
        self.assertEqual(self.testconn.type(job.key), b'hash')

        # Saving writes pickled job data
        unpickled_data = loads(zlib.decompress(self.testconn.hget(job.key, 'data')))
        self.assertEqual(unpickled_data[0], 'tests.fixtures.some_calculation')

    def test_fetch(self):
        """Fetching jobs."""
        # Prepare test
        self.testconn.hset('rq:job:some_id', 'data',
                           "(S'tests.fixtures.some_calculation'\\nN(I3\\nI4\\nt(dp1\\nS'z'\\nI2\\nstp2\\n.")
        self.testconn.hset('rq:job:some_id', 'created_at',
                           '2012-02-07T22:13:24.123456Z')

        # Fetch returns a job
        job = Job.fetch('some_id')
        self.assertEqual(job.id, 'some_id')
        self.assertEqual(job.func_name, 'tests.fixtures.some_calculation')
        self.assertIsNone(job.instance)
        self.assertEqual(job.args, (3, 4))
        self.assertEqual(job.kwargs, dict(z=2))
        self.assertEqual(job.created_at, datetime(2012, 2, 7, 22, 13, 24, 123456))

    def test_persistence_of_empty_jobs(self):  # noqa
        """Storing empty jobs."""
        job = Job()
        with self.assertRaises(ValueError):
            job.save()

    def test_persistence_of_typical_jobs(self):
        """Storing typical jobs."""
        job = Job.create(func=fixtures.some_calculation, args=(3, 4), kwargs=dict(z=2))
        job.save()

        stored_date = self.testconn.hget(job.key, 'created_at').decode('utf-8')
        self.assertEqual(stored_date, utcformat(job.created_at))

        # ... and no other keys are stored
        self.assertEqual(
            sorted(self.testconn.hkeys(job.key)),
            [b'created_at', b'data', b'description'])

    def test_persistence_of_parent_job(self):
        """Storing jobs with parent job, either instance or key."""
        parent_job = Job.create(func=fixtures.some_calculation)
        parent_job.save()
        job = Job.create(func=fixtures.some_calculation, depends_on=parent_job)
        job.save()
        stored_job = Job.fetch(job.id)
        self.assertEqual(stored_job._dependency_id, parent_job.id)
        self.assertEqual(stored_job.dependency, parent_job)

        job = Job.create(func=fixtures.some_calculation, depends_on=parent_job.id)
        job.save()
        stored_job = Job.fetch(job.id)
        self.assertEqual(stored_job._dependency_id, parent_job.id)
        self.assertEqual(stored_job.dependency, parent_job)

    def test_store_then_fetch(self):
        """Store, then fetch."""
        job = Job.create(func=fixtures.some_calculation, timeout='1h', args=(3, 4), kwargs=dict(z=2))
        job.save()

        job2 = Job.fetch(job.id)
        self.assertEqual(job.func, job2.func)
        self.assertEqual(job.args, job2.args)
        self.assertEqual(job.kwargs, job2.kwargs)
        self.assertEqual(job.timeout, job2.timeout)

        # Mathematical equation
        self.assertEqual(job, job2)

    def test_fetching_can_fail(self):
        """Fetching fails for non-existing jobs."""
        with self.assertRaises(NoSuchJobError):
            Job.fetch('b4a44d44-da16-4620-90a6-798e8cd72ca0')

    def test_fetching_unreadable_data(self):
        """Fetching succeeds on unreadable data, but lazy props fail."""
        # Set up
        job = Job.create(func=fixtures.some_calculation, args=(3, 4),
                         kwargs=dict(z=2))
        job.save()

        # Just replace the data hkey with some random noise
        self.testconn.hset(job.key, 'data', 'this is no pickle string')
        job.refresh()

        for attr in ('func_name', 'instance', 'args', 'kwargs'):
            with self.assertRaises(UnpickleError):
                getattr(job, attr)

    def test_job_is_unimportable(self):
        """Jobs that cannot be imported throw exception on access."""
        job = Job.create(func=fixtures.say_hello, args=('Lionel',))
        job.save()

        # Now slightly modify the job to make it unimportable (this is
        # equivalent to a worker not having the most up-to-date source code
        # and unable to import the function)
        job_data = job.data
        unimportable_data = job_data.replace(b'say_hello', b'nay_hello')

        self.testconn.hset(job.key, 'data', zlib.compress(unimportable_data))

        job.refresh()
        with self.assertRaises(AttributeError):
            job.func  # accessing the func property should fail

    def test_compressed_exc_info_handling(self):
        """Jobs handle both compressed and uncompressed exc_info"""
        exception_string = 'Some exception'

        job = Job.create(func=fixtures.say_hello, args=('Lionel',))
        job.exc_info = exception_string
        job.save()

        # exc_info is stored in compressed format
        exc_info = self.testconn.hget(job.key, 'exc_info')
        self.assertEqual(
            as_text(zlib.decompress(exc_info)),
            exception_string
        )

        job.refresh()
        self.assertEqual(job.exc_info, exception_string)

        # Uncompressed exc_info is also handled
        self.testconn.hset(job.key, 'exc_info', exception_string)

        job.refresh()
        self.assertEqual(job.exc_info, exception_string)

    def test_compressed_job_data_handling(self):
        """Jobs handle both compressed and uncompressed data"""

        job = Job.create(func=fixtures.say_hello, args=('Lionel',))
        job.save()

        # Job data is stored in compressed format
        job_data = job.data
        self.assertEqual(
            zlib.compress(job_data),
            self.testconn.hget(job.key, 'data')
        )

        self.testconn.hset(job.key, 'data', job_data)
        job.refresh()
        self.assertEqual(job.data, job_data)


    def test_custom_meta_is_persisted(self):
        """Additional meta data on jobs are stored persisted correctly."""
        job = Job.create(func=fixtures.say_hello, args=('Lionel',))
        job.meta['foo'] = 'bar'
        job.save()

        raw_data = self.testconn.hget(job.key, 'meta')
        self.assertEqual(loads(raw_data)['foo'], 'bar')

        job2 = Job.fetch(job.id)
        self.assertEqual(job2.meta['foo'], 'bar')

    def test_custom_meta_is_rewriten_by_save_meta(self):
        """New meta data can be stored by save_meta."""
        job = Job.create(func=fixtures.say_hello, args=('Lionel',))
        job.save()
        serialized = job.to_dict()

        job.meta['foo'] = 'bar'
        job.save_meta()

        raw_meta = self.testconn.hget(job.key, 'meta')
        self.assertEqual(loads(raw_meta)['foo'], 'bar')

        job2 = Job.fetch(job.id)
        self.assertEqual(job2.meta['foo'], 'bar')

        # nothing else was changed
        serialized2 = job2.to_dict()
        serialized2.pop('meta')
        self.assertDictEqual(serialized, serialized2)

    def test_unpickleable_result(self):
        """Unpickleable job result doesn't crash job.to_dict()"""
        job = Job.create(func=fixtures.say_hello, args=('Lionel',))
        job._result = queue.Queue()
        data = job.to_dict()
        self.assertEqual(data['result'], 'Unpickleable return value')

    def test_result_ttl_is_persisted(self):
        """Ensure that job's result_ttl is set properly"""
        job = Job.create(func=fixtures.say_hello, args=('Lionel',), result_ttl=10)
        job.save()
        Job.fetch(job.id, connection=self.testconn)
        self.assertEqual(job.result_ttl, 10)

        job = Job.create(func=fixtures.say_hello, args=('Lionel',))
        job.save()
        Job.fetch(job.id, connection=self.testconn)
        self.assertEqual(job.result_ttl, None)

    def test_failure_ttl_is_persisted(self):
        """Ensure job.failure_ttl is set and restored properly"""
        job = Job.create(func=fixtures.say_hello, args=('Lionel',), failure_ttl=15)
        job.save()
        Job.fetch(job.id, connection=self.testconn)
        self.assertEqual(job.failure_ttl, 15)

        job = Job.create(func=fixtures.say_hello, args=('Lionel',))
        job.save()
        Job.fetch(job.id, connection=self.testconn)
        self.assertEqual(job.failure_ttl, None)

    def test_description_is_persisted(self):
        """Ensure that job's custom description is set properly"""
        job = Job.create(func=fixtures.say_hello, args=('Lionel',), description='Say hello!')
        job.save()
        Job.fetch(job.id, connection=self.testconn)
        self.assertEqual(job.description, 'Say hello!')

        # Ensure job description is constructed from function call string
        job = Job.create(func=fixtures.say_hello, args=('Lionel',))
        job.save()
        Job.fetch(job.id, connection=self.testconn)
        if PY2:
            self.assertEqual(job.description, "tests.fixtures.say_hello(u'Lionel')")
        else:
            self.assertEqual(job.description, "tests.fixtures.say_hello('Lionel')")

    def test_job_access_outside_job_fails(self):
        """The current job is accessible only within a job context."""
        self.assertIsNone(get_current_job())

    def test_job_access_within_job_function(self):
        """The current job is accessible within the job function."""
        q = Queue()
        job = q.enqueue(fixtures.access_self)
        w = Worker([q])
        w.work(burst=True)
        # access_self calls get_current_job() and executes successfully
        self.assertEqual(job.get_status(), JobStatus.FINISHED)

    def test_job_access_within_synchronous_job_function(self):
        queue = Queue(is_async=False)
        queue.enqueue(fixtures.access_self)

    def test_job_async_status_finished(self):
        queue = Queue(is_async=False)
        job = queue.enqueue(fixtures.say_hello)
        self.assertEqual(job.result, 'Hi there, Stranger!')
        self.assertEqual(job.get_status(), JobStatus.FINISHED)

    def test_enqueue_job_async_status_finished(self):
        queue = Queue(is_async=False)
        job = Job.create(func=fixtures.say_hello)
        job = queue.enqueue_job(job)
        self.assertEqual(job.result, 'Hi there, Stranger!')
        self.assertEqual(job.get_status(), JobStatus.FINISHED)

    def test_get_result_ttl(self):
        """Getting job result TTL."""
        job_result_ttl = 1
        default_ttl = 2
        job = Job.create(func=fixtures.say_hello, result_ttl=job_result_ttl)
        job.save()
        self.assertEqual(job.get_result_ttl(default_ttl=default_ttl), job_result_ttl)
        self.assertEqual(job.get_result_ttl(), job_result_ttl)
        job = Job.create(func=fixtures.say_hello)
        job.save()
        self.assertEqual(job.get_result_ttl(default_ttl=default_ttl), default_ttl)
        self.assertEqual(job.get_result_ttl(), None)

    def test_get_job_ttl(self):
        """Getting job TTL."""
        ttl = 1
        job = Job.create(func=fixtures.say_hello, ttl=ttl)
        job.save()
        self.assertEqual(job.get_ttl(), ttl)
        job = Job.create(func=fixtures.say_hello)
        job.save()
        self.assertEqual(job.get_ttl(), None)

    def test_ttl_via_enqueue(self):
        ttl = 1
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(fixtures.say_hello, ttl=ttl)
        self.assertEqual(job.get_ttl(), ttl)

    def test_never_expire_during_execution(self):
        """Test what happens when job expires during execution"""
        ttl = 1
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(fixtures.long_running_job, args=(2,), ttl=ttl)
        self.assertEqual(job.get_ttl(), ttl)
        job.save()
        job.perform()
        self.assertEqual(job.get_ttl(), ttl)
        self.assertTrue(job.exists(job.id))
        self.assertEqual(job.result, 'Done sleeping...')

    def test_cleanup(self):
        """Test that jobs and results are expired properly."""
        job = Job.create(func=fixtures.say_hello)
        job.save()

        # Jobs with negative TTLs don't expire
        job.cleanup(ttl=-1)
        self.assertEqual(self.testconn.ttl(job.key), -1)

        # Jobs with positive TTLs are eventually deleted
        job.cleanup(ttl=100)
        self.assertEqual(self.testconn.ttl(job.key), 100)

        # Jobs with 0 TTL are immediately deleted
        job.cleanup(ttl=0)
        self.assertRaises(NoSuchJobError, Job.fetch, job.id, self.testconn)

    def test_job_with_dependents_delete_parent(self):
        """job.delete() deletes itself from Redis but not dependents.
        Wthout a save, the dependent job is never saved into redis. The delete
        method will get and pass a NoSuchJobError.
        """
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(fixtures.say_hello)
        job2 = Job.create(func=fixtures.say_hello, depends_on=job)
        job2.register_dependency()

        job.delete()
        self.assertFalse(self.testconn.exists(job.key))
        self.assertFalse(self.testconn.exists(job.dependents_key))

        # By default, dependents are not deleted, but The job is in redis only
        # if it was saved!
        self.assertFalse(self.testconn.exists(job2.key))

        self.assertNotIn(job.id, queue.get_job_ids())

    def test_job_delete_removes_itself_from_registries(self):
        """job.delete() should remove itself from job registries"""
        connection = self.testconn
        job = Job.create(func=fixtures.say_hello, status=JobStatus.FAILED,
                         connection=self.testconn, origin='default')
        job.save()
        registry = FailedJobRegistry(connection=self.testconn)
        registry.add(job, 500)

        job.delete()
        self.assertFalse(job in registry)

        job = Job.create(func=fixtures.say_hello, status=JobStatus.FINISHED,
                         connection=self.testconn, origin='default')
        job.save()

        registry = FinishedJobRegistry(connection=self.testconn)
        registry.add(job, 500)

        job.delete()
        self.assertFalse(job in registry)

        job = Job.create(func=fixtures.say_hello, status=JobStatus.STARTED,
                         connection=self.testconn, origin='default')
        job.save()

        registry = StartedJobRegistry(connection=self.testconn)
        registry.add(job, 500)

        job.delete()
        self.assertFalse(job in registry)

        job = Job.create(func=fixtures.say_hello, status=JobStatus.DEFERRED,
                         connection=self.testconn, origin='default')
        job.save()

        registry = DeferredJobRegistry(connection=self.testconn)
        registry.add(job, 500)

        job.delete()
        self.assertFalse(job in registry)

    def test_job_with_dependents_delete_parent_with_saved(self):
        """job.delete() deletes itself from Redis but not dependents. If the
        dependent job was saved, it will remain in redis."""
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(fixtures.say_hello)
        job2 = Job.create(func=fixtures.say_hello, depends_on=job)
        job2.register_dependency()
        job2.save()

        job.delete()
        self.assertFalse(self.testconn.exists(job.key))
        self.assertFalse(self.testconn.exists(job.dependents_key))

        # By default, dependents are not deleted, but The job is in redis only
        # if it was saved!
        self.assertTrue(self.testconn.exists(job2.key))

        self.assertNotIn(job.id, queue.get_job_ids())

    def test_job_with_dependents_deleteall(self):
        """job.delete() deletes itself from Redis. Dependents need to be
        deleted explictely."""
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(fixtures.say_hello)
        job2 = Job.create(func=fixtures.say_hello, depends_on=job)
        job2.register_dependency()

        job.delete(delete_dependents=True)
        self.assertFalse(self.testconn.exists(job.key))
        self.assertFalse(self.testconn.exists(job.dependents_key))
        self.assertFalse(self.testconn.exists(job2.key))

        self.assertNotIn(job.id, queue.get_job_ids())

    def test_job_with_dependents_delete_all_with_saved(self):
        """job.delete() deletes itself from Redis. Dependents need to be
        deleted explictely. Without a save, the dependent job is never saved
        into redis. The delete method will get and pass a NoSuchJobError.
        """
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(fixtures.say_hello)
        job2 = Job.create(func=fixtures.say_hello, depends_on=job)
        job2.register_dependency()
        job2.save()

        job.delete(delete_dependents=True)
        self.assertFalse(self.testconn.exists(job.key))
        self.assertFalse(self.testconn.exists(job.dependents_key))
        self.assertFalse(self.testconn.exists(job2.key))

        self.assertNotIn(job.id, queue.get_job_ids())

    def test_create_job_with_id(self):
        """test creating jobs with a custom ID"""
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(fixtures.say_hello, job_id="1234")
        self.assertEqual(job.id, "1234")
        job.perform()

        self.assertRaises(TypeError, queue.enqueue, fixtures.say_hello, job_id=1234)

    def test_get_call_string_unicode(self):
        """test call string with unicode keyword arguments"""
        queue = Queue(connection=self.testconn)

        job = queue.enqueue(fixtures.echo, arg_with_unicode=fixtures.UnicodeStringObject())
        self.assertIsNotNone(job.get_call_string())
        job.perform()

    def test_create_job_with_ttl_should_have_ttl_after_enqueued(self):
        """test creating jobs with ttl and checks if get_jobs returns it properly [issue502]"""
        queue = Queue(connection=self.testconn)
        queue.enqueue(fixtures.say_hello, job_id="1234", ttl=10)
        job = queue.get_jobs()[0]
        self.assertEqual(job.ttl, 10)

    def test_create_job_with_ttl_should_expire(self):
        """test if a job created with ttl expires [issue502]"""
        queue = Queue(connection=self.testconn)
        queue.enqueue(fixtures.say_hello, job_id="1234", ttl=1)
        time.sleep(1.1)
        self.assertEqual(0, len(queue.get_jobs()))

    def test_create_and_cancel_job(self):
        """test creating and using cancel_job deletes job properly"""
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(fixtures.say_hello)
        self.assertEqual(1, len(queue.get_jobs()))
        cancel_job(job.id)
        self.assertEqual(0, len(queue.get_jobs()))

    def test_dependents_key_for_should_return_prefixed_job_id(self):
        """test redis key to store job dependents hash under"""
        job_id = 'random'
        key = Job.dependents_key_for(job_id=job_id)

        assert key == Job.redis_job_namespace_prefix + job_id + ':dependents'

    def test_key_for_should_return_prefixed_job_id(self):
        """test redis key to store job hash under"""
        job_id = 'random'
        key = Job.key_for(job_id=job_id)

        assert key == (Job.redis_job_namespace_prefix + job_id).encode('utf-8')
`

fileContents['tests/test_queue.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from tests import RQTestCase
from tests.fixtures import echo, Number, say_hello

from rq import Queue
from rq.exceptions import InvalidJobDependency
from rq.job import Job, JobStatus
from rq.registry import DeferredJobRegistry
from rq.worker import Worker


class CustomJob(Job):
    pass


class TestQueue(RQTestCase):
    def test_create_queue(self):
        """Creating queues."""
        q = Queue('my-queue')
        self.assertEqual(q.name, 'my-queue')
        self.assertEqual(str(q), '<Queue my-queue>')

    def test_create_default_queue(self):
        """Instantiating the default queue."""
        q = Queue()
        self.assertEqual(q.name, 'default')

    def test_equality(self):
        """Mathematical equality of queues."""
        q1 = Queue('foo')
        q2 = Queue('foo')
        q3 = Queue('bar')

        self.assertEqual(q1, q2)
        self.assertEqual(q2, q1)
        self.assertNotEqual(q1, q3)
        self.assertNotEqual(q2, q3)
        self.assertGreater(q1, q3)
        self.assertRaises(TypeError, lambda: q1 == 'some string')
        self.assertRaises(TypeError, lambda: q1 < 'some string')

    def test_empty_queue(self):
        """Emptying queues."""
        q = Queue('example')

        self.testconn.rpush('rq:queue:example', 'foo')
        self.testconn.rpush('rq:queue:example', 'bar')
        self.assertEqual(q.is_empty(), False)

        q.empty()

        self.assertEqual(q.is_empty(), True)
        self.assertIsNone(self.testconn.lpop('rq:queue:example'))

    def test_empty_removes_jobs(self):
        """Emptying a queue deletes the associated job objects"""
        q = Queue('example')
        job = q.enqueue(say_hello)
        self.assertTrue(Job.exists(job.id))
        q.empty()
        self.assertFalse(Job.exists(job.id))

    def test_queue_is_empty(self):
        """Detecting empty queues."""
        q = Queue('example')
        self.assertEqual(q.is_empty(), True)

        self.testconn.rpush('rq:queue:example', 'sentinel message')
        self.assertEqual(q.is_empty(), False)

    def test_queue_delete(self):
        """Test queue.delete properly removes queue"""
        q = Queue('example')
        job = q.enqueue(say_hello)
        job2 = q.enqueue(say_hello)

        self.assertEqual(2, len(q.get_job_ids()))

        q.delete()

        self.assertEqual(0, len(q.get_job_ids()))
        self.assertEqual(False, self.testconn.exists(job.key))
        self.assertEqual(False, self.testconn.exists(job2.key))
        self.assertEqual(0, len(self.testconn.smembers(Queue.redis_queues_keys)))
        self.assertEqual(False, self.testconn.exists(q.key))

    def test_queue_delete_but_keep_jobs(self):
        """Test queue.delete properly removes queue but keeps the job keys in the redis store"""
        q = Queue('example')
        job = q.enqueue(say_hello)
        job2 = q.enqueue(say_hello)

        self.assertEqual(2, len(q.get_job_ids()))

        q.delete(delete_jobs=False)

        self.assertEqual(0, len(q.get_job_ids()))
        self.assertEqual(True, self.testconn.exists(job.key))
        self.assertEqual(True, self.testconn.exists(job2.key))
        self.assertEqual(0, len(self.testconn.smembers(Queue.redis_queues_keys)))
        self.assertEqual(False, self.testconn.exists(q.key))

    def test_remove(self):
        """Ensure queue.remove properly removes Job from queue."""
        q = Queue('example')
        job = q.enqueue(say_hello)
        self.assertIn(job.id, q.job_ids)
        q.remove(job)
        self.assertNotIn(job.id, q.job_ids)

        job = q.enqueue(say_hello)
        self.assertIn(job.id, q.job_ids)
        q.remove(job.id)
        self.assertNotIn(job.id, q.job_ids)

    def test_jobs(self):
        """Getting jobs out of a queue."""
        q = Queue('example')
        self.assertEqual(q.jobs, [])
        job = q.enqueue(say_hello)
        self.assertEqual(q.jobs, [job])

        # Deleting job removes it from queue
        job.delete()
        self.assertEqual(q.job_ids, [])

    def test_compact(self):
        """Queue.compact() removes non-existing jobs."""
        q = Queue()

        q.enqueue(say_hello, 'Alice')
        q.enqueue(say_hello, 'Charlie')
        self.testconn.lpush(q.key, '1', '2')

        self.assertEqual(q.count, 4)
        self.assertEqual(len(q), 4)

        q.compact()

        self.assertEqual(q.count, 2)
        self.assertEqual(len(q), 2)

    def test_enqueue(self):
        """Enqueueing job onto queues."""
        q = Queue()
        self.assertEqual(q.is_empty(), True)

        # say_hello spec holds which queue this is sent to
        job = q.enqueue(say_hello, 'Nick', foo='bar')
        job_id = job.id
        self.assertEqual(job.origin, q.name)

        # Inspect data inside Redis
        q_key = 'rq:queue:default'
        self.assertEqual(self.testconn.llen(q_key), 1)
        self.assertEqual(
            self.testconn.lrange(q_key, 0, -1)[0].decode('ascii'),
            job_id)

    def test_enqueue_sets_metadata(self):
        """Enqueueing job onto queues modifies meta data."""
        q = Queue()
        job = Job.create(func=say_hello, args=('Nick',), kwargs=dict(foo='bar'))

        # Preconditions
        self.assertIsNone(job.enqueued_at)

        # Action
        q.enqueue_job(job)

        # Postconditions
        self.assertIsNotNone(job.enqueued_at)

    def test_pop_job_id(self):
        """Popping job IDs from queues."""
        # Set up
        q = Queue()
        uuid = '112188ae-4e9d-4a5b-a5b3-f26f2cb054da'
        q.push_job_id(uuid)

        # Pop it off the queue...
        self.assertEqual(q.count, 1)
        self.assertEqual(q.pop_job_id(), uuid)

        # ...and assert the queue count when down
        self.assertEqual(q.count, 0)

    def test_dequeue_any(self):
        """Fetching work from any given queue."""
        fooq = Queue('foo')
        barq = Queue('bar')

        self.assertEqual(Queue.dequeue_any([fooq, barq], None), None)

        # Enqueue a single item
        barq.enqueue(say_hello)
        job, queue = Queue.dequeue_any([fooq, barq], None)
        self.assertEqual(job.func, say_hello)
        self.assertEqual(queue, barq)

        # Enqueue items on both queues
        barq.enqueue(say_hello, 'for Bar')
        fooq.enqueue(say_hello, 'for Foo')

        job, queue = Queue.dequeue_any([fooq, barq], None)
        self.assertEqual(queue, fooq)
        self.assertEqual(job.func, say_hello)
        self.assertEqual(job.origin, fooq.name)
        self.assertEqual(
            job.args[0], 'for Foo',
            'Foo should be dequeued first.'
        )

        job, queue = Queue.dequeue_any([fooq, barq], None)
        self.assertEqual(queue, barq)
        self.assertEqual(job.func, say_hello)
        self.assertEqual(job.origin, barq.name)
        self.assertEqual(
            job.args[0], 'for Bar',
            'Bar should be dequeued second.'
        )

    def test_dequeue_any_ignores_nonexisting_jobs(self):
        """Dequeuing (from any queue) silently ignores non-existing jobs."""

        q = Queue('low')
        uuid = '49f205ab-8ea3-47dd-a1b5-bfa186870fc8'
        q.push_job_id(uuid)

        # Dequeue simply ignores the missing job and returns None
        self.assertEqual(q.count, 1)
        self.assertEqual(
            Queue.dequeue_any([Queue(), Queue('low')], None),  # noqa
            None
        )
        self.assertEqual(q.count, 0)

    def test_enqueue_sets_status(self):
        """Enqueueing a job sets its status to "queued"."""
        q = Queue()
        job = q.enqueue(say_hello)
        self.assertEqual(job.get_status(), JobStatus.QUEUED)

    def test_enqueue_meta_arg(self):
        """enqueue() can set the job.meta contents."""
        q = Queue()
        job = q.enqueue(say_hello, meta={'foo': 'bar', 'baz': 42})
        self.assertEqual(job.meta['foo'], 'bar')
        self.assertEqual(job.meta['baz'], 42)

    def test_enqueue_with_failure_ttl(self):
        """enqueue() properly sets job.failure_ttl"""
        q = Queue()
        job = q.enqueue(say_hello, failure_ttl=10)
        job.refresh()
        self.assertEqual(job.failure_ttl, 10)

    def test_job_timeout(self):
        """Timeout can be passed via job_timeout argument"""
        queue = Queue()
        job = queue.enqueue(echo, 1, job_timeout=15)
        self.assertEqual(job.timeout, 15)

    def test_default_timeout(self):
        """Timeout can be passed via job_timeout argument"""
        queue = Queue()
        job = queue.enqueue(echo, 1)
        self.assertEqual(job.timeout, queue.DEFAULT_TIMEOUT)

        job = Job.create(func=echo)
        job = queue.enqueue_job(job)
        self.assertEqual(job.timeout, queue.DEFAULT_TIMEOUT)

        queue = Queue(default_timeout=15)
        job = queue.enqueue(echo, 1)
        self.assertEqual(job.timeout, 15)

        job = Job.create(func=echo)
        job = queue.enqueue_job(job)
        self.assertEqual(job.timeout, 15)

    def test_enqueue_explicit_args(self):
        """enqueue() works for both implicit/explicit args."""
        q = Queue()

        # Implicit args/kwargs mode
        job = q.enqueue(echo, 1, job_timeout=1, result_ttl=1, bar='baz')
        self.assertEqual(job.timeout, 1)
        self.assertEqual(job.result_ttl, 1)
        self.assertEqual(
            job.perform(),
            ((1,), {'bar': 'baz'})
        )

        # Explicit kwargs mode
        kwargs = {
            'timeout': 1,
            'result_ttl': 1,
        }
        job = q.enqueue(echo, job_timeout=2, result_ttl=2, args=[1], kwargs=kwargs)
        self.assertEqual(job.timeout, 2)
        self.assertEqual(job.result_ttl, 2)
        self.assertEqual(
            job.perform(),
            ((1,), {'timeout': 1, 'result_ttl': 1})
        )

    def test_all_queues(self):
        """All queues"""
        q1 = Queue('first-queue')
        q2 = Queue('second-queue')
        q3 = Queue('third-queue')

        # Ensure a queue is added only once a job is enqueued
        self.assertEqual(len(Queue.all()), 0)
        q1.enqueue(say_hello)
        self.assertEqual(len(Queue.all()), 1)

        # Ensure this holds true for multiple queues
        q2.enqueue(say_hello)
        q3.enqueue(say_hello)
        names = [q.name for q in Queue.all()]
        self.assertEqual(len(Queue.all()), 3)

        # Verify names
        self.assertTrue('first-queue' in names)
        self.assertTrue('second-queue' in names)
        self.assertTrue('third-queue' in names)

        # Now empty two queues
        w = Worker([q2, q3])
        w.work(burst=True)

        # Queue.all() should still report the empty queues
        self.assertEqual(len(Queue.all()), 3)

    def test_all_custom_job(self):
        class CustomJob(Job):
            pass

        q = Queue('all-queue')
        q.enqueue(say_hello)
        queues = Queue.all(job_class=CustomJob)
        self.assertEqual(len(queues), 1)
        self.assertIs(queues[0].job_class, CustomJob)

    def test_from_queue_key(self):
        """Ensure being able to get a Queue instance manually from Redis"""
        q = Queue()
        key = Queue.redis_queue_namespace_prefix + 'default'
        reverse_q = Queue.from_queue_key(key)
        self.assertEqual(q, reverse_q)

    def test_from_queue_key_error(self):
        """Ensure that an exception is raised if the queue prefix is wrong"""
        key = 'some:weird:prefix:' + 'default'
        self.assertRaises(ValueError, Queue.from_queue_key, key)

    def test_enqueue_dependents(self):
        """Enqueueing dependent jobs pushes all jobs in the depends set to the queue
        and removes them from DeferredJobQueue."""
        q = Queue()
        parent_job = Job.create(func=say_hello)
        parent_job.save()
        job_1 = q.enqueue(say_hello, depends_on=parent_job)
        job_2 = q.enqueue(say_hello, depends_on=parent_job)

        registry = DeferredJobRegistry(q.name, connection=self.testconn)
        self.assertEqual(
            set(registry.get_job_ids()),
            set([job_1.id, job_2.id])
        )
        # After dependents is enqueued, job_1 and job_2 should be in queue
        self.assertEqual(q.job_ids, [])
        q.enqueue_dependents(parent_job)
        self.assertEqual(set(q.job_ids), set([job_2.id, job_1.id]))
        self.assertFalse(self.testconn.exists(parent_job.dependents_key))

        # DeferredJobRegistry should also be empty
        self.assertEqual(registry.get_job_ids(), [])

    def test_enqueue_dependents_on_multiple_queues(self):
        """Enqueueing dependent jobs on multiple queues pushes jobs in the queues
        and removes them from DeferredJobRegistry for each different queue."""
        q_1 = Queue("queue_1")
        q_2 = Queue("queue_2")
        parent_job = Job.create(func=say_hello)
        parent_job.save()
        job_1 = q_1.enqueue(say_hello, depends_on=parent_job)
        job_2 = q_2.enqueue(say_hello, depends_on=parent_job)

        # Each queue has its own DeferredJobRegistry
        registry_1 = DeferredJobRegistry(q_1.name, connection=self.testconn)
        self.assertEqual(
            set(registry_1.get_job_ids()),
            set([job_1.id])
        )
        registry_2 = DeferredJobRegistry(q_2.name, connection=self.testconn)
        self.assertEqual(
            set(registry_2.get_job_ids()),
            set([job_2.id])
        )

        # After dependents is enqueued, job_1 on queue_1 and
        # job_2 should be in queue_2
        self.assertEqual(q_1.job_ids, [])
        self.assertEqual(q_2.job_ids, [])
        q_1.enqueue_dependents(parent_job)
        q_2.enqueue_dependents(parent_job)
        self.assertEqual(set(q_1.job_ids), set([job_1.id]))
        self.assertEqual(set(q_2.job_ids), set([job_2.id]))
        self.assertFalse(self.testconn.exists(parent_job.dependents_key))

        # DeferredJobRegistry should also be empty
        self.assertEqual(registry_1.get_job_ids(), [])
        self.assertEqual(registry_2.get_job_ids(), [])

    def test_enqueue_job_with_dependency(self):
        """Jobs are enqueued only when their dependencies are finished."""
        # Job with unfinished dependency is not immediately enqueued
        parent_job = Job.create(func=say_hello)
        parent_job.save()
        q = Queue()
        job = q.enqueue_call(say_hello, depends_on=parent_job)
        self.assertEqual(q.job_ids, [])
        self.assertEqual(job.get_status(), JobStatus.DEFERRED)

        # Jobs dependent on finished jobs are immediately enqueued
        parent_job.set_status(JobStatus.FINISHED)
        parent_job.save()
        job = q.enqueue_call(say_hello, depends_on=parent_job)
        self.assertEqual(q.job_ids, [job.id])
        self.assertEqual(job.timeout, Queue.DEFAULT_TIMEOUT)
        self.assertEqual(job.get_status(), JobStatus.QUEUED)

    def test_enqueue_job_with_dependency_by_id(self):
        """Can specify job dependency with job object or job id."""
        parent_job = Job.create(func=say_hello)
        parent_job.save()

        q = Queue()
        q.enqueue_call(say_hello, depends_on=parent_job.id)
        self.assertEqual(q.job_ids, [])

        # Jobs dependent on finished jobs are immediately enqueued
        parent_job.set_status(JobStatus.FINISHED)
        parent_job.save()
        job = q.enqueue_call(say_hello, depends_on=parent_job.id)
        self.assertEqual(q.job_ids, [job.id])
        self.assertEqual(job.timeout, Queue.DEFAULT_TIMEOUT)

    def test_enqueue_job_with_dependency_and_timeout(self):
        """Jobs remember their timeout when enqueued as a dependency."""
        # Job with unfinished dependency is not immediately enqueued
        parent_job = Job.create(func=say_hello)
        parent_job.save()
        q = Queue()
        job = q.enqueue_call(say_hello, depends_on=parent_job, timeout=123)
        self.assertEqual(q.job_ids, [])
        self.assertEqual(job.timeout, 123)

        # Jobs dependent on finished jobs are immediately enqueued
        parent_job.set_status(JobStatus.FINISHED)
        parent_job.save()
        job = q.enqueue_call(say_hello, depends_on=parent_job, timeout=123)
        self.assertEqual(q.job_ids, [job.id])
        self.assertEqual(job.timeout, 123)

    def test_enqueue_job_with_invalid_dependency(self):
        """Enqueuing a job fails, if the dependency does not exist at all."""
        parent_job = Job.create(func=say_hello)
        # without save() the job is not visible to others

        q = Queue()
        with self.assertRaises(InvalidJobDependency):
            q.enqueue_call(say_hello, depends_on=parent_job)

        with self.assertRaises(InvalidJobDependency):
            q.enqueue_call(say_hello, depends_on=parent_job.id)

        self.assertEqual(q.job_ids, [])

    def test_fetch_job_successful(self):
        """Fetch a job from a queue."""
        q = Queue('example')
        job_orig = q.enqueue(say_hello)
        job_fetch = q.fetch_job(job_orig.id)
        self.assertIsNotNone(job_fetch)
        self.assertEqual(job_orig.id, job_fetch.id)
        self.assertEqual(job_orig.description, job_fetch.description)

    def test_fetch_job_missing(self):
        """Fetch a job from a queue which doesn't exist."""
        q = Queue('example')
        job = q.fetch_job('123')
        self.assertIsNone(job)

    def test_fetch_job_different_queue(self):
        """Fetch a job from a queue which is in a different queue."""
        q1 = Queue('example1')
        q2 = Queue('example2')
        job_orig = q1.enqueue(say_hello)
        job_fetch = q2.fetch_job(job_orig.id)
        self.assertIsNone(job_fetch)

        job_fetch = q1.fetch_job(job_orig.id)
        self.assertIsNotNone(job_fetch)
`

fileContents['tests/test_registry.py'] = `# -*- coding: utf-8 -*-
from __future__ import absolute_import

from rq.compat import as_text
from rq.defaults import DEFAULT_FAILURE_TTL
from rq.exceptions import InvalidJobOperation
from rq.job import Job, JobStatus, requeue_job
from rq.queue import Queue
from rq.utils import current_timestamp
from rq.worker import Worker
from rq.registry import (clean_registries, DeferredJobRegistry,
                         FailedJobRegistry, FinishedJobRegistry,
                         StartedJobRegistry)

from tests import RQTestCase
from tests.fixtures import div_by_zero, say_hello


class CustomJob(Job):
    """A custom job class just to test it"""


class TestRegistry(RQTestCase):

    def setUp(self):
        super(TestRegistry, self).setUp()
        self.registry = StartedJobRegistry(connection=self.testconn)

    def test_init(self):
        """Registry can be instantiated with queue or name/Redis connection"""
        queue = Queue('foo', connection=self.testconn)
        registry = StartedJobRegistry(queue=queue)
        self.assertEqual(registry.name, queue.name)
        self.assertEqual(registry.connection, queue.connection)

        registry = StartedJobRegistry('bar', self.testconn)
        self.assertEqual(registry.name, 'bar')
        self.assertEqual(registry.connection, self.testconn)

    def test_key(self):
        self.assertEqual(self.registry.key, 'rq:wip:default')

    def test_custom_job_class(self):
        registry = StartedJobRegistry(job_class=CustomJob)
        self.assertFalse(registry.job_class == self.registry.job_class)

    def test_contains(self):
        registry = StartedJobRegistry(connection=self.testconn)
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(say_hello)

        self.assertFalse(job in registry)
        self.assertFalse(job.id in registry)

        registry.add(job, 5)

        self.assertTrue(job in registry)
        self.assertTrue(job.id in registry)

    def test_add_and_remove(self):
        """Adding and removing job to StartedJobRegistry."""
        timestamp = current_timestamp()
        job = Job()

        # Test that job is added with the right score
        self.registry.add(job, 1000)
        self.assertLess(self.testconn.zscore(self.registry.key, job.id),
                        timestamp + 1002)

        # Ensure that a timeout of -1 results in a score of inf
        self.registry.add(job, -1)
        self.assertEqual(self.testconn.zscore(self.registry.key, job.id), float('inf'))

        # Ensure that job is properly removed from sorted set
        self.registry.remove(job)
        self.assertIsNone(self.testconn.zscore(self.registry.key, job.id))

    def test_get_job_ids(self):
        """Getting job ids from StartedJobRegistry."""
        timestamp = current_timestamp()
        self.testconn.zadd(self.registry.key, {'foo': timestamp + 10})
        self.testconn.zadd(self.registry.key, {'bar': timestamp + 20})
        self.assertEqual(self.registry.get_job_ids(), ['foo', 'bar'])

    def test_get_expired_job_ids(self):
        """Getting expired job ids form StartedJobRegistry."""
        timestamp = current_timestamp()

        self.testconn.zadd(self.registry.key, {'foo': 1})
        self.testconn.zadd(self.registry.key, {'bar': timestamp + 10})
        self.testconn.zadd(self.registry.key, {'baz': timestamp + 30})

        self.assertEqual(self.registry.get_expired_job_ids(), ['foo'])
        self.assertEqual(self.registry.get_expired_job_ids(timestamp + 20),
                         ['foo', 'bar'])

    def test_cleanup_moves_jobs_to_failed_job_registry(self):
        """Moving expired jobs to FailedJobRegistry."""
        queue = Queue(connection=self.testconn)
        failed_job_registry = FailedJobRegistry(connection=self.testconn)
        job = queue.enqueue(say_hello)

        self.testconn.zadd(self.registry.key, {job.id: 2})

        # Job has not been moved to FailedJobRegistry
        self.registry.cleanup(1)
        self.assertNotIn(job, failed_job_registry)
        self.assertIn(job, self.registry)

        self.registry.cleanup()
        self.assertIn(job.id, failed_job_registry)
        self.assertNotIn(job, self.registry)
        job.refresh()
        self.assertEqual(job.get_status(), JobStatus.FAILED)

    def test_job_execution(self):
        """Job is removed from StartedJobRegistry after execution."""
        registry = StartedJobRegistry(connection=self.testconn)
        queue = Queue(connection=self.testconn)
        worker = Worker([queue])

        job = queue.enqueue(say_hello)
        self.assertTrue(job.is_queued)

        worker.prepare_job_execution(job)
        self.assertIn(job.id, registry.get_job_ids())
        self.assertTrue(job.is_started)

        worker.perform_job(job, queue)
        self.assertNotIn(job.id, registry.get_job_ids())
        self.assertTrue(job.is_finished)

        # Job that fails
        job = queue.enqueue(div_by_zero)

        worker.prepare_job_execution(job)
        self.assertIn(job.id, registry.get_job_ids())

        worker.perform_job(job, queue)
        self.assertNotIn(job.id, registry.get_job_ids())

    def test_job_deletion(self):
        """Ensure job is removed from StartedJobRegistry when deleted."""
        registry = StartedJobRegistry(connection=self.testconn)
        queue = Queue(connection=self.testconn)
        worker = Worker([queue])

        job = queue.enqueue(say_hello)
        self.assertTrue(job.is_queued)

        worker.prepare_job_execution(job)
        self.assertIn(job.id, registry.get_job_ids())

        job.delete()
        self.assertNotIn(job.id, registry.get_job_ids())

    def test_get_job_count(self):
        """StartedJobRegistry returns the right number of job count."""
        timestamp = current_timestamp() + 10
        self.testconn.zadd(self.registry.key, {'foo': timestamp})
        self.testconn.zadd(self.registry.key, {'bar': timestamp})
        self.assertEqual(self.registry.count, 2)
        self.assertEqual(len(self.registry), 2)

    def test_clean_registries(self):
        """clean_registries() cleans Started and Finished job registries."""

        queue = Queue(connection=self.testconn)

        finished_job_registry = FinishedJobRegistry(connection=self.testconn)
        self.testconn.zadd(finished_job_registry.key, {'foo': 1})

        started_job_registry = StartedJobRegistry(connection=self.testconn)
        self.testconn.zadd(started_job_registry.key, {'foo': 1})

        failed_job_registry = FailedJobRegistry(connection=self.testconn)
        self.testconn.zadd(failed_job_registry.key, {'foo': 1})

        clean_registries(queue)
        self.assertEqual(self.testconn.zcard(finished_job_registry.key), 0)
        self.assertEqual(self.testconn.zcard(started_job_registry.key), 0)
        self.assertEqual(self.testconn.zcard(failed_job_registry.key), 0)

    def test_get_queue(self):
        """registry.get_queue() returns the right Queue object."""
        registry = StartedJobRegistry(connection=self.testconn)
        self.assertEqual(registry.get_queue(), Queue(connection=self.testconn))

        registry = StartedJobRegistry('foo', connection=self.testconn)
        self.assertEqual(registry.get_queue(),
                         Queue('foo', connection=self.testconn))


class TestFinishedJobRegistry(RQTestCase):

    def setUp(self):
        super(TestFinishedJobRegistry, self).setUp()
        self.registry = FinishedJobRegistry(connection=self.testconn)

    def test_key(self):
        self.assertEqual(self.registry.key, 'rq:finished:default')

    def test_cleanup(self):
        """Finished job registry removes expired jobs."""
        timestamp = current_timestamp()
        self.testconn.zadd(self.registry.key, {'foo': 1})
        self.testconn.zadd(self.registry.key, {'bar': timestamp + 10})
        self.testconn.zadd(self.registry.key, {'baz': timestamp + 30})

        self.registry.cleanup()
        self.assertEqual(self.registry.get_job_ids(), ['bar', 'baz'])

        self.registry.cleanup(timestamp + 20)
        self.assertEqual(self.registry.get_job_ids(), ['baz'])

    def test_jobs_are_put_in_registry(self):
        """Completed jobs are added to FinishedJobRegistry."""
        self.assertEqual(self.registry.get_job_ids(), [])
        queue = Queue(connection=self.testconn)
        worker = Worker([queue])

        # Completed jobs are put in FinishedJobRegistry
        job = queue.enqueue(say_hello)
        worker.perform_job(job, queue)
        self.assertEqual(self.registry.get_job_ids(), [job.id])

        # When job is deleted, it should be removed from FinishedJobRegistry
        self.assertEqual(job.get_status(), JobStatus.FINISHED)
        job.delete()
        self.assertEqual(self.registry.get_job_ids(), [])

        # Failed jobs are not put in FinishedJobRegistry
        failed_job = queue.enqueue(div_by_zero)
        worker.perform_job(failed_job, queue)
        self.assertEqual(self.registry.get_job_ids(), [])


class TestDeferredRegistry(RQTestCase):

    def setUp(self):
        super(TestDeferredRegistry, self).setUp()
        self.registry = DeferredJobRegistry(connection=self.testconn)

    def test_key(self):
        self.assertEqual(self.registry.key, 'rq:deferred:default')

    def test_add(self):
        """Adding a job to DeferredJobsRegistry."""
        job = Job()
        self.registry.add(job)
        job_ids = [as_text(job_id) for job_id in
                   self.testconn.zrange(self.registry.key, 0, -1)]
        self.assertEqual(job_ids, [job.id])

    def test_register_dependency(self):
        """Ensure job creation and deletion works with DeferredJobRegistry."""
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(say_hello)
        job2 = queue.enqueue(say_hello, depends_on=job)

        registry = DeferredJobRegistry(connection=self.testconn)
        self.assertEqual(registry.get_job_ids(), [job2.id])

        # When deleted, job removes itself from DeferredJobRegistry
        job2.delete()
        self.assertEqual(registry.get_job_ids(), [])


class TestFailedJobRegistry(RQTestCase):

    def test_default_failure_ttl(self):
        """Job TTL defaults to DEFAULT_FAILURE_TTL"""
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(say_hello)

        registry = FailedJobRegistry(connection=self.testconn)
        key = registry.key

        timestamp = current_timestamp()
        registry.add(job)
        self.assertLess(
            self.testconn.zscore(key, job.id),
            timestamp + DEFAULT_FAILURE_TTL + 2
        )
        self.assertGreater(
            self.testconn.zscore(key, job.id),
            timestamp + DEFAULT_FAILURE_TTL - 2
        )

        timestamp = current_timestamp()
        ttl = 5
        registry.add(job, ttl=5)
        self.assertLess(
            self.testconn.zscore(key, job.id),
            timestamp + ttl + 2
        )
        self.assertGreater(
            self.testconn.zscore(key, job.id),
            timestamp + ttl - 2
        )

    def test_requeue(self):
        """FailedJobRegistry.requeue works properly"""
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(div_by_zero, failure_ttl=5)

        worker = Worker([queue])
        worker.work(burst=True)

        registry = FailedJobRegistry(connection=worker.connection)
        self.assertTrue(job in registry)

        registry.requeue(job.id)
        self.assertFalse(job in registry)
        self.assertIn(job.id, queue.get_job_ids())

        job.refresh()
        self.assertEqual(job.get_status(), JobStatus.QUEUED)

        worker.work(burst=True)
        self.assertTrue(job in registry)

        # Should also work with job instance
        registry.requeue(job)
        self.assertFalse(job in registry)
        self.assertIn(job.id, queue.get_job_ids())

        job.refresh()
        self.assertEqual(job.get_status(), JobStatus.QUEUED)

        worker.work(burst=True)
        self.assertTrue(job in registry)

        # requeue_job should work the same way
        requeue_job(job.id, connection=self.testconn)
        self.assertFalse(job in registry)
        self.assertIn(job.id, queue.get_job_ids())

        job.refresh()
        self.assertEqual(job.get_status(), JobStatus.QUEUED)

        worker.work(burst=True)
        self.assertTrue(job in registry)

        # And so does job.requeue()
        job.requeue()
        self.assertFalse(job in registry)
        self.assertIn(job.id, queue.get_job_ids())

        job.refresh()
        self.assertEqual(job.get_status(), JobStatus.QUEUED)

    def test_invalid_job(self):
        """Requeuing a job that's not in FailedJobRegistry raises an error."""
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(say_hello)

        registry = FailedJobRegistry(connection=self.testconn)
        with self.assertRaises(InvalidJobOperation):
            registry.requeue(job)

    def test_worker_handle_job_failure(self):
        """Failed jobs are added to FailedJobRegistry"""
        q = Queue(connection=self.testconn)

        w = Worker([q])
        registry = FailedJobRegistry(connection=w.connection)

        timestamp = current_timestamp()

        job = q.enqueue(div_by_zero, failure_ttl=5)
        w.handle_job_failure(job)
        # job is added to FailedJobRegistry with default failure ttl
        self.assertIn(job.id, registry.get_job_ids())
        self.assertLess(self.testconn.zscore(registry.key, job.id),
                        timestamp + DEFAULT_FAILURE_TTL + 5)

        # job is added to FailedJobRegistry with specified ttl
        job = q.enqueue(div_by_zero, failure_ttl=5)
        w.handle_job_failure(job)
        self.assertLess(self.testconn.zscore(registry.key, job.id),
                        timestamp + 7)
`

fileContents['tests/test_sentry.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from rq import Queue
from rq.cli import main
from rq.cli.helpers import read_config_file
from rq.contrib.sentry import register_sentry
from rq.worker import SimpleWorker

from tests import RQTestCase
from tests.fixtures import div_by_zero

import mock
from click.testing import CliRunner


class FakeSentry(object):
    servers = []

    def captureException(self, *args, **kwds):  # noqa
        pass  # we cannot check this, because worker forks


class TestSentry(RQTestCase):

    def setUp(self):
        super(TestSentry, self).setUp()
        db_num = self.testconn.connection_pool.connection_kwargs['db']
        self.redis_url = 'redis://127.0.0.1:6379/%d' % db_num

    def test_reading_dsn_from_file(self):
        settings = read_config_file('tests.config_files.sentry')
        self.assertIn('SENTRY_DSN', settings)
        self.assertEqual(settings['SENTRY_DSN'], 'https://123@sentry.io/123')

    @mock.patch('rq.contrib.sentry.register_sentry')
    def test_cli_flag(self, mocked):
        """rq worker -u <url> -b --exception-handler <handler>"""
        # connection = Redis.from_url(self.redis_url)
        runner = CliRunner()
        runner.invoke(main, ['worker', '-u', self.redis_url, '-b',
                             '--sentry-dsn', 'https://1@sentry.io/1'])
        self.assertEqual(mocked.call_count, 1)

    def test_failure_capture(self):
        """Test failure is captured by Sentry SDK"""
        from sentry_sdk import Hub
        hub = Hub.current
        self.assertIsNone(hub.last_event_id())
        queue = Queue(connection=self.testconn)
        queue.enqueue(div_by_zero)
        worker = SimpleWorker(queues=[queue], connection=self.testconn)
        register_sentry('https://123@sentry.io/123')
        worker.work(burst=True)
        self.assertIsNotNone(hub.last_event_id())
`

fileContents['tests/test_utils.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)
import re
import datetime
from tests import RQTestCase, fixtures
from rq.utils import parse_timeout, first, is_nonstring_iterable, ensure_list, utcparse, backend_class
from rq.exceptions import TimeoutFormatError


class TestUtils(RQTestCase):
    def test_parse_timeout(self):
        """Ensure function parse_timeout works correctly"""
        self.assertEqual(12, parse_timeout(12))
        self.assertEqual(12, parse_timeout('12'))
        self.assertEqual(12, parse_timeout('12s'))
        self.assertEqual(720, parse_timeout('12m'))
        self.assertEqual(3600, parse_timeout('1h'))
        self.assertEqual(3600, parse_timeout('1H'))

    def test_parse_timeout_coverage_scenarios(self):
        """Test parse_timeout edge cases for coverage"""
        timeouts = ['h12', 'h', 'm', 's', '10k']

        self.assertEqual(None, parse_timeout(None))
        with self.assertRaises(TimeoutFormatError):
            for timeout in timeouts:
                parse_timeout(timeout)

    def test_first(self):
        """Ensure function first works correctly"""
        self.assertEqual(42, first([0, False, None, [], (), 42]))
        self.assertEqual(None, first([0, False, None, [], ()]))
        self.assertEqual('ohai', first([0, False, None, [], ()], default='ohai'))
        self.assertEqual('bc', first(re.match(regex, 'abc') for regex in ['b.*', 'a(.*)']).group(1))
        self.assertEqual(4, first([1, 1, 3, 4, 5], key=lambda x: x % 2 == 0))

    def test_is_nonstring_iterable(self):
        """Ensure function is_nonstring_iterable works correctly"""
        self.assertEqual(True, is_nonstring_iterable([]))
        self.assertEqual(False, is_nonstring_iterable('test'))
        self.assertEqual(True, is_nonstring_iterable({}))
        self.assertEqual(True, is_nonstring_iterable(()))

    def test_ensure_list(self):
        """Ensure function ensure_list works correctly"""
        self.assertEqual([], ensure_list([]))
        self.assertEqual(['test'], ensure_list('test'))
        self.assertEqual({}, ensure_list({}))
        self.assertEqual((), ensure_list(()))

    def test_utcparse(self):
        """Ensure function utcparse works correctly"""
        utc_formated_time = '2017-08-31T10:14:02.123456Z'
        self.assertEqual(datetime.datetime(2017, 8, 31, 10, 14, 2, 123456), utcparse(utc_formated_time))

    def test_utcparse_legacy(self):
        """Ensure function utcparse works correctly"""
        utc_formated_time = '2017-08-31T10:14:02Z'
        self.assertEqual(datetime.datetime(2017, 8, 31, 10, 14, 2), utcparse(utc_formated_time))

    def test_backend_class(self):
        """Ensure function backend_class works correctly"""
        self.assertEqual(fixtures.DummyQueue, backend_class(fixtures, 'DummyQueue'))
        self.assertNotEqual(fixtures.say_pid, backend_class(fixtures, 'DummyQueue'))
        self.assertEqual(fixtures.DummyQueue, backend_class(fixtures, 'DummyQueue', override=fixtures.DummyQueue))
        self.assertEqual(fixtures.DummyQueue,
                         backend_class(fixtures, 'DummyQueue', override='tests.fixtures.DummyQueue'))
`

fileContents['tests/test_worker.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import os
import shutil
import signal
import subprocess
import sys
import time
import zlib

from datetime import datetime, timedelta
from multiprocessing import Process
from time import sleep

from unittest import skipIf

import pytest
import mock
from mock import Mock

from tests import RQTestCase, slow
from tests.fixtures import (
    create_file, create_file_after_timeout, div_by_zero, do_nothing, say_hello,
    say_pid, run_dummy_heroku_worker, access_self, modify_self,
    modify_self_and_error, long_running_job, save_key_ttl
)

from rq import Queue, SimpleWorker, Worker, get_current_connection
from rq.compat import as_text, PY2
from rq.job import Job, JobStatus
from rq.registry import StartedJobRegistry, FailedJobRegistry, FinishedJobRegistry
from rq.suspension import resume, suspend
from rq.utils import utcnow
from rq.worker import HerokuWorker, WorkerStatus


class CustomJob(Job):
    pass


class CustomQueue(Queue):
    pass


class TestWorker(RQTestCase):

    def test_create_worker(self):
        """Worker creation using various inputs."""

        # With single string argument
        w = Worker('foo')
        self.assertEqual(w.queues[0].name, 'foo')

        # With list of strings
        w = Worker(['foo', 'bar'])
        self.assertEqual(w.queues[0].name, 'foo')
        self.assertEqual(w.queues[1].name, 'bar')

        # With iterable of strings
        w = Worker(iter(['foo', 'bar']))
        self.assertEqual(w.queues[0].name, 'foo')
        self.assertEqual(w.queues[1].name, 'bar')

        # Also accept byte strings in Python 2
        if PY2:
            # With single byte string argument
            w = Worker(b'foo')
            self.assertEqual(w.queues[0].name, 'foo')

            # With list of byte strings
            w = Worker([b'foo', b'bar'])
            self.assertEqual(w.queues[0].name, 'foo')
            self.assertEqual(w.queues[1].name, 'bar')

            # With iterable of byte strings
            w = Worker(iter([b'foo', b'bar']))
            self.assertEqual(w.queues[0].name, 'foo')
            self.assertEqual(w.queues[1].name, 'bar')

        # With single Queue
        w = Worker(Queue('foo'))
        self.assertEqual(w.queues[0].name, 'foo')

        # With iterable of Queues
        w = Worker(iter([Queue('foo'), Queue('bar')]))
        self.assertEqual(w.queues[0].name, 'foo')
        self.assertEqual(w.queues[1].name, 'bar')

        # With list of Queues
        w = Worker([Queue('foo'), Queue('bar')])
        self.assertEqual(w.queues[0].name, 'foo')
        self.assertEqual(w.queues[1].name, 'bar')

    def test_work_and_quit(self):
        """Worker processes work, then quits."""
        fooq, barq = Queue('foo'), Queue('bar')
        w = Worker([fooq, barq])
        self.assertEqual(
            w.work(burst=True), False,
            'Did not expect any work on the queue.'
        )

        fooq.enqueue(say_hello, name='Frank')
        self.assertEqual(
            w.work(burst=True), True,
            'Expected at least some work done.'
        )

    def test_worker_all(self):
        """Worker.all() works properly"""
        foo_queue = Queue('foo')
        bar_queue = Queue('bar')

        w1 = Worker([foo_queue, bar_queue], name='w1')
        w1.register_birth()
        w2 = Worker([foo_queue], name='w2')
        w2.register_birth()

        self.assertEqual(
            set(Worker.all(connection=foo_queue.connection)),
            set([w1, w2])
        )
        self.assertEqual(set(Worker.all(queue=foo_queue)), set([w1, w2]))
        self.assertEqual(set(Worker.all(queue=bar_queue)), set([w1]))

        w1.register_death()
        w2.register_death()

    def test_find_by_key(self):
        """Worker.find_by_key restores queues, state and job_id."""
        queues = [Queue('foo'), Queue('bar')]
        w = Worker(queues)
        w.register_death()
        w.register_birth()
        w.set_state(WorkerStatus.STARTED)
        worker = Worker.find_by_key(w.key)
        self.assertEqual(worker.queues, queues)
        self.assertEqual(worker.get_state(), WorkerStatus.STARTED)
        self.assertEqual(worker._job_id, None)
        self.assertTrue(worker.key in Worker.all_keys(worker.connection))

        # If worker is gone, its keys should also be removed
        worker.connection.delete(worker.key)
        Worker.find_by_key(worker.key)
        self.assertFalse(worker.key in Worker.all_keys(worker.connection))

        self.assertRaises(ValueError, Worker.find_by_key, 'foo')

    def test_worker_ttl(self):
        """Worker ttl."""
        w = Worker([])
        w.register_birth()
        [worker_key] = self.testconn.smembers(Worker.redis_workers_keys)
        self.assertIsNotNone(self.testconn.ttl(worker_key))
        w.register_death()

    def test_work_via_string_argument(self):
        """Worker processes work fed via string arguments."""
        q = Queue('foo')
        w = Worker([q])
        job = q.enqueue('tests.fixtures.say_hello', name='Frank')
        self.assertEqual(
            w.work(burst=True), True,
            'Expected at least some work done.'
        )
        self.assertEqual(job.result, 'Hi there, Frank!')

    def test_job_times(self):
        """job times are set correctly."""
        q = Queue('foo')
        w = Worker([q])
        before = utcnow()
        before = before.replace(microsecond=0)
        job = q.enqueue(say_hello)
        self.assertIsNotNone(job.enqueued_at)
        self.assertIsNone(job.started_at)
        self.assertIsNone(job.ended_at)
        self.assertEqual(
            w.work(burst=True), True,
            'Expected at least some work done.'
        )
        self.assertEqual(job.result, 'Hi there, Stranger!')
        after = utcnow()
        job.refresh()
        self.assertTrue(
            before <= job.enqueued_at <= after,
            'Not %s <= %s <= %s' % (before, job.enqueued_at, after)
        )
        self.assertTrue(
            before <= job.started_at <= after,
            'Not %s <= %s <= %s' % (before, job.started_at, after)
        )
        self.assertTrue(
            before <= job.ended_at <= after,
            'Not %s <= %s <= %s' % (before, job.ended_at, after)
        )

    def test_work_is_unreadable(self):
        """Unreadable jobs are put on the failed job registry."""
        q = Queue()
        self.assertEqual(q.count, 0)

        # NOTE: We have to fake this enqueueing for this test case.
        # What we're simulating here is a call to a function that is not
        # importable from the worker process.
        job = Job.create(func=div_by_zero, args=(3,), origin=q.name)
        job.save()

        job_data = job.data
        invalid_data = job_data.replace(b'div_by_zero', b'nonexisting')
        assert job_data != invalid_data
        self.testconn.hset(job.key, 'data', zlib.compress(invalid_data))

        # We use the low-level internal function to enqueue any data (bypassing
        # validity checks)
        q.push_job_id(job.id)

        self.assertEqual(q.count, 1)

        # All set, we're going to process it
        w = Worker([q])
        w.work(burst=True)   # should silently pass
        self.assertEqual(q.count, 0)

        failed_job_registry = FailedJobRegistry(queue=q)
        self.assertTrue(job in failed_job_registry)

    def test_heartbeat(self):
        """Heartbeat saves last_heartbeat"""
        q = Queue()
        w = Worker([q])
        w.register_birth()

        self.assertEqual(str(w.pid), as_text(self.testconn.hget(w.key, 'pid')))
        self.assertEqual(w.hostname,
                         as_text(self.testconn.hget(w.key, 'hostname')))
        last_heartbeat = self.testconn.hget(w.key, 'last_heartbeat')
        self.assertIsNotNone(self.testconn.hget(w.key, 'birth'))
        self.assertTrue(last_heartbeat is not None)
        w = Worker.find_by_key(w.key)
        self.assertIsInstance(w.last_heartbeat, datetime)

        # worker.refresh() shouldn't fail if last_heartbeat is None
        # for compatibility reasons
        self.testconn.hdel(w.key, 'last_heartbeat')
        w.refresh()
        # worker.refresh() shouldn't fail if birth is None
        # for compatibility reasons
        self.testconn.hdel(w.key, 'birth')
        w.refresh()

    @slow
    def test_heartbeat_busy(self):
        """Periodic heartbeats while horse is busy with long jobs"""
        q = Queue()
        w = Worker([q], job_monitoring_interval=5)

        for timeout, expected_heartbeats in [(2, 0), (7, 1), (12, 2)]:
            job = q.enqueue(long_running_job,
                            args=(timeout,),
                            job_timeout=30,
                            result_ttl=-1)
            with mock.patch.object(w, 'heartbeat', wraps=w.heartbeat) as mocked:
                w.execute_job(job, q)
                self.assertEqual(mocked.call_count, expected_heartbeats)
            job = Job.fetch(job.id)
            self.assertEqual(job.get_status(), JobStatus.FINISHED)

    def test_work_fails(self):
        """Failing jobs are put on the failed queue."""
        q = Queue()
        self.assertEqual(q.count, 0)

        # Action
        job = q.enqueue(div_by_zero)
        self.assertEqual(q.count, 1)

        # keep for later
        enqueued_at_date = str(job.enqueued_at)

        w = Worker([q])
        w.work(burst=True)  # should silently pass

        # Postconditions
        self.assertEqual(q.count, 0)
        failed_job_registry = FailedJobRegistry(queue=q)
        self.assertTrue(job in failed_job_registry)
        self.assertEqual(w.get_current_job_id(), None)

        # Check the job
        job = Job.fetch(job.id)
        self.assertEqual(job.origin, q.name)

        # Should be the original enqueued_at date, not the date of enqueueing
        # to the failed queue
        self.assertEqual(str(job.enqueued_at), enqueued_at_date)
        self.assertTrue(job.exc_info)  # should contain exc_info

    def test_statistics(self):
        """Successful and failed job counts are saved properly"""
        queue = Queue()
        job = queue.enqueue(div_by_zero)
        worker = Worker([queue])
        worker.register_birth()

        self.assertEqual(worker.failed_job_count, 0)
        self.assertEqual(worker.successful_job_count, 0)
        self.assertEqual(worker.total_working_time, 0)

        registry = StartedJobRegistry(connection=worker.connection)
        job.started_at = utcnow()
        job.ended_at = job.started_at + timedelta(seconds=0.75)
        worker.handle_job_failure(job)
        worker.handle_job_success(job, queue, registry)

        worker.refresh()
        self.assertEqual(worker.failed_job_count, 1)
        self.assertEqual(worker.successful_job_count, 1)
        self.assertEqual(worker.total_working_time, 1.5) # 1.5 seconds

        worker.handle_job_failure(job)
        worker.handle_job_success(job, queue, registry)

        worker.refresh()
        self.assertEqual(worker.failed_job_count, 2)
        self.assertEqual(worker.successful_job_count, 2)
        self.assertEqual(worker.total_working_time, 3.0)

    def test_total_working_time(self):
        """worker.total_working_time is stored properly"""
        queue = Queue()
        job = queue.enqueue(long_running_job, 0.05)
        worker = Worker([queue])
        worker.register_birth()

        worker.perform_job(job, queue)
        worker.refresh()
        # total_working_time should be around 0.05 seconds
        self.assertTrue(0.05 <= worker.total_working_time < 0.06)

    def test_disable_default_exception_handler(self):
        """
        Job is not moved to FailedJobRegistry when default custom exception
        handler is disabled.
        """
        queue = Queue(name='default', connection=self.testconn)

        job = queue.enqueue(div_by_zero)
        worker = Worker([queue], disable_default_exception_handler=False)
        worker.work(burst=True)

        registry = FailedJobRegistry(queue=queue)
        self.assertTrue(job in registry)

        # Job is not added to FailedJobRegistry if
        # disable_default_exception_handler is True
        job = queue.enqueue(div_by_zero)
        worker = Worker([queue], disable_default_exception_handler=True)
        worker.work(burst=True)
        self.assertFalse(job in registry)

    def test_custom_exc_handling(self):
        """Custom exception handling."""

        def first_handler(job, *exc_info):
            job.meta = {'first_handler': True}
            job.save_meta()
            return True

        def second_handler(job, *exc_info):
            job.meta.update({'second_handler': True})
            job.save_meta()

        def black_hole(job, *exc_info):
            # Don't fall through to default behaviour (moving to failed queue)
            return False

        q = Queue()
        self.assertEqual(q.count, 0)
        job = q.enqueue(div_by_zero)

        w = Worker([q], exception_handlers=first_handler)
        w.work(burst=True)

        # Check the job
        job.refresh()
        self.assertEqual(job.is_failed, True)
        self.assertTrue(job.meta['first_handler'])

        job = q.enqueue(div_by_zero)
        w = Worker([q], exception_handlers=[first_handler, second_handler])
        w.work(burst=True)

        # Both custom exception handlers are run
        job.refresh()
        self.assertEqual(job.is_failed, True)
        self.assertTrue(job.meta['first_handler'])
        self.assertTrue(job.meta['second_handler'])

        job = q.enqueue(div_by_zero)
        w = Worker([q], exception_handlers=[first_handler, black_hole,
                                            second_handler])
        w.work(burst=True)

        # second_handler is not run since it's interrupted by black_hole
        job.refresh()
        self.assertEqual(job.is_failed, True)
        self.assertTrue(job.meta['first_handler'])
        self.assertEqual(job.meta.get('second_handler'), None)

    def test_cancelled_jobs_arent_executed(self):
        """Cancelling jobs."""

        SENTINEL_FILE = '/tmp/rq-tests.txt'  # noqa

        try:
            # Remove the sentinel if it is leftover from a previous test run
            os.remove(SENTINEL_FILE)
        except OSError as e:
            if e.errno != 2:
                raise

        q = Queue()
        job = q.enqueue(create_file, SENTINEL_FILE)

        # Here, we cancel the job, so the sentinel file may not be created
        self.testconn.delete(job.key)

        w = Worker([q])
        w.work(burst=True)
        assert q.count == 0

        # Should not have created evidence of execution
        self.assertEqual(os.path.exists(SENTINEL_FILE), False)

    @slow  # noqa
    def test_timeouts(self):
        """Worker kills jobs after timeout."""
        sentinel_file = '/tmp/.rq_sentinel'

        q = Queue()
        w = Worker([q])

        # Put it on the queue with a timeout value
        res = q.enqueue(create_file_after_timeout,
                        args=(sentinel_file, 4),
                        job_timeout=1)

        try:
            os.unlink(sentinel_file)
        except OSError as e:
            if e.errno == 2:
                pass

        self.assertEqual(os.path.exists(sentinel_file), False)
        w.work(burst=True)
        self.assertEqual(os.path.exists(sentinel_file), False)

        # TODO: Having to do the manual refresh() here is really ugly!
        res.refresh()
        self.assertIn('JobTimeoutException', as_text(res.exc_info))

    def test_worker_sets_result_ttl(self):
        """Ensure that Worker properly sets result_ttl for individual jobs."""
        q = Queue()
        job = q.enqueue(say_hello, args=('Frank',), result_ttl=10)
        w = Worker([q])
        self.assertIn(job.get_id().encode('utf-8'), self.testconn.lrange(q.key, 0, -1))
        w.work(burst=True)
        self.assertNotEqual(self.testconn.ttl(job.key), 0)
        self.assertNotIn(job.get_id().encode('utf-8'), self.testconn.lrange(q.key, 0, -1))

        # Job with -1 result_ttl don't expire
        job = q.enqueue(say_hello, args=('Frank',), result_ttl=-1)
        w = Worker([q])
        self.assertIn(job.get_id().encode('utf-8'), self.testconn.lrange(q.key, 0, -1))
        w.work(burst=True)
        self.assertEqual(self.testconn.ttl(job.key), -1)
        self.assertNotIn(job.get_id().encode('utf-8'), self.testconn.lrange(q.key, 0, -1))

        # Job with result_ttl = 0 gets deleted immediately
        job = q.enqueue(say_hello, args=('Frank',), result_ttl=0)
        w = Worker([q])
        self.assertIn(job.get_id().encode('utf-8'), self.testconn.lrange(q.key, 0, -1))
        w.work(burst=True)
        self.assertEqual(self.testconn.get(job.key), None)
        self.assertNotIn(job.get_id().encode('utf-8'), self.testconn.lrange(q.key, 0, -1))

    def test_worker_sets_job_status(self):
        """Ensure that worker correctly sets job status."""
        q = Queue()
        w = Worker([q])

        job = q.enqueue(say_hello)
        self.assertEqual(job.get_status(), JobStatus.QUEUED)
        self.assertEqual(job.is_queued, True)
        self.assertEqual(job.is_finished, False)
        self.assertEqual(job.is_failed, False)

        w.work(burst=True)
        job = Job.fetch(job.id)
        self.assertEqual(job.get_status(), JobStatus.FINISHED)
        self.assertEqual(job.is_queued, False)
        self.assertEqual(job.is_finished, True)
        self.assertEqual(job.is_failed, False)

        # Failed jobs should set status to "failed"
        job = q.enqueue(div_by_zero, args=(1,))
        w.work(burst=True)
        job = Job.fetch(job.id)
        self.assertEqual(job.get_status(), JobStatus.FAILED)
        self.assertEqual(job.is_queued, False)
        self.assertEqual(job.is_finished, False)
        self.assertEqual(job.is_failed, True)

    def test_job_dependency(self):
        """Enqueue dependent jobs only if their parents don't fail"""
        q = Queue()
        w = Worker([q])
        parent_job = q.enqueue(say_hello, result_ttl=0)
        job = q.enqueue_call(say_hello, depends_on=parent_job)
        w.work(burst=True)
        job = Job.fetch(job.id)
        self.assertEqual(job.get_status(), JobStatus.FINISHED)

        parent_job = q.enqueue(div_by_zero)
        job = q.enqueue_call(say_hello, depends_on=parent_job)
        w.work(burst=True)
        job = Job.fetch(job.id)
        self.assertNotEqual(job.get_status(), JobStatus.FINISHED)

    def test_get_current_job(self):
        """Ensure worker.get_current_job() works properly"""
        q = Queue()
        worker = Worker([q])
        job = q.enqueue_call(say_hello)

        self.assertEqual(self.testconn.hget(worker.key, 'current_job'), None)
        worker.set_current_job_id(job.id)
        self.assertEqual(
            worker.get_current_job_id(),
            as_text(self.testconn.hget(worker.key, 'current_job'))
        )
        self.assertEqual(worker.get_current_job(), job)

    def test_custom_job_class(self):
        """Ensure Worker accepts custom job class."""
        q = Queue()
        worker = Worker([q], job_class=CustomJob)
        self.assertEqual(worker.job_class, CustomJob)

    def test_custom_queue_class(self):
        """Ensure Worker accepts custom queue class."""
        q = CustomQueue()
        worker = Worker([q], queue_class=CustomQueue)
        self.assertEqual(worker.queue_class, CustomQueue)

    def test_custom_queue_class_is_not_global(self):
        """Ensure Worker custom queue class is not global."""
        q = CustomQueue()
        worker_custom = Worker([q], queue_class=CustomQueue)
        q_generic = Queue()
        worker_generic = Worker([q_generic])
        self.assertEqual(worker_custom.queue_class, CustomQueue)
        self.assertEqual(worker_generic.queue_class, Queue)
        self.assertEqual(Worker.queue_class, Queue)

    def test_custom_job_class_is_not_global(self):
        """Ensure Worker custom job class is not global."""
        q = Queue()
        worker_custom = Worker([q], job_class=CustomJob)
        q_generic = Queue()
        worker_generic = Worker([q_generic])
        self.assertEqual(worker_custom.job_class, CustomJob)
        self.assertEqual(worker_generic.job_class, Job)
        self.assertEqual(Worker.job_class, Job)

    def test_work_via_simpleworker(self):
        """Worker processes work, with forking disabled,
        then returns."""
        fooq, barq = Queue('foo'), Queue('bar')
        w = SimpleWorker([fooq, barq])
        self.assertEqual(w.work(burst=True), False,
                         'Did not expect any work on the queue.')

        job = fooq.enqueue(say_pid)
        self.assertEqual(w.work(burst=True), True,
                         'Expected at least some work done.')
        self.assertEqual(job.result, os.getpid(),
                         'PID mismatch, fork() is not supposed to happen here')

    def test_simpleworker_heartbeat_ttl(self):
        """SimpleWorker's key must last longer than job.timeout when working"""
        queue = Queue('foo')

        worker = SimpleWorker([queue])
        job_timeout = 300
        job = queue.enqueue(save_key_ttl, worker.key, job_timeout=job_timeout)
        worker.work(burst=True)
        job.refresh()
        self.assertGreater(job.meta['ttl'], job_timeout)

    def test_prepare_job_execution(self):
        """Prepare job execution does the necessary bookkeeping."""
        queue = Queue(connection=self.testconn)
        job = queue.enqueue(say_hello)
        worker = Worker([queue])
        worker.prepare_job_execution(job)

        # Updates working queue
        registry = StartedJobRegistry(connection=self.testconn)
        self.assertEqual(registry.get_job_ids(), [job.id])

        # Updates worker statuses
        self.assertEqual(worker.get_state(), 'busy')
        self.assertEqual(worker.get_current_job_id(), job.id)

    def test_work_unicode_friendly(self):
        """Worker processes work with unicode description, then quits."""
        q = Queue('foo')
        w = Worker([q])
        job = q.enqueue('tests.fixtures.say_hello', name='Adam',
                        description='你好 世界!')
        self.assertEqual(w.work(burst=True), True,
                         'Expected at least some work done.')
        self.assertEqual(job.result, 'Hi there, Adam!')
        self.assertEqual(job.description, '你好 世界!')

    def test_work_log_unicode_friendly(self):
        """Worker process work with unicode or str other than pure ascii content,
        logging work properly"""
        q = Queue("foo")
        w = Worker([q])

        job = q.enqueue('tests.fixtures.say_hello', name='阿达姆',
                        description='你好 世界!')
        w.work(burst=True)
        self.assertEqual(job.get_status(), JobStatus.FINISHED)

        job = q.enqueue('tests.fixtures.say_hello_unicode', name='阿达姆',
                        description='你好 世界!')
        w.work(burst=True)
        self.assertEqual(job.get_status(), JobStatus.FINISHED)

    def test_suspend_worker_execution(self):
        """Test Pause Worker Execution"""

        SENTINEL_FILE = '/tmp/rq-tests.txt'  # noqa

        try:
            # Remove the sentinel if it is leftover from a previous test run
            os.remove(SENTINEL_FILE)
        except OSError as e:
            if e.errno != 2:
                raise

        q = Queue()
        q.enqueue(create_file, SENTINEL_FILE)

        w = Worker([q])

        suspend(self.testconn)

        w.work(burst=True)
        assert q.count == 1

        # Should not have created evidence of execution
        self.assertEqual(os.path.exists(SENTINEL_FILE), False)

        resume(self.testconn)
        w.work(burst=True)
        assert q.count == 0
        self.assertEqual(os.path.exists(SENTINEL_FILE), True)

    @slow
    def test_suspend_with_duration(self):
        q = Queue()
        for _ in range(5):
            q.enqueue(do_nothing)

        w = Worker([q])

        # This suspends workers for working for 2 second
        suspend(self.testconn, 2)

        # So when this burst of work happens the queue should remain at 5
        w.work(burst=True)
        assert q.count == 5

        sleep(3)

        # The suspension should be expired now, and a burst of work should now clear the queue
        w.work(burst=True)
        assert q.count == 0

    def test_worker_hash_(self):
        """Workers are hashed by their .name attribute"""
        q = Queue('foo')
        w1 = Worker([q], name="worker1")
        w2 = Worker([q], name="worker2")
        w3 = Worker([q], name="worker1")
        worker_set = set([w1, w2, w3])
        self.assertEqual(len(worker_set), 2)

    def test_worker_sets_birth(self):
        """Ensure worker correctly sets worker birth date."""
        q = Queue()
        w = Worker([q])

        w.register_birth()

        birth_date = w.birth_date
        self.assertIsNotNone(birth_date)
        self.assertEqual(type(birth_date).__name__, 'datetime')

    def test_worker_sets_death(self):
        """Ensure worker correctly sets worker death date."""
        q = Queue()
        w = Worker([q])

        w.register_death()

        death_date = w.death_date
        self.assertIsNotNone(death_date)
        self.assertIsInstance(death_date, datetime)

    def test_clean_queue_registries(self):
        """worker.clean_registries sets last_cleaned_at and cleans registries."""
        foo_queue = Queue('foo', connection=self.testconn)
        foo_registry = StartedJobRegistry('foo', connection=self.testconn)
        self.testconn.zadd(foo_registry.key, {'foo': 1})
        self.assertEqual(self.testconn.zcard(foo_registry.key), 1)

        bar_queue = Queue('bar', connection=self.testconn)
        bar_registry = StartedJobRegistry('bar', connection=self.testconn)
        self.testconn.zadd(bar_registry.key, {'bar': 1})
        self.assertEqual(self.testconn.zcard(bar_registry.key), 1)

        worker = Worker([foo_queue, bar_queue])
        self.assertEqual(worker.last_cleaned_at, None)
        worker.clean_registries()
        self.assertNotEqual(worker.last_cleaned_at, None)
        self.assertEqual(self.testconn.zcard(foo_registry.key), 0)
        self.assertEqual(self.testconn.zcard(bar_registry.key), 0)

        # worker.clean_registries() only runs once every 15 minutes
        # If we add another key, calling clean_registries() should do nothing
        self.testconn.zadd(bar_registry.key, {'bar': 1})
        worker.clean_registries()
        self.assertEqual(self.testconn.zcard(bar_registry.key), 1)

    def test_should_run_maintenance_tasks(self):
        """Workers should run maintenance tasks on startup and every hour."""
        queue = Queue(connection=self.testconn)
        worker = Worker(queue)
        self.assertTrue(worker.should_run_maintenance_tasks)

        worker.last_cleaned_at = utcnow()
        self.assertFalse(worker.should_run_maintenance_tasks)
        worker.last_cleaned_at = utcnow() - timedelta(seconds=3700)
        self.assertTrue(worker.should_run_maintenance_tasks)

    def test_worker_calls_clean_registries(self):
        """Worker calls clean_registries when run."""
        queue = Queue(connection=self.testconn)
        registry = StartedJobRegistry(connection=self.testconn)
        self.testconn.zadd(registry.key, {'foo': 1})

        worker = Worker(queue, connection=self.testconn)
        worker.work(burst=True)
        self.assertEqual(self.testconn.zcard(registry.key), 0)

    def test_job_dependency_race_condition(self):
        """Dependencies added while the job gets finished shouldn't get lost."""

        # This patches the enqueue_dependents to enqueue a new dependency AFTER
        # the original code was executed.
        orig_enqueue_dependents = Queue.enqueue_dependents

        def new_enqueue_dependents(self, job, *args, **kwargs):
            orig_enqueue_dependents(self, job, *args, **kwargs)
            if hasattr(Queue, '_add_enqueue') and Queue._add_enqueue is not None and Queue._add_enqueue.id == job.id:
                Queue._add_enqueue = None
                Queue().enqueue_call(say_hello, depends_on=job)

        Queue.enqueue_dependents = new_enqueue_dependents

        q = Queue()
        w = Worker([q])
        with mock.patch.object(Worker, 'execute_job', wraps=w.execute_job) as mocked:
            parent_job = q.enqueue(say_hello, result_ttl=0)
            Queue._add_enqueue = parent_job
            job = q.enqueue_call(say_hello, depends_on=parent_job)
            w.work(burst=True)
            job = Job.fetch(job.id)
            self.assertEqual(job.get_status(), JobStatus.FINISHED)

            # The created spy checks two issues:
            # * before the fix of #739, 2 of the 3 jobs where executed due
            #   to the race condition
            # * during the development another issue was fixed:
            #   due to a missing pipeline usage in Queue.enqueue_job, the job
            #   which was enqueued before the "rollback" was executed twice.
            #   So before that fix the call count was 4 instead of 3
            self.assertEqual(mocked.call_count, 3)

    def test_self_modification_persistence(self):
        """Make sure that any meta modification done by
        the job itself persists completely through the
        queue/worker/job stack."""
        q = Queue()
        # Also make sure that previously existing metadata
        # persists properly
        job = q.enqueue(modify_self, meta={'foo': 'bar', 'baz': 42},
                        args=[{'baz': 10, 'newinfo': 'waka'}])

        w = Worker([q])
        w.work(burst=True)

        job_check = Job.fetch(job.id)
        self.assertEqual(set(job_check.meta.keys()),
                         set(['foo', 'baz', 'newinfo']))
        self.assertEqual(job_check.meta['foo'], 'bar')
        self.assertEqual(job_check.meta['baz'], 10)
        self.assertEqual(job_check.meta['newinfo'], 'waka')

    def test_self_modification_persistence_with_error(self):
        """Make sure that any meta modification done by
        the job itself persists completely through the
        queue/worker/job stack -- even if the job errored"""
        q = Queue()
        # Also make sure that previously existing metadata
        # persists properly
        job = q.enqueue(modify_self_and_error, meta={'foo': 'bar', 'baz': 42},
                        args=[{'baz': 10, 'newinfo': 'waka'}])

        w = Worker([q])
        w.work(burst=True)

        # Postconditions
        self.assertEqual(q.count, 0)
        failed_job_registry = FailedJobRegistry(queue=q)
        self.assertTrue(job in failed_job_registry)
        self.assertEqual(w.get_current_job_id(), None)

        job_check = Job.fetch(job.id)
        self.assertEqual(set(job_check.meta.keys()),
                         set(['foo', 'baz', 'newinfo']))
        self.assertEqual(job_check.meta['foo'], 'bar')
        self.assertEqual(job_check.meta['baz'], 10)
        self.assertEqual(job_check.meta['newinfo'], 'waka')

    @mock.patch('rq.worker.logger.info')
    def test_log_result_lifespan_true(self, mock_logger_info):
        """Check that log_result_lifespan True causes job lifespan to be logged."""
        q = Queue()

        w = Worker([q])
        job = q.enqueue(say_hello, args=('Frank',), result_ttl=10)
        w.perform_job(job, q)
        mock_logger_info.assert_called_with('Result is kept for %s seconds', 10)
        self.assertIn('Result is kept for %s seconds', [c[0][0] for c in mock_logger_info.call_args_list])

    @mock.patch('rq.worker.logger.info')
    def test_log_result_lifespan_false(self, mock_logger_info):
        """Check that log_result_lifespan False causes job lifespan to not be logged."""
        q = Queue()

        class TestWorker(Worker):
            log_result_lifespan = False

        w = TestWorker([q])
        job = q.enqueue(say_hello, args=('Frank',), result_ttl=10)
        w.perform_job(job, q)
        self.assertNotIn('Result is kept for 10 seconds', [c[0][0] for c in mock_logger_info.call_args_list])

    @mock.patch('rq.worker.logger.info')
    def test_log_job_description_true(self, mock_logger_info):
        """Check that log_job_description True causes job lifespan to be logged."""
        q = Queue()
        w = Worker([q])
        job = q.enqueue(say_hello, args=('Frank',), result_ttl=10)
        w.dequeue_job_and_maintain_ttl(10)
        self.assertIn("Frank",  mock_logger_info.call_args[0][2])

    @mock.patch('rq.worker.logger.info')
    def test_log_job_description_false(self, mock_logger_info):
        """Check that log_job_description False causes job lifespan to not be logged."""
        q = Queue()
        w = Worker([q], log_job_description=False)
        job = q.enqueue(say_hello, args=('Frank',), result_ttl=10)
        w.dequeue_job_and_maintain_ttl(10)
        self.assertNotIn("Frank", mock_logger_info.call_args[0][2])


def kill_worker(pid, double_kill):
    # wait for the worker to be started over on the main process
    time.sleep(0.5)
    os.kill(pid, signal.SIGTERM)
    if double_kill:
        # give the worker time to switch signal handler
        time.sleep(0.5)
        os.kill(pid, signal.SIGTERM)


def wait_and_kill_work_horse(pid, time_to_wait=0.0):
    time.sleep(time_to_wait)
    os.kill(pid, signal.SIGKILL)


class TimeoutTestCase:
    def setUp(self):
        # we want tests to fail if signal are ignored and the work remain
        # running, so set a signal to kill them after X seconds
        self.killtimeout = 15
        signal.signal(signal.SIGALRM, self._timeout)
        signal.alarm(self.killtimeout)

    def _timeout(self, signal, frame):
        raise AssertionError(
            "test still running after %i seconds, likely the worker wasn't shutdown correctly" % self.killtimeout
        )


class WorkerShutdownTestCase(TimeoutTestCase, RQTestCase):
    @slow
    def test_idle_worker_warm_shutdown(self):
        """worker with no ongoing job receiving single SIGTERM signal and shutting down"""
        w = Worker('foo')
        self.assertFalse(w._stop_requested)
        p = Process(target=kill_worker, args=(os.getpid(), False))
        p.start()

        w.work()

        p.join(1)
        self.assertFalse(w._stop_requested)

    @slow
    def test_working_worker_warm_shutdown(self):
        """worker with an ongoing job receiving single SIGTERM signal, allowing job to finish then shutting down"""
        fooq = Queue('foo')
        w = Worker(fooq)

        sentinel_file = '/tmp/.rq_sentinel_warm'
        fooq.enqueue(create_file_after_timeout, sentinel_file, 2)
        self.assertFalse(w._stop_requested)
        p = Process(target=kill_worker, args=(os.getpid(), False))
        p.start()

        w.work()

        p.join(2)
        self.assertFalse(p.is_alive())
        self.assertTrue(w._stop_requested)
        self.assertTrue(os.path.exists(sentinel_file))

        self.assertIsNotNone(w.shutdown_requested_date)
        self.assertEqual(type(w.shutdown_requested_date).__name__, 'datetime')

    @slow
    def test_working_worker_cold_shutdown(self):
        """Busy worker shuts down immediately on double SIGTERM signal"""
        fooq = Queue('foo')
        w = Worker(fooq)
        sentinel_file = '/tmp/.rq_sentinel_cold'
        fooq.enqueue(create_file_after_timeout, sentinel_file, 2)
        self.assertFalse(w._stop_requested)
        p = Process(target=kill_worker, args=(os.getpid(), True))
        p.start()

        self.assertRaises(SystemExit, w.work)

        p.join(1)
        self.assertTrue(w._stop_requested)
        self.assertFalse(os.path.exists(sentinel_file))

        shutdown_requested_date = w.shutdown_requested_date
        self.assertIsNotNone(shutdown_requested_date)
        self.assertEqual(type(shutdown_requested_date).__name__, 'datetime')

    @slow
    def test_work_horse_death_sets_job_failed(self):
        """worker with an ongoing job whose work horse dies unexpectadly (before
        completing the job) should set the job's status to FAILED
        """
        fooq = Queue('foo')
        self.assertEqual(fooq.count, 0)
        w = Worker(fooq)
        sentinel_file = '/tmp/.rq_sentinel_work_horse_death'
        if os.path.exists(sentinel_file):
            os.remove(sentinel_file)
        fooq.enqueue(create_file_after_timeout, sentinel_file, 100)
        job, queue = w.dequeue_job_and_maintain_ttl(5)
        w.fork_work_horse(job, queue)
        p = Process(target=wait_and_kill_work_horse, args=(w._horse_pid, 0.5))
        p.start()
        w.monitor_work_horse(job)
        job_status = job.get_status()
        p.join(1)
        self.assertEqual(job_status, JobStatus.FAILED)
        failed_job_registry = FailedJobRegistry(queue=fooq)
        self.assertTrue(job in failed_job_registry)
        self.assertEqual(fooq.count, 0)


def schedule_access_self():
    q = Queue('default', connection=get_current_connection())
    q.enqueue(access_self)


@pytest.mark.skipif(sys.platform == 'darwin', reason='Fails on OS X')
class TestWorkerSubprocess(RQTestCase):
    def setUp(self):
        super(TestWorkerSubprocess, self).setUp()
        db_num = self.testconn.connection_pool.connection_kwargs['db']
        self.redis_url = 'redis://127.0.0.1:6379/%d' % db_num

    def test_run_empty_queue(self):
        """Run the worker in its own process with an empty queue"""
        subprocess.check_call(['rqworker', '-u', self.redis_url, '-b'])

    def test_run_access_self(self):
        """Schedule a job, then run the worker as subprocess"""
        q = Queue()
        job = q.enqueue(access_self)
        subprocess.check_call(['rqworker', '-u', self.redis_url, '-b'])
        registry = FinishedJobRegistry(queue=q)
        self.assertTrue(job in registry)
        assert q.count == 0

    @skipIf('pypy' in sys.version.lower(), 'often times out with pypy')
    def test_run_scheduled_access_self(self):
        """Schedule a job that schedules a job, then run the worker as subprocess"""
        q = Queue()
        job = q.enqueue(schedule_access_self)
        subprocess.check_call(['rqworker', '-u', self.redis_url, '-b'])
        registry = FinishedJobRegistry(queue=q)
        self.assertTrue(job in registry)
        assert q.count == 0


@pytest.mark.skipif(sys.platform == 'darwin', reason='requires Linux signals')
@skipIf('pypy' in sys.version.lower(), 'these tests often fail on pypy')
class HerokuWorkerShutdownTestCase(TimeoutTestCase, RQTestCase):
    def setUp(self):
        super(HerokuWorkerShutdownTestCase, self).setUp()
        self.sandbox = '/tmp/rq_shutdown/'
        os.makedirs(self.sandbox)

    def tearDown(self):
        shutil.rmtree(self.sandbox, ignore_errors=True)

    @slow
    def test_immediate_shutdown(self):
        """Heroku work horse shutdown with immediate (0 second) kill"""
        p = Process(target=run_dummy_heroku_worker, args=(self.sandbox, 0))
        p.start()
        time.sleep(0.5)

        os.kill(p.pid, signal.SIGRTMIN)

        p.join(2)
        self.assertEqual(p.exitcode, 1)
        self.assertTrue(os.path.exists(os.path.join(self.sandbox, 'started')))
        self.assertFalse(os.path.exists(os.path.join(self.sandbox, 'finished')))
        with open(os.path.join(self.sandbox, 'stderr.log')) as f:
            stderr = f.read().strip('\\n')
            err = 'ShutDownImminentException: shut down imminent (signal: SIGRTMIN)'
            self.assertTrue(stderr.endswith(err), stderr)

    @slow
    def test_1_sec_shutdown(self):
        """Heroku work horse shutdown with 1 second kill"""
        p = Process(target=run_dummy_heroku_worker, args=(self.sandbox, 1))
        p.start()
        time.sleep(0.5)

        os.kill(p.pid, signal.SIGRTMIN)
        time.sleep(0.1)
        self.assertEqual(p.exitcode, None)
        p.join(2)
        self.assertEqual(p.exitcode, 1)

        self.assertTrue(os.path.exists(os.path.join(self.sandbox, 'started')))
        self.assertFalse(os.path.exists(os.path.join(self.sandbox, 'finished')))
        with open(os.path.join(self.sandbox, 'stderr.log')) as f:
            stderr = f.read().strip('\\n')
            err = 'ShutDownImminentException: shut down imminent (signal: SIGALRM)'
            self.assertTrue(stderr.endswith(err), stderr)

    @slow
    def test_shutdown_double_sigrtmin(self):
        """Heroku work horse shutdown with long delay but SIGRTMIN sent twice"""
        p = Process(target=run_dummy_heroku_worker, args=(self.sandbox, 10))
        p.start()
        time.sleep(0.5)

        os.kill(p.pid, signal.SIGRTMIN)
        # we have to wait a short while otherwise the second signal wont bet processed.
        time.sleep(0.1)
        os.kill(p.pid, signal.SIGRTMIN)
        p.join(2)
        self.assertEqual(p.exitcode, 1)

        self.assertTrue(os.path.exists(os.path.join(self.sandbox, 'started')))
        self.assertFalse(os.path.exists(os.path.join(self.sandbox, 'finished')))
        with open(os.path.join(self.sandbox, 'stderr.log')) as f:
            stderr = f.read().strip('\\n')
            err = 'ShutDownImminentException: shut down imminent (signal: SIGRTMIN)'
            self.assertTrue(stderr.endswith(err), stderr)

    def test_handle_shutdown_request(self):
        """Mutate HerokuWorker so _horse_pid refers to an artificial process
        and test handle_warm_shutdown_request"""
        w = HerokuWorker('foo')

        path = os.path.join(self.sandbox, 'shouldnt_exist')
        p = Process(target=create_file_after_timeout, args=(path, 2))
        p.start()
        self.assertEqual(p.exitcode, None)

        w._horse_pid = p.pid
        w.handle_warm_shutdown_request()
        p.join(2)
        self.assertEqual(p.exitcode, -34)
        self.assertFalse(os.path.exists(path))

    def test_handle_shutdown_request_no_horse(self):
        """Mutate HerokuWorker so _horse_pid refers to non existent process
        and test handle_warm_shutdown_request"""
        w = HerokuWorker('foo')

        w._horse_pid = 19999
        w.handle_warm_shutdown_request()


class TestExceptionHandlerMessageEncoding(RQTestCase):

    def setUp(self):
        super(TestExceptionHandlerMessageEncoding, self).setUp()
        self.worker = Worker("foo")
        self.worker._exc_handlers = []
        # Mimic how exception info is actually passed forwards
        try:
            raise Exception(u"💪")
        except:
            self.exc_info = sys.exc_info()

    def test_handle_exception_handles_non_ascii_in_exception_message(self):
        """worker.handle_exception doesn't crash on non-ascii in exception message."""
        self.worker.handle_exception(Mock(), *self.exc_info)
`

fileContents['tests/test_worker_registration.py'] = `from tests import RQTestCase

from rq import Queue, Worker
from rq.worker_registration import (clean_worker_registry, get_keys, register,
                                    unregister, REDIS_WORKER_KEYS,
                                    WORKERS_BY_QUEUE_KEY)


class TestWorkerRegistry(RQTestCase):

    def test_worker_registration(self):
        """Ensure worker.key is correctly set in Redis."""
        foo_queue = Queue(name='foo')
        bar_queue = Queue(name='bar')
        worker = Worker([foo_queue, bar_queue])

        register(worker)
        redis = worker.connection

        self.assertTrue(redis.sismember(worker.redis_workers_keys, worker.key))
        self.assertEqual(Worker.count(connection=redis), 1)
        self.assertTrue(
            redis.sismember(WORKERS_BY_QUEUE_KEY % foo_queue.name, worker.key)
        )
        self.assertEqual(Worker.count(queue=foo_queue), 1)
        self.assertTrue(
            redis.sismember(WORKERS_BY_QUEUE_KEY % bar_queue.name, worker.key)
        )
        self.assertEqual(Worker.count(queue=bar_queue), 1)

        unregister(worker)
        self.assertFalse(redis.sismember(worker.redis_workers_keys, worker.key))
        self.assertFalse(
            redis.sismember(WORKERS_BY_QUEUE_KEY % foo_queue.name, worker.key)
        )
        self.assertFalse(
            redis.sismember(WORKERS_BY_QUEUE_KEY % bar_queue.name, worker.key)
        )

    def test_get_keys_by_queue(self):
        """get_keys_by_queue only returns active workers for that queue"""
        foo_queue = Queue(name='foo')
        bar_queue = Queue(name='bar')
        baz_queue = Queue(name='baz')

        worker1 = Worker([foo_queue, bar_queue])
        worker2 = Worker([foo_queue])
        worker3 = Worker([baz_queue])

        self.assertEqual(set(), get_keys(foo_queue))

        register(worker1)
        register(worker2)
        register(worker3)

        # get_keys(queue) will return worker keys for that queue
        self.assertEqual(
            set([worker1.key, worker2.key]),
            get_keys(foo_queue)
        )
        self.assertEqual(set([worker1.key]), get_keys(bar_queue))

        # get_keys(connection=connection) will return all worker keys
        self.assertEqual(
            set([worker1.key, worker2.key, worker3.key]),
            get_keys(connection=worker1.connection)
        )

        # Calling get_keys without arguments raises an exception
        self.assertRaises(ValueError, get_keys)

        unregister(worker1)
        unregister(worker2)
        unregister(worker3)

    def test_clean_registry(self):
        """clean_registry removes worker keys that don't exist in Redis"""
        queue = Queue(name='foo')
        worker = Worker([queue])

        register(worker)
        redis = worker.connection

        self.assertTrue(redis.sismember(worker.redis_workers_keys, worker.key))
        self.assertTrue(redis.sismember(REDIS_WORKER_KEYS, worker.key))

        clean_worker_registry(queue)
        self.assertFalse(redis.sismember(worker.redis_workers_keys, worker.key))
        self.assertFalse(redis.sismember(REDIS_WORKER_KEYS, worker.key))
`

fileContents['docs/CNAME'] = `python-rq.org
`

fileContents['docs/_config.yml'] = `baseurl: /
exclude: design
permalink: pretty

navigation:
- text: Home
  url: /
- text: Docs
  url: /docs/
  subs:
  - text: Queues
    url: /docs/
  - text: Workers
    url: /docs/workers/
  - text: Results
    url: /docs/results/
  - text: Jobs
    url: /docs/jobs/
  - text: Monitoring
    url: /docs/monitoring/
  - text: Connections
    url: /docs/connections/
  - text: Exceptions
    url: /docs/exceptions/
  - text: Testing
    url: /docs/testing/
- text: Patterns
  url: /patterns/
  subs:
  - text: Heroku
    url: /patterns/
  - text: Django
    url: /patterns/django/
  - text: Sentry
    url: /patterns/sentry/
  - text: Supervisor
    url: /patterns/supervisor/
- text: Contributing
  url: /contrib/
  subs:
  - text: Internals
    url: /contrib/
  - text: GitHub
    url: /contrib/github/
  - text: Documentation
    url: /contrib/docs/
  - text: Testing
    url: /contrib/testing/
  - text: Vagrant
    url: /contrib/vagrant/
`

fileContents['docs/_includes/forward.html'] = `<script type="text/javascript">
    // Auto-forward for incoming links on nvie.com
    if ("nvie.com" === document.location.hostname) {
        document.location = 'http://python-rq.org';
    }
</script>
`

fileContents['docs/_includes/ga_tracking.html'] = `<script type="text/javascript">

  var _gaq = _gaq || [];
  _gaq.push(['_setAccount', 'UA-27167945-1']);
  _gaq.push(['_trackPageview']);

  (function() {
    var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
    ga.src = ('https:' == document.location.protocol ? 'https://ssl' : 'http://www') + '.google-analytics.com/ga.js';
    var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
  })();

</script>

<script src="https://cdnjs.cloudflare.com/ajax/libs/anchor-js/4.2.0/anchor.min.js"></script>
<script>
document.addEventListener("DOMContentLoaded", function(event) {
  anchors.add();
});
</script>
`

fileContents['docs/_layouts/contrib.html'] = `---
layout: default
---
<div class="subnav">
    <ul class="inline">
    {% for link in site.navigation %}
        {% if link.url == "contrib/" %}
            {% for sublink in link.subs %}
                <li><a href="{{ sublink.url }}">{{ sublink.text }}</a></li>
            {% endfor %}
        {% endif %}
    {% endfor %}
    </ul>
</div>

{{ content }}
`

fileContents['docs/_layouts/default.html'] = `<!DOCTYPE html>
<base href="{{ site.baseurl }}" />
<html lang="en">
  <head>
    <meta charset="UTF-8">
    <title>{{ page.title }}</title>
    <meta content="width=600" name="viewport">
    <meta content="all" name="robots">
    <link href="http://fonts.googleapis.com/css?family=Lato:light,regular,regularitalic,lightitalic,bold&amp;v1" media="all" rel="stylesheet" type="text/css">
    <link href='http://fonts.googleapis.com/css?family=Droid+Sans+Mono' media="all" rel='stylesheet' type='text/css'>
    <link href="/css/screen.css" media="screen" rel="stylesheet" type="text/css">
    <link href="/css/syntax.css" media="screen" rel="stylesheet" type="text/css">
    <link href="/favicon.png" rel="icon" type="image/png">
  </head>
  <body>
    <header>
        <a href="http://git.io/rq"><img class="nomargin" style="position: absolute; top: 0; right: 0; border: 0;" src="https://s3.amazonaws.com/github/ribbons/forkme_right_orange_ff7600.png" alt="Fork me on GitHub"></a>

        <ul class="inline">
        {% for link in site.navigation %}
            <li><a href="{{ link.url }}">{{ link.text }}</a></li>
        {% endfor %}
        </ul>
    </header>

    <section class="container">
      {{ content }}
    </section>

    <footer>
        <p>RQ is written by <a href="http://nvie.com/about">Vincent Driessen</a>.</p>
        <p>It is open sourced under the terms of the <a href="https://raw.github.com/nvie/rq/master/LICENSE">BSD license</a>.</p>
    </footer>

    {% include forward.html %}
    {% include ga_tracking.html %}
  </body>
</html>
`

fileContents['docs/_layouts/docs.html'] = `---
layout: default
---
<div class="subnav">
    <ul class="inline">
    {% for link in site.navigation %}
        {% if link.url == "/docs/" %}
            {% for sublink in link.subs %}
                <li><a href="{{ sublink.url }}">{{ sublink.text }}</a></li>
            {% endfor %}
        {% endif %}
    {% endfor %}
    </ul>
</div>

{{ content }}
`

fileContents['docs/_layouts/patterns.html'] = `---
layout: default
---
<div class="subnav">
    <ul class="inline">
    {% for link in site.navigation %}
        {% if link.url == "/patterns/" %}
            {% for sublink in link.subs %}
                <li><a href="{{ sublink.url }}">{{ sublink.text }}</a></li>
            {% endfor %}
        {% endif %}
    {% endfor %}
    </ul>
</div>

{{ content }}
`

fileContents['docs/contrib/docs.md'] = `---
title: "Documentation"
layout: contrib
---

### Running docs locally

To build the docs, run [jekyll](http://jekyllrb.com/):

\`\`\`
jekyll serve
\`\`\`

If you rather use Vagrant, see [these instructions][v].

[v]: {{site.baseurl}}contrib/vagrant/
`

fileContents['docs/contrib/github.md'] = `---
title: "Contributing to RQ"
layout: contrib
---

If you'd like to contribute to RQ, simply [fork](https://github.com/nvie/rq)
the project on GitHub and submit a pull request.

Please bear in mind the philosiphy behind RQ: it should rather remain small and
simple, than packed with features.  And it should value insightfulness over
performance.
`

fileContents['docs/contrib/index.md'] = `---
title: "RQ: Simple job queues for Python"
layout: contrib
---

This document describes how RQ works internally when enqueuing or dequeueing.


## Enqueueing internals

Whenever a function call gets enqueued, RQ does two things:

* It creates a job instance representing the delayed function call and persists
  it in a Redis [hash][h]; and
* It pushes the given job's ID onto the requested Redis queue.

All jobs are stored in Redis under the \`rq:job:\` prefix, for example:

    rq:job:55528e58-9cac-4e05-b444-8eded32e76a1

The keys of such a job [hash][h] are:

    created_at  => '2012-02-13 14:35:16+0000'
    enqueued_at => '2012-02-13 14:35:16+0000'
    origin      => 'default'
    data        => <pickled representation of the function call>
    description => "count_words_at_url('http://nvie.com')"

Depending on whether or not the job has run successfully or has failed, the
following keys are available, too:

    ended_at    => '2012-02-13 14:41:33+0000'
    result      => <pickled return value>
    exc_info    => <exception information>

[h]: http://redis.io/topics/data-types#hashes


## Dequeueing internals

Whenever a dequeue is requested, an RQ worker does two things:

* It pops a job ID from the queue, and fetches the job data belonging to that
  job ID;
* It starts executing the function call.
* If the job succeeds, its return value is written to the \`result\` hash key and
  the hash itself is expired after 500 seconds; or
* If the job failes, the exception information is written to the \`exc_info\`
  hash key and the job ID is pushed onto the \`failed\` queue.


## Cancelling jobs

Any job ID that is encountered by a worker for which no job hash is found in
Redis is simply ignored.  This makes it easy to cancel jobs by simply removing
the job hash.  In Python:

    from rq import cancel_job
    cancel_job('2eafc1e6-48c2-464b-a0ff-88fd199d039c')

Note that it is irrelevant on which queue the job resides.  When a worker
eventually pops the job ID from the queue and notes that the Job hash does not
exist (anymore), it simply discards the job ID and continues with the next.
`

fileContents['docs/contrib/testing.md'] = `---
title: "Testing"
layout: contrib
---

### Testing RQ locally

To run tests locally;

\`\`\`
tox
\`\`\`

If you rather use Vagrant, see [these instructions][v].

[v]: {{site.baseurl}}contrib/vagrant/
`

fileContents['docs/contrib/vagrant.md'] = `---
title: "Using Vagrant"
layout: contrib
---

If you don't feel like installing dependencies on your main development
machine, you can use [Vagrant](https://www.vagrantup.com/).  Here's how you run
your tests and build the documentation on Vagrant.


### Running tests in Vagrant

To create a working Vagrant environment, use the following;

\`\`\`
vagrant init ubuntu/trusty64
vagrant up
vagrant ssh -- "sudo apt-get -y install redis-server python-dev python-pip"
vagrant ssh -- "sudo pip install --no-input redis hiredis mock"
vagrant ssh -- "(cd /vagrant; ./run_tests)"
\`\`\`


### Running docs on Vagrant

\`\`\`
vagrant init ubuntu/trusty64
vagrant up
vagrant ssh -- "sudo apt-get -y install ruby-dev nodejs"
vagrant ssh -- "sudo gem install jekyll"
vagrant ssh -- "(cd /vagrant; jekyll serve)"
\`\`\`

You'll also need to add a port forward entry to your \`Vagrantfile\`;

\`\`\`
config.vm.network "forwarded_port", guest: 4000, host: 4001
\`\`\`

Then you can access the docs using;

\`\`\`
http://127.0.0.1:4001
\`\`\`

You also may need to forcibly kill Jekyll if you ctrl+c;

\`\`\`
vagrant ssh -- "sudo killall -9 jekyll"
\`\`\`
`

fileContents['docs/css/reset.css'] = `/* http://meyerweb.com/eric/tools/css/reset/ 
   v2.0 | 20110126
   License: none (public domain)
*/

html, body, div, span, applet, object, iframe,
h1, h2, h3, h4, h5, h6, p, blockquote, pre,
a, abbr, acronym, address, big, cite, code,
del, dfn, em, img, ins, kbd, q, s, samp,
small, strike, strong, sub, sup, tt, var,
b, u, i, center,
dl, dt, dd, ol, ul, li,
fieldset, form, label, legend,
table, caption, tbody, tfoot, thead, tr, th, td,
article, aside, canvas, details, embed, 
figure, figcaption, footer, header, hgroup, 
menu, nav, output, ruby, section, summary,
time, mark, audio, video {
	margin: 0;
	padding: 0;
	border: 0;
	font-size: 100%;
	font: inherit;
	vertical-align: baseline;
}
/* HTML5 display-role reset for older browsers */
article, aside, details, figcaption, figure, 
footer, header, hgroup, menu, nav, section {
	display: block;
}
body {
	line-height: 1;
}
ol, ul {
	list-style: none;
}
blockquote, q {
	quotes: none;
}
blockquote:before, blockquote:after,
q:before, q:after {
	content: '';
	content: none;
}
table {
	border-collapse: collapse;
	border-spacing: 0;
}
`

fileContents['docs/css/screen.css'] = `@import url("reset.css");

html
{
    font-size: 62.5%;
    -webkit-text-size-adjust: 110%;
}

body
{
    background: #DBE0DF url(../img/bg.png) 50% 0 repeat-y !important;
    height: 100%;
    font-family: Lato, sans-serif;
    font-size: 150%;
    font-weight: 300;
    line-height: 1.55;
    padding: 0 30px 80px;
}

header
{
    background: url(../img/ribbon.png) no-repeat 50% 0;
    max-width: 430px;
    width: 100%;
    text-align: center;

    padding: 240px 0 1em 0;
    border-bottom: 1px dashed #e1e1e1;
    margin: 0 auto 2em auto;
}

ul.inline
{
    list-style-type: none;
    margin: 0;
    padding: 0;
}

ul.inline li
{
    display: inline;
    margin: 0 10px;
}

.subnav ul.inline li
{
    margin: 0 6px;
}

header a
{
    color: #3a3a3a;
    border: 0;
    font-size: 110%;
    font-weight: 600;
    text-decoration: none;
    transition: color linear 0.1s;
    -webkit-transition: color linear 0.1s;
    -moz-transition: color linear 0.1s;
}

header a:hover
{
    border-bottom-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.4);
}

.subnav
{
    text-align: center;
    font-size: 94%;
    margin: -3em auto 2em auto;
}

.subnav li
{
    background-color: white;
    padding: 0 4px;
}

.subnav a
{
    text-decoration: none;
}

.container
{
    margin: 0 auto;
    max-width: 430px;
    width: 100%;
}

footer
{
    margin: 2em auto;
    max-width: 430px;
    width: 100%;
    border-top: 1px dashed #e1e1e1;
    padding-top: 1em;
}

footer p
{
    text-align: center;
    font-size: 90%;
    font-style: italic;
    margin-bottom: 0;
}

footer a
{
    font-weight: 400;
}

pre, pre.highlight
{
    margin: 0 0 1em 1em;
    padding: 1em 1.8em;
    color: #222;
    border-bottom: 1px solid #ccc;
    border-right: 1px solid #ccc;
    background: #F3F3F0 url(../img/bq.png) top left no-repeat;
    line-height: 1.15em;
    overflow: auto;
}

code
{
    font-family: 'Droid Sans Mono', monospace;
    font-weight: 400;
    font-size: 80%;

    line-height: 0.5em;

    border: 1px solid #efeaea;
    padding: 0.2em 0.4em;
}

pre code
{
    border: none;
    padding: 0;
}

h1
{
    font-size: 280%;
    font-weight: 400;
}

.ir
{
    display: block;
    border: 0;
    text-indent: -999em;
    overflow: hidden;
    background-color: transparent;
    background-repeat: no-repeat;
    text-align: left;
    direction: ltr;
}

.ir br
{
    display: none;
}

h1#logo
{
    margin: 0 auto;
    width: 305px;
    height: 186px;
    background-image: url(../img/logo2.png);
}

/*
h1:hover:after
{
    color: rgba(0, 0, 0, 0.3);
    content: attr(title);
    font-size: 60%;
    font-weight: 300;
    margin: 0 0 0 0.5em;
}
*/

h2
{
    font-size: 200%;
    font-weight: 400;
    margin: 0 0 0.4em;
}

h3
{
    font-size: 135%;
    font-weight: 400;
    margin: 0 0 0.25em;
}

p
{
    color: rgba(0, 0, 0, 0.7);
    margin: 0 0 1em;
}

p:last-child
{
    margin-bottom: 0;
}

img
{
    border-radius: 4px;
    float: left;
    margin: 6px 12px 15px 0;
    -moz-border-radius: 4px;
    -webkit-border-radius: 4px;
}

.nomargin
{
    margin: 0;
}

a
{
    border-bottom: 1px solid rgba(65, 131, 196, 0.1);
    color: rgb(65, 131, 196);
    font-weight: 600;
    text-decoration: none;
    transition: color linear 0.1s;
    -webkit-transition: color linear 0.1s;
    -moz-transition: color linear 0.1s;
}

a:hover
{
    border-bottom-color: rgba(0, 0, 0, 0.1);
    color: rgba(0, 0, 0, 0.4);
}

em
{
    font-style: italic;
}

strong
{
    font-weight: 600;
}

acronym
{
    border-bottom: 1px dotted rgba(0, 0, 0, 0.1);
    cursor: help;
}

blockquote
{
    font-style: italic;
    padding: 1em;
}

ul
{
    list-style: circle;
    margin: 0 0 1em 2em;
    color: rgba(0, 0, 0, 0.7);
}

li
{
    font-size: 100%;
}

ol
{
    list-style-type: decimal;
    margin: 0 0 1em 2em;
    color: rgba(0, 0, 0, 0.7);
}

li
{
    font-size: 100%;
}

.warning
{
  position: relative;
  padding: 7px 15px;
  margin-bottom: 18px;
  color: #404040;
  background-color: #eedc94;
  background-repeat: repeat-x;
  background-image: -khtml-gradient(linear, left top, left bottom, from(#fceec1), to(#eedc94));
  background-image: -moz-linear-gradient(top, #fceec1, #eedc94);
  background-image: -ms-linear-gradient(top, #fceec1, #eedc94);
  background-image: -webkit-gradient(linear, left top, left bottom, color-stop(0%, #fceec1), color-stop(100%, #eedc94));
  background-image: -webkit-linear-gradient(top, #fceec1, #eedc94);
  background-image: -o-linear-gradient(top, #fceec1, #eedc94);
  background-image: linear-gradient(top, #fceec1, #eedc94);
  filter: progid:DXImageTransform.Microsoft.gradient(startColorstr='#fceec1', endColorstr='#eedc94', GradientType=0);
  text-shadow: 0 -1px 0 rgba(0, 0, 0, 0.25);
  border-color: #eedc94 #eedc94 #e4c652;
  border-color: rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.1) rgba(0, 0, 0, 0.25);
  text-shadow: 0 1px 0 rgba(255, 255, 255, 0.5);
  border-width: 1px;
  border-style: solid;
  -webkit-border-radius: 4px;
  -moz-border-radius: 4px;
  border-radius: 4px;
  -webkit-box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
  -moz-box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.25);
}

.warning p
{
}

.alert-message .close {
  *margin-top: 3px;
  /* IE7 spacing */

}

/*
@media screen and (max-width: 1400px)
{
    body
    {
        padding-bottom: 60px;
        padding-top: 60px;
    }
}

@media screen and (max-width: 600px)
{
    body
    {
        padding-bottom: 40px;
        padding-top: 30px;
    }
}
*/
`

fileContents['docs/css/syntax.css'] = `.highlight  { background: #ffffff; }
.highlight .c { color: #999988; } /* Comment */
.highlight .err { color: #a61717; background-color: #e3d2d2 } /* Error */
.highlight .k { font-weight: bold; color: #555555; } /* Keyword */
.highlight .kn { font-weight: bold; color: #555555; } /* Keyword */
.highlight .o { font-weight: bold; color: #555555; } /* Operator */
.highlight .cm { color: #999988; } /* Comment.Multiline */
.highlight .cp { color: #999999; font-weight: bold } /* Comment.Preproc */
.highlight .c1 { color: #999988; } /* Comment.Single */
.highlight .cs { color: #999999; font-weight: bold; } /* Comment.Special */
.highlight .gd { color: #000000; background-color: #ffdddd } /* Generic.Deleted */
.highlight .gd .x { color: #000000; background-color: #ffaaaa } /* Generic.Deleted.Specific */
.highlight .ge {} /* Generic.Emph */
.highlight .gr { color: #aa0000 } /* Generic.Error */
.highlight .gh { color: #999999 } /* Generic.Heading */
.highlight .gi { color: #000000; background-color: #ddffdd } /* Generic.Inserted */
.highlight .gi .x { color: #000000; background-color: #aaffaa } /* Generic.Inserted.Specific */
.highlight .go { color: #888888 } /* Generic.Output */
.highlight .gp { color: #555555 } /* Generic.Prompt */
.highlight .gs { font-weight: bold } /* Generic.Strong */
.highlight .gu { color: #aaaaaa } /* Generic.Subheading */
.highlight .gt { color: #aa0000 } /* Generic.Traceback */
.highlight .kc { font-weight: bold } /* Keyword.Constant */
.highlight .kd { font-weight: bold } /* Keyword.Declaration */
.highlight .kp { font-weight: bold } /* Keyword.Pseudo */
.highlight .kr { font-weight: bold } /* Keyword.Reserved */
.highlight .kt { color: #445588; font-weight: bold } /* Keyword.Type */
.highlight .m { color: #009999 } /* Literal.Number */
.highlight .s { color: #d14 } /* Literal.String */
.highlight .na { color: #008080 } /* Name.Attribute */
.highlight .nb { color: #0086B3 } /* Name.Builtin */
.highlight .nc { color: #445588; font-weight: bold } /* Name.Class */
.highlight .no { color: #008080 } /* Name.Constant */
.highlight .ni { color: #800080 } /* Name.Entity */
.highlight .ne { color: #aa0000; font-weight: bold } /* Name.Exception */
.highlight .nf { color: #aa0000; font-weight: bold } /* Name.Function */
.highlight .nn { color: #555555 } /* Name.Namespace */
.highlight .nt { color: #000080 } /* Name.Tag */
.highlight .nv { color: #008080 } /* Name.Variable */
.highlight .ow { font-weight: bold } /* Operator.Word */
.highlight .w { color: #bbbbbb } /* Text.Whitespace */
.highlight .mf { color: #009999 } /* Literal.Number.Float */
.highlight .mh { color: #009999 } /* Literal.Number.Hex */
.highlight .mi { color: #009999 } /* Literal.Number.Integer */
.highlight .mo { color: #009999 } /* Literal.Number.Oct */
.highlight .sb { color: #d14 } /* Literal.String.Backtick */
.highlight .sc { color: #d14 } /* Literal.String.Char */
.highlight .sd { color: #d14 } /* Literal.String.Doc */
.highlight .s2 { color: #d14 } /* Literal.String.Double */
.highlight .se { color: #d14 } /* Literal.String.Escape */
.highlight .sh { color: #d14 } /* Literal.String.Heredoc */
.highlight .si { color: #d14 } /* Literal.String.Interpol */
.highlight .sx { color: #d14 } /* Literal.String.Other */
.highlight .sr { color: #009926 } /* Literal.String.Regex */
.highlight .s1 { color: #d14 } /* Literal.String.Single */
.highlight .ss { color: #990073 } /* Literal.String.Symbol */
.highlight .bp { color: #999999 } /* Name.Builtin.Pseudo */
.highlight .vc { color: #008080 } /* Name.Variable.Class */
.highlight .vg { color: #008080 } /* Name.Variable.Global */
.highlight .vi { color: #008080 } /* Name.Variable.Instance */
.highlight .il { color: #009999 } /* Literal.Number.Integer.Long */
`

fileContents['docs/docs/connections.md'] = `---
title: "RQ: Connections"
layout: docs
---

Although RQ features the \`use_connection()\` command for convenience, it
is deprecated, since it pollutes the global namespace.  Instead, prefer explicit
connection management using the \`with Connection(...):\` context manager, or
pass in Redis connection references to queues directly.


## Single Redis connection (easy)

<div class="warning">
    <img style="float: right; margin-right: -60px; margin-top: -38px" src="/img/warning.png" />
    <strong>Note:</strong>
    <p>
        The use of <code>use_connection</code> is deprecated.
        Please don't use \`use_connection\` in your scripts.
        Instead, use explicit connection management.
    </p>
</div>

In development mode, to connect to a default, local Redis server:

\`\`\`python
from rq import use_connection
use_connection()
\`\`\`

In production, to connect to a specific Redis server:

\`\`\`python
from redis import Redis
from rq import use_connection

redis = Redis('my.host.org', 6789, password='secret')
use_connection(redis)
\`\`\`

Be aware of the fact that \`use_connection\` pollutes the global namespace.  It
also implies that you can only ever use a single connection.


## Multiple Redis connections

However, the single connection pattern facilitates only those cases where you
connect to a single Redis instance, and where you affect global context (by
replacing the existing connection with the \`use_connection()\` call).  You can
only use this pattern when you are in full control of your web stack.

In any other situation, or when you want to use multiple connections, you
should use \`Connection\` contexts or pass connections around explicitly.


### Explicit connections (precise, but tedious)

Each RQ object instance (queues, workers, jobs) has a \`connection\` keyword
argument that can be passed to the constructor.  Using this, you don't need to
use \`use_connection()\`.  Instead, you can create your queues like this:

\`\`\`python
from rq import Queue
from redis import Redis

conn1 = Redis('localhost', 6379)
conn2 = Redis('remote.host.org', 9836)

q1 = Queue('foo', connection=conn1)
q2 = Queue('bar', connection=conn2)
\`\`\`

Every job that is enqueued on a queue will know what connection it belongs to.
The same goes for the workers.

This approach is very precise, but rather verbose, and therefore, tedious.


### Connection contexts (precise and concise)

There is a better approach if you want to use multiple connections, though.
Each RQ object instance, upon creation, will use the topmost Redis connection
on the RQ connection stack, which is a mechanism to temporarily replace the
default connection to be used.

An example will help to understand it:

\`\`\`python
from rq import Queue, Connection
from redis import Redis

with Connection(Redis('localhost', 6379)):
    q1 = Queue('foo')
    with Connection(Redis('remote.host.org', 9836)):
        q2 = Queue('bar')
    q3 = Queue('qux')

assert q1.connection != q2.connection
assert q2.connection != q3.connection
assert q1.connection == q3.connection
\`\`\`

You can think of this as if, within the \`Connection\` context, every newly
created RQ object instance will have the \`connection\` argument set implicitly.
Enqueueing a job with \`q2\` will enqueue it in the second (remote) Redis
backend, even when outside of the connection context.


### Pushing/popping connections

If your code does not allow you to use a \`with\` statement, for example, if you
want to use this to set up a unit test, you can use the \`push_connection()\` and
\`pop_connection()\` methods instead of using the context manager.

\`\`\`python
import unittest
from rq import Queue
from rq import push_connection, pop_connection

class MyTest(unittest.TestCase):
    def setUp(self):
        push_connection(Redis())

    def tearDown(self):
        pop_connection()

    def test_foo(self):
        """Any queues created here use local Redis."""
        q = Queue()
\`\`\`

### Sentinel support

To use redis sentinel, you must specify a dictionary in the configuration file.
Using this setting in conjunction with the systemd or docker containers with the
automatic restart option allows workers and RQ to have a fault-tolerant connection to the redis.

\`\`\`python
SENTINEL: {'INSTANCES':[('remote.host1.org', 26379), ('remote.host2.org', 26379), ('remote.host3.org', 26379)],
           'SOCKET_TIMEOUT': None,
           'PASSWORD': 'secret',
           'DB': 2,
           'MASTER_NAME': 'master'}
\`\`\`
`

fileContents['docs/docs/exceptions.md'] = `---
title: "RQ: Exceptions"
layout: docs
---

Jobs can fail due to exceptions occurring.  When your RQ workers run in the
background, how do you get notified of these exceptions?

## Default: the \`FailedJobRegistry\`

The default safety net for RQ is the \`FailedJobRegistry\`. Every job that doesn't
execute successfully is stored here, along with its exception information (type,
value, traceback). While this makes sure no failing jobs "get lost", this is
of no use to get notified pro-actively about job failure.


## Custom Exception Handlers

RQ supports registering custom exception handlers. This makes it possible to
inject your own error handling logic to your workers.

This is how you register custom exception handler(s) to an RQ worker:

\`\`\`python
from exception_handlers import foo_handler, bar_handler

w = Worker([q], exception_handlers=[foo_handler, bar_handler])
\`\`\`

The handler itself is a function that takes the following parameters: \`job\`,
\`exc_type\`, \`exc_value\` and \`traceback\`:

\`\`\`python
def my_handler(job, exc_type, exc_value, traceback):
    # do custom things here
    # for example, write the exception info to a DB

\`\`\`

You might also see the three exception arguments encoded as:

\`\`\`python
def my_handler(job, *exc_info):
    # do custom things here
\`\`\`

{% highlight python %}
from exception_handlers import foo_handler

w = Worker([q], exception_handlers=[foo_handler],
           disable_default_exception_handler=True)
{% endhighlight %}


## Chaining Exception Handlers

The handler itself is responsible for deciding whether or not the exception
handling is done, or should fall through to the next handler on the stack.
The handler can indicate this by returning a boolean. \`False\` means stop
processing exceptions, \`True\` means continue and fall through to the next
exception handler on the stack.

It's important to know for implementors that, by default, when the handler
doesn't have an explicit return value (thus \`None\`), this will be interpreted
as \`True\` (i.e.  continue with the next handler).

To prevent the next exception handler in the handler chain from executing,
use a custom exception handler that doesn't fall through, for example:

\`\`\`python
def black_hole(job, *exc_info):
    return False
\`\`\`
`

fileContents['docs/docs/index.md'] = `---
title: "RQ: Documentation"
layout: docs
---

A _job_ is a Python object, representing a function that is invoked
asynchronously in a worker (background) process.  Any Python function can be
invoked asynchronously, by simply pushing a reference to the function and its
arguments onto a queue.  This is called _enqueueing_.


## Enqueueing jobs

To put jobs on queues, first declare a function:

\`\`\`python
import requests

def count_words_at_url(url):
    resp = requests.get(url)
    return len(resp.text.split())
\`\`\`

Noticed anything?  There's nothing special about this function!  Any Python
function call can be put on an RQ queue.

To put this potentially expensive word count for a given URL in the background,
simply do this:

\`\`\`python
from rq import Queue
from redis import Redis
from somewhere import count_words_at_url

# Tell RQ what Redis connection to use
redis_conn = Redis()
q = Queue(connection=redis_conn)  # no args implies the default queue

# Delay execution of count_words_at_url('http://nvie.com')
job = q.enqueue(count_words_at_url, 'http://nvie.com')
print(job.result)   # => None

# Now, wait a while, until the worker is finished
time.sleep(2)
print(job.result)   # => 889
\`\`\`

If you want to put the work on a specific queue, simply specify its name:

\`\`\`python
q = Queue('low', connection=redis_conn)
q.enqueue(count_words_at_url, 'http://nvie.com')
\`\`\`

Notice the \`Queue('low')\` in the example above?  You can use any queue name, so
you can quite flexibly distribute work to your own desire.  A common naming
pattern is to name your queues after priorities (e.g.  \`high\`, \`medium\`,
\`low\`).

In addition, you can add a few options to modify the behaviour of the queued
job. By default, these are popped out of the kwargs that will be passed to the
job function.

* \`job_timeout\` specifies the maximum runtime of the job before it's interrupted
    and marked as \`failed\`. Its default unit is second and it can be an integer or a string representing an integer(e.g.  \`2\`, \`'2'\`). Furthermore, it can be a string with specify unit including hour, minute, second(e.g. \`'1h'\`, \`'3m'\`, \`'5s'\`).
* \`result_ttl\` specifies the expiry time of the key where the job result will
  be stored
* \`ttl\` specifies the maximum queued time of the job before it'll be cancelled.
  If you specify a value of \`-1\` you indicate an infinite job ttl and it will run indefinitely
* \`depends_on\` specifies another job (or job id) that must complete before this
  job will be queued
* \`job_id\` allows you to manually specify this job's \`job_id\`
* \`at_front\` will place the job at the *front* of the queue, instead of the
  back
* \`description\` to add additional description to enqueued jobs.
* \`kwargs\` and \`args\` lets you bypass the auto-pop of these arguments, ie:
  specify a \`description\` argument for the underlying job function.

In the last case, it may be advantageous to instead use the explicit version of
\`.enqueue()\`, \`.enqueue_call()\`:

\`\`\`python
q = Queue('low', connection=redis_conn)
q.enqueue_call(func=count_words_at_url,
               args=('http://nvie.com',),
               job_timeout=30)
\`\`\`

For cases where the web process doesn't have access to the source code running
in the worker (i.e. code base X invokes a delayed function from code base Y),
you can pass the function as a string reference, too.

\`\`\`python
q = Queue('low', connection=redis_conn)
q.enqueue('my_package.my_module.my_func', 3, 4)
\`\`\`


## Working with Queues

Besides enqueuing jobs, Queues have a few useful methods:

\`\`\`python
from rq import Queue
from redis import Redis

redis_conn = Redis()
q = Queue(connection=redis_conn)

# Getting the number of jobs in the queue
print(len(q))

# Retrieving jobs
queued_job_ids = q.job_ids # Gets a list of job IDs from the queue
queued_jobs = q.jobs # Gets a list of enqueued job instances
job = q.fetch_job('my_id') # Returns job having ID "my_id"

# Deleting the queue
q.delete(delete_jobs=True) # Passing in \`True\` will remove all jobs in the queue
# queue is unusable now unless re-instantiated
\`\`\`


### On the Design

With RQ, you don't have to set up any queues upfront, and you don't have to
specify any channels, exchanges, routing rules, or whatnot.  You can just put
jobs onto any queue you want.  As soon as you enqueue a job to a queue that
does not exist yet, it is created on the fly.

RQ does _not_ use an advanced broker to do the message routing for you.  You
may consider this an awesome advantage or a handicap, depending on the problem
you're solving.

Lastly, it does not speak a portable protocol, since it depends on [pickle][p]
to serialize the jobs, so it's a Python-only system.


## The delayed result

When jobs get enqueued, the \`queue.enqueue()\` method returns a \`Job\` instance.
This is nothing more than a proxy object that can be used to check the outcome
of the actual job.

For this purpose, it has a convenience \`result\` accessor property, that
will return \`None\` when the job is not yet finished, or a non-\`None\` value when
the job has finished (assuming the job _has_ a return value in the first place,
of course).


## The \`@job\` decorator
If you're familiar with Celery, you might be used to its \`@task\` decorator.
Starting from RQ >= 0.3, there exists a similar decorator:

\`\`\`python
from rq.decorators import job

@job('low', connection=my_redis_conn, timeout=5)
def add(x, y):
    return x + y

job = add.delay(3, 4)
time.sleep(1)
print(job.result)
\`\`\`


## Bypassing workers

For testing purposes, you can enqueue jobs without delegating the actual
execution to a worker (available since version 0.3.1). To do this, pass the
\`is_async=False\` argument into the Queue constructor:

\`\`\`python
>>> q = Queue('low', is_async=False, connection=my_redis_conn)
>>> job = q.enqueue(fib, 8)
>>> job.result
21
\`\`\`

The above code runs without an active worker and executes \`fib(8)\`
synchronously within the same process. You may know this behaviour from Celery
as \`ALWAYS_EAGER\`. Note, however, that you still need a working connection to
a redis instance for storing states related to job execution and completion.


## Job dependencies

New in RQ 0.4.0 is the ability to chain the execution of multiple jobs.
To execute a job that depends on another job, use the \`depends_on\` argument:

\`\`\`python
q = Queue('low', connection=my_redis_conn)
report_job = q.enqueue(generate_report)
q.enqueue(send_report, depends_on=report_job)
\`\`\`

The ability to handle job dependencies allows you to split a big job into
several smaller ones. A job that is dependent on another is enqueued only when
its dependency finishes *successfully*.


## The worker

To learn about workers, see the [workers][w] documentation.

[w]: {{site.baseurl}}workers/


## Considerations for jobs

Technically, you can put any Python function call on a queue, but that does not
mean it's always wise to do so.  Some things to consider before putting a job
on a queue:

* Make sure that the function's \`__module__\` is importable by the worker.  In
  particular, this means that you cannot enqueue functions that are declared in
  the \`__main__\` module.
* Make sure that the worker and the work generator share _exactly_ the same
  source code.
* Make sure that the function call does not depend on its context.  In
  particular, global variables are evil (as always), but also _any_ state that
  the function depends on (for example a "current" user or "current" web
  request) is not there when the worker will process it.  If you want work done
  for the "current" user, you should resolve that user to a concrete instance
  and pass a reference to that user object to the job as an argument.


## Limitations

RQ workers will only run on systems that implement \`fork()\`.  Most notably,
this means it is not possible to run the workers on Windows without using the [Windows Subsystem for Linux](https://docs.microsoft.com/en-us/windows/wsl/about) and running in a bash shell.


[m]: http://pypi.python.org/pypi/mailer
[p]: http://docs.python.org/library/pickle.html
`

fileContents['docs/docs/jobs.md'] = `---
title: "RQ: Documentation"
layout: docs
---

For some use cases it might be useful have access to the current job ID or
instance from within the job function itself.  Or to store arbitrary data on
jobs.


## Retrieving Job from Redis

All job information is stored in Redis. You can inspect a job and its attributes
by using \`Job.fetch()\`.

\`\`\`python
from redis import Redis
from rq.job import Job

redis = Redis()
job = Job.fetch('my_job_id', connection=redis)
print('Status: %s' $ job.get_status())
\`\`\`

Some interesting job attributes include:
* \`job.status\`
* \`job.func_name\`
* \`job.args\`
* \`job.kwargs\`
* \`job.result\`
* \`job.enqueued_at\`
* \`job.started_at\`
* \`job.ended_at\`
* \`job.exc_info\`

## Accessing the "current" job

Since job functions are regular Python functions, you have to ask RQ for the
current job ID, if any.  To do this, you can use:

\`\`\`python
from rq import get_current_job

def add(x, y):
    job = get_current_job()
    print('Current job: %s' % (job.id,))
    return x + y
\`\`\`


## Storing arbitrary data on jobs

_Improved in 0.8.0._

To add/update custom status information on this job, you have access to the
\`meta\` property, which allows you to store arbitrary pickleable data on the job
itself:

\`\`\`python
import socket

def add(x, y):
    job = get_current_job()
    job.meta['handled_by'] = socket.gethostname()
    job.save_meta()

    # do more work
    time.sleep(1)
    return x + y
\`\`\`


## Time to live for job in queue

_New in version 0.4.7._

A job has two TTLs, one for the job result and one for the job itself. This means that if you have
job that shouldn't be executed after a certain amount of time, you can define a TTL as such:

\`\`\`python
# When creating the job:
job = Job.create(func=say_hello, ttl=43)

# or when queueing a new job:
job = q.enqueue(count_words_at_url, 'http://nvie.com', ttl=43)
\`\`\`


## Failed Jobs

If a job fails during execution, the worker will put the job in a FailedJobRegistry.
On the Job instance, the \`is_failed\` property will be true. FailedJobRegistry
can be accessed through \`queue.failed_job_registry\`.

\`\`\`python
from redis import StrictRedis
from rq import Queue
from rq.job import Job


def div_by_zero(x):
    return x / 0


connection = StrictRedis()
queue = Queue(connection=connection)
job = queue.enqueue(div_by_zero, 1)
registry = queue.failed_job_registry

worker = Worker([queue])
worker.work(burst=True)

assert len(registry) == 1  # Failed jobs are kept in FailedJobRegistry

registry.requeue(job)  # Puts job back in its original queue

assert len(registry) == 0

assert queue.count == 1
\`\`\`

By default, failed jobs are kept for 1 year. You can change this by specifying
\`failure_ttl\` (in seconds) when enqueueing jobs.

\`\`\`python
job = queue.enqueue(foo_job, failure_ttl=300)  # 5 minutes in seconds
\`\`\`

## Requeueing Failed Jobs

RQ also provides a CLI tool that makes requeueing failed jobs easy.

\`\`\`console
# This will requeue foo_job_id and bar_job_id from myqueue's failed job registry
rq requeue --queue myqueue -u redis://localhost:6379 foo_job_id bar_job_id

# This command will requeue all jobs in myqueue's failed job registry
rq requeue --queue myqueue -u redis://localhost:6379 --all
\`\`\`
`

fileContents['docs/docs/monitoring.md'] = `---
title: "RQ: Monitoring"
layout: docs
---

Monitoring is where RQ shines.

The easiest way is probably to use the [RQ dashboard][dashboard], a separately
distributed tool, which is a lightweight webbased monitor frontend for RQ,
which looks like this:

[![RQ dashboard](/img/dashboard.png)][dashboard]

To install, just do:

\`\`\`console
$ pip install rq-dashboard
$ rq-dashboard
\`\`\`

It can also be integrated easily in your Flask app.


## Monitoring at the console

To see what queues exist and what workers are active, just type \`rq info\`:

\`\`\`console
$ rq info
high       |██████████████████████████ 20
low        |██████████████ 12
default    |█████████ 8
3 queues, 45 jobs total

Bricktop.19233 idle: low
Bricktop.19232 idle: high, default, low
Bricktop.18349 idle: default
3 workers, 3 queues
\`\`\`


## Querying by queue names

You can also query for a subset of queues, if you're looking for specific ones:

\`\`\`console
$ rq info high default
high       |██████████████████████████ 20
default    |█████████ 8
2 queues, 28 jobs total

Bricktop.19232 idle: high, default
Bricktop.18349 idle: default
2 workers, 2 queues
\`\`\`


## Organising workers by queue

By default, \`rq info\` prints the workers that are currently active, and the
queues that they are listening on, like this:

\`\`\`console
$ rq info
...

Mickey.26421 idle: high, default
Bricktop.25458 busy: high, default, low
Turkish.25812 busy: high, default
3 workers, 3 queues
\`\`\`

To see the same data, but organised by queue, use the \`-R\` (or \`--by-queue\`)
flag:

\`\`\`console
$ rq info -R
...

high:    Bricktop.25458 (busy), Mickey.26421 (idle), Turkish.25812 (busy)
low:     Bricktop.25458 (busy)
default: Bricktop.25458 (busy), Mickey.26421 (idle), Turkish.25812 (busy)
failed:  –
3 workers, 4 queues
\`\`\`


## Interval polling

By default, \`rq info\` will print stats and exit.
You can specify a poll interval, by using the \`--interval\` flag.

\`\`\`console
$ rq info --interval 1
\`\`\`

\`rq info\` will now update the screen every second.  You may specify a float
value to indicate fractions of seconds.  Be aware that low interval values will
increase the load on Redis, of course.

\`\`\`console
$ rq info --interval 0.5
\`\`\`

[dashboard]: https://github.com/nvie/rq-dashboard
`

fileContents['docs/docs/results.md'] = `---
title: "RQ: Documentation"
layout: docs
---

Enqueueing jobs is delayed execution of function calls.  This means we're
solving a problem, but are getting back a few in return.


## Dealing with results

Python functions may have return values, so jobs can have them, too.  If a job
returns a non-\`None\` return value, the worker will write that return value back
to the job's Redis hash under the \`result\` key.  The job's Redis hash itself
will expire after 500 seconds by default after the job is finished.

The party that enqueued the job gets back a \`Job\` instance as a result of the
enqueueing itself.  Such a \`Job\` object is a proxy object that is tied to the
job's ID, to be able to poll for results.


**On the return value's TTL**
Return values are written back to Redis with a limited lifetime (via a Redis
expiring key), which is merely to avoid ever-growing Redis databases.

From RQ >= 0.3.1, The TTL value of the job result can be specified using the
\`result_ttl\` keyword argument to \`enqueue()\` and \`enqueue_call()\` calls.  It
can also be used to disable the expiry altogether.  You then are responsible
for cleaning up jobs yourself, though, so be careful to use that.

You can do the following:

    q.enqueue(foo)  # result expires after 500 secs (the default)
    q.enqueue(foo, result_ttl=86400)  # result expires after 1 day
    q.enqueue(foo, result_ttl=0)  # result gets deleted immediately
    q.enqueue(foo, result_ttl=-1)  # result never expires--you should delete jobs manually

Additionally, you can use this for keeping around finished jobs without return
values, which would be deleted immediately by default.

    q.enqueue(func_without_rv, result_ttl=500)  # job kept explicitly


## Dealing with exceptions

Jobs can fail and throw exceptions.  This is a fact of life.  RQ deals with
this in the following way.

Job failure is too important not to be noticed and therefore the job's return
value should never expire.  Furthermore, it should be possible to retry failed
jobs.  Typically, this is something that needs manual interpretation, since
there is no automatic or reliable way of letting RQ judge whether it is safe
for certain tasks to be retried or not.

When an exception is thrown inside a job, it is caught by the worker,
serialized and stored under the job's Redis hash's \`exc_info\` key.  A reference
to the job is put on the \`failed\` queue.

The job itself has some useful properties that can be used to aid inspection:

* the original creation time of the job
* the last enqueue date
* the originating queue
* a textual description of the desired function invocation
* the exception information

This makes it possible to inspect and interpret the problem manually and
possibly resubmit the job.


## Dealing With Interruptions

When workers get killed in the polite way (Ctrl+C or \`kill\`), RQ tries hard not
to lose any work.  The current work is finished after which the worker will
stop further processing of jobs.  This ensures that jobs always get a fair
chance to finish themselves.

However, workers can be killed forcefully by \`kill -9\`, which will not give the
workers a chance to finish the job gracefully or to put the job on the \`failed\`
queue.  Therefore, killing a worker forcefully could potentially lead to
damage.

Just sayin'.


## Dealing With Job Timeouts

By default, jobs should execute within 180 seconds.  After that, the worker
kills the work horse and puts the job onto the \`failed\` queue, indicating the
job timed out.

If a job requires more (or less) time to complete, the default timeout period
can be loosened (or tightened), by specifying it as a keyword argument to the
\`enqueue()\` call, like so:

\`\`\`python
q = Queue()
q.enqueue(mytask, args=(foo,), kwargs={'bar': qux}, job_timeout=600)  # 10 mins
\`\`\`

You can also change the default timeout for jobs that are enqueued via specific
queue instances at once, which can be useful for patterns like this:

\`\`\`python
# High prio jobs should end in 8 secs, while low prio
# work may take up to 10 mins
high = Queue('high', default_timeout=8)  # 8 secs
low = Queue('low', default_timeout=600)  # 10 mins

# Individual jobs can still override these defaults
low.enqueue(really_really_slow, job_timeout=3600)  # 1 hr
\`\`\`

Individual jobs can still specify an alternative timeout, as workers will
respect these.
`

fileContents['docs/docs/testing.md'] = `---
title: "RQ: Testing"
layout: docs
---

## Workers inside unit tests

You may wish to include your RQ tasks inside unit tests. However many frameworks (such as Django) use in-memory databases which do not play nicely with the default \`fork()\` behaviour of RQ.

Therefore, you must use the SimpleWorker class to avoid fork();

\`\`\`python
from redis import Redis
from rq import SimpleWorker, Queue

queue = Queue(connection=Redis())
queue.enqueue(my_long_running_job)
worker = SimpleWorker([queue], connection=queue.connection)
worker.work(burst=True)  # Runs enqueued job
# Check for result...
\`\`\`


## Running Jobs in unit tests

Another solution for testing purposes is to use the \`is_async=False\` queue
parameter, that instructs it to instantly perform the job in the same
thread instead of dispatching it to the workers. Workers are not required
anymore.
Additionally, we can use fakeredis to mock a redis instance, so we don't have to
run a redis server separately. The instance of the fake redis server can
be directly passed as the connection argument to the queue:

\`\`\`python
from fakeredis import FakeStrictRedis
from rq import Queue

queue = Queue(is_async=False, connection=FakeStrictRedis())
job = queue.enqueue(my_long_running_job)
assert job.is_finished
\`\`\`
`

fileContents['docs/docs/workers.md'] = `---
title: "RQ: Simple job queues for Python"
layout: docs
---

A worker is a Python process that typically runs in the background and exists
solely as a work horse to perform lengthy or blocking tasks that you don't want
to perform inside web processes.


## Starting Workers

To start crunching work, simply start a worker from the root of your project
directory:

\`\`\`console
$ rq worker high normal low
*** Listening for work on high, normal, low
Got send_newsletter('me@nvie.com') from default
Job ended normally without result
*** Listening for work on high, normal, low
...
\`\`\`

Workers will read jobs from the given queues (the order is important) in an
endless loop, waiting for new work to arrive when all jobs are done.

Each worker will process a single job at a time.  Within a worker, there is no
concurrent processing going on.  If you want to perform jobs concurrently,
simply start more workers.


### Burst Mode

By default, workers will start working immediately and will block and wait for
new work when they run out of work.  Workers can also be started in _burst
mode_ to finish all currently available work and quit as soon as all given
queues are emptied.

\`\`\`console
$ rq worker --burst high normal low
*** Listening for work on high, normal, low
Got send_newsletter('me@nvie.com') from default
Job ended normally without result
No more work, burst finished.
Registering death.
\`\`\`

This can be useful for batch work that needs to be processed periodically, or
just to scale up your workers temporarily during peak periods.


### Worker Arguments

In addition to \`--burst\`, \`rq worker\` also accepts these arguments:

* \`--url\` or \`-u\`: URL describing Redis connection details (e.g \`rq worker --url redis://:secrets@example.com:1234/9\`)
* \`--path\` or \`-P\`: multiple import paths are supported (e.g \`rq worker --path foo --path bar\`)
* \`--config\` or \`-c\`: path to module containing RQ settings.
* \`--worker-class\` or \`-w\`: RQ Worker class to use (e.g \`rq worker --worker-class 'foo.bar.MyWorker'\`)
* \`--job-class\` or \`-j\`: RQ Job class to use.
* \`--queue-class\`: RQ Queue class to use.
* \`--connection-class\`: Redis connection class to use, defaults to \`redis.StrictRedis\`.
* \`--log-format\`: Format for the worker logs, defaults to \`'%(asctime)s %(message)s'\`
* \`--date-format\`: Datetime format for the worker logs, defaults to \`'%H:%M:%S'\`
* \`--disable-job-desc-logging\`: Turn off job description logging.

## Inside the worker

### The Worker Lifecycle

The life-cycle of a worker consists of a few phases:

1. _Boot_. Loading the Python environment.
2. _Birth registration_. The worker registers itself to the system so it knows
   of this worker.
3. _Start listening_. A job is popped from any of the given Redis queues.
   If all queues are empty and the worker is running in burst mode, quit now.
   Else, wait until jobs arrive.
4. _Prepare job execution_. The worker tells the system that it will begin work
   by setting its status to \`busy\` and registers job in the \`StartedJobRegistry\`.
5. _Fork a child process._
   A child process (the "work horse") is forked off to do the actual work in
   a fail-safe context.
6. _Process work_. This performs the actual job work in the work horse.
7. _Cleanup job execution_. The worker sets its status to \`idle\` and sets both
   the job and its result to expire based on \`result_ttl\`. Job is also removed
   from \`StartedJobRegistry\` and added to to \`FinishedJobRegistry\` in the case
   of successful execution, or \`FailedJobRegistry\` in the case of failure.
8. _Loop_.  Repeat from step 3.


## Performance Notes

Basically the \`rq worker\` shell script is a simple fetch-fork-execute loop.
When a lot of your jobs do lengthy setups, or they all depend on the same set
of modules, you pay this overhead each time you run a job (since you're doing
the import _after_ the moment of forking).  This is clean, because RQ won't
ever leak memory this way, but also slow.

A pattern you can use to improve the throughput performance for these kind of
jobs can be to import the necessary modules _before_ the fork.  There is no way
of telling RQ workers to perform this set up for you, but you can do it
yourself before starting the work loop.

To do this, provide your own worker script (instead of using \`rq worker\`).
A simple implementation example:

\`\`\`python
#!/usr/bin/env python
import sys
from rq import Connection, Worker

# Preload libraries
import library_that_you_want_preloaded

# Provide queue names to listen to as arguments to this script,
# similar to rq worker
with Connection():
    qs = sys.argv[1:] or ['default']

    w = Worker(qs)
    w.work()
\`\`\`


### Worker Names

Workers are registered to the system under their names, which are generated
randomly during instantiation (see [monitoring][m]). To override this default,
specify the name when starting the worker, or use the \`--name\` cli option.

{% highlight python %}
from redis import Redis
from rq import Queue, Worker

redis = Redis()
queue = Queue('queue_name')

# Start a worker with a custom name
worker = Worker([queue], connection=redis, name='foo')
{% endhighlight %}

[m]: /docs/monitoring/


### Retrieving Worker Information

_Updated in version 0.10.0._

\`Worker\` instances store their runtime information in Redis. Here's how to
retrieve them:

\`\`\`python
from redis import Redis
from rq import Queue, Worker

# Returns all workers registered in this connection
redis = Redis()
workers = Worker.all(connection=redis)

# Returns all workers in this queue (new in version 0.10.0)
queue = Queue('queue_name')
workers = Worker.all(queue=queue)
worker = workers[0]
print(worker.name)
\`\`\`

Aside from \`worker.name\`, worker also have the following properties:
* \`hostname\` - the host where this worker is run
* \`pid\` - worker's process ID
* \`queues\` - queues on which this worker is listening for jobs
* \`state\` - possible states are \`suspended\`, \`started\`, \`busy\` and \`idle\`
* \`current_job\` - the job it's currently executing (if any)
* \`last_heartbeat\` - the last time this worker was seen
* \`birth_date\` - time of worker's instantiation
* \`successful_job_count\` - number of jobs finished successfully
* \`failed_job_count\` - number of failed jobs processed
* \`total_working_time\` - amount of time spent executing jobs, in seconds

_New in version 0.10.0._

If you only want to know the number of workers for monitoring purposes,
\`Worker.count()\` is much more performant.

\`\`\`python
from redis import Redis
from rq import Worker

redis = Redis()

# Count the number of workers in this Redis connection
workers = Worker.count(connection=redis)

# Count the number of workers for a specific queue
queue = Queue('queue_name', connection=redis)
workers = Worker.all(queue=queue)
\`\`\`


### Worker Statistics

_New in version 0.9.0._

If you want to check the utilization of your queues, \`Worker\` instances
store a few useful information:

\`\`\`python
from rq.worker import Worker
worker = Worker.find_by_key('rq:worker:name')

worker.successful_job_count  # Number of jobs finished successfully
worker.failed_job_count # Number of failed jobs processed by this worker
worker.total_working_time  # Amount of time spent executing jobs (in seconds)
\`\`\`


## Taking Down Workers

If, at any time, the worker receives \`SIGINT\` (via Ctrl+C) or \`SIGTERM\` (via
\`kill\`), the worker wait until the currently running task is finished, stop
the work loop and gracefully register its own death.

If, during this takedown phase, \`SIGINT\` or \`SIGTERM\` is received again, the
worker will forcefully terminate the child process (sending it \`SIGKILL\`), but
will still try to register its own death.


## Using a Config File

If you'd like to configure \`rq worker\` via a configuration file instead of
through command line arguments, you can do this by creating a Python file like
\`settings.py\`:

\`\`\`python
REDIS_URL = 'redis://localhost:6379/1'

# You can also specify the Redis DB to use
# REDIS_HOST = 'redis.example.com'
# REDIS_PORT = 6380
# REDIS_DB = 3
# REDIS_PASSWORD = 'very secret'

# Queues to listen on
QUEUES = ['high', 'normal', 'low']

# If you're using Sentry to collect your runtime exceptions, you can use this
# to configure RQ for it in a single step
# The 'sync+' prefix is required for raven: https://github.com/nvie/rq/issues/350#issuecomment-43592410
SENTRY_DSN = 'sync+http://public:secret@example.com/1'

# If you want custom worker name
# NAME = 'worker-1024'
\`\`\`

The example above shows all the options that are currently supported.

_Note: The_ \`QUEUES\` _and_ \`REDIS_PASSWORD\` _settings are new since 0.3.3._

To specify which module to read settings from, use the \`-c\` option:

\`\`\`console
$ rq worker -c settings
\`\`\`


## Custom Worker Classes

There are times when you want to customize the worker's behavior. Some of the
more common requests so far are:

1. Managing database connectivity prior to running a job.
2. Using a job execution model that does not require \`os.fork\`.
3. The ability to use different concurrency models such as
   \`multiprocessing\` or \`gevent\`.

You can use the \`-w\` option to specify a different worker class to use:

\`\`\`console
$ rq worker -w 'path.to.GeventWorker'
\`\`\`


## Custom Job and Queue Classes

You can tell the worker to use a custom class for jobs and queues using
\`--job-class\` and/or \`--queue-class\`.

\`\`\`console
$ rq worker --job-class 'custom.JobClass' --queue-class 'custom.QueueClass'
\`\`\`

Don't forget to use those same classes when enqueueing the jobs.

For example:

\`\`\`python
from rq import Queue
from rq.job import Job

class CustomJob(Job):
    pass

class CustomQueue(Queue):
    job_class = CustomJob

queue = CustomQueue('default', connection=redis_conn)
queue.enqueue(some_func)
\`\`\`


## Custom DeathPenalty Classes

When a Job times-out, the worker will try to kill it using the supplied
\`death_penalty_class\` (default: \`UnixSignalDeathPenalty\`). This can be overridden
if you wish to attempt to kill jobs in an application specific or 'cleaner' manner.

DeathPenalty classes are constructed with the following arguments
\`BaseDeathPenalty(timeout, JobTimeoutException, job_id=job.id)\`


## Custom Exception Handlers

If you need to handle errors differently for different types of jobs, or simply want to customize
RQ's default error handling behavior, run \`rq worker\` using the \`--exception-handler\` option:

\`\`\`console
$ rq worker --exception-handler 'path.to.my.ErrorHandler'

# Multiple exception handlers is also supported
$ rq worker --exception-handler 'path.to.my.ErrorHandler' --exception-handler 'another.ErrorHandler'
\`\`\`

If you want to disable RQ's default exception handler, use the \`--disable-default-exception-handler\` option:

\`\`\`console
$ rq worker --exception-handler 'path.to.my.ErrorHandler' --disable-default-exception-handler
\`\`\`
`

fileContents['docs/index.md'] = `---
title: "RQ: Simple job queues for Python"
layout: default
---

RQ (_Redis Queue_) is a simple Python library for queueing jobs and processing
them in the background with workers.  It is backed by Redis and it is designed
to have a low barrier to entry.  It can be integrated in your web stack easily.

RQ requires Redis >= 3.0.0.

## Getting started

First, run a Redis server.  You can use an existing one.  To put jobs on
queues, you don't have to do anything special, just define your typically
lengthy or blocking function:

{% highlight python %}
import requests

def count_words_at_url(url):
    resp = requests.get(url)
    return len(resp.text.split())
{% endhighlight %}

Then, create a RQ queue:

{% highlight python %}
from redis import Redis
from rq import Queue

q = Queue(connection=Redis())
{% endhighlight %}

And enqueue the function call:

{% highlight python %}
from my_module import count_words_at_url
result = q.enqueue(
             count_words_at_url, 'http://nvie.com')
{% endhighlight %}

For a more complete example, refer to the [docs][d].  But this is the essence.

[d]: {{site.baseurl}}docs/


### The worker

To start executing enqueued function calls in the background, start a worker
from your project's directory:

{% highlight console %}
$ rq worker
*** Listening for work on default
Got count_words_at_url('http://nvie.com') from default
Job result = 818
*** Listening for work on default
{% endhighlight %}

That's about it.


## Installation

Simply use the following command to install the latest released version:

    pip install rq

If you want the cutting edge version (that may well be broken), use this:

    pip install -e git+git@github.com:nvie/rq.git@master#egg=rq


## Project history

This project has been inspired by the good parts of [Celery][1], [Resque][2]
and [this snippet][3], and has been created as a lightweight alternative to
existing queueing frameworks, with a low barrier to entry.

[m]: http://pypi.python.org/pypi/mailer
[p]: http://docs.python.org/library/pickle.html
[1]: http://www.celeryproject.org/
[2]: https://github.com/defunkt/resque
[3]: http://flask.pocoo.org/snippets/73/
`

fileContents['docs/patterns/django.md'] = `---
title: "RQ: Using with Django"
layout: patterns
---

## Using RQ with Django

The simplest way of using RQ with Django is to use
[django-rq](https://github.com/ui/django-rq).  Follow the instructions in the
README.

### Manually

In order to use RQ together with Django, you have to start the worker in
a "Django context".  Possibly, you have to write a custom Django management
command to do so.  In many cases, however, setting the \`DJANGO_SETTINGS_MODULE\`
environmental variable will already do the trick.

If \`settings.py\` is your Django settings file (as it is by default), use this:

{% highlight console %}
$ DJANGO_SETTINGS_MODULE=settings rq worker high default low
{% endhighlight %}
`

fileContents['docs/patterns/index.md'] = `---
title: "RQ: Using RQ on Heroku"
layout: patterns
---


## Using RQ on Heroku

To setup RQ on [Heroku][1], first add it to your
\`requirements.txt\` file:

    redis>=3
    rq>=0.13

Create a file called \`run-worker.py\` with the following content (assuming you
are using [Redis To Go][2] with Heroku):

{% highlight python %}
import os
import urlparse
from redis import Redis
from rq import Queue, Connection
from rq.worker import HerokuWorker as Worker

listen = ['high', 'default', 'low']

redis_url = os.getenv('REDISTOGO_URL')
if not redis_url:
    raise RuntimeError('Set up Redis To Go first.')

urlparse.uses_netloc.append('redis')
url = urlparse.urlparse(redis_url)
conn = Redis(host=url.hostname, port=url.port, db=0, password=url.password)

if __name__ == '__main__':
    with Connection(conn):
        worker = Worker(map(Queue, listen))
        worker.work()
{% endhighlight %}

Than, add the command to your \`Procfile\`:

    worker: python -u run-worker.py

Now, all you have to do is spin up a worker:

{% highlight console %}
$ heroku scale worker=1
{% endhighlight %}


## Putting RQ under foreman

[Foreman][3] is probably the process manager you use when you host your app on
Heroku, or just because it's a pretty friendly tool to use in development.

When using RQ under \`foreman\`, you may experience that the workers are a bit
quiet sometimes.  This is because of Python buffering the output, so \`foreman\`
cannot (yet) echo it.  Here's a related [Wiki page][4].

Just change the way you run your worker process, by adding the \`-u\` option (to
force stdin, stdout and stderr to be totally unbuffered):

    worker: python -u run-worker.py

[1]: https://heroku.com
[2]: https://devcenter.heroku.com/articles/redistogo
[3]: https://github.com/ddollar/foreman
[4]: https://github.com/ddollar/foreman/wiki/Missing-Output
`

fileContents['docs/patterns/sentry.md'] = `---
title: "RQ: Sending exceptions to Sentry"
layout: patterns
---

## Sending Exceptions to Sentry

[Sentry](https://www.getsentry.com/) is a popular exception gathering service.
RQ allows you to very easily send job exceptions to Sentry. To do this, you'll
need to have [sentry-sdk](https://pypi.org/project/sentry-sdk/) installed.

There are a few ways to start sending job exceptions to Sentry.


### Configuring Sentry Through CLI

Simply invoke the \`rqworker\` script using the \`\`--sentry-dsn\`\` argument.

\`\`\`console
rq worker --sentry-dsn https://my-dsn@sentry.io/123
\`\`\`


### Configuring Sentry Through a Config File

Declare \`SENTRY_DSN\` in RQ's config file like this:

\`\`\`python
SENTRY_DSN = 'https://my-dsn@sentry.io/123'
\`\`\`

And run RQ's worker with your config file:

\`\`\`console
rq worker -c my_settings
\`\`\`

Visit [this page](https://python-rq.org/docs/workers/#using-a-config-file)
to read more about running RQ using a config file.


### Configuring Sentry Through Environment Variable

Simple set \`RQ_SENTRY_DSN\` in your environment variable and RQ will
automatically start Sentry integration for you.

\`\`\`console
RQ_SENTRY_DSN="https://my-dsn@sentry.io/123" rq worker
\`\`\`
`

fileContents['docs/patterns/supervisor.md'] = `---
title: "Putting RQ under supervisor"
layout: patterns
---

## Putting RQ under supervisor

[Supervisor][1] is a popular tool for managing long-running processes in
production environments.  It can automatically restart any crashed processes,
and you gain a single dashboard for all of the running processes that make up
your product.

RQ can be used in combination with supervisor easily.  You'd typically want to
use the following supervisor settings:

{% highlight ini %}
[program:myworker]
; Point the command to the specific rq command you want to run.
; If you use virtualenv, be sure to point it to
; /path/to/virtualenv/bin/rq
; Also, you probably want to include a settings module to configure this
; worker.  For more info on that, see http://python-rq.org/docs/workers/
command=/path/to/rq worker -c mysettings high normal low
; process_num is required if you specify >1 numprocs
process_name=%(program_name)s-%(process_num)s

; If you want to run more than one worker instance, increase this
numprocs=1

; This is the directory from which RQ is ran. Be sure to point this to the
; directory where your source code is importable from
directory=/path/to

; RQ requires the TERM signal to perform a warm shutdown. If RQ does not die
; within 10 seconds, supervisor will forcefully kill it
stopsignal=TERM

; These are up to you
autostart=true
autorestart=true
{% endhighlight %}

### Conda environments

[Conda][2] virtualenvs can be used for RQ jobs which require non-Python
dependencies. You can use a similar approach as with regular virtualenvs.

{% highlight ini %}
[program:myworker]
; Point the command to the specific rq command you want to run.
; For conda virtual environments, install RQ into your env.
; Also, you probably want to include a settings module to configure this
; worker.  For more info on that, see http://python-rq.org/docs/workers/
environment=PATH='/opt/conda/envs/myenv/bin'
command=/opt/conda/envs/myenv/bin/rq worker -c mysettings high normal low
; process_num is required if you specify >1 numprocs
process_name=%(program_name)s-%(process_num)s

; If you want to run more than one worker instance, increase this
numprocs=1

; This is the directory from which RQ is ran. Be sure to point this to the
; directory where your source code is importable from
directory=/path/to

; RQ requires the TERM signal to perform a warm shutdown. If RQ does not die
; within 10 seconds, supervisor will forcefully kill it
stopsignal=TERM

; These are up to you
autostart=true
autorestart=true
{% endhighlight %}

[1]: http://supervisord.org/
[2]: https://conda.io/docs/
`

fileContents['examples/fib.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)


def slow_fib(n):
    if n <= 1:
        return 1
    else:
        return slow_fib(n-1) + slow_fib(n-2)
`

fileContents['examples/run_example.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

import os
import time

from rq import Connection, Queue

from fib import slow_fib


def main():
    # Range of Fibonacci numbers to compute
    fib_range = range(20, 34)

    # Kick off the tasks asynchronously
    async_results = {}
    q = Queue()
    for x in fib_range:
        async_results[x] = q.enqueue(slow_fib, x)

    start_time = time.time()
    done = False
    while not done:
        os.system('clear')
        print('Asynchronously: (now = %.2f)' % (time.time() - start_time,))
        done = True
        for x in fib_range:
            result = async_results[x].return_value
            if result is None:
                done = False
                result = '(calculating)'
            print('fib(%d) = %s' % (x, result))
        print('')
        print('To start the actual in the background, run a worker:')
        print('    python examples/run_worker.py')
        time.sleep(0.2)

    print('Done')


if __name__ == '__main__':
    # Tell RQ what Redis connection to use
    with Connection():
        main()
`

fileContents['examples/run_worker.py'] = `# -*- coding: utf-8 -*-
from __future__ import (absolute_import, division, print_function,
                        unicode_literals)

from rq import Connection, Queue, Worker

if __name__ == '__main__':
    # Tell rq what Redis connection to use
    with Connection():
        q = Queue()
        Worker(q).work()
`

fileContents['.gitignore'] = `*.pyc
*.egg-info

.DS_Store

/dump.rdb
/.direnv
/.envrc
/.tox
/dist
/build
.tox
.pytest_cache/
.vagrant
Vagrantfile
.idea/
.coverage*
/.cache

Gemfile
Gemfile.lock
_site/
`

fileContents['.mailmap'] = `Cal Leeming <cal@iops.io> <cal.leeming@simplicitymedialtd.co.uk>
Mark LaPerriere <marklap@gmail.com> <mark.a.laperriere@disney.com>
Selwin Ong <selwin.ong@gmail.com> <selwin@ui.co.id>
Vincent Driessen <me@nvie.com> <vincent@3rdcloud.com>
Vincent Driessen <me@nvie.com> <vincent@datafox.nl>
zhangliyong <lyzhang87@gmail.com> <zhangliyong@umeng.com>
`

fileContents['.travis.yml'] = `sudo: false
language: python
services:
  - redis
python:
  - "2.7"
  - "3.4"
  - "3.5"
  - "3.6"
  - "3.7-dev"
  - "pypy"
install:
  - pip install -e .
  - pip install pytest-cov sentry-sdk codecov
  #- pip install pytest  # installed by Travis by default already
script:
  - RUN_SLOW_TESTS_TOO=1 py.test --cov rq --durations=5
after_success:
  - codecov
`

fileContents['CHANGES.md'] = `### 1.0 (2019-04-06)
Backward incompatible changes:

- \`job.status\` has been removed. Use \`job.get_status()\` and \`job.set_status()\` instead. Thanks @selwin!

- \`FailedQueue\` has been replaced with \`FailedJobRegistry\`:
  * \`get_failed_queue()\` function has been removed. Please use \`FailedJobRegistry(queue=queue)\` instead.
  * \`move_to_failed_queue()\` has been removed.
  * RQ now provides a mechanism to automatically cleanup failed jobs. By default, failed jobs are kept for 1 year.
  * Thanks @selwin!

- RQ's custom job exception handling mechanism has also changed slightly:
  * RQ's default exception handling mechanism (moving jobs to \`FailedJobRegistry\`) can be disabled by doing \`Worker(disable_default_exception_handler=True)\`.
  * Custom exception handlers are no longer executed in reverse order.
  * Thanks @selwin!

- \`Worker\` names are now randomized. Thanks @selwin!

- \`timeout\` argument on \`queue.enqueue()\` has been deprecated in favor of \`job_timeout\`. Thanks @selwin!

- Sentry integration has been reworked:
  * RQ now uses the new [sentry-sdk](https://pypi.org/project/sentry-sdk/) in place of the deprecated [Raven](https://pypi.org/project/raven/) library
  * RQ will look for the more explicit \`RQ_SENTRY_DSN\` environment variable instead of \`SENTRY_DSN\` before instantiating Sentry integration
  * Thanks @selwin!

- Fixed \`Worker.total_working_time\` accounting bug. Thanks @selwin!


### 0.13.0 (2018-12-11)
- Compatibility with Redis 3.0. Thanks @dash-rai!
- Added \`job_timeout\` argument to \`queue.enqueue()\`. This argument will eventually replace \`timeout\` argument. Thanks @selwin!
- Added \`job_id\` argument to \`BaseDeathPenalty\` class. Thanks @loopbio!
- Fixed a bug which causes long running jobs to timeout under \`SimpleWorker\`. Thanks @selwin!
- You can now override worker's name from config file. Thanks @houqp!
- Horses will now return exit code 1 if they don't terminate properly (e.g when Redis connection is lost). Thanks @selwin!
- Added \`date_format\` and \`log_format\` arguments to \`Worker\` and \`rq worker\` CLI. Thanks @shikharsg!


### 0.12.0 (2018-07-14)
- Added support for Python 3.7. Since \`async\` is a keyword in Python 3.7,
\`Queue(async=False)\` has been changed to \`Queue(is_async=False)\`. The \`async\`
keyword argument will still work, but raises a \`DeprecationWarning\`. Thanks @dchevell!


### 0.11.0 (2018-06-01)
- \`Worker\` now periodically sends heartbeats and checks whether child process is still alive while performing long running jobs. Thanks @Kriechi!
- \`Job.create\` now accepts \`timeout\` in string format (e.g \`1h\`). Thanks @theodesp!
- \`worker.main_work_horse()\` should exit with return code \`0\` even if job execution fails. Thanks @selwin!
- \`job.delete(delete_dependents=True)\` will delete job along with its dependents. Thanks @olingerc!
- Other minor fixes and documentation updates.


### 0.10.0
- \`@job\` decorator now accepts \`description\`, \`meta\`, \`at_front\` and \`depends_on\` kwargs. Thanks @jlucas91 and @nlyubchich!
- Added the capability to fetch workers by queue using \`Worker.all(queue=queue)\` and \`Worker.count(queue=queue)\`.
- Improved RQ's default logging configuration. Thanks @samuelcolvin!
- \`job.data\` and \`job.exc_info\` are now stored in compressed format in Redis.


### 0.9.2
- Fixed an issue where \`worker.refresh()\` may fail when \`birth_date\` is not set. Thanks @vanife!


### 0.9.1
- Fixed an issue where \`worker.refresh()\` may fail when upgrading from previous versions of RQ.


### 0.9.0
- \`Worker\` statistics! \`Worker\` now keeps track of \`last_heartbeat\`, \`successful_job_count\`, \`failed_job_count\` and \`total_working_time\`. Thanks @selwin!
- \`Worker\` now sends heartbeat during suspension check. Thanks @theodesp!
- Added \`queue.delete()\` method to delete \`Queue\` objects entirely from Redis. Thanks @theodesp!
- More robust exception string decoding. Thanks @stylight!
- Added \`--logging-level\` option to command line scripts. Thanks @jiajunhuang!
- Added millisecond precision to job timestamps. Thanks @samuelcolvin!
- Python 2.6 is no longer supported. Thanks @samuelcolvin!


### 0.8.2
- Fixed an issue where \`job.save()\` may fail with unpickleable return value.


### 0.8.1
- Replace \`job.id\` with \`Job\` instance in local \`_job_stack \`. Thanks @katichev!
- \`job.save()\` no longer implicitly calls \`job.cleanup()\`. Thanks @katichev!
- Properly catch \`StopRequested\` \`worker.heartbeat()\`. Thanks @fate0!
- You can now pass in timeout in days. Thanks @yaniv-g!
- The core logic of sending job to \`FailedQueue\` has been moved to \`rq.handlers.move_to_failed_queue\`. Thanks @yaniv-g!
- RQ cli commands now accept \`--path\` parameter. Thanks @kirill and @sjtbham!
- Make \`job.dependency\` slightly more efficient. Thanks @liangsijian!
- \`FailedQueue\` now returns jobs with the correct class. Thanks @amjith!


### 0.8.0
- Refactored APIs to allow custom \`Connection\`, \`Job\`, \`Worker\` and \`Queue\` classes via CLI. Thanks @jezdez!
- \`job.delete()\` now properly cleans itself from job registries. Thanks @selwin!
- \`Worker\` should no longer overwrite \`job.meta\`. Thanks @WeatherGod!
- \`job.save_meta()\` can now be used to persist custom job data. Thanks @katichev!
- Added Redis Sentinel support. Thanks @strawposter!
- Make \`Worker.find_by_key()\` more efficient. Thanks @selwin!
- You can now specify job \`timeout\` using strings such as \`queue.enqueue(foo, timeout='1m')\`. Thanks @luojiebin!
- Better unicode handling. Thanks @myme5261314 and @jaywink!
- Sentry should default to HTTP transport. Thanks @Atala!
- Improve \`HerokuWorker\` termination logic. Thanks @samuelcolvin!


### 0.7.1
- Fixes a bug that prevents fetching jobs from \`FailedQueue\` (#765). Thanks @jsurloppe!
- Fixes race condition when enqueueing jobs with dependency (#742). Thanks @th3hamm0r!
- Skip a test that requires Linux signals on MacOS (#763). Thanks @jezdez!
- \`enqueue_job\` should use Redis pipeline when available (#761). Thanks mtdewulf!


### 0.7.0
- Better support for Heroku workers (#584, #715)
- Support for connecting using a custom connection class (#741)
- Fix: connection stack in default worker (#479, #641)
- Fix: \`fetch_job\` now checks that a job requested actually comes from the
  intended queue (#728, #733)
- Fix: Properly raise exception if a job dependency does not exist (#747)
- Fix: Job status not updated when horse dies unexpectedly (#710)
- Fix: \`request_force_stop_sigrtmin\` failing for Python 3 (#727)
- Fix \`Job.cancel()\` method on failed queue (#707)
- Python 3.5 compatibility improvements (#729)
- Improved signal name lookup (#722)


### 0.6.0
- Jobs that depend on job with result_ttl == 0 are now properly enqueued.
- \`cancel_job\` now works properly. Thanks @jlopex!
- Jobs that execute successfully now no longer tries to remove itself from queue. Thanks @amyangfei!
- Worker now properly logs Falsy return values. Thanks @liorsbg!
- \`Worker.work()\` now accepts \`logging_level\` argument. Thanks @jlopex!
- Logging related fixes by @redbaron4 and @butla!
- \`@job\` decorator now accepts \`ttl\` argument. Thanks @javimb!
- \`Worker.__init__\` now accepts \`queue_class\` keyword argument. Thanks @antoineleclair!
- \`Worker\` now saves warm shutdown time. You can access this property from \`worker.shutdown_requested_date\`. Thanks @olingerc!
- Synchronous queues now properly sets completed job status as finished. Thanks @ecarreras!
- \`Worker\` now correctly deletes \`current_job_id\` after failed job execution. Thanks @olingerc!
- \`Job.create()\` and \`queue.enqueue_call()\` now accepts \`meta\` argument. Thanks @tornstrom!
- Added \`job.started_at\` property. Thanks @samuelcolvin!
- Cleaned up the implementation of \`job.cancel()\` and \`job.delete()\`. Thanks @glaslos!
- \`Worker.execute_job()\` now exports \`RQ_WORKER_ID\` and \`RQ_JOB_ID\` to OS environment variables. Thanks @mgk!
- \`rqinfo\` now accepts \`--config\` option. Thanks @kfrendrich!
- \`Worker\` class now has \`request_force_stop()\` and \`request_stop()\` methods that can be overridden by custom worker classes. Thanks @samuelcolvin!
- Other minor fixes by @VicarEscaped, @kampfschlaefer, @ccurvey, @zfz, @antoineleclair,
  @orangain, @nicksnell, @SkyLothar, @ahxxm and @horida.


### 0.5.6

- Job results are now logged on \`DEBUG\` level. Thanks @tbaugis!
- Modified \`patch_connection\` so Redis connection can be easily mocked
- Customer exception handlers are now called if Redis connection is lost. Thanks @jlopex!
- Jobs can now depend on jobs in a different queue. Thanks @jlopex!


### 0.5.5 (2015-08-25)

- Add support for \`--exception-handler\` command line flag
- Fix compatibility with click>=5.0
- Fix maximum recursion depth problem for very large queues that contain jobs
  that all fail


### 0.5.4

(July 8th, 2015)

- Fix compatibility with raven>=5.4.0


### 0.5.3

(June 3rd, 2015)

- Better API for instantiating Workers. Thanks @RyanMTB!
- Better support for unicode kwargs. Thanks @nealtodd and @brownstein!
- Workers now automatically cleans up job registries every hour
- Jobs in \`FailedQueue\` now have their statuses set properly
- \`enqueue_call()\` no longer ignores \`ttl\`. Thanks @mbodock!
- Improved logging. Thanks @trevorprater!


### 0.5.2

(April 14th, 2015)

- Support SSL connection to Redis (requires redis-py>=2.10)
- Fix to prevent deep call stacks with large queues


### 0.5.1

(March 9th, 2015)

- Resolve performance issue when queues contain many jobs
- Restore the ability to specify connection params in config
- Record \`birth_date\` and \`death_date\` on Worker
- Add support for SSL URLs in Redis (and \`REDIS_SSL\` config option)
- Fix encoding issues with non-ASCII characters in function arguments
- Fix Redis transaction management issue with job dependencies


### 0.5.0
(Jan 30th, 2015)

- RQ workers can now be paused and resumed using \`rq suspend\` and
  \`rq resume\` commands. Thanks Jonathan Tushman!
- Jobs that are being performed are now stored in \`StartedJobRegistry\`
  for monitoring purposes. This also prevents currently active jobs from
  being orphaned/lost in the case of hard shutdowns.
- You can now monitor finished jobs by checking \`FinishedJobRegistry\`.
  Thanks Nic Cope for helping!
- Jobs with unmet dependencies are now created with \`deferred\` as their
  status. You can monitor deferred jobs by checking \`DeferredJobRegistry\`.
- It is now possible to enqueue a job at the beginning of queue using
  \`queue.enqueue(func, at_front=True)\`. Thanks Travis Johnson!
- Command line scripts have all been refactored to use \`click\`. Thanks Lyon Zhang!
- Added a new \`SimpleWorker\` that does not fork when executing jobs.
  Useful for testing purposes. Thanks Cal Leeming!
- Added \`--queue-class\` and \`--job-class\` arguments to \`rqworker\` script.
  Thanks David Bonner!
- Many other minor bug fixes and enhancements.


### 0.4.6
(May 21st, 2014)

- Raise a warning when RQ workers are used with Sentry DSNs using
  asynchronous transports.  Thanks Wei, Selwin & Toms!


### 0.4.5
(May 8th, 2014)

- Fix where rqworker broke on Python 2.6. Thanks, Marko!


### 0.4.4
(May 7th, 2014)

- Properly declare redis dependency.
- Fix a NameError regression that was introduced in 0.4.3.


### 0.4.3
(May 6th, 2014)

- Make job and queue classes overridable. Thanks, Marko!
- Don't require connection for @job decorator at definition time. Thanks, Sasha!
- Syntactic code cleanup.


### 0.4.2
(April 28th, 2014)

- Add missing depends_on kwarg to @job decorator.  Thanks, Sasha!


### 0.4.1
(April 22nd, 2014)

- Fix bug where RQ 0.4 workers could not unpickle/process jobs from RQ < 0.4.


### 0.4.0
(April 22nd, 2014)

- Emptying the failed queue from the command line is now as simple as running
  \`rqinfo -X\` or \`rqinfo --empty-failed-queue\`.

- Job data is unpickled lazily. Thanks, Malthe!

- Removed dependency on the \`times\` library. Thanks, Malthe!

- Job dependencies!  Thanks, Selwin.

- Custom worker classes, via the \`--worker-class=path.to.MyClass\` command line
  argument.  Thanks, Selwin.

- \`Queue.all()\` and \`rqinfo\` now report empty queues, too.  Thanks, Rob!

- Fixed a performance issue in \`Queue.all()\` when issued in large Redis DBs.
  Thanks, Rob!

- Birth and death dates are now stored as proper datetimes, not timestamps.

- Ability to provide a custom job description (instead of using the default
  function invocation hint).  Thanks, İbrahim.

- Fix: temporary key for the compact queue is now randomly generated, which
  should avoid name clashes for concurrent compact actions.

- Fix: \`Queue.empty()\` now correctly deletes job hashes from Redis.


### 0.3.13
(December 17th, 2013)

- Bug fix where the worker crashes on jobs that have their timeout explicitly
  removed.  Thanks for reporting, @algrs.


### 0.3.12
(December 16th, 2013)

- Bug fix where a worker could time out before the job was done, removing it
  from any monitor overviews (#288).


### 0.3.11
(August 23th, 2013)

- Some more fixes in command line scripts for Python 3


### 0.3.10
(August 20th, 2013)

- Bug fix in setup.py


### 0.3.9
(August 20th, 2013)

- Python 3 compatibility (Thanks, Alex!)

- Minor bug fix where Sentry would break when func cannot be imported


### 0.3.8
(June 17th, 2013)

- \`rqworker\` and \`rqinfo\` have a  \`--url\` argument to connect to a Redis url.

- \`rqworker\` and \`rqinfo\` have a \`--socket\` option to connect to a Redis server
  through a Unix socket.

- \`rqworker\` reads \`SENTRY_DSN\` from the environment, unless specifically
  provided on the command line.

- \`Queue\` has a new API that supports paging \`get_jobs(3, 7)\`, which will
  return at most 7 jobs, starting from the 3rd.


### 0.3.7
(February 26th, 2013)

- Fixed bug where workers would not execute builtin functions properly.


### 0.3.6
(February 18th, 2013)

- Worker registrations now expire.  This should prevent \`rqinfo\` from reporting
  about ghosted workers.  (Thanks, @yaniv-aknin!)

- \`rqworker\` will automatically clean up ghosted worker registrations from
  pre-0.3.6 runs.

- \`rqworker\` grew a \`-q\` flag, to be more silent (only warnings/errors are shown)


### 0.3.5
(February 6th, 2013)

- \`ended_at\` is now recorded for normally finished jobs, too.  (Previously only
  for failed jobs.)

- Adds support for both \`Redis\` and \`StrictRedis\` connection types

- Makes \`StrictRedis\` the default connection type if none is explicitly provided


### 0.3.4
(January 23rd, 2013)

- Restore compatibility with Python 2.6.


### 0.3.3
(January 18th, 2013)

- Fix bug where work was lost due to silently ignored unpickle errors.

- Jobs can now access the current \`Job\` instance from within.  Relevant
  documentation [here](http://python-rq.org/docs/jobs/).

- Custom properties can be set by modifying the \`job.meta\` dict.  Relevant
  documentation [here](http://python-rq.org/docs/jobs/).

- Custom properties can be set by modifying the \`job.meta\` dict.  Relevant
  documentation [here](http://python-rq.org/docs/jobs/).

- \`rqworker\` now has an optional \`--password\` flag.

- Remove \`logbook\` dependency (in favor of \`logging\`)


### 0.3.2
(September 3rd, 2012)

- Fixes broken \`rqinfo\` command.

- Improve compatibility with Python < 2.7.



### 0.3.1
(August 30th, 2012)

- \`.enqueue()\` now takes a \`result_ttl\` keyword argument that can be used to
  change the expiration time of results.

- Queue constructor now takes an optional \`async=False\` argument to bypass the
  worker (for testing purposes).

- Jobs now carry status information.  To get job status information, like
  whether a job is queued, finished, or failed, use the property \`status\`, or
  one of the new boolean accessor properties \`is_queued\`, \`is_finished\` or
  \`is_failed\`.

- Jobs return values are always stored explicitly, even if they have to
  explicit return value or return \`None\` (with given TTL of course).  This
  makes it possible to distinguish between a job that explicitly returned
  \`None\` and a job that isn't finished yet (see \`status\` property).

- Custom exception handlers can now be configured in addition to, or to fully
  replace, moving failed jobs to the failed queue.  Relevant documentation
  [here](http://python-rq.org/docs/exceptions/) and
  [here](http://python-rq.org/patterns/sentry/).

- \`rqworker\` now supports passing in configuration files instead of the
  many command line options: \`rqworker -c settings\` will source
  \`settings.py\`.

- \`rqworker\` now supports one-flag setup to enable Sentry as its exception
  handler: \`rqworker --sentry-dsn="http://public:secret@example.com/1"\`
  Alternatively, you can use a settings file and configure \`SENTRY_DSN
  = 'http://public:secret@example.com/1'\` instead.


### 0.3.0
(August 5th, 2012)

- Reliability improvements

    - Warm shutdown now exits immediately when Ctrl+C is pressed and worker is idle
    - Worker does not leak worker registrations anymore when stopped gracefully

- \`.enqueue()\` does not consume the \`timeout\` kwarg anymore.  Instead, to pass
  RQ a timeout value while enqueueing a function, use the explicit invocation
  instead:

      \`\`\`python
      q.enqueue(do_something, args=(1, 2), kwargs={'a': 1}, timeout=30)
      \`\`\`

- Add a \`@job\` decorator, which can be used to do Celery-style delayed
  invocations:

      \`\`\`python
      from redis import StrictRedis
      from rq.decorators import job

      # Connect to Redis
      redis = StrictRedis()

      @job('high', timeout=10, connection=redis)
      def some_work(x, y):
          return x + y
      \`\`\`

  Then, in another module, you can call \`some_work\`:

      \`\`\`python
      from foo.bar import some_work

      some_work.delay(2, 3)
      \`\`\`


### 0.2.2
(August 1st, 2012)

- Fix bug where return values that couldn't be pickled crashed the worker


### 0.2.1
(July 20th, 2012)

- Fix important bug where result data wasn't restored from Redis correctly
  (affected non-string results only).


### 0.2.0
(July 18th, 2012)

- \`q.enqueue()\` accepts instance methods now, too.  Objects will be pickle'd
  along with the instance method, so beware.
- \`q.enqueue()\` accepts string specification of functions now, too.  Example:
  \`q.enqueue("my.math.lib.fibonacci", 5)\`.  Useful if the worker and the
  submitter of work don't share code bases.
- Job can be assigned custom attrs and they will be pickle'd along with the
  rest of the job's attrs.  Can be used when writing RQ extensions.
- Workers can now accept explicit connections, like Queues.
- Various bug fixes.


### 0.1.2
(May 15, 2012)

- Fix broken PyPI deployment.


### 0.1.1
(May 14, 2012)

- Thread-safety by using context locals
- Register scripts as console_scripts, for better portability
- Various bugfixes.


### 0.1.0:
(March 28, 2012)

- Initially released version.
`

fileContents['LICENSE'] = `Copyright 2012 Vincent Driessen. All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

   1. Redistributions of source code must retain the above copyright notice,
      this list of conditions and the following disclaimer.

   2. Redistributions in binary form must reproduce the above copyright notice,
      this list of conditions and the following disclaimer in the documentation
      and/or other materials provided with the distribution.

THIS SOFTWARE IS PROVIDED BY VINCENT DRIESSEN \`\`AS IS'' AND ANY EXPRESS OR
IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF
MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT
SHALL VINCENT DRIESSEN OR CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT,
INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT
LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR
PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF
LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE
OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

The views and conclusions contained in the software and documentation are those
of the authors and should not be interpreted as representing official policies,
either expressed or implied, of Vincent Driessen.
`

fileContents['MANIFEST.in'] = `recursive-exclude tests *
`

fileContents['Makefile'] = `all:
	@grep -Ee '^[a-z].*:' Makefile | cut -d: -f1 | grep -vF all

clean:
	rm -rf build/ dist/

release: clean
	# Check if latest tag is the current head we're releasing
	echo "Latest tag = $$(git tag | sort -nr | head -n1)"
	echo "HEAD SHA       = $$(git sha head)"
	echo "Latest tag SHA = $$(git tag | sort -nr | head -n1 | xargs git sha)"
	@test "$$(git sha head)" = "$$(git tag | sort -nr | head -n1 | xargs git sha)"
	make force_release

force_release: clean
	git push --tags
	python setup.py sdist bdist_wheel
	twine upload dist/*
`

fileContents['README.md'] = `RQ (_Redis Queue_) is a simple Python library for queueing jobs and processing
them in the background with workers.  It is backed by Redis and it is designed
to have a low barrier to entry.  It should be integrated in your web stack
easily.

RQ requires Redis >= 3.0.0.

[![Build status](https://travis-ci.org/rq/rq.svg?branch=master)](https://secure.travis-ci.org/rq/rq)
[![PyPI](https://img.shields.io/pypi/pyversions/rq.svg)](https://pypi.python.org/pypi/rq)
[![Coverage](https://codecov.io/gh/rq/rq/branch/master/graph/badge.svg)](https://codecov.io/gh/rq/rq)

Full documentation can be found [here][d].


## Getting started

First, run a Redis server, of course:

\`\`\`console
$ redis-server
\`\`\`

To put jobs on queues, you don't have to do anything special, just define
your typically lengthy or blocking function:

\`\`\`python
import requests

def count_words_at_url(url):
    """Just an example function that's called async."""
    resp = requests.get(url)
    return len(resp.text.split())
\`\`\`

You do use the excellent [requests][r] package, don't you?

Then, create an RQ queue:

\`\`\`python
from redis import Redis
from rq import Queue

q = Queue(connection=Redis())
\`\`\`

And enqueue the function call:

\`\`\`python
from my_module import count_words_at_url
job = q.enqueue(count_words_at_url, 'http://nvie.com')
\`\`\`

For a more complete example, refer to the [docs][d].  But this is the essence.


### The worker

To start executing enqueued function calls in the background, start a worker
from your project's directory:

\`\`\`console
$ rq worker
*** Listening for work on default
Got count_words_at_url('http://nvie.com') from default
Job result = 818
*** Listening for work on default
\`\`\`

That's about it.


## Installation

Simply use the following command to install the latest released version:

    pip install rq

If you want the cutting edge version (that may well be broken), use this:

    pip install -e git+https://github.com/nvie/rq.git@master#egg=rq


## Project history

This project has been inspired by the good parts of [Celery][1], [Resque][2]
and [this snippet][3], and has been created as a lightweight alternative to the
heaviness of Celery or other AMQP-based queueing implementations.

[r]: http://python-requests.org
[d]: http://python-rq.org/
[m]: http://pypi.python.org/pypi/mailer
[p]: http://docs.python.org/library/pickle.html
[1]: http://www.celeryproject.org/
[2]: https://github.com/resque/resque
[3]: http://flask.pocoo.org/snippets/73/
`

fileContents['dev-requirements.txt'] = `mock
pytest
`

fileContents['requirements.txt'] = `redis>=3.0
click>=3.0.0
`

fileContents['run_tests'] = `#!/bin/sh
check_redis_running() {
    redis-cli echo "just checking" > /dev/null
    return $?
}

# Quit early if Redis server isn't running
if ! check_redis_running; then
    echo "Redis not running." >&2
    exit 2
fi

if command -v rg >/dev/null; then
    safe_rg=rg
else
    # Fall back for systems that don't have rg installed
    safe_rg=cat
fi

export RUN_SLOW_TESTS_TOO=1
if [ "$1" = '-f' ]; then  # Poor man's argparse
    unset RUN_SLOW_TESTS_TOO
    shift 1
fi

# For use on build server, we need exit code to be representative of success/failure
if [ "$1" = '-x' ]; then
    shift 1
    /usr/bin/env python -m pytest -v tests $@ 2>&1
else
    /usr/bin/env python -m pytest -v tests $@ 2>&1 | egrep -v '^test_' | $safe_rg
fi
`

fileContents['setup.cfg'] = `[bdist_rpm]
requires = redis >= 3.0.0
           click >= 3.0

[wheel]
universal = 1

[flake8]
max-line-length=120
ignore=E731
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
    url='https://github.com/nvie/rq/',
    license='BSD',
    author='Vincent Driessen',
    author_email='vincent@3rdcloud.com',
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

fileContents['tox.ini'] = `[tox]
envlist=py27,py34,py35,py36,py37,pypy,flake8

[testenv]
commands=pytest --cov rq --durations=5 {posargs}
deps=
    pytest
    pytest-cov
    mock

[testenv:flake8]
basepython = python3.6
deps =
    flake8
commands =
    flake8 rq tests
`

export default fileContents
