"""
RQ-specific vocabulary for grounded prompt detection and keyword matching.

Extracted from engine.py — these term dictionaries and helper functions
are used by the scoring engine to detect domain-specific language in
user prompts.
"""

import re


# ---------- RQ-specific vocabulary for grounded prompt detection ----------

RQ_TERMS = {
    # file names
    "worker.py", "queue.py", "job.py", "registry.py", "timeouts.py",
    "connections.py", "exceptions.py", "utils.py", "serializers.py",
    # class / function names
    "enqueue", "dequeue", "blpop", "hset", "lpush", "rpush",
    "enqueue_in", "enqueue_at", "dequeue_timeout",
    "baseworker", "simpleworker", "worker",
    "baseregistry", "startedregistry", "finishedregistry",
    "failedregistry", "deferredregistry", "scheduledregistry",
    "job.create", "job.fetch", "job.restore",
    # concepts
    "sorted set", "ttl", "heartbeat", "work horse", "workhorse",
    "register_birth", "register_death", "clean_registries",
    "dequeue_job_and_maintain_ttl", "execute_job",
}

TRADEOFF_TERMS = {
    "tradeoff", "trade-off", "instead of", "alternatively", "however",
    "downside", "upside", "pros", "cons", "better", "worse",
    "simpler", "more complex", "overhead", "performance", "memory",
    "time complexity", "space complexity", "o(", "big o",
}

EDGE_CASE_TERMS = {
    "edge case", "edge-case", "boundary", "corner case", "corner-case",
    "empty", "none", "null", "zero", "negative", "overflow",
    "fail", "error", "exception", "invalid", "missing",
    "timeout", "retry", "duplicate",
}


# ---------- Vocabulary helper functions ----------

def _is_grounded(prompt: str) -> bool:
    lower = prompt.lower()
    return any(term in lower for term in RQ_TERMS)


def _has_tradeoff_language(prompt: str) -> bool:
    lower = prompt.lower()
    return any(term in lower for term in TRADEOFF_TERMS)


def _has_edge_case_language(prompt: str) -> bool:
    lower = prompt.lower()
    return any(term in lower for term in EDGE_CASE_TERMS)


def _word_overlap(a: str, b: str) -> float:
    """Jaccard similarity between word sets of two strings."""
    wa = set(re.findall(r"\w+", a.lower()))
    wb = set(re.findall(r"\w+", b.lower()))
    if not wa or not wb:
        return 0.0
    return len(wa & wb) / len(wa | wb)
