"""
Prompt assembly for consistent character & panel art.

Centralises the rules that keep a series visually coherent:
- a global quality/no-text rule (panel text is added later as an editable overlay),
- the series-level style anchor (applied to every image),
- the per-character appearance anchor + reference images (Phase 3).
"""

GLOBAL_IMAGE_RULES = (
    "Professional comic book illustration, highly detailed, clean confident line art "
    "with expressive cel shading. IMPORTANT: do NOT render any text, letters, words, "
    "speech bubbles, captions, logos, watermarks or signatures anywhere in the image."
)


def style_anchor(series: dict) -> str:
    style = (
        series.get("art_style")
        or "modern comic book art, bold ink outlines, vivid flat colors, cinematic lighting"
    ).strip()
    return f"ART STYLE (must stay identical across the whole series): {style}."


def build_portrait_prompt(series: dict, character: dict) -> str:
    """Prompt for a character's canonical reference portrait (model-sheet style)."""
    name = character.get("name", "the character")
    appearance = (
        character.get("appearance_anchor")
        or character.get("portrait_prompt")
        or character.get("appearance")
        or ""
    ).strip()
    framing = (
        character.get("portrait_prompt")
        or "Full body, front view, neutral confident standing pose, arms relaxed."
    ).strip()

    parts = [
        f"Character reference sheet portrait of {name}.",
        framing,
        "Single character, centered and fully visible, simple plain light-gray studio "
        "background, even lighting, model-sheet reference style.",
        f"CHARACTER APPEARANCE (render exactly, this is the canonical look): {appearance}",
        style_anchor(series),
        GLOBAL_IMAGE_RULES,
    ]
    return "\n".join(p for p in parts if p)


def build_panel_prompt(series: dict, panel: dict, present_characters: list[dict]) -> str:
    """
    Assemble the prompt for a story panel. The present characters' appearance
    anchors are included verbatim, and (separately) their locked reference images
    are passed to the model so they render consistently. No text is drawn — speech
    is lettered on top later.
    """
    lines = [
        f"Comic book panel — {panel.get('shot') or 'medium shot'}.",
        f"SCENE: {panel.get('scene', '')}",
    ]
    if panel.get("mood"):
        lines.append(f"MOOD: {panel['mood']}.")
    if present_characters:
        lines.append(
            "CHARACTERS PRESENT — render each to match their reference image and "
            "description exactly (same face, hair, build, outfit):"
        )
        for c in present_characters:
            anchor = (c.get("appearance_anchor") or "").strip()
            lines.append(f"- {c.get('name')}: {anchor}")
    lines.append(style_anchor(series))
    lines.append(GLOBAL_IMAGE_RULES)
    return "\n".join(line for line in lines if line)


def build_cover_prompt(series: dict, protagonist: dict | None) -> str:
    """Prompt for a series cover — dramatic hero shot, no baked title text."""
    lines = [
        f'Comic book cover illustration for the series "{series.get("title", "")}".',
        "Dramatic, eye-catching cover composition with a clear focal character and "
        "dynamic lighting. Leave some negative space near the top where a title could go.",
    ]
    if protagonist:
        lines.append(
            f"FEATURED CHARACTER ({protagonist.get('name')}) — match the reference image "
            f"and this description exactly: {protagonist.get('appearance_anchor', '')}"
        )
    if series.get("premise"):
        lines.append(f"MOOD / PREMISE: {series['premise']}")
    lines.append(style_anchor(series))
    lines.append(GLOBAL_IMAGE_RULES)
    return "\n".join(line for line in lines if line)
