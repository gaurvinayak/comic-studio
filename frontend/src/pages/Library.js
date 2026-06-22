import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Plus, BookOpen, Sparkles, Trash2, Users } from "lucide-react";
import { seriesAPI, assetUrl } from "@/api";
import { Button, Card, Modal, Field, Textarea, Spinner } from "@/components/ui";
import { timeAgo } from "@/lib/utils";

const SAMPLE_IDEAS = [
  "A retired dragon who runs a hard-boiled detective agency in a rain-soaked cyberpunk city.",
  "Two rival food trucks wage a culinary turf war that accidentally saves their dying town.",
  "A timid librarian discovers the overdue books are doorways to the worlds inside them.",
  "Space-janitors on a derelict station uncover why the last crew vanished.",
];

export default function Library() {
  const [series, setSeries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();

  const load = () => {
    setLoading(true);
    seriesAPI
      .list()
      .then(({ data }) => setSeries(data.series))
      .catch(() => toast.error("Couldn't load your comics"))
      .finally(() => setLoading(false));
  };
  useEffect(load, []);

  const remove = async (e, id) => {
    e.stopPropagation();
    if (!window.confirm("Delete this comic and all its characters?")) return;
    try {
      await seriesAPI.remove(id);
      setSeries((s) => s.filter((x) => x.series_id !== id));
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-wide text-white">Your Comics</h1>
          <p className="mt-1 text-slate-400">
            Spin up a universe from a single idea — characters and story included.
          </p>
        </div>
        <Button size="lg" onClick={() => setShowCreate(true)}>
          <Plus className="h-5 w-5" /> New Comic
        </Button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-24 text-slate-500">
          <Spinner className="h-6 w-6" />
        </div>
      ) : series.length === 0 ? (
        <EmptyState onCreate={() => setShowCreate(true)} />
      ) : (
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {series.map((s) => (
            <Card
              key={s.series_id}
              onClick={() => navigate(`/series/${s.series_id}`)}
              className="group cursor-pointer overflow-hidden transition hover:border-indigo-500/60"
            >
              {s.cover_url && (
                <div className="aspect-[16/10] overflow-hidden bg-slate-950">
                  <img
                    src={assetUrl(s.cover_url)}
                    alt=""
                    className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                  />
                </div>
              )}
              <div className="p-5">
                <div className="mb-3 flex items-start justify-between">
                  <span className="rounded-md bg-indigo-500/10 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-indigo-300">
                    {s.genre || "comic"}
                  </span>
                  <button
                    onClick={(e) => remove(e, s.series_id)}
                    className="text-slate-600 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                <h3 className="font-display text-2xl tracking-wide text-white">{s.title}</h3>
                <p className="mt-2 line-clamp-3 text-sm text-slate-400">{s.premise}</p>
                <div className="mt-4 flex items-center gap-4 text-xs text-slate-500">
                  <span className="inline-flex items-center gap-1">
                    <Users className="h-3.5 w-3.5" /> {s.character_count} characters
                  </span>
                  <span>{timeAgo(s.created_at)}</span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <CreateSeriesModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(id) => navigate(`/series/${id}`)}
      />
    </div>
  );
}

function EmptyState({ onCreate }) {
  return (
    <Card className="halftone grid place-items-center gap-4 py-20 text-center">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-600">
        <BookOpen className="h-8 w-8 text-white" />
      </div>
      <div>
        <h3 className="font-display text-2xl tracking-wide text-white">No comics yet</h3>
        <p className="mt-1 text-slate-400">Start with a theme and we'll generate your first cast.</p>
      </div>
      <Button size="lg" onClick={onCreate}>
        <Sparkles className="h-5 w-5" /> Create your first comic
      </Button>
    </Card>
  );
}

function CreateSeriesModal({ open, onClose, onCreated }) {
  const [theme, setTheme] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    if (!theme.trim()) return toast.error("Describe your comic idea first");
    setBusy(true);
    try {
      const { data } = await seriesAPI.create(theme.trim());
      toast.success(`Created “${data.series.title}” — ${data.characters.length} characters`);
      onCreated(data.series.series_id);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Generation failed");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={busy ? () => {} : onClose}
      title="New Comic"
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? (
              <>
                <Spinner className="h-4 w-4" /> Conjuring cast…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generate
              </>
            )}
          </Button>
        </>
      }
    >
      <Field label="Theme or idea" hint="one sentence is enough">
        <Textarea
          rows={4}
          autoFocus
          placeholder="e.g. A retired dragon who runs a detective agency in a rain-soaked cyberpunk city…"
          value={theme}
          onChange={(e) => setTheme(e.target.value)}
          disabled={busy}
        />
      </Field>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {SAMPLE_IDEAS.map((idea) => (
          <button
            key={idea}
            disabled={busy}
            onClick={() => setTheme(idea)}
            className="rounded-full border border-slate-700 px-2.5 py-1 text-left text-[11px] text-slate-400 transition hover:border-indigo-500 hover:text-indigo-200 disabled:opacity-50"
          >
            {idea.length > 46 ? idea.slice(0, 46) + "…" : idea}
          </button>
        ))}
      </div>
      <p className="mt-3 text-xs text-slate-500">
        The studio writes a premise, world, art style, and an initial cast you can edit and add to.
      </p>
    </Modal>
  );
}
