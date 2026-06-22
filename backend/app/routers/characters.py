"""
Character endpoints: add (AI-designed or manual), edit, delete, and the
reference-portrait lifecycle (generate → choose → lock) that powers consistency.
"""

import asyncio

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from .. import db, repo, storage
from ..deps import assert_series_owner, get_current_user
from ..services import consistency, imagegen, jobs, story
from ..util import asset_url, utcnow

router = APIRouter(prefix="/api", tags=["characters"])


class AddCharacterBody(BaseModel):
    concept: str | None = None  # let the AI design from a one-liner...
    name: str | None = None  # ...or provide fields manually
    role: str | None = None
    appearance_anchor: str | None = None


class UpdateCharacterBody(BaseModel):
    name: str | None = None
    role: str | None = None
    concept: str | None = None
    backstory: str | None = None
    appearance_anchor: str | None = None
    portrait_prompt: str | None = None
    personality: dict | None = None


class SetPortraitBody(BaseModel):
    asset_id: str


async def _get_character_or_404(character_id: str) -> dict:
    char = await db.characters_col().find_one({"character_id": character_id})
    if not char:
        raise HTTPException(status_code=404, detail="Character not found")
    return char


@router.post("/series/{series_id}/characters")
async def add_character(series_id: str, body: AddCharacterBody, user=Depends(get_current_user)):
    series = await assert_series_owner(series_id, user)

    if body.concept:
        designed = await run_in_threadpool(story.design_character, series, body.concept)
        char = await repo.create_character(series_id, designed)
    else:
        if not (body.name and body.appearance_anchor):
            raise HTTPException(
                status_code=400,
                detail="Provide either 'concept' or both 'name' and 'appearance_anchor'",
            )
        char = await repo.create_character(series_id, body.model_dump(exclude_none=True))
    return {"character": repo.serialize_character(char)}


@router.patch("/characters/{character_id}")
async def update_character(
    character_id: str, body: UpdateCharacterBody, user=Depends(get_current_user)
):
    await _get_character_or_404(character_id)
    updates = body.model_dump(exclude_none=True)
    if updates:
        updates["updated_at"] = utcnow()
        await db.characters_col().update_one(
            {"character_id": character_id}, {"$set": updates}
        )
    char = await _get_character_or_404(character_id)
    return {"character": repo.serialize_character(char)}


@router.get("/characters/{character_id}")
async def get_character(character_id: str, user=Depends(get_current_user)):
    char = await _get_character_or_404(character_id)
    return {"character": repo.serialize_character(char)}


@router.delete("/characters/{character_id}")
async def delete_character(character_id: str, user=Depends(get_current_user)):
    res = await db.characters_col().delete_one({"character_id": character_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Character not found")
    return {"deleted": True}


# ── Reference portrait lifecycle ─────────────────────────────────────────────


async def _run_portrait_job(job_id: str, character_id: str, prompt: str) -> None:
    async def work() -> dict:
        png = await asyncio.to_thread(imagegen.generate_image, prompt)
        char = await db.characters_col().find_one({"character_id": character_id})
        if not char:
            raise RuntimeError("character no longer exists")
        asset = await storage.store_asset(
            data=png,
            mime="image/png",
            kind="character_ref",
            series_id=char["series_id"],
            meta={"character_id": character_id, "prompt": prompt},
        )
        # first generated portrait becomes the canonical one automatically
        set_fields = {"updated_at": utcnow()}
        if not char.get("portrait_asset_id"):
            set_fields["portrait_asset_id"] = asset["asset_id"]
        await db.characters_col().update_one(
            {"character_id": character_id},
            {"$set": set_fields, "$push": {"reference_images": asset["asset_id"]}},
        )
        return {
            "character_id": character_id,
            "asset_id": asset["asset_id"],
            "url": asset_url(asset["asset_id"]),
        }

    await jobs.run_job(job_id, work)


@router.post("/characters/{character_id}/generate-portrait")
async def generate_portrait(
    character_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)
):
    char = await _get_character_or_404(character_id)
    series = await assert_series_owner(char["series_id"], user)
    prompt = consistency.build_portrait_prompt(series or {}, char)
    job = await jobs.create_job(
        "generate_character", series_id=char["series_id"], meta={"character_id": character_id}
    )
    background_tasks.add_task(_run_portrait_job, job["job_id"], character_id, prompt)
    return {"job_id": job["job_id"], "status": "queued"}


@router.post("/characters/{character_id}/set-portrait")
async def set_portrait(
    character_id: str, body: SetPortraitBody, user=Depends(get_current_user)
):
    char = await _get_character_or_404(character_id)
    if body.asset_id not in (char.get("reference_images") or []):
        raise HTTPException(
            status_code=400, detail="asset_id is not one of this character's references"
        )
    await db.characters_col().update_one(
        {"character_id": character_id},
        {"$set": {"portrait_asset_id": body.asset_id, "updated_at": utcnow()}},
    )
    char = await _get_character_or_404(character_id)
    return {"character": repo.serialize_character(char)}


@router.post("/characters/{character_id}/lock")
async def lock_character(character_id: str, user=Depends(get_current_user)):
    char = await _get_character_or_404(character_id)
    if not char.get("portrait_asset_id"):
        raise HTTPException(
            status_code=400, detail="Generate and select a portrait before locking"
        )
    await db.characters_col().update_one(
        {"character_id": character_id}, {"$set": {"status": "locked", "updated_at": utcnow()}}
    )
    char = await _get_character_or_404(character_id)
    return {"character": repo.serialize_character(char)}


@router.post("/characters/{character_id}/unlock")
async def unlock_character(character_id: str, user=Depends(get_current_user)):
    await _get_character_or_404(character_id)
    await db.characters_col().update_one(
        {"character_id": character_id}, {"$set": {"status": "draft", "updated_at": utcnow()}}
    )
    char = await _get_character_or_404(character_id)
    return {"character": repo.serialize_character(char)}
