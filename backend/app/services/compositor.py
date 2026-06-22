"""
Page compositor — flattens panel art + lettering into a finished comic page PNG.

Panels are laid out in a comic grid (varied rows), each art image cover-cropped to
its cell, with black gutters. Dialogue is drawn on top: narration as caption boxes,
speech/thought as bubbles with tails, SFX as bold text. This is the single render
used by both the reader and PDF/PNG export, so editor data → page is WYSIWYG.
"""

from io import BytesIO

from PIL import Image, ImageDraw, ImageFont

PAGE_W, PAGE_H = 1024, 1450
GUTTER = 16

_FONT_REG = [
    "C:/Windows/Fonts/arial.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]
_FONT_BOLD = [
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/liberation/LiberationSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def _font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    for path in (_FONT_BOLD if bold else _FONT_REG):
        try:
            return ImageFont.truetype(path, size)
        except (OSError, IOError):
            continue
    return ImageFont.load_default()


# ── Layout ───────────────────────────────────────────────────────────────────

_ROW_PRESETS = {
    1: [1],
    2: [1, 1],
    3: [1, 2],
    4: [2, 2],
    5: [2, 3],
    6: [3, 3],
    7: [2, 2, 3],
    8: [2, 3, 3],
    9: [3, 3, 3],
}


def _row_plan(n: int, template: str = "auto") -> list[int]:
    if template == "vertical":  # one panel per full-width row
        return [1] * n
    if template == "grid":  # rows of 2
        rows, rem = [], n
        while rem > 0:
            rows.append(min(2, rem))
            rem -= min(2, rem)
        return rows
    if template == "wide-top":  # a splash panel, then rows of 2
        if n <= 1:
            return [1]
        rows, rem = [1], n - 1
        while rem > 0:
            rows.append(min(2, rem))
            rem -= min(2, rem)
        return rows
    if n in _ROW_PRESETS:  # auto
        return _ROW_PRESETS[n]
    rows, rem = [], n
    while rem > 0:
        rows.append(min(3, rem))
        rem -= min(3, rem)
    return rows


def _cells(
    n: int, w: int, h: int, gutter: int, template: str = "auto", custom=None
) -> list[tuple[int, int, int, int]]:
    # A "custom" page carries explicit per-cell rects (fractions of the page).
    if template == "custom" and custom:
        out = []
        for c in custom[:n]:
            cx = int(_frac(c.get("x"), 0.0) * w)
            cy = int(_frac(c.get("y"), 0.0) * h)
            cw = int(max(_frac(c.get("w"), 0.3) * w, 40))
            ch = int(max(_frac(c.get("h"), 0.3) * h, 40))
            out.append((cx, cy, cw, ch))
        if len(out) < n:  # safety: fall back to auto for any unspecified panels
            out.extend(_cells(n - len(out), w, h, gutter, "auto"))
        return out[:n]

    rows = _row_plan(n, template)
    cells = []
    row_h = (h - gutter * (len(rows) + 1)) / len(rows)
    y = gutter
    for cnt in rows:
        col_w = (w - gutter * (cnt + 1)) / cnt
        x = gutter
        for _ in range(cnt):
            cells.append((int(x), int(y), int(col_w), int(row_h)))
            x += col_w + gutter
        y += row_h + gutter
    return cells[:n]


def _cover(img: Image.Image, w: int, h: int) -> Image.Image:
    """object-fit: cover — fill the cell, center-cropping the overflow."""
    iw, ih = img.size
    scale = max(w / iw, h / ih)
    nw, nh = max(int(iw * scale), w), max(int(ih * scale), h)
    img = img.resize((nw, nh), Image.LANCZOS)
    left, top = (nw - w) // 2, (nh - h) // 2
    return img.crop((left, top, left + w, top + h))


# ── Lettering ────────────────────────────────────────────────────────────────


def _wrap(draw, text, font, max_w):
    words, lines, cur = text.split(), [], ""
    for wd in words:
        trial = (cur + " " + wd).strip()
        if draw.textlength(trial, font=font) <= max_w or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = wd
    if cur:
        lines.append(cur)
    return lines


def _frac(v, default):
    try:
        return min(max(float(v), 0.0), 1.0)
    except (TypeError, ValueError):
        return default


def _caption(draw, text, left, top, width):
    font = _font(17, bold=True)
    pad = 8
    lines = _wrap(draw, text, font, width - 2 * pad)
    lh = font.size + 5
    bh = lh * len(lines) + 2 * pad
    draw.rectangle([left, top, left + width, top + bh], fill="#FCD34D", outline="#111111", width=3)
    ty = top + pad
    for ln in lines:
        draw.text((left + pad, ty), ln, fill="#1A1A1A", font=font)
        ty += lh
    return top + bh + 6


def _bubble(draw, text, ax, top, max_w, thought=False, centered=True):
    font = _font(18)
    pad = 11
    lines = _wrap(draw, text, font, max_w - 2 * pad)
    lh = font.size + 5
    tw = max((draw.textlength(ln, font=font) for ln in lines), default=10)
    bw = int(tw) + 2 * pad
    bh = lh * len(lines) + 2 * pad
    left = int(ax - bw / 2) if centered else int(ax)
    by = int(top)
    fill = "#EAF2FF" if thought else "#FFFFFF"
    draw.rounded_rectangle([left, by, left + bw, by + bh], radius=16, fill=fill, outline="#111111", width=3)
    # tail
    midx = left + bw // 2
    draw.polygon(
        [(midx - 9, by + bh - 1), (midx + 9, by + bh - 1), (midx - 2, by + bh + 16)],
        fill=fill,
        outline="#111111",
    )
    ty = by + pad
    for ln in lines:
        lw = draw.textlength(ln, font=font)
        draw.text((left + (bw - lw) / 2, ty), ln, fill="#111111", font=font)
        ty += lh
    return by + bh + 20


def _sfx(draw, text, cx, cy):
    f = _font(46, bold=True)
    draw.text(
        (cx, cy), text[:18], fill="#F59E0B", font=f, anchor="mm", stroke_width=3, stroke_fill="#111111"
    )


def _letter_panel(draw, panel, x, y, w, h):
    # A dialogue line with a `bubble` {x, y, w} (fractions of the panel) is placed
    # exactly there (WYSIWYG with the editor); the rest auto-stack from the top.
    cursor = y + 10
    for d in panel.get("dialogue", []):
        text = (d.get("text") or "").strip()
        if not text:
            continue
        kind = d.get("kind", "speech")
        pos = d.get("bubble") if isinstance(d.get("bubble"), dict) else None

        if kind == "sfx":
            if pos:
                _sfx(draw, text, x + _frac(pos.get("x"), 0.4) * w, y + _frac(pos.get("y"), 0.8) * h)
            else:
                _sfx(draw, text, x + w / 2, y + h - 54)
            continue

        if pos:
            left = x + _frac(pos.get("x"), 0.08) * w
            top = y + _frac(pos.get("y"), 0.06) * h
            width = _frac(pos.get("w"), 0.5) * w
            if kind == "narration":
                _caption(draw, text, left, top, width)
            else:
                _bubble(draw, text, left, top, width, thought=kind == "thought", centered=False)
        else:
            if cursor > y + h - 46:
                continue
            if kind == "narration":
                cursor = _caption(draw, text, x + 10, cursor, min(w - 20, 380))
            else:
                cursor = _bubble(draw, text, x + w / 2, cursor, min(w - 48, 340), thought=kind == "thought")


def compose(page: dict, panels: list[dict], art_map: dict[str, bytes]) -> bytes:
    """Render a finished comic page PNG from its panels and their art bytes."""
    img = Image.new("RGB", (PAGE_W, PAGE_H), "#0B0B0F")
    draw = ImageDraw.Draw(img)
    cells = _cells(
        max(len(panels), 1),
        PAGE_W,
        PAGE_H,
        GUTTER,
        page.get("layout_template") or "auto",
        page.get("custom_cells"),
    )

    for cell, panel in zip(cells, panels):
        x, y, w, h = cell
        art = art_map.get(panel["panel_id"])
        if art:
            try:
                tile = Image.open(BytesIO(art)).convert("RGB")
                img.paste(_cover(tile, w, h), (x, y))
            except Exception:
                draw.rectangle([x, y, x + w, y + h], fill="#15151C")
        else:
            draw.rectangle([x, y, x + w, y + h], fill="#15151C")
            ph = _font(20, bold=True)
            draw.text((x + w / 2, y + h / 2), f"panel {panel.get('number', '?')}", fill="#3A3A45", font=ph, anchor="mm")
        draw.rectangle([x, y, x + w - 1, y + h - 1], outline="#000000", width=4)
        _letter_panel(draw, panel, x, y, w, h)

    buf = BytesIO()
    img.save(buf, format="PNG")
    return buf.getvalue()
