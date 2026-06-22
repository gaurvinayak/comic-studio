"""Series (comic book project) endpoints: create-from-theme, list, get, update, delete."""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from .. import config, db, repo, storage
from ..deps import assert_series_owner, get_current_user
from ..services import jobs, render, story
from ..util import clean, utcnow

router = APIRouter(prefix="/api/series", tags=["series"])


class CreateSeriesBody(BaseModel):
    theme: str
    hint: str | None = ""


class UpdateSeriesBody(BaseModel):
    title: str | None = None
    premise: str | None = None
    genre: str | None = None
    tone: str | None = None
    art_style: str | None = None
    world_bible: str | None = None
    story_state: str | None = None
    status: str | None = None


@router.post("")
async def create_series(body: CreateSeriesBody, user=Depends(get_current_user)):
    if not body.theme.strip():
        raise HTTPException(status_code=400, detail="theme is required")
    # LLM bootstrap (blocking SDK) → offload so the event loop stays responsive
    bootstrap = await run_in_threadpool(story.bootstrap_series, body.theme, body.hint or "")
    series = await repo.create_series(user["user_id"], body.theme, bootstrap)
    characters = []
    for c in bootstrap.get("characters", []):
        char = await repo.create_character(series["series_id"], c)
        characters.append(repo.serialize_character(char))
    return {"series": series, "characters": characters}


@router.get("")
async def list_series(user=Depends(get_current_user)):
    cursor = db.series_col().find({"owner_id": user["user_id"]}).sort("created_at", -1)
    items = [repo.serialize_series(d) async for d in cursor]
    for s in items:
        s["character_count"] = await db.characters_col().count_documents(
            {"series_id": s["series_id"]}
        )
    return {"series": items}


@router.get("/{series_id}")
async def get_series(series_id: str, user=Depends(get_current_user)):
    series = repo.serialize_series(await assert_series_owner(series_id, user))
    images = await db.assets_col().count_documents(
        {"series_id": series_id, "kind": {"$in": ["character_ref", "panel_art", "cover"]}}
    )
    series["usage"] = {"images": images, "est_cost_usd": round(images * config.IMAGE_COST_USD, 2)}
    chars_cursor = db.characters_col().find({"series_id": series_id}).sort("created_at", 1)
    characters = [repo.serialize_character(d) async for d in chars_cursor]
    return {"series": series, "characters": characters}


@router.patch("/{series_id}")
async def update_series(series_id: str, body: UpdateSeriesBody, user=Depends(get_current_user)):
    await assert_series_owner(series_id, user)
    updates = body.model_dump(exclude_none=True)
    if updates:
        updates["updated_at"] = utcnow()
        await db.series_col().update_one({"series_id": series_id}, {"$set": updates})
    series = await db.series_col().find_one({"series_id": series_id}, {"_id": 0})
    if not series:
        raise HTTPException(status_code=404, detail="Series not found")
    return {"series": repo.serialize_series(series)}


async def _run_cover_job(job_id: str, series_id: str) -> None:
    await jobs.run_job(job_id, lambda: render.generate_cover(series_id))


@router.post("/{series_id}/generate-cover")
async def generate_cover(series_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    await assert_series_owner(series_id, user)
    job = await jobs.create_job("generate_cover", series_id=series_id)
    background_tasks.add_task(_run_cover_job, job["job_id"], series_id)
    return {"job_id": job["job_id"], "status": "queued"}


@router.delete("/{series_id}")
async def delete_series(series_id: str, user=Depends(get_current_user)):
    await assert_series_owner(series_id, user)
    res = await db.series_col().delete_one({"series_id": series_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Series not found")
    # cascade: remove all story data + generated assets for this series
    await db.panels_col().delete_many({"series_id": series_id})
    await db.pages_col().delete_many({"series_id": series_id})
    await db.parts_col().delete_many({"series_id": series_id})
    await db.characters_col().delete_many({"series_id": series_id})
    await storage.delete_assets_for_series(series_id)
    return {"deleted": True}
