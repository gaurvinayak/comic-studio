"""
Asset blob store.

Writes generated images / exports to the local filesystem and records a row in
the `assets` collection. All access goes through `store_asset` / `read_asset` so
that swapping in S3/R2 later is a single-file change.
"""

from pathlib import Path

from . import config, db
from .util import new_id, utcnow, clean

_EXT_BY_MIME = {
    "image/png": ".png",
    "image/jpeg": ".jpg",
    "image/webp": ".webp",
    "application/pdf": ".pdf",
}

# kind ∈ {character_ref, panel_art, style_ref, export}


def _abs_path(rel_path: str) -> Path:
    return config.STORAGE_DIR / rel_path


async def store_asset(
    *,
    data: bytes,
    mime: str,
    kind: str,
    series_id: str | None = None,
    meta: dict | None = None,
) -> dict:
    """Persist bytes to disk + assets collection; return the asset doc (no _id)."""
    asset_id = new_id("ast")
    ext = _EXT_BY_MIME.get(mime, ".bin")
    rel_path = f"{kind}/{asset_id}{ext}"
    abs_path = _abs_path(rel_path)
    abs_path.parent.mkdir(parents=True, exist_ok=True)
    abs_path.write_bytes(data)

    doc = {
        "asset_id": asset_id,
        "series_id": series_id,
        "kind": kind,
        "path": rel_path,
        "mime": mime,
        "meta": meta or {},
        "created_at": utcnow(),
    }
    await db.assets_col().insert_one(doc)
    return clean(doc)


async def get_asset_doc(asset_id: str) -> dict | None:
    return await db.assets_col().find_one({"asset_id": asset_id}, {"_id": 0})


async def read_asset(asset_id: str) -> tuple[bytes | None, dict | None]:
    """Return (bytes, doc). bytes is None if the doc or file is missing."""
    doc = await get_asset_doc(asset_id)
    if not doc:
        return None, None
    path = _abs_path(doc["path"])
    if not path.exists():
        return None, doc
    return path.read_bytes(), doc


async def read_asset_bytes(asset_id: str) -> bytes | None:
    data, _ = await read_asset(asset_id)
    return data


async def delete_assets_for_series(series_id: str) -> int:
    """Unlink files + remove asset docs for a series (used on series delete)."""
    count = 0
    async for a in db.assets_col().find({"series_id": series_id}):
        try:
            _abs_path(a["path"]).unlink(missing_ok=True)
        except Exception:  # noqa: BLE001 — best-effort file cleanup
            pass
        count += 1
    await db.assets_col().delete_many({"series_id": series_id})
    return count
