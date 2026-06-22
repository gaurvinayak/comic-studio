"""
Dev / plumbing endpoints — health check plus smoke tests that exercise the LLM
and image providers end to end (and persist a real asset). Used to verify Phase 0.
"""

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool

from .. import config, db, storage
from ..deps import get_current_user
from ..models import DevImageRequest, DevLLMRequest
from ..services import imagegen, llm
from ..util import asset_url

router = APIRouter(prefix="/api", tags=["dev"])


@router.get("/usage")
async def usage(user=Depends(get_current_user)):
    """Account-wide image-generation usage + estimated spend for the current user."""
    series_ids = [
        s["series_id"]
        async for s in db.series_col().find({"owner_id": user["user_id"]}, {"series_id": 1, "_id": 0})
    ]
    images = 0
    if series_ids:
        images = await db.assets_col().count_documents(
            {"series_id": {"$in": series_ids}, "kind": {"$in": ["character_ref", "panel_art", "cover"]}}
        )
    return {"images": images, "est_cost_usd": round(images * config.IMAGE_COST_USD, 2)}


@router.get("/health")
async def health():
    try:
        mongo_ok = await db.ping()
    except Exception:  # noqa: BLE001
        mongo_ok = False
    return {
        "ok": True,
        "service": "comic-studio",
        "mongo": mongo_ok,
        "auth_enabled": config.AUTH_ENABLED,
        "story_provider": config.STORY_PROVIDER,
        "text_model": config.GEMINI_TEXT_MODEL,
        "image_model": config.GEMINI_IMAGE_MODEL,
        "keys": {
            "gemini": bool(config.GEMINI_API_KEY),
            "anthropic": bool(config.ANTHROPIC_API_KEY),
            "openai": bool(config.OPENAI_API_KEY),
        },
    }


@router.post("/dev/test-llm")
async def test_llm(req: DevLLMRequest):
    # blocking SDK call → offload to a worker thread so the event loop stays free
    text = await run_in_threadpool(
        llm.generate_text, req.system, req.prompt, provider=req.provider
    )
    return {"provider": req.provider or config.STORY_PROVIDER, "text": text}


@router.post("/dev/test-image")
async def test_image(req: DevImageRequest):
    png = await run_in_threadpool(imagegen.generate_image, req.prompt)
    asset = await storage.store_asset(
        data=png,
        mime="image/png",
        kind="panel_art",
        meta={"source": "dev/test-image", "prompt": req.prompt},
    )
    return {
        "asset_id": asset["asset_id"],
        "url": asset_url(asset["asset_id"]),
        "bytes": len(png),
    }
