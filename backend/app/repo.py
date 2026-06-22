"""
Document builders + serializers for the core domain entities.

Keeps Mongo document shape in one place so routers stay thin and both the series
bootstrap and the "add character" path create identically-shaped characters.
"""

from . import db
from .util import asset_url, clean, new_id, utcnow


async def create_series(owner_id: str, theme: str, b: dict) -> dict:
    doc = {
        "series_id": new_id("ser"),
        "owner_id": owner_id,
        "title": b.get("title") or "Untitled Series",
        "premise": b.get("premise", ""),
        "theme": theme,
        "genre": b.get("genre", ""),
        "tone": b.get("tone", ""),
        "art_style": b.get("art_style", ""),
        "style_ref_asset_id": None,
        "world_bible": b.get("world_bible", ""),
        "story_state": "",  # running continuity summary (Phase 2)
        "status": "draft",
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    await db.series_col().insert_one(doc)
    return clean(doc)


def serialize_series(doc: dict | None) -> dict | None:
    doc = clean(doc)
    if doc:
        doc["cover_url"] = asset_url(doc.get("cover_asset_id"))
    return doc


def _norm_personality(p) -> dict:
    if not isinstance(p, dict):
        return {"traits": [], "motivations": "", "voice": ""}
    traits = p.get("traits", [])
    if isinstance(traits, str):
        traits = [t.strip() for t in traits.split(",") if t.strip()]
    return {
        "traits": traits or [],
        "motivations": p.get("motivations", ""),
        "voice": p.get("voice", ""),
    }


async def create_character(series_id: str, data: dict, status: str = "draft") -> dict:
    doc = {
        "character_id": new_id("chr"),
        "series_id": series_id,
        "name": data.get("name") or "Unnamed",
        "role": data.get("role") or "supporting",
        "concept": data.get("concept", ""),
        "personality": _norm_personality(data.get("personality")),
        "backstory": data.get("backstory", ""),
        # appearance_anchor is the verbatim look injected into every render
        "appearance_anchor": data.get("appearance_anchor") or data.get("appearance") or "",
        "portrait_prompt": data.get("portrait_prompt", ""),
        "reference_images": [],  # asset ids of generated reference portraits
        "portrait_asset_id": None,  # the chosen canonical reference
        "status": status,  # draft | locked
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    await db.characters_col().insert_one(doc)
    return clean(doc)


def serialize_character(doc: dict | None) -> dict | None:
    doc = clean(doc)
    if not doc:
        return None
    doc["portrait_url"] = asset_url(doc.get("portrait_asset_id"))
    doc["reference_urls"] = [asset_url(a) for a in doc.get("reference_images", [])]
    return doc


# ── Parts / pages / panels (Phase 2+) ────────────────────────────────────────


def _name_to_id(characters: list[dict]) -> dict:
    """Map cast names (full + first name, lowercased) to character ids."""
    m: dict[str, str] = {}
    for c in characters:
        name = (c.get("name") or "").strip().lower()
        if name:
            m[name] = c["character_id"]
            first = name.split()[0]
            m.setdefault(first, c["character_id"])
    return m


async def persist_part(series_id: str, number: int, data: dict, characters: list[dict]) -> dict:
    """Create the part + its pages + panels from a generated script; return assembled."""
    name2id = _name_to_id(characters)

    part = {
        "part_id": new_id("part"),
        "series_id": series_id,
        "number": number,
        "title": data.get("title") or f"Part {number}",
        "synopsis": data.get("synopsis", ""),
        "outline": data.get("outline", []),
        "recap": data.get("synopsis", ""),
        "status": "draft",
        "created_at": utcnow(),
        "updated_at": utcnow(),
    }
    await db.parts_col().insert_one(part)

    pages_out = []
    for i, pg in enumerate(data.get("pages", []), 1):
        page = {
            "page_id": new_id("page"),
            "part_id": part["part_id"],
            "series_id": series_id,
            "number": pg.get("number", i),
            "layout_template": None,
            "composite_asset_id": None,
            "created_at": utcnow(),
            "updated_at": utcnow(),
        }
        await db.pages_col().insert_one(page)

        panels_out = []
        for j, pan in enumerate(pg.get("panels", []), 1):
            present = [
                name2id[n.strip().lower()]
                for n in pan.get("present_characters", [])
                if isinstance(n, str) and n.strip().lower() in name2id
            ]
            dialogue = []
            for d in pan.get("dialogue", []) or []:
                spk = d.get("speaker")
                sid = name2id.get(spk.strip().lower()) if isinstance(spk, str) and spk.strip() else None
                dialogue.append(
                    {
                        "character_id": sid,
                        "speaker_name": spk if isinstance(spk, str) else None,
                        "kind": d.get("kind", "speech"),
                        "text": d.get("text", ""),
                    }
                )
            panel = {
                "panel_id": new_id("pan"),
                "page_id": page["page_id"],
                "part_id": part["part_id"],
                "series_id": series_id,
                "number": pan.get("number", j),
                "scene": pan.get("scene", ""),
                "present_character_ids": present,
                "shot": pan.get("shot", ""),
                "mood": pan.get("mood", ""),
                "dialogue": dialogue,
                "art": {"asset_id": None, "prompt": None, "status": "empty"},
                "created_at": utcnow(),
                "updated_at": utcnow(),
            }
            await db.panels_col().insert_one(panel)
            panels_out.append(serialize_panel(panel))

        page = clean(page)
        page["panels"] = panels_out
        pages_out.append(page)

    part = clean(part)
    part["pages"] = pages_out
    return part


def serialize_panel(doc: dict | None, name_map: dict | None = None) -> dict | None:
    doc = clean(doc)
    if not doc:
        return None
    art = doc.get("art") or {}
    doc["art_url"] = asset_url(art.get("asset_id"))
    doc["art_variant_urls"] = [asset_url(a) for a in (doc.get("art_variants") or [])]
    if name_map is not None:
        doc["present_character_names"] = [
            name_map.get(cid, "?") for cid in doc.get("present_character_ids", [])
        ]
    return doc
