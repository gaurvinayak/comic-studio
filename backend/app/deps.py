"""
Auth dependency — the single seam that makes the app multi-user-ready.

Today (AUTH_ENABLED=False) every request resolves to the local owner user, so no
login is required. When auth is switched on (Phase 7) this is the one place that
validates a bearer token against `user_sessions` and returns the real user — the
rest of the app already threads `owner_id` through, so nothing else changes.
"""

from datetime import timezone

from fastapi import Header, HTTPException

from . import config, db
from .util import utcnow


async def ensure_default_user() -> None:
    existing = await db.users_col().find_one({"user_id": config.DEFAULT_USER_ID})
    if not existing:
        await db.users_col().insert_one(
            {
                "user_id": config.DEFAULT_USER_ID,
                "email": None,
                "role": "owner",
                "created_at": utcnow(),
            }
        )


async def get_current_user(authorization: str | None = Header(default=None)) -> dict:
    if not config.AUTH_ENABLED:
        user = await db.users_col().find_one(
            {"user_id": config.DEFAULT_USER_ID}, {"_id": 0}
        )
        return user or {"user_id": config.DEFAULT_USER_ID, "role": "owner"}

    # ── Phase 7: real auth ──
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="Missing bearer token")
    token = authorization.split(" ", 1)[1].strip()
    session = await db.col("user_sessions").find_one({"session_token": token})
    if not session:
        raise HTTPException(status_code=401, detail="Invalid or expired session")
    exp = session.get("expires_at")
    if exp is not None:
        # Mongo returns naive UTC datetimes; utcnow() is tz-aware — normalize.
        if exp.tzinfo is None:
            exp = exp.replace(tzinfo=timezone.utc)
        if exp < utcnow():
            await db.col("user_sessions").delete_one({"session_token": token})
            raise HTTPException(status_code=401, detail="Session expired")
    user = await db.users_col().find_one(
        {"user_id": session["user_id"]}, {"_id": 0, "password_hash": 0}
    )
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def assert_series_owner(series_id: str, user: dict) -> dict:
    """Return the series if the current user may access it, else 404 (no leak)."""
    series = await db.series_col().find_one({"series_id": series_id}, {"_id": 0})
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    if config.AUTH_ENABLED and series.get("owner_id") != user.get("user_id"):
        raise HTTPException(status_code=404, detail="Series not found")
    return series
