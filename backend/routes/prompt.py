from fastapi import APIRouter

router = APIRouter()


@router.post("/prompt")
async def handle_prompt():
    # TODO: Forward prompt to Gemini API, return response
    pass
