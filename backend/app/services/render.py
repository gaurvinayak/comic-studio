"""
Orchestration for panel art generation and page composition.

Pure work functions (no job/HTTP concerns) so both the single-panel route and the
batch "draw the whole part" job can reuse them.
"""

import asyncio
from io import BytesIO

from PIL import Image

from .. import db, storage
from ..util import asset_url, utcnow
from . import compositor, consistency, imagegen


async def generate_panel_art(panel_id: str) -> dict:
    panel = await db.panels_col().find_one({"panel_id": panel_id})
    if not panel:
        raise RuntimeError("panel not found")
    series = await db.series_col().find_one({"series_id": panel["series_id"]}, {"_id": 0})

    present, refs = [], []
    for cid in panel.get("present_character_ids", []):
        c = await db.characters_col().find_one({"character_id": cid}, {"_id": 0})
        if not c:
            continue
        present.append(c)
        if c.get("portrait_asset_id"):
            data = await storage.read_asset_bytes(c["portrait_asset_id"])
            if data:
                refs.append(data)

    prompt = consistency.build_panel_prompt(series or {}, panel, present)
    png = await asyncio.to_thread(imagegen.generate_image, prompt, reference_images=refs or None)
    asset = await storage.store_asset(
        data=png,
        mime="image/png",
        kind="panel_art",
        series_id=panel["series_id"],
        meta={"panel_id": panel_id, "prompt": prompt},
    )
    await db.panels_col().update_one(
        {"panel_id": panel_id},
        {
            "$set": {"art": {"asset_id": asset["asset_id"], "prompt": prompt, "status": "done"}, "updated_at": utcnow()},
            "$push": {"art_variants": asset["asset_id"]},
        },
    )
    return {
        "panel_id": panel_id,
        "asset_id": asset["asset_id"],
        "url": asset_url(asset["asset_id"]),
        "references_used": len(refs),
    }


async def generate_cover(series_id: str) -> dict:
    series = await db.series_col().find_one({"series_id": series_id}, {"_id": 0})
    if not series:
        raise RuntimeError("series not found")
    chars = [c async for c in db.characters_col().find({"series_id": series_id})]
    protagonist = next(
        (c for c in chars if c.get("role") == "protagonist" and c.get("portrait_asset_id")), None
    ) or next((c for c in chars if c.get("portrait_asset_id")), None)

    refs = []
    if protagonist and protagonist.get("portrait_asset_id"):
        data = await storage.read_asset_bytes(protagonist["portrait_asset_id"])
        if data:
            refs.append(data)

    prompt = consistency.build_cover_prompt(series, protagonist)
    png = await asyncio.to_thread(imagegen.generate_image, prompt, reference_images=refs or None)
    asset = await storage.store_asset(
        data=png, mime="image/png", kind="cover", series_id=series_id, meta={"prompt": prompt}
    )
    await db.series_col().update_one(
        {"series_id": series_id},
        {"$set": {"cover_asset_id": asset["asset_id"], "updated_at": utcnow()}},
    )
    return {"series_id": series_id, "asset_id": asset["asset_id"], "url": asset_url(asset["asset_id"])}


async def compose_page(page_id: str) -> dict:
    page = await db.pages_col().find_one({"page_id": page_id})
    if not page:
        raise RuntimeError("page not found")
    panels = [p async for p in db.panels_col().find({"page_id": page_id}).sort("number", 1)]

    art_map: dict[str, bytes] = {}
    for pan in panels:
        aid = (pan.get("art") or {}).get("asset_id")
        if aid:
            data = await storage.read_asset_bytes(aid)
            if data:
                art_map[pan["panel_id"]] = data

    png = await asyncio.to_thread(compositor.compose, page, panels, art_map)
    asset = await storage.store_asset(
        data=png,
        mime="image/png",
        kind="export",
        series_id=page["series_id"],
        meta={"page_id": page_id},
    )
    await db.pages_col().update_one(
        {"page_id": page_id},
        {"$set": {"composite_asset_id": asset["asset_id"], "updated_at": utcnow()}},
    )
    return {"page_id": page_id, "asset_id": asset["asset_id"], "url": asset_url(asset["asset_id"])}


def _build_pdf(images_bytes: list[bytes]) -> bytes:
    imgs = [Image.open(BytesIO(b)).convert("RGB") for b in images_bytes]
    out = BytesIO()
    if imgs:
        imgs[0].save(out, format="PDF", save_all=True, append_images=imgs[1:])
    return out.getvalue()


async def export_part_pdf(part_id: str) -> dict:
    """Compose any un-composed pages, then bundle all page PNGs into one PDF."""
    part = await db.parts_col().find_one({"part_id": part_id}, {"_id": 0})
    if not part:
        raise RuntimeError("part not found")
    pages = [p async for p in db.pages_col().find({"part_id": part_id}).sort("number", 1)]

    page_pngs = []
    for pg in pages:
        aid = pg.get("composite_asset_id")
        if not aid:
            res = await compose_page(pg["page_id"])
            aid = res["asset_id"]
        data = await storage.read_asset_bytes(aid)
        if data:
            page_pngs.append(data)

    pdf = await asyncio.to_thread(_build_pdf, page_pngs)
    asset = await storage.store_asset(
        data=pdf,
        mime="application/pdf",
        kind="export",
        series_id=part["series_id"],
        meta={"part_id": part_id, "format": "pdf"},
    )
    return {"asset_id": asset["asset_id"], "url": asset_url(asset["asset_id"]), "pages": len(page_pngs)}
