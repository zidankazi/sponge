"""
Gemini model configuration.

Priority chain: best/newest model first, most-available free tier last.
On 429 RESOURCE_EXHAUSTED, the fallback helper tries each model in order.

Override the primary model via GEMINI_MODEL env var (e.g. in .env):
  GEMINI_MODEL=gemini-2.5-flash
"""

import os

# Priority chain: highest capability first, most available last
_primary = os.environ.get("GEMINI_MODEL", "gemini-2.5-pro")
GEMINI_MODEL_CHAIN = list(dict.fromkeys([
    _primary,
    "gemini-2.5-flash",
    "gemini-2.0-flash",
]))
