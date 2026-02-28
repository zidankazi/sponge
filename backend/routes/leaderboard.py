from fastapi import APIRouter

router = APIRouter()


@router.get("/leaderboard")
async def get_leaderboard():
    # TODO: Return sorted leaderboard
    return []
