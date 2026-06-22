"""MongoDB (Motor async) connection + collection accessors + index setup."""

import asyncio

import motor.motor_asyncio

from . import config

_client: motor.motor_asyncio.AsyncIOMotorClient | None = None
_client_loop = None


def get_client() -> motor.motor_asyncio.AsyncIOMotorClient:
    """
    Return a Motor client bound to the current event loop.

    A Motor client caches the loop it was created on. Under uvicorn there is one
    loop for the app's lifetime so this is created once. Test clients, however,
    can run requests on different loops — so we recreate the client if the running
    loop changed, which avoids "Event loop is closed" errors in tests.
    """
    global _client, _client_loop
    try:
        loop = asyncio.get_running_loop()
    except RuntimeError:
        loop = None
    if _client is None or (loop is not None and _client_loop is not loop):
        _client = motor.motor_asyncio.AsyncIOMotorClient(config.MONGO_URL)
        _client_loop = loop
    return _client


def get_db():
    return get_client()[config.DB_NAME]


def col(name: str):
    return get_db()[name]


# ── Named collection accessors ───────────────────────────────────────────────
def series_col():      return col("series")
def characters_col():  return col("characters")
def parts_col():       return col("parts")
def pages_col():       return col("pages")
def panels_col():      return col("panels")
def assets_col():      return col("assets")
def jobs_col():        return col("jobs")
def users_col():       return col("users")


async def ensure_indexes() -> None:
    """Create indexes for every collection up front (idempotent)."""
    await series_col().create_index("series_id", unique=True)
    await series_col().create_index("owner_id")

    await characters_col().create_index("character_id", unique=True)
    await characters_col().create_index("series_id")

    await parts_col().create_index("part_id", unique=True)
    await parts_col().create_index([("series_id", 1), ("number", 1)])
    await parts_col().create_index("share_slug", unique=True, sparse=True)
    await parts_col().create_index("is_public")

    await pages_col().create_index("page_id", unique=True)
    await pages_col().create_index([("part_id", 1), ("number", 1)])

    await panels_col().create_index("panel_id", unique=True)
    await panels_col().create_index([("page_id", 1), ("number", 1)])

    await assets_col().create_index("asset_id", unique=True)
    await assets_col().create_index("series_id")

    await jobs_col().create_index("job_id", unique=True)
    await jobs_col().create_index([("series_id", 1), ("created_at", -1)])

    await users_col().create_index("user_id", unique=True)


async def ping() -> bool:
    await get_client().admin.command("ping")
    return True
