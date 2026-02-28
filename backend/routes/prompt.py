from typing import Optional

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import store
from gemini.client import call_gemini
from models.session import Session

router = APIRouter(tags=["prompt"])


# ---------- Request / Response schemas ----------

class ConversationMessage(BaseModel):
    role: str       # "user" | "assistant"
    content: str


class PromptRequest(BaseModel):
    session_id: str
    prompt_text: str
    conversation_history: list[ConversationMessage] = []
    active_file: Optional[str] = None
    file_contents: Optional[dict[str, str]] = None


class PromptResponse(BaseModel):
    response_text: str


# ---------- Endpoint ----------

@router.post("/prompt", response_model=PromptResponse)
async def handle_prompt(body: PromptRequest):
    """
    Forwards the user prompt to Gemini with conversation history and codebase context.
    Persists the new turn to the session and returns the AI response.
    """
    session = store.sessions.get(body.session_id)
    if session is None:
        # Serverless (Vercel): session may not survive across invocations.
        # Auto-create so the prompt flow works even if the container restarted.
        session = Session(session_id=body.session_id)
        store.sessions[body.session_id] = session

    history = [msg.model_dump() for msg in body.conversation_history]

    response_text = await call_gemini(
        prompt=body.prompt_text,
        conversation_history=history,
        active_file=body.active_file,
        file_contents=body.file_contents,
    )

    # Persist the exchange for the scoring engine.
    # The frontend includes the current user message in conversation_history,
    # so strip it to avoid duplication before appending the full exchange.
    prior_history = history
    if history and history[-1].get("role") == "user":
        prior_history = history[:-1]

    session.conversation_history = prior_history + [
        {"role": "user", "content": body.prompt_text},
        {"role": "assistant", "content": response_text},
    ]

    return PromptResponse(response_text=response_text)
