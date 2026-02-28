from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import store
from gemini.client import call_gemini

router = APIRouter(tags=["prompt"])


# ---------- Request / Response schemas ----------

class ConversationMessage(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class PromptRequest(BaseModel):
    session_id: str
    prompt_text: str
    conversation_history: list[ConversationMessage] = []


class PromptResponse(BaseModel):
    response_text: str


# ---------- Endpoint ----------

@router.post("/prompt", response_model=PromptResponse)
async def handle_prompt(body: PromptRequest):
    """
    Forwards the user prompt to Gemini with conversation history.
    Persists the new turn to the session and returns the AI response.
    """
    session = store.sessions.get(body.session_id)
    if session is None:
        raise HTTPException(status_code=404, detail="Session not found")

    history = [msg.model_dump() for msg in body.conversation_history]

    # TODO: replace stub with real Gemini call once gemini/client.py is implemented
    response_text = await call_gemini(
        prompt=body.prompt_text,
        conversation_history=history,
    )

    # Persist the new exchange so the scoring engine can read it later
    session.conversation_history = history + [
        {"role": "user", "content": body.prompt_text},
        {"role": "assistant", "content": response_text},
    ]

    return PromptResponse(response_text=response_text)
