import { useEffect, useState, useCallback } from "react";
import { useParams, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Plus, Lock, Pencil, Sparkles, Wand2, Image as ImageIcon } from "lucide-react";
import { seriesAPI, charactersAPI, assetUrl, pollJob } from "@/api";
import { Button, Card, Badge, Modal, Field, Textarea, Input, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";
import CharacterEditor from "@/components/CharacterEditor";
import StoryStudio from "@/components/StoryStudio";

export default function SeriesStudio() {
  const { id } = useParams();
  const [series, setSeries] = useState(null);
  const [characters, setCharacters] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [showAdd, setShowAdd] = useState(false);
  const [tab, setTab] = useState("cast");

  const load = useCallback(() => {
    setLoading(true);
    seriesAPI
      .get(id)
      .then(({ data }) => {
        setSeries(data.series);
        setCharacters(data.characters);
      })
      .catch(() => toast.error("Couldn't load this comic"))
      .finally(() => setLoading(false));
  }, [id]);
  useEffect(load, [load]);

  const upsert = (c) =>
    setCharacters((list) =>
      list.some((x) => x.character_id === c.character_id)
        ? list.map((x) => (x.character_id === c.character_id ? c : x))
        : [...list, c]
    );
  const drop = (cid) => setCharacters((list) => list.filter((x) => x.character_id !== cid));

  if (loading)
    return (
      <div className="grid place-items-center py-24">
        <Spinner className="h-6 w-6 text-slate-500" />
      </div>
    );
  if (!series)
    return (
      <div className="text-slate-400">
        Comic not found.{" "}
        <Link to="/app" className="text-indigo-400">
          Back to library
        </Link>
      </div>
    );

  const lockedCount = characters.filter((c) => c.status === "locked").length;

  return (
    <div>
      <Link
        to="/app"
        className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200"
      >
        <ArrowLeft className="h-4 w-4" /> Library
      </Link>

      <SeriesHeader series={series} onChange={setSeries} />

      <div className="mt-8 flex gap-1 border-b border-slate-800">
        {[
          { k: "cast", label: `Cast · ${characters.length}` },
          { k: "story", label: "Story" },
        ].map(({ k, label }) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={cn(
              "relative px-4 py-2.5 text-sm font-semibold transition",
              tab === k ? "text-white" : "text-slate-400 hover:text-slate-200"
            )}
          >
            {label}
            {tab === k && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded bg-indigo-400" />}
          </button>
        ))}
      </div>

      {tab === "story" && <StoryStudio seriesId={id} characters={characters} />}

      {tab === "cast" && (
        <>
          <div className="mb-4 mt-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-3xl tracking-wide text-white">Cast</h2>
          <p className="text-sm text-slate-400">
            {characters.length} characters · {lockedCount} locked for consistent art
          </p>
        </div>
        <Button onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Add Character
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
        {characters.map((c) => (
          <CharacterTile key={c.character_id} c={c} onClick={() => setEditing(c)} />
        ))}
        <button
          onClick={() => setShowAdd(true)}
          className="grid min-h-[240px] place-items-center rounded-2xl border border-dashed border-slate-700 text-slate-500 transition hover:border-indigo-500 hover:text-indigo-300"
        >
          <span className="flex flex-col items-center gap-2">
            <Plus className="h-7 w-7" /> Add character
          </span>
        </button>
          </div>
        </>
      )}

      {editing && (
        <CharacterEditor
          character={editing}
          onClose={() => setEditing(null)}
          onSaved={upsert}
          onDeleted={(cid) => {
            drop(cid);
            setEditing(null);
          }}
        />
      )}
      <AddCharacterModal
        open={showAdd}
        seriesId={id}
        onClose={() => setShowAdd(false)}
        onAdded={(c) => {
          upsert(c);
          setShowAdd(false);
          setEditing(c);
        }}
      />
    </div>
  );
}

function CharacterTile({ c, onClick }) {
  return (
    <Card
      onClick={onClick}
      className="group cursor-pointer overflow-hidden transition hover:border-indigo-500/60"
    >
      <div className="relative aspect-[3/4] bg-slate-950">
        {c.portrait_url ? (
          <img src={assetUrl(c.portrait_url)} alt={c.name} className="h-full w-full object-cover" />
        ) : (
          <div className="halftone grid h-full place-items-center text-slate-600">
            <span className="text-xs">no portrait yet</span>
          </div>
        )}
        <div className="absolute right-2 top-2">
          {c.status === "locked" ? (
            <Badge className="bg-emerald-500/90 text-emerald-950">
              <Lock className="h-3 w-3" /> locked
            </Badge>
          ) : (
            <Badge className="bg-slate-800/90 text-slate-300">draft</Badge>
          )}
        </div>
      </div>
      <div className="p-3">
        <div className="truncate font-semibold text-white">{c.name}</div>
        <div className="text-xs capitalize text-slate-400">{c.role}</div>
      </div>
    </Card>
  );
}

function Info({ label, value, className }) {
  if (!value) return null;
  return (
    <div className={className}>
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{label}</div>
      <div className="text-sm text-slate-300">{value}</div>
    </div>
  );
}

function SeriesHeader({ series, onChange }) {
  const [editing, setEditing] = useState(false);
  const [coverBusy, setCoverBusy] = useState(false);

  const genCover = async () => {
    setCoverBusy(true);
    const tid = toast.loading("Painting the cover…");
    try {
      const { data } = await seriesAPI.generateCover(series.series_id);
      const final = await pollJob(data.job_id);
      if (final.status === "error") throw new Error(final.error);
      const fresh = (await seriesAPI.get(series.series_id)).data.series;
      onChange(fresh);
      toast.success("Cover ready", { id: tid });
    } catch (e) {
      toast.error(e?.message || "Cover generation failed", { id: tid });
    } finally {
      setCoverBusy(false);
    }
  };

  return (
    <Card className="p-6">
      <div className="flex flex-col gap-5 sm:flex-row">
        <div className="shrink-0">
          <div className="relative aspect-[3/4] w-40 overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
            {series.cover_url ? (
              <img src={assetUrl(series.cover_url)} alt="cover" className="h-full w-full object-cover" />
            ) : (
              <div className="halftone grid h-full place-items-center px-3 text-center text-xs text-slate-600">
                no cover yet
              </div>
            )}
            {coverBusy && (
              <div className="absolute inset-0 grid place-items-center bg-slate-950/70">
                <Spinner className="h-5 w-5" />
              </div>
            )}
          </div>
          <Button variant="secondary" size="sm" onClick={genCover} disabled={coverBusy} className="mt-2 w-40">
            {coverBusy ? <Spinner className="h-4 w-4" /> : <ImageIcon className="h-4 w-4" />}
            {series.cover_url ? "Regenerate" : "Generate cover"}
          </Button>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="font-display text-4xl tracking-wide text-white">{series.title}</h1>
                {series.genre && <Badge className="bg-fuchsia-500/15 text-fuchsia-300">{series.genre}</Badge>}
              </div>
              <p className="mt-2 max-w-3xl text-slate-300">{series.premise}</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <Info label="Tone" value={series.tone} />
                <Info label="Art style · consistency anchor" value={series.art_style} />
                <Info label="World" value={series.world_bible} className="sm:col-span-2" />
              </div>
              {series.usage && (
                <div className="mt-3 inline-flex items-center gap-1.5 rounded-full border border-slate-800 px-3 py-1 text-xs text-slate-400">
                  <ImageIcon className="h-3.5 w-3.5" /> {series.usage.images} images generated · ~$
                  {series.usage.est_cost_usd}
                </div>
              )}
            </div>
            <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="h-4 w-4" /> Edit
            </Button>
          </div>
        </div>
      </div>
      <EditSeriesModal open={editing} series={series} onClose={() => setEditing(false)} onSaved={onChange} />
    </Card>
  );
}

function EditSeriesModal({ open, series, onClose, onSaved }) {
  const [form, setForm] = useState(series);
  const [busy, setBusy] = useState(false);
  useEffect(() => setForm(series), [series, open]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const save = async () => {
    setBusy(true);
    try {
      const { data } = await seriesAPI.update(series.series_id, {
        title: form.title,
        premise: form.premise,
        genre: form.genre,
        tone: form.tone,
        art_style: form.art_style,
        world_bible: form.world_bible,
      });
      onSaved(data.series);
      toast.success("Series updated");
      onClose();
    } catch {
      toast.error("Update failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Edit series"
      wide
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : null} Save
          </Button>
        </>
      }
    >
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Title">
            <Input value={form.title || ""} onChange={set("title")} />
          </Field>
          <Field label="Genre">
            <Input value={form.genre || ""} onChange={set("genre")} />
          </Field>
        </div>
        <Field label="Premise">
          <Textarea rows={2} value={form.premise || ""} onChange={set("premise")} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tone">
            <Input value={form.tone || ""} onChange={set("tone")} />
          </Field>
          <Field label="Art style" hint="applied to every panel">
            <Input value={form.art_style || ""} onChange={set("art_style")} />
          </Field>
        </div>
        <Field label="World bible">
          <Textarea rows={2} value={form.world_bible || ""} onChange={set("world_bible")} />
        </Field>
      </div>
    </Modal>
  );
}

function AddCharacterModal({ open, seriesId, onClose, onAdded }) {
  const [mode, setMode] = useState("ai"); // ai | manual
  const [concept, setConcept] = useState("");
  const [manual, setManual] = useState({ name: "", role: "supporting", appearance_anchor: "" });
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      let body;
      if (mode === "ai") {
        if (!concept.trim()) {
          setBusy(false);
          return toast.error("Describe the character first");
        }
        body = { concept: concept.trim() };
      } else {
        if (!manual.name.trim() || !manual.appearance_anchor.trim()) {
          setBusy(false);
          return toast.error("Name and appearance are required");
        }
        body = manual;
      }
      const { data } = await charactersAPI.add(seriesId, body);
      toast.success(`Added ${data.character.name}`);
      setConcept("");
      setManual({ name: "", role: "supporting", appearance_anchor: "" });
      onAdded(data.character);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Couldn't add character");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="Add character"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Spinner className="h-4 w-4" /> : <Plus className="h-4 w-4" />} Add
          </Button>
        </>
      }
    >
      <div className="mb-4 flex rounded-lg border border-slate-800 p-1">
        {[
          { k: "ai", label: "Design with AI", icon: Wand2 },
          { k: "manual", label: "Manual", icon: Pencil },
        ].map(({ k, label, icon: Icon }) => (
          <button
            key={k}
            onClick={() => setMode(k)}
            className={cn(
              "flex flex-1 items-center justify-center gap-1.5 rounded-md py-1.5 text-sm font-medium transition",
              mode === k ? "bg-indigo-500 text-white" : "text-slate-400 hover:text-slate-200"
            )}
          >
            <Icon className="h-4 w-4" /> {label}
          </button>
        ))}
      </div>

      {mode === "ai" ? (
        <Field label="Concept" hint="one line — the AI fits it to your world">
          <Textarea
            rows={3}
            autoFocus
            placeholder="e.g. a jittery rookie cop with a cybernetic eye who idolizes the dragon detective"
            value={concept}
            onChange={(e) => setConcept(e.target.value)}
            disabled={busy}
          />
        </Field>
      ) : (
        <div className="grid gap-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Name">
              <Input
                value={manual.name}
                onChange={(e) => setManual((m) => ({ ...m, name: e.target.value }))}
              />
            </Field>
            <Field label="Role">
              <Input
                value={manual.role}
                onChange={(e) => setManual((m) => ({ ...m, role: e.target.value }))}
              />
            </Field>
          </div>
          <Field label="Appearance anchor" hint="specific, fixed look">
            <Textarea
              rows={3}
              value={manual.appearance_anchor}
              onChange={(e) => setManual((m) => ({ ...m, appearance_anchor: e.target.value }))}
            />
          </Field>
        </div>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-xs text-slate-500">
        <Sparkles className="h-3.5 w-3.5" /> After adding, generate a portrait and lock the character.
      </p>
    </Modal>
  );
}
