"""
Central configuration for the Comic Book Studio backend.

Values are read from environment / .env once at import. Model names live here so
they can be bumped in one place when providers ship new versions.
"""

import os
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # .../comic-studio/backend
load_dotenv(BASE_DIR / ".env")


def _bool(name: str, default: bool = False) -> bool:
    return os.getenv(name, str(default)).strip().lower() in ("1", "true", "yes", "on")


# ── Server ───────────────────────────────────────────────────────────────────
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8004"))
FRONTEND_ORIGIN = os.getenv("FRONTEND_ORIGIN", "http://localhost:3002")

# ── Database ─────────────────────────────────────────────────────────────────
MONGO_URL = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
DB_NAME = os.getenv("DB_NAME", "comic_studio")

# ── Storage (local blob store; swap for S3/R2 later behind storage.py) ───────
# A relative STORAGE_DIR resolves against the backend dir, NOT the process CWD,
# so assets land in the same place no matter where uvicorn is launched from.
_storage_env = os.getenv("STORAGE_DIR", "").strip()
if _storage_env:
    _sp = Path(_storage_env)
    STORAGE_DIR = (_sp if _sp.is_absolute() else (BASE_DIR / _sp)).resolve()
else:
    STORAGE_DIR = (BASE_DIR / "storage").resolve()

# ── AI keys ──────────────────────────────────────────────────────────────────
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY", "")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
REPLICATE_API_TOKEN = os.getenv("REPLICATE_API_TOKEN", "")

# ── Models ───────────────────────────────────────────────────────────────────
GEMINI_TEXT_MODEL = os.getenv("GEMINI_TEXT_MODEL", "gemini-2.5-flash")
GEMINI_IMAGE_MODEL = os.getenv("GEMINI_IMAGE_MODEL", "gemini-2.5-flash-image")
ANTHROPIC_MODEL = os.getenv("ANTHROPIC_MODEL", "claude-sonnet-4-6")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o")

# Which provider generates story/script text: "gemini" | "anthropic" | "openai".
# Defaults to gemini (single proven key); switch to anthropic for richer prose.
STORY_PROVIDER = os.getenv("STORY_PROVIDER", "gemini").strip().lower()

# ── Generation tuning ────────────────────────────────────────────────────────
SCRIPT_TEMPERATURE = float(os.getenv("SCRIPT_TEMPERATURE", "0.85"))
MAX_RETRIES = int(os.getenv("MAX_RETRIES", "3"))
# Rough per-image cost for the usage meter (gemini-2.5-flash-image ballpark).
IMAGE_COST_USD = float(os.getenv("IMAGE_COST_USD", "0.039"))
RETRY_BACKOFF_BASE = 2  # exponential backoff base in seconds: 2, 4, 8
IMAGE_RESPONSE_MODALITIES = ["TEXT", "IMAGE"]  # Gemini image gen requires both

# ── Auth seam (single-user now, multi-user-ready) ────────────────────────────
# When AUTH_ENABLED is False, every request resolves to DEFAULT_USER_ID. Flipping
# it on later (Phase 7) is where real sessions get validated in deps.py.
AUTH_ENABLED = _bool("AUTH_ENABLED", False)
DEFAULT_USER_ID = os.getenv("DEFAULT_USER_ID", "local-user")
SESSION_TTL_DAYS = int(os.getenv("SESSION_TTL_DAYS", "30"))
