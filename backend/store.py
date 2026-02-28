"""
In-memory session store shared across all routes.
For the hackathon, sessions live in a plain dict — no DB needed.
"""

from models.session import Session

sessions: dict[str, Session] = {}
