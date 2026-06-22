"""Small shared helpers: id generation, timestamps, doc cleanup."""

import re
import uuid
from datetime import datetime, timezone
from typing import Any, Iterable


def new_id(prefix: str) -> str:
    """Readable, sortable-enough id like `ser_3f9a1c2b4d5e`."""
    return f"{prefix}_{uuid.uuid4().hex[:12]}"


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def clean(doc: dict | None) -> dict | None:
    """Drop Mongo's internal `_id` so a document is JSON-serialisable."""
    if doc is None:
        return None
    return {k: v for k, v in doc.items() if k != "_id"}


def clean_many(docs: Iterable[dict]) -> list[dict]:
    return [clean(d) for d in docs]


def asset_url(asset_id: str | None) -> str | None:
    """Public URL the frontend uses to fetch a stored asset."""
    return f"/api/assets/{asset_id}" if asset_id else None


def slugify(text: str, max_len: int = 50) -> str:
    text = (text or "").lower()
    text = re.sub(r"[^\w\s-]", "", text)
    text = re.sub(r"[\s_-]+", "-", text).strip("-")
    return text[:max_len].strip("-") or "comic"

