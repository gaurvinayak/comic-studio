import { useState, useRef } from "react";
import { toast } from "sonner";
import { X, Check, RotateCcw } from "lucide-react";
import { pagesAPI, assetUrl } from "@/api";
import { Button, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { templateCells, PAGE_RATIO } from "@/lib/layout";

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

export default function PageLayoutEditor({ page, onClose, onSaved }) {
  const panels = page.panels || [];
  const [cells, setCells] = useState(() =>
    page.layout_template === "custom" && page.custom_cells?.length
      ? page.custom_cells.map((c) => ({ ...c }))
      : templateCells(panels.length, page.layout_template || "auto")
  );
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef(null);

  const setCell = (i, patch) => setCells((cs) => cs.map((c, j) => (j === i ? { ...c, ...patch } : c)));

  const drag = (e, i, mode) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(i);
    const box = canvasRef.current.getBoundingClientRect();
    const s = { mx: e.clientX, my: e.clientY, ...cells[i] };
    const move = (ev) => {
      const dx = (ev.clientX - s.mx) / box.width;
      const dy = (ev.clientY - s.my) / box.height;
      if (mode === "move") {
        setCell(i, { x: clamp(s.x + dx, 0, 1 - s.w), y: clamp(s.y + dy, 0, 1 - s.h) });
      } else {
        setCell(i, { w: clamp(s.w + dx, 0.06, 1 - s.x), h: clamp(s.h + dy, 0.06, 1 - s.y) });
      }
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const reset = () => setCells(templateCells(panels.length, "auto"));

  const save = async () => {
    setBusy(true);
    const tid = toast.loading("Applying layout & re-composing…");
    try {
      await pagesAPI.setCustomLayout(page.page_id, cells);
      onSaved();
      toast.success("Custom layout saved", { id: tid });
      onClose();
    } catch {
      toast.error("Couldn't save layout", { id: tid });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-center bg-black/75 p-4 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="my-4 flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h3 className="font-display text-xl tracking-wide text-white">Page {page.number} layout</h3>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4" /> Reset
            </Button>
            <Button size="sm" onClick={save} disabled={busy}>
              {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save
            </Button>
            <button
              onClick={onClose}
              className="rounded-md p-1 text-slate-400 transition hover:bg-slate-800 hover:text-slate-200"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          <p className="mb-3 text-center text-xs text-slate-500">
            Drag a panel to move it · drag its corner to resize
          </p>
          <div
            ref={canvasRef}
            className="relative mx-auto w-full overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
            style={{ aspectRatio: String(PAGE_RATIO), maxWidth: 440 }}
          >
            {panels.map((pan, i) => {
              const c = cells[i] || { x: 0, y: 0, w: 0.3, h: 0.3 };
              return (
                <div
                  key={pan.panel_id}
                  onPointerDown={(e) => drag(e, i, "move")}
                  style={{
                    left: `${c.x * 100}%`,
                    top: `${c.y * 100}%`,
                    width: `${c.w * 100}%`,
                    height: `${c.h * 100}%`,
                  }}
                  className={cn(
                    "absolute cursor-move touch-none overflow-hidden rounded border-2",
                    selected === i ? "z-10 border-indigo-400" : "border-slate-600"
                  )}
                >
                  {pan.art_url ? (
                    <img
                      src={assetUrl(pan.art_url)}
                      alt=""
                      draggable={false}
                      className="pointer-events-none h-full w-full object-cover"
                    />
                  ) : (
                    <div className="halftone grid h-full place-items-center bg-slate-900 text-[10px] text-slate-500">
                      panel {pan.number}
                    </div>
                  )}
                  <span className="absolute left-1 top-1 rounded bg-slate-950/80 px-1 text-[10px] font-bold text-white">
                    {pan.number}
                  </span>
                  <span
                    onPointerDown={(e) => drag(e, i, "resize")}
                    className="absolute bottom-0 right-0 h-4 w-4 cursor-se-resize touch-none rounded-tl bg-indigo-500/90"
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
