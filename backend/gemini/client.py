"""
Gemini API client.

Reads GEMINI_API_KEY from the environment (set in backend/.env).
Wraps google-generativeai to send conversation history and return response text.
"""

import os

# TODO: uncomment once google-generativeai is installed and key is set
# import google.generativeai as genai

SYSTEM_PROMPT = """
You are an expert AI assistant helping a developer explore and extend the RQ (Redis Queue) codebase.

Your role:
- Answer questions about how RQ works internally (workers, queues, jobs, connections)
- Help the developer think through implementing a new feature or fixing a bug
- Reference specific files and functions when possible (e.g. rq/worker.py, rq/job.py)
- Be concise but precise — this is a timed coding exercise

What you should NOT do:
- Write complete implementations for the developer unprompted
- Give away answers without explanation
- Make up API details that don't exist in RQ

When the developer asks you to look at code, reason from the file paths and function names
they mention. Guide them toward understanding rather than just handing them solutions.
""".strip()


async def call_gemini(
    prompt: str,
    conversation_history: list[dict],
) -> str:
    """
    Send a prompt to Gemini with full conversation history and return the response text.

    Args:
        prompt: The latest user message.
        conversation_history: Prior turns as [{"role": "user"|"assistant", "content": str}].

    Returns:
        The model's response as a plain string.

    TODO: Replace the placeholder return with real Gemini API call below.
    """

    # --- Placeholder (remove when implementing) ---
    return (
        "[Gemini placeholder] I can see your question about the RQ codebase. "
        "Once the GEMINI_API_KEY is configured this will return a real response. "
        f"You asked: {prompt!r}"
    )

    # --- Real implementation (uncomment and fill in) ---
    # genai.configure(api_key=os.environ["GEMINI_API_KEY"])
    # model = genai.GenerativeModel(
    #     model_name="gemini-1.5-flash",
    #     system_instruction=SYSTEM_PROMPT,
    # )
    #
    # # Convert our history format → Gemini Content format
    # gemini_history = []
    # for turn in conversation_history:
    #     role = "user" if turn["role"] == "user" else "model"
    #     gemini_history.append({"role": role, "parts": [turn["content"]]})
    #
    # chat = model.start_chat(history=gemini_history)
    # response = chat.send_message(prompt)
    # return response.text
