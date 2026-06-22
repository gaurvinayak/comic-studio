"""
Story / cast generation via the LLM.

`bootstrap_series` turns a theme into a series bible + initial cast.
`design_character` expands a one-line concept into a full cast member that fits an
existing series. Both return validated dicts (the service layer persists them).
"""

from pathlib import Path

from . import errors, llm

_PROMPT_DIR = Path(__file__).resolve().parent.parent / "prompts"


def _load(name: str) -> str:
    return (_PROMPT_DIR / name).read_text(encoding="utf-8")


# ── Validators ───────────────────────────────────────────────────────────────


def _require(data: dict, keys: list[str], where: str) -> None:
    missing = [k for k in keys if k not in data or data[k] in (None, "")]
    if missing:
        raise errors.ScriptValidationError(f"{where} missing keys: {missing}")


def _validate_series(data: dict) -> None:
    _require(data, ["title", "premise", "art_style", "characters"], "series")
    if not isinstance(data["characters"], list) or not data["characters"]:
        raise errors.ScriptValidationError("series.characters must be a non-empty list")
    for i, c in enumerate(data["characters"], 1):
        _require(c, ["name", "appearance"], f"character[{i}]")


def _validate_character(data: dict) -> None:
    _require(data, ["name", "appearance_anchor"], "character")


def _validate_part(data: dict) -> None:
    _require(data, ["title", "synopsis", "pages"], "part")
    if not isinstance(data["pages"], list) or not data["pages"]:
        raise errors.ScriptValidationError("part.pages must be a non-empty list")
    for pi, pg in enumerate(data["pages"], 1):
        if not isinstance(pg.get("panels"), list) or not pg["panels"]:
            raise errors.ScriptValidationError(f"page[{pi}] must have a non-empty panels list")
        for pj, pan in enumerate(pg["panels"], 1):
            _require(pan, ["scene"], f"page[{pi}].panel[{pj}]")


# ── Generators ───────────────────────────────────────────────────────────────


def bootstrap_series(theme: str, hint: str = "") -> dict:
    system = _load("series_bootstrap.txt")
    user = f"THEME / IDEA:\n{theme.strip()}\n"
    if hint.strip():
        user += f"\nADDITIONAL DIRECTION:\n{hint.strip()}\n"
    user += "\nReturn ONLY the JSON object."
    return llm.generate_json(system, user, validate=_validate_series)


def design_character(series: dict, concept: str) -> dict:
    system = _load("character_design.txt")
    user = (
        f"SERIES TITLE: {series.get('title')}\n"
        f"PREMISE: {series.get('premise')}\n"
        f"GENRE: {series.get('genre')}\n"
        f"TONE: {series.get('tone')}\n"
        f"ART STYLE: {series.get('art_style')}\n"
        f"WORLD: {series.get('world_bible')}\n\n"
        f"NEW CHARACTER CONCEPT:\n{concept.strip()}\n\n"
        "Return ONLY the JSON object."
    )
    return llm.generate_json(system, user, validate=_validate_character)


def _cast_block(characters: list[dict]) -> str:
    lines = []
    for c in characters:
        p = c.get("personality") or {}
        traits = ", ".join(p.get("traits", []) or [])
        voice = p.get("voice", "")
        lines.append(
            f"- {c.get('name')} ({c.get('role', 'supporting')}): {traits}."
            + (f" Voice: {voice}." if voice else "")
        )
    return "\n".join(lines)


def generate_part(series: dict, characters: list[dict], previous_parts: list[dict], direction: str = "") -> dict:
    """Write the next part. Carries continuity via series.story_state + the last part."""
    system = _load("story_part.txt")
    number = len(previous_parts) + 1

    if previous_parts:
        last = previous_parts[-1]
        continuity = (
            f"STORY SO FAR:\n{series.get('story_state', '') or '(none recorded)'}\n\n"
            f"PREVIOUS PART was \"{last.get('title')}\": {last.get('synopsis', '')}"
        )
    else:
        continuity = "This is PART 1 — establish the world, introduce the cast in action, and end on a hook."

    user = (
        f"SERIES: {series.get('title')}\n"
        f"PREMISE: {series.get('premise')}\n"
        f"TONE: {series.get('tone')}\n"
        f"WORLD: {series.get('world_bible')}\n\n"
        f"CAST:\n{_cast_block(characters)}\n\n"
        f"{continuity}\n\n"
        f"PART NUMBER TO WRITE: {number}\n"
        f"DIRECTION FOR THIS PART: {direction.strip() or 'Continue naturally, deepen the conflict, and end on a hook.'}\n\n"
        "Return ONLY the JSON object."
    )
    return llm.generate_json(system, user, validate=_validate_part)
