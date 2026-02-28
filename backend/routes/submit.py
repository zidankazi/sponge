from fastapi import APIRouter

router = APIRouter()


@router.post("/submit")
async def submit_session():
    # TODO: Run scoring engine on session, return results
    pass
