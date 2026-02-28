"""
Gemini API client.

Reads GEMINI_API_KEY from backend/.env (loaded by main.py at startup).
Uses google-generativeai to send codebase context + conversation history
and return structured guidance as response text.
"""

import asyncio
import os
from typing import Optional

import google.generativeai as genai

SYSTEM_PROMPT = """
You are an AIDE (AI-assisted Development Environment) helping a developer work through a timed coding exercise on the RQ (Redis Queue) codebase.

You have access to the full codebase and the file the developer is currently viewing.

Your role:
- Guide the developer toward understanding and implementing the solution themselves
- Reference specific files, classes, and functions from the actual codebase provided
- Ask clarifying questions when the intent is unclear
- Suggest the next small step rather than the complete solution
- When the developer asks you to make a change, describe what needs to change and where, then let them implement it — do not write the entire implementation unprompted

What you should NOT do:
- Provide a complete, copy-pasteable solution to the main task in one shot
- Write large blocks of new code without the developer requesting it
- Skip explanation in favor of just dumping code
- Make up file paths or function signatures that don't exist in the codebase

When referencing code, use file paths and line numbers (e.g. rq/worker.py line 437).
Be concise — this is a timed exercise. Guide, don't solve.
""".strip()


def _build_context_block(
    active_file: Optional[str],
    file_contents: Optional[dict[str, str]],
) -> str:
    """Build a codebase context string to prepend to the user prompt."""
    if not file_contents:
        return ""

    parts = ["=== CODEBASE CONTEXT ==="]

    # Active file first for prominence
    if active_file and active_file in file_contents:
        parts.append(f"\n--- ACTIVE FILE: {active_file} ---")
        parts.append(file_contents[active_file])

    # Remaining files
    for path, content in file_contents.items():
        if path == active_file:
            continue
        parts.append(f"\n--- {path} ---")
        parts.append(content)

    parts.append("\n=== END CODEBASE CONTEXT ===\n")
    return "\n".join(parts)


def _call_gemini_sync(
    prompt_with_context: str,
    conversation_history: list[dict],
) -> str:
    """Synchronous Gemini call — run via asyncio.to_thread from the async wrapper."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        return (
            "**Gemini unavailable** — `GEMINI_API_KEY` is not set. "
            "Add it to `backend/.env` and restart the server."
        )

    genai.configure(api_key=api_key)
    model = genai.GenerativeModel(
        model_name="gemini-1.5-flash",
        system_instruction=SYSTEM_PROMPT,
    )

    # Convert our history format → Gemini Content format
    # The last user message is sent as send_message, not in history
    gemini_history = []
    for turn in conversation_history:
        role = "user" if turn["role"] == "user" else "model"
        gemini_history.append({"role": role, "parts": [turn["content"]]})

    chat = model.start_chat(history=gemini_history)
    response = chat.send_message(prompt_with_context)
    return response.text


async def call_gemini(
    prompt: str,
    conversation_history: list[dict],
    active_file: Optional[str] = None,
    file_contents: Optional[dict[str, str]] = None,
) -> str:
    """
    Send a prompt to Gemini with full conversation history and codebase context.

    Args:
        prompt: The latest user message.
        conversation_history: Prior turns as [{"role": "user"|"assistant", "content": str}].
        active_file: The file path currently open in the editor.
        file_contents: Dict mapping file paths to their current contents.

    Returns:
        The model's response as a plain string.
    """
    context_block = _build_context_block(active_file, file_contents)
    prompt_with_context = f"{context_block}{prompt}" if context_block else prompt

    return await asyncio.to_thread(_call_gemini_sync, prompt_with_context, conversation_history)
