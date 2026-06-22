"""
Page composition + batch part operations (Phase 4).

- compose a single page (panel art + lettering → finished page PNG)
- "draw the whole part" — a background job that generates art for every panel
- compose the whole part (all pages)
"""

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from pydantic import BaseModel

from .. import db
from ..deps import assert_series_owner, get_current_user
from ..services import jobs, render
from ..util import clean, utcnow

router = APIRouter(prefix="/api", tags=["pages"])

VALID_LAYOUTS = {"auto", "vertical", "grid", "wide-top"}


class LayoutBody(BaseModel):
    template: str


class CustomLayoutBody(BaseModel):
    cells: list[dict]  # [{x, y, w, h}] fractions of the page, one per panel


@router.post("/pages/{page_id}/compose")
async def compose_page(page_id: str, user=Depends(get_current_user)):
    page = await db.pages_col().find_one({"page_id": page_id}, {"_id": 0})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    await assert_series_owner(page["series_id"], user)
    return await render.compose_page(page_id)


@router.post("/pages/{page_id}/layout")
async def set_page_layout(page_id: str, body: LayoutBody, user=Depends(get_current_user)):
    page = await db.pages_col().find_one({"page_id": page_id}, {"_id": 0})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    await assert_series_owner(page["series_id"], user)
    template = body.template if body.template in VALID_LAYOUTS else "auto"
    await db.pages_col().update_one(
        {"page_id": page_id}, {"$set": {"layout_template": template, "updated_at": utcnow()}}
    )
    return await render.compose_page(page_id)


def _clamp01(v, default=0.0):
    try:
        return min(max(float(v), 0.0), 1.0)
    except (TypeError, ValueError):
        return default


@router.post("/pages/{page_id}/custom-layout")
async def set_custom_layout(page_id: str, body: CustomLayoutBody, user=Depends(get_current_user)):
    page = await db.pages_col().find_one({"page_id": page_id}, {"_id": 0})
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    await assert_series_owner(page["series_id"], user)
    cells = [
        {
            "x": _clamp01(c.get("x")),
            "y": _clamp01(c.get("y")),
            "w": max(_clamp01(c.get("w"), 0.3), 0.05),
            "h": max(_clamp01(c.get("h"), 0.3), 0.05),
        }
        for c in body.cells
    ]
    await db.pages_col().update_one(
        {"page_id": page_id},
        {"$set": {"layout_template": "custom", "custom_cells": cells, "updated_at": utcnow()}},
    )
    return await render.compose_page(page_id)


@router.post("/parts/{part_id}/compose")
async def compose_part(part_id: str, user=Depends(get_current_user)):
    part = await db.parts_col().find_one({"part_id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    await assert_series_owner(part["series_id"], user)
    pages = [clean(p) async for p in db.pages_col().find({"part_id": part_id}).sort("number", 1)]
    if not pages:
        raise HTTPException(status_code=404, detail="No pages to compose")
    out = [await render.compose_page(pg["page_id"]) for pg in pages]
    return {"pages": out}


@router.post("/parts/{part_id}/export-pdf")
async def export_part_pdf(part_id: str, user=Depends(get_current_user)):
    part = await db.parts_col().find_one({"part_id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    await assert_series_owner(part["series_id"], user)
    return await render.export_part_pdf(part_id)


async def _run_part_art_job(job_id: str, part_id: str) -> None:
    async def work() -> dict:
        pages = [p async for p in db.pages_col().find({"part_id": part_id}).sort("number", 1)]
        panels = []
        for pg in pages:
            async for pan in db.panels_col().find({"page_id": pg["page_id"]}).sort("number", 1):
                panels.append(pan)
        total = len(panels) or 1
        ok = 0
        failed = []
        for i, pan in enumerate(panels, 1):
            try:
                await render.generate_panel_art(pan["panel_id"])
                ok += 1
            except Exception:  # noqa: BLE001 — one bad panel shouldn't kill the batch
                failed.append(pan["panel_id"])
                await db.panels_col().update_one(
                    {"panel_id": pan["panel_id"]},
                    {"$set": {"art.status": "failed", "updated_at": utcnow()}},
                )
            await jobs.update_job(job_id, progress=int(i / total * 100))
        # auto-compose the pages once art exists
        for pg in pages:
            try:
                await render.compose_page(pg["page_id"])
            except Exception:  # noqa: BLE001
                pass
        return {"generated": ok, "failed": len(failed), "total": len(panels), "pages": len(pages)}

    await jobs.run_job(job_id, work)


@router.post("/parts/{part_id}/generate-art")
async def generate_part_art(
    part_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)
):
    part = await db.parts_col().find_one({"part_id": part_id}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="Part not found")
    await assert_series_owner(part["series_id"], user)
    n = await db.panels_col().count_documents({"part_id": part_id})
    job = await jobs.create_job(
        "generate_part_art", series_id=part["series_id"], meta={"part_id": part_id, "panel_count": n}
    )
    background_tasks.add_task(_run_part_art_job, job["job_id"], part_id)
    return {"job_id": job["job_id"], "status": "queued", "panel_count": n}
