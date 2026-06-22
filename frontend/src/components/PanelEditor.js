import { useState, useRef } from "react";
import { toast } from "sonner";
import { X, Plus, Wand2, Check, Trash2 } from "lucide-react";
import { partsAPI, pagesAPI, pollJob, assetUrl } from "@/api";
import { Button, Textarea, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { cellAspect } from "@/lib/layout";

const KINDS = ["speech", "thought", "narration", "sfx"];

const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

function withBubbles(dialogue) {
  let cursor = 0.04;
  return (dialogue || []).map((d) => {
    if (d.bubble && typeof d.bubble.x === "number") return { ...d };
    let bubble;
    if (d.kind === "sfx") bubble = { x: 0.34, y: 0.78, w: 0.32 };
    else if (d.kind === "narration") {
      bubble = { x: 0.03, y: cursor, w: 0.62 };
      cursor += 0.14;
    } else {
      bubble = { x: 0.22, y: cursor, w: 0.56 };
      cursor += 0.17;
    }
    return { ...d, bubble };
  });
}

function bubbleClass(kind) {
  if (kind === "narration") return "bg-amber-300 text-amber-950 border-amber-900";
  if (kind === "sfx") return "bg-transparent text-orange-400 border-transparent font-extrabold text-sm drop-shadow";
  if (kind === "thought") return "bg-sky-50 text-slate-900 border-slate-900";
  return "bg-white text-slate-900 border-slate-900";
}

export default function PanelEditor({ panel, characters, pagePanelCount, panelIndex, layoutTemplate, customCells, onClose, onSaved }) {
  const [dialogue, setDialogue] = useState(() => withBubbles(panel.dialogue));
  const [scene, setScene] = useState(panel.scene || "");
  const [shot, setShot] = useState(panel.shot || "");
  const [art, setArt] = useState({ url: panel.art_url, variants: panel.art_variant_urls || [] });
  const [selected, setSelected] = useState(0);
  const [busy, setBusy] = useState(false);
  const [generating, setGenerating] = useState(false);
  const boxRef = useRef(null);

  const aspect = cellAspect(pagePanelCount, panelIndex, layoutTemplate || "auto", customCells);

  const setLine = (i, patch) =>
    setDialogue((d) => d.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setBubble = (i, patch) =>
    setDialogue((d) => d.map((l, j) => (j === i ? { ...l, bubble: { ...l.bubble, ...patch } } : l)));

  const addLine = () =>
    setDialogue((d) => [
      ...d,
      { kind: "speech", text: "", character_id: null, speaker_name: null, bubble: { x: 0.25, y: 0.1, w: 0.5 } },
    ]);
  const removeLine = (i) => setDialogue((d) => d.filter((_, j) => j !== i));

  const setSpeaker = (i, charId) => {
    const c = characters?.find((x) => x.character_id === charId);
    setLine(i, { character_id: charId || null, speaker_name: c ? c.name : null });
  };

  const startDrag = (e, idx) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected(idx);
    const box = boxRef.current.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY, bx: dialogue[idx].bubble.x, by: dialogue[idx].bubble.y };
    const move = (ev) => {
      const dx = (ev.clientX - start.x) / box.width;
      const dy = (ev.clientY - start.y) / box.height;
      setBubble(idx, { x: clamp(start.bx + dx, 0, 0.92), y: clamp(start.by + dy, 0, 0.92) });
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const regenerate = async () => {
    setGenerating(true);
    const tid = toast.loading("Redrawing panel…");
    try {
      const { data } = await partsAPI.generatePanelArt(panel.panel_id);
      const final = await pollJob(data.job_id);
      if (final.status === "error") throw new Error(final.error);
      const fresh = (await partsAPI.getPanel(panel.panel_id)).data.panel;
      setArt({ url: fresh.art_url, variants: fresh.art_variant_urls || [] });
      toast.success("Panel redrawn", { id: tid });
    } catch (e) {
      toast.error(e?.message || "Failed", { id: tid });
    } finally {
      setGenerating(false);
    }
  };

  const pickVariant = async (url) => {
    try {
      const assetId = url.split("/").pop();
      const fresh = (await partsAPI.setPanelArt(panel.panel_id, assetId)).data.panel;
      setArt({ url: fresh.art_url, variants: fresh.art_variant_urls || [] });
    } catch {
      toast.error("Couldn't set variant");
    }
  };

  const save = async () => {
    setBusy(true);
    const tid = toast.loading("Saving & re-composing page…");
    try {
      const payload = dialogue.map((d) => ({
        character_id: d.character_id || null,
        speaker_name: d.speaker_name || null,
        kind: d.kind,
        text: d.text,
        bubble: d.bubble,
      }));
      const { data } = await partsAPI.updatePanel(panel.panel_id, { dialogue: payload, scene, shot });
      if (panel.page_id) await pagesAPI.compose(panel.page_id);
      onSaved(data.panel);
      toast.success("Saved", { id: tid });
      onClose();
    } catch {
      toast.error("Save failed", { id: tid });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-center bg-black/75 p-4 backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="my-4 flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-800 px-5 py-3">
          <h3 className="font-display text-xl tracking-wide text-white">Letter panel {panel.number}</h3>
          <div className="flex items-center gap-2">
            <Button onClick={save} disabled={busy} size="sm">
              {busy ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save &amp; compose
            </Button>
            <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-800 hover:text-slate-200">
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-5 overflow-y-auto p-5 lg:grid-cols-[1fr_360px]">
          {/* canvas */}
          <div>
            <div
              ref={boxRef}
              className="relative mx-auto w-full max-w-[560px] overflow-hidden rounded-lg border border-slate-700 bg-slate-950"
              style={{ aspectRatio: String(aspect) }}
            >
              {art.url ? (
                <img src={assetUrl(art.url)} alt="" className="absolute inset-0 h-full w-full object-cover" draggable={false} />
              ) : (
                <div className="grid h-full place-items-center px-4 text-center text-sm text-slate-500">
                  No art yet — use “Redraw panel” to generate it.
                </div>
              )}
              {dialogue.map((d, i) => (
                <div
                  key={i}
                  onPointerDown={(e) => startDrag(e, i)}
                  style={{ left: `${d.bubble.x * 100}%`, top: `${d.bubble.y * 100}%`, width: `${d.bubble.w * 100}%` }}
                  className={cn(
                    "absolute cursor-move select-none rounded-lg border-2 px-2 py-1 text-[11px] leading-tight shadow-md",
                    bubbleClass(d.kind),
                    selected === i && "ring-2 ring-indigo-400"
                  )}
                >
                  {d.text || <span className="opacity-40">empty</span>}
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-xs text-slate-500">Drag bubbles to position them. Save re-renders the page.</p>

            {(art.variants?.length > 1 || true) && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between">
                  <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Art variants</span>
                  <Button size="sm" variant="secondary" onClick={regenerate} disabled={generating}>
                    {generating ? <Spinner className="h-3.5 w-3.5" /> : <Wand2 className="h-3.5 w-3.5" />} Redraw panel
                  </Button>
                </div>
                {art.variants?.length > 0 && (
                  <div className="grid grid-cols-5 gap-2">
                    {art.variants.map((url) => (
                      <button
                        key={url}
                        onClick={() => pickVariant(url)}
                        className={cn(
                          "aspect-square overflow-hidden rounded-md border-2",
                          url === art.url ? "border-emerald-400" : "border-transparent hover:border-slate-600"
                        )}
                      >
                        <img src={assetUrl(url)} alt="" className="h-full w-full object-cover" />
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* dialogue + scene editor */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Dialogue</span>
              <Button size="sm" variant="ghost" onClick={addLine}>
                <Plus className="h-4 w-4" /> Add line
              </Button>
            </div>

            {dialogue.map((d, i) => (
              <div
                key={i}
                onClick={() => setSelected(i)}
                className={cn(
                  "rounded-lg border p-2.5",
                  selected === i ? "border-indigo-500 bg-slate-800/40" : "border-slate-800"
                )}
              >
                <div className="mb-2 flex flex-wrap items-center gap-1">
                  {KINDS.map((k) => (
                    <button
                      key={k}
                      onClick={() => setLine(i, { kind: k })}
                      className={cn(
                        "rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase transition",
                        d.kind === k ? "bg-indigo-500 text-white" : "bg-slate-800 text-slate-400 hover:text-slate-200"
                      )}
                    >
                      {k === "narration" ? "caption" : k}
                    </button>
                  ))}
                  <button
                    onClick={() => removeLine(i)}
                    className="ml-auto text-slate-600 transition hover:text-rose-400"
                    title="Remove line"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
                {(d.kind === "speech" || d.kind === "thought") && (
                  <select
                    value={d.character_id || ""}
                    onChange={(e) => setSpeaker(i, e.target.value)}
                    className="mb-1.5 h-8 w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 text-xs text-slate-200 outline-none focus:border-indigo-500"
                  >
                    <option value="">— speaker —</option>
                    {characters?.map((c) => (
                      <option key={c.character_id} value={c.character_id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                <Textarea rows={2} value={d.text} onChange={(e) => setLine(i, { text: e.target.value })} className="text-sm" />
                <div className="mt-1.5 flex items-center gap-2">
                  <span className="text-[10px] text-slate-500">width</span>
                  <input
                    type="range"
                    min="0.15"
                    max="0.92"
                    step="0.01"
                    value={d.bubble.w}
                    onChange={(e) => setBubble(i, { w: parseFloat(e.target.value) })}
                    className="flex-1 accent-indigo-500"
                  />
                </div>
              </div>
            ))}

            <div className="space-y-1.5 border-t border-slate-800 pt-3">
              <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">Scene</span>
              <Textarea rows={3} value={scene} onChange={(e) => setScene(e.target.value)} className="text-sm" />
              <input
                value={shot}
                onChange={(e) => setShot(e.target.value)}
                placeholder="shot (e.g. close-up)"
                className="h-9 w-full rounded-md border border-slate-700 bg-slate-950/60 px-2 text-sm text-slate-200 outline-none focus:border-indigo-500"
              />
              <p className="text-[11px] text-slate-500">
                Editing the scene updates the script; click “Redraw panel” to regenerate art from it.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
