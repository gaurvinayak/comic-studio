// Mirrors backend app/services/compositor.py so the editors line up with the
// composed page (drag is WYSIWYG).

const ROW_PRESETS = {
  1: [1],
  2: [1, 1],
  3: [1, 2],
  4: [2, 2],
  5: [2, 3],
  6: [3, 3],
  7: [2, 2, 3],
  8: [2, 3, 3],
  9: [3, 3, 3],
};
const PAGE_W = 1024;
const PAGE_H = 1450;
const GUTTER = 16;

function rowsOf(n, max) {
  const rows = [];
  let rem = n;
  while (rem > 0) {
    const k = Math.min(max, rem);
    rows.push(k);
    rem -= k;
  }
  return rows;
}

function rowPlan(n, template = "auto") {
  if (template === "vertical") return Array(n).fill(1);
  if (template === "grid") return rowsOf(n, 2);
  if (template === "wide-top") return n <= 1 ? [1] : [1, ...rowsOf(n - 1, 2)];
  if (ROW_PRESETS[n]) return ROW_PRESETS[n];
  return rowsOf(n, 3);
}

/** Full cell rects as fractions of the page: {x, y, w, h}. */
function cells(n, template = "auto") {
  const rows = rowPlan(n, template);
  const out = [];
  const rowH = (PAGE_H - GUTTER * (rows.length + 1)) / rows.length;
  let y = GUTTER;
  for (const cnt of rows) {
    const colW = (PAGE_W - GUTTER * (cnt + 1)) / cnt;
    let x = GUTTER;
    for (let i = 0; i < cnt; i++) {
      out.push({ x: x / PAGE_W, y: y / PAGE_H, w: colW / PAGE_W, h: rowH / PAGE_H });
      x += colW + GUTTER;
    }
    y += rowH + GUTTER;
  }
  return out.slice(0, n);
}

/** Seed rects for the custom-layout editor from a named template. */
export function templateCells(n, template = "auto") {
  return cells(Math.max(n, 1), template);
}

/** Aspect ratio (w/h) of a panel's cell in the composed page. */
export function cellAspect(panelCount, index, template = "auto", customCells = null) {
  if (template === "custom" && customCells && customCells[index]) {
    const c = customCells[index];
    return (c.w * PAGE_W) / (c.h * PAGE_H);
  }
  const c = cells(Math.max(panelCount, 1), template);
  const cell = c[index] || c[c.length - 1] || { w: 1, h: 1 };
  return (cell.w * PAGE_W) / (cell.h * PAGE_H);
}

export const PAGE_RATIO = PAGE_W / PAGE_H;

export const LAYOUT_OPTIONS = [
  { value: "auto", label: "Auto" },
  { value: "vertical", label: "Vertical" },
  { value: "grid", label: "Grid" },
  { value: "wide-top", label: "Splash" },
];
