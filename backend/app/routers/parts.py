"""
Story endpoints: generate the next part (continuing the story), read a part's full
script (pages → panels → dialogue), edit panels, and delete parts.
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel

from .. import db, repo
from ..deps import assert_series_owner, get_current_user
from ..services import jobs, render, story
from ..util import asset_url, clean, new_id, slugify, utcnow

router = APIRouter(prefix="/api", tags=["parts"])


class GeneratePartBody(BaseModel):
    direction: str | None = ""


class UpdatePanelBody(BaseModel):
    scene: str | None = None
    shot: str | None = None
    mood: str | None = None
    dialogue: list[dict] | None = None
    present_character_ids: list[str] | None = None


class SetPanelArtBody(BaseModel):
    asset_id: str


@router.post("/series/{series_id}/parts")
async def generate_part(series_id: str, body: GeneratePartBody, user=Depends(get_current_user)):
    series = await assert_series_owner(series_id, user)
    characters = [clean(c) async for c in db.characters_col().find({"series_id": series_id})]
    if not characters:
        raise HTTPException(status_code=400, detail="Add at least one character before writing a part")

    previous = [clean(p) async for p in db.parts_col().find({"series_id": series_id}).sort("number", 1)]
    number = len(previous) + 1

    data = await run_in_threadpool(
        story.generate_part, series, characters, previous, body.direction or ""
    )
    part = await repo.persist_part(series_id, number, data, characters)

    # advance continuity memory for the next part
    story_so_far = data.get("story_so_far") or series.get("story_state", "")
    await db.series_col().update_one(
        {"series_id": series_id},
        {"$set": {"story_state": story_so_far, "status": "in_progress", "updated_at": utcnow()}},
    )
    return {"part": part, "story_state": story_so_far}


@router.get("/series/{series_id}/parts")
async def list_parts(series_id: str, user=Depends(get_current_user)):
    series = await db.series_col().find_one({"series_id": series_id}, {"_id": 0})
    parts = [clean(p) async for p in db.parts_col().find({"series_id": series_id}).sort("number", 1)]
    for p in parts:
        p["page_count"] = await db.pages_col().count_documents({"part_id": p["part_id"]})
        p["panel_count"] = await db.panels_col().count_documents({"part_id": p["part_id"]})
    return {"parts": parts, "story_state": (series or {}).get("story_state", "")}


@router.get("/parts/{part_id}")
async def get_part(part_id: str, user=Depends(get_current_user)):
    part = await db.parts_col().find_one({"part_id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    await assert_series_owner(part["series_id"], user)
    characters = [clean(c) async for c in db.characters_col().find({"series_id": part["series_id"]})]
    name_map = {c["character_id"]: c["name"] for c in characters}

    pages = [clean(pg) async for pg in db.pages_col().find({"part_id": part_id}).sort("number", 1)]
    for pg in pages:
        panels = [
            repo.serialize_panel(pan, name_map)
            async for pan in db.panels_col().find({"page_id": pg["page_id"]}).sort("number", 1)
        ]
        pg["composite_url"] = asset_url(pg.get("composite_asset_id"))
        pg["panels"] = panels
    part["pages"] = pages
    return {"part": part, "characters": [repo.serialize_character(c) for c in characters]}


@router.post("/parts/{part_id}/publish")
async def publish_part(part_id: str, user=Depends(get_current_user)):
    part = await db.parts_col().find_one({"part_id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    series = await assert_series_owner(part["series_id"], user)
    composed = await db.pages_col().count_documents(
        {"part_id": part_id, "composite_asset_id": {"$ne": None}}
    )
    if composed == 0:
        raise HTTPException(status_code=400, detail="Draw the part before publishing it")
    slug = part.get("share_slug") or (
        f"{slugify(series['title'] + ' ' + (part.get('title') or ''))}-{new_id('x').split('_')[1][:6]}"
    )
    await db.parts_col().update_one(
        {"part_id": part_id},
        {
            "$set": {
                "is_public": True,
                "share_slug": slug,
                "published_at": utcnow(),
                "author_name": user.get("name") or "Anonymous",
            }
        },
    )
    return {"part": await db.parts_col().find_one({"part_id": part_id}, {"_id": 0})}


@router.post("/parts/{part_id}/unpublish")
async def unpublish_part(part_id: str, user=Depends(get_current_user)):
    part = await db.parts_col().find_one({"part_id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    await assert_series_owner(part["series_id"], user)
    await db.parts_col().update_one({"part_id": part_id}, {"$set": {"is_public": False}})
    return {"part": await db.parts_col().find_one({"part_id": part_id}, {"_id": 0})}


@router.patch("/panels/{panel_id}")
async def update_panel(panel_id: str, body: UpdatePanelBody, user=Depends(get_current_user)):
    updates = body.model_dump(exclude_none=True)
    if updates:
        updates["updated_at"] = utcnow()
        await db.panels_col().update_one({"panel_id": panel_id}, {"$set": updates})
    pan = await db.panels_col().find_one({"panel_id": panel_id})
    if not pan:
        raise HTTPException(status_code=404, detail="Panel not found")
    return {"panel": repo.serialize_panel(pan)}


# ── Panel art generation (Phase 3) ───────────────────────────────────────────


async def _run_panel_art_job(job_id: str, panel_id: str) -> None:
    await jobs.run_job(job_id, lambda: render.generate_panel_art(panel_id))


@router.post("/panels/{panel_id}/generate-art")
async def generate_panel_art(
    panel_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)
):
    panel = await db.panels_col().find_one({"panel_id": panel_id}, {"_id": 0})
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    await assert_series_owner(panel["series_id"], user)
    job = await jobs.create_job(
        "generate_panel", series_id=panel["series_id"], meta={"panel_id": panel_id}
    )
    background_tasks.add_task(_run_panel_art_job, job["job_id"], panel_id)
    return {"job_id": job["job_id"], "status": "queued"}


@router.post("/panels/{panel_id}/set-art")
async def set_panel_art(panel_id: str, body: SetPanelArtBody, user=Depends(get_current_user)):
    panel = await db.panels_col().find_one({"panel_id": panel_id})
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    if body.asset_id not in (panel.get("art_variants") or []):
        raise HTTPException(status_code=400, detail="asset_id is not a variant of this panel")
    art = panel.get("art") or {}
    art["asset_id"] = body.asset_id
    await db.panels_col().update_one(
        {"panel_id": panel_id}, {"$set": {"art": art, "updated_at": utcnow()}}
    )
    panel = await db.panels_col().find_one({"panel_id": panel_id})
    return {"panel": repo.serialize_panel(panel)}


@router.get("/panels/{panel_id}")
async def get_panel(panel_id: str, user=Depends(get_current_user)):
    panel = await db.panels_col().find_one({"panel_id": panel_id})
    if not panel:
        raise HTTPException(status_code=404, detail="Panel not found")
    return {"panel": repo.serialize_panel(panel)}


@router.delete("/parts/{part_id}")
async def delete_part(part_id: str, user=Depends(get_current_user)):
    await db.panels_col().delete_many({"part_id": part_id})
    await db.pages_col().delete_many({"part_id": part_id})
    res = await db.parts_col().delete_one({"part_id": part_id})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Part not found")
    return {"deleted": True}
