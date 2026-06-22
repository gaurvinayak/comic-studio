"""
Public showcase — PUBLIC (no auth). Lists parts that owners have published and
serves them for anonymous reading. Page images are served by the public assets
route, so no auth is needed to read a published comic.
"""

from fastapi import APIRouter, HTTPException

from .. import db
from ..util import asset_url, clean

router = APIRouter(prefix="/api/showcase", tags=["showcase"])


@router.get("")
async def list_showcase():
    parts = [
        clean(p)
        async for p in db.parts_col().find({"is_public": True}).sort("published_at", -1).limit(60)
    ]
    comics = []
    for p in parts:
        series = await db.series_col().find_one({"series_id": p["series_id"]}, {"_id": 0})
        if not series:
            continue
        page_count = await db.pages_col().count_documents(
            {"part_id": p["part_id"], "composite_asset_id": {"$ne": None}}
        )
        comics.append(
            {
                "slug": p.get("share_slug"),
                "title": p.get("title"),
                "number": p.get("number"),
                "author_name": p.get("author_name") or "Anonymous",
                "published_at": p.get("published_at"),
                "series_title": series.get("title"),
                "genre": series.get("genre"),
                "cover_url": asset_url(series.get("cover_asset_id")),
                "pages": page_count,
            }
        )
    return {"comics": comics}


@router.get("/{slug}")
async def read_showcase(slug: str):
    part = await db.parts_col().find_one({"share_slug": slug, "is_public": True}, {"_id": 0})
    if not part:
        raise HTTPException(status_code=404, detail="Comic not found")
    series = await db.series_col().find_one({"series_id": part["series_id"]}, {"_id": 0}) or {}
    pages = [clean(pg) async for pg in db.pages_col().find({"part_id": part["part_id"]}).sort("number", 1)]
    page_imgs = [
        {"number": pg["number"], "url": asset_url(pg.get("composite_asset_id"))}
        for pg in pages
        if pg.get("composite_asset_id")
    ]
    return {
        "series": {
            "title": series.get("title"),
            "genre": series.get("genre"),
            "premise": series.get("premise"),
            "cover_url": asset_url(series.get("cover_asset_id")),
        },
        "part": {
            "title": part.get("title"),
            "number": part.get("number"),
            "synopsis": part.get("synopsis"),
            "author_name": part.get("author_name") or "Anonymous",
            "published_at": part.get("published_at"),
        },
        "pages": page_imgs,
    }
