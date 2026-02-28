from fastapi import APIRouter

router = APIRouter()


@router.post("/session/start")
async def start_session():
    # TODO: Generate session ID, initialize session storage
    pass


@router.post("/session/event")
async def log_event():
    # TODO: Log frontend event to session
    pass
