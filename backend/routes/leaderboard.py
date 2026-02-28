from fastapi import APIRouter
from pydantic import BaseModel

import store

router = APIRouter(tags=["leaderboard"])


# ---------- Response schema ----------

class LeaderboardEntry(BaseModel):
    username: str
    score: int
    badge: str
    time_completed: str     # ISO-8601


# ---------- Endpoint ----------

@router.get("/leaderboard", response_model=list[LeaderboardEntry])
async def get_leaderboard():
    """
    Returns all completed sessions sorted by total_score descending.
    Only sessions that have been submitted (i.e. have a score) appear here.
    """
    entries: list[LeaderboardEntry] = []

    for session in store.sessions.values():
        if session.score is None:
            continue

        entries.append(
            LeaderboardEntry(
                username=session.username or "Anonymous",
                score=session.score.total_score,
                badge=session.score.badge,
                time_completed=session.started_at.isoformat() + "Z",
            )
        )

    entries.sort(key=lambda e: e.score, reverse=True)
    return entries
