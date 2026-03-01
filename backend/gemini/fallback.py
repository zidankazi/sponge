"""
Shared Gemini fallback helper.

generate_with_fallback() tries each model in GEMINI_MODEL_CHAIN in order.
On 429 RESOURCE_EXHAUSTED it logs a warning and moves to the next model.
All other exceptions propagate normally.
Returns None only if every model in the chain is exhausted.
"""

import logging
from typing import Optional, Any

from gemini.config import GEMINI_MODEL_CHAIN

logger = logging.getLogger(__name__)


async def generate_with_fallback(client, *, contents, config) -> Optional[Any]:
    """
    Try each model in GEMINI_MODEL_CHAIN in priority order.

    Args:
        client: google.genai.Client instance
        contents: list of content dicts for generate_content
        config: types.GenerateContentConfig instance

    Returns:
        The first successful GenerateContentResponse, or None if all
        models in the chain are rate-limited.
    """
    for model in GEMINI_MODEL_CHAIN:
        try:
            response = await client.aio.models.generate_content(
                model=model,
                contents=contents,
                config=config,
            )
            return response
        except Exception as e:
            err_str = str(e)
            if "429" in err_str or "RESOURCE_EXHAUSTED" in err_str:
                logger.warning(
                    f"Model {model!r} quota exhausted — trying next in chain"
                )
                continue
            # Non-quota errors propagate so callers can handle/log them
            raise

    logger.error(
        "All models in fallback chain exhausted: %s", GEMINI_MODEL_CHAIN
    )
    return None
