import { useState, useEffect, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Wand2, BookOpen, FileText, Download, ImagePlus, Pencil, Share2, ExternalLink, LayoutGrid } from "lucide-react";
import { partsAPI, pagesAPI, pollJob, assetUrl } from "@/api";
import { Button, Card, Badge, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import { LAYOUT_OPTIONS } from "@/lib/layout";
import PanelEditor from "@/components/PanelEditor";
import PageLayoutEditor from "@/components/PageLayoutEditor";

export default function PartView() {
  const { partId } = useParams();
  const [part, setPart] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState("script");
  const [drawing, setDrawing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exporting, setExporting] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [editing, setEditing] = useState(null);
  const [customizing, setCustomizing] = useState(null);

  const load = useCallback(
    (silent) => {
      if (!silent) setLoading(true);
      partsAPI
        .get(partId)
        .then(({ data }) => {
          setPart(data.part);
          setCharacters(data.characters || []);
        })
        .catch(() => toast.error("Couldn't load this part"))
        .finally(() => setLoading(false));
    },
    [partId]
  );
  useEffect(() => load(), [load]);

  const drawAll = async () => {
    setDrawing(true);
    setProgress(0);
    const tid = toast.loading("Drawing the comic… this takes a bit");
    let ticks = 0;
    try {
      const { data } = await partsAPI.generateAllArt(partId);
      const final = await pollJob(data.job_id, {
        onTick: (j) => {
          setProgress(j.progress || 0);
          if (++ticks % 2 === 0) load(true); // refresh so panels appear as they're drawn
        },
        timeout: 1200000,
      });
      load(true);
      setMode("read");
      const failedCount = final.result?.failed || 0;
      if (failedCount > 0)
        toast.warning(`Done — ${failedCount} panel(s) failed. Retry them from the Script tab.`, { id: tid });
      else toast.success("Comic drawn!", { id: tid });
    } catch (e) {
      toast.error(e?.message || "Drawing failed", { id: tid });
    } finally {
      setDrawing(false);
    }
  };

  const setLayout = async (pageId, template) => {
    const tid = toast.loading("Re-laying out the page…");
    try {
      await pagesAPI.setLayout(pageId, template);
      load(true);
      toast.success("Layout updated", { id: tid });
    } catch {
      toast.error("Couldn't update layout", { id: tid });
    }
  };

  const exportPdf = async () => {
    setExporting(true);
    const tid = toast.loading("Building PDF…");
    try {
      const { data } = await partsAPI.exportPdf(partId);
      window.open(assetUrl(data.url), "_blank");
      toast.success(`PDF ready (${data.pages} pages)`, { id: tid });
    } catch {
      toast.error("Export failed", { id: tid });
    } finally {
      setExporting(false);
    }
  };

  const togglePublish = async () => {
    setPublishing(true);
    try {
      const { data } = part.is_public
        ? await partsAPI.unpublish(partId)
        : await partsAPI.publish(partId);
      setPart((p) => ({ ...p, ...data.part }));
      toast.success(data.part.is_public ? "Published to the showcase!" : "Unpublished");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    } finally {
      setPublishing(false);
    }
  };

  if (loading)
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-6 w-6 text-slate-500" />
      </div>
    );
  if (!part)
    return (
      <div className="text-slate-400">
        Part not found.{" "}
        <Link to="/app" className="text-indigo-400">
          Library
        </Link>
      </div>
    );

  const allPanels = part.pages.flatMap((pg) => pg.panels);
  const arted = allPanels.filter((p) => p.art_url).length;
  const composed = part.pages.filter((pg) => pg.composite_url).length;

  return (
    <div>
      <Link
        to={`/series/${part.series_id}`}
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Back to series
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Badge className="bg-indigo-500/15 text-indigo-300">Part {part.number}</Badge>
          <h1 className="mt-1 font-display text-4xl tracking-wide text-white">{part.title}</h1>
          <p className="mt-2 max-w-3xl text-slate-300">{part.synopsis}</p>
          <div className="mt-2 text-xs text-slate-500">
            {part.pages.length} pages · {allPanels.length} panels · {arted} drawn · {composed} composed
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2">
          <Button onClick={drawAll} disabled={drawing}>
            {drawing ? (
              <>
                <Spinner className="h-4 w-4" /> Drawing… {progress}%
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" /> {arted ? "Redraw the whole part" : "Draw the whole part"}
              </>
            )}
          </Button>
          <Button variant="secondary" onClick={exportPdf} disabled={exporting}>
            {exporting ? <Spinner className="h-4 w-4" /> : <Download className="h-4 w-4" />} Export PDF
          </Button>
          <Button
            variant={part.is_public ? "outline" : "secondary"}
            onClick={togglePublish}
            disabled={publishing}
          >
            {publishing ? <Spinner className="h-4 w-4" /> : <Share2 className="h-4 w-4" />}
            {part.is_public ? "Unpublish" : "Publish"}
          </Button>
          {part.is_public && part.share_slug && (
            <a
              href={`/c/${part.share_slug}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center gap-1 text-xs text-indigo-400 transition hover:text-indigo-300"
            >
              <ExternalLink className="h-3 w-3" /> View public page
            </a>
          )}
        </div>
      </div>

      {drawing && (
        <div className="mt-4 h-2 w-full overflow-hidden rounded-full bg-slate-800">
          <div className="h-full bg-indigo-500 transition-all" style={{ width: `${progress}%` }} />
        </div>
      )}

      <div className="mt-6 inline-flex rounded-lg border border-slate-800 p-1">
        {[
          { k: "script", label: "Script", icon: FileText },
          { k: "read", label: "Read", icon: BookOpen },
        ].map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={cn(
              "flex items-center gap-1.5 rounded-md px-4 py-1.5 text-sm font-medium transition",
              mode === k ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-slate-200"
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {mode === "script" ? (
        <ScriptView
          part={part}
          onPanelArt={() => load(true)}
          onEditPanel={(p, count, idx, layout, customCells) =>
            setEditing({ panel: p, count, idx, layout, customCells })
          }
          onSetLayout={setLayout}
          onCustomize={(pg) => setCustomizing(pg)}
        />
      ) : (
        <ReadView part={part} />
      )}

      {editing && (
        <PanelEditor
          panel={editing.panel}
          characters={characters}
          pagePanelCount={editing.count}
          panelIndex={editing.idx}
          layoutTemplate={editing.layout}
          customCells={editing.customCells}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            load(true);
          }}
        />
      )}

      {customizing && (
        <PageLayoutEditor
          page={customizing}
          onClose={() => setCustomizing(null)}
          onSaved={() => {
            setCustomizing(null);
            load(true);
          }}
        />
      )}
    </div>
  );
}

function ScriptView({ part, onPanelArt, onEditPanel, onSetLayout, onCustomize }) {
  return (
    <div className="mt-6 space-y-8">
      {part.pages.map((pg) => (
        <div key={pg.page_id}>
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold uppercase tracking-wide text-slate-400">
              Page {pg.number}
            </span>
            <div className="flex items-center gap-2">
              <label className="flex items-center gap-1.5 text-xs text-slate-500">
                layout
                <select
                  value={pg.layout_template || "auto"}
                  onChange={(e) => {
                    if (e.target.value !== "custom") onSetLayout(pg.page_id, e.target.value);
                  }}
                  className="h-7 rounded-md border border-slate-700 bg-slate-950/60 px-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500"
                >
                  {LAYOUT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                  {pg.layout_template === "custom" && <option value="custom">Custom</option>}
                </select>
              </label>
              <button
                onClick={() => onCustomize(pg)}
                className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-indigo-500 hover:text-indigo-200"
              >
                <LayoutGrid className="h-3.5 w-3.5" /> Customize
              </button>
            </div>
          </div>
          <div className="space-y-3">
            {pg.panels.map((pan, idx) => (
              <PanelRow
                key={pan.panel_id}
                panel={pan}
                onArt={onPanelArt}
                onEdit={() => onEditPanel(pan, pg.panels.length, idx, pg.layout_template, pg.custom_cells)}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function PanelRow({ panel, onArt, onEdit }) {
  const [busy, setBusy] = useState(false);

  const gen = async () => {
    setBusy(true);
    const tid = toast.loading(`Drawing panel ${panel.number}…`);
    try {
      const { data } = await partsAPI.generatePanelArt(panel.panel_id);
      const final = await pollJob(data.job_id);
      if (final.status === "error") throw new Error(final.error);
      toast.success("Panel drawn", { id: tid });
      onArt();
    } catch (e) {
      toast.error(e?.message || "Failed", { id: tid });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="flex gap-4 p-4">
      <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-lg border border-slate-800 bg-slate-950">
        {panel.art_url ? (
          <img src={assetUrl(panel.art_url)} alt="" className="h-full w-full object-cover" />
        ) : (
          <button
            onClick={gen}
            disabled={busy}
            className={cn(
              "grid h-full w-full place-items-center transition",
              panel.art?.status === "failed"
                ? "text-rose-400 hover:text-rose-300"
                : "text-slate-500 hover:text-indigo-300"
            )}
            title={panel.art?.status === "failed" ? "Generation failed — click to retry" : "Generate art"}
          >
            {busy ? <Spinner className="h-5 w-5" /> : <ImagePlus className="h-6 w-6" />}
          </button>
        )}
        {panel.art_url && (
          <button
            onClick={gen}
            disabled={busy}
            className="absolute bottom-1 right-1 rounded bg-slate-900/80 p-1 text-slate-300 transition hover:text-white"
            title="Regenerate"
          >
            {busy ? <Spinner className="h-3.5 w-3.5" /> : <ImagePlus className="h-3.5 w-3.5" />}
          </button>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
          <span className="font-semibold text-slate-400">Panel {panel.number}</span>
          {panel.shot && <span>· {panel.shot}</span>}
          {panel.present_character_names?.length > 0 && (
            <span>· {panel.present_character_names.join(", ")}</span>
          )}
          <button
            onClick={onEdit}
            className="ml-auto inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium text-indigo-300 transition hover:bg-indigo-500/10"
          >
            <Pencil className="h-3 w-3" /> Letter
          </button>
        </div>
        <p className="mt-1 text-sm text-slate-300">{panel.scene}</p>
        {panel.dialogue?.length > 0 && (
          <div className="mt-2 space-y-1">
            {panel.dialogue.map((d, i) => (
              <div key={i} className="text-sm leading-snug">
                <span
                  className={cn(
                    "mr-1.5 rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase",
                    d.kind === "narration"
                      ? "bg-amber-500/20 text-amber-300"
                      : d.kind === "sfx"
                      ? "bg-orange-500/20 text-orange-300"
                      : d.kind === "thought"
                      ? "bg-sky-500/20 text-sky-300"
                      : "bg-slate-700 text-slate-300"
                  )}
                >
                  {d.kind === "narration" ? "caption" : d.kind}
                </span>
                {d.speaker_name && <span className="font-semibold text-slate-200">{d.speaker_name}: </span>}
                <span className="text-slate-300">{d.text}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}

function ReadView({ part }) {
  const composed = part.pages.filter((pg) => pg.composite_url);
  if (composed.length === 0)
    return (
      <div className="mt-10 grid place-items-center gap-3 py-16 text-center text-slate-400">
        <BookOpen className="h-10 w-10 text-slate-600" />
        <div>
          No pages drawn yet.
          <br />
          Hit “Draw the whole part” to render the comic.
        </div>
      </div>
    );
  return (
    <div className="mt-6 flex flex-col items-center gap-6">
      {part.pages.map((pg) =>
        pg.composite_url ? (
          <img
            key={pg.page_id}
            src={assetUrl(pg.composite_url)}
            alt={`Page ${pg.number}`}
            className="w-full max-w-2xl rounded-lg border border-slate-800 shadow-panel"
          />
        ) : null
      )}
    </div>
  );
}
