import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { BookText, Trash2, ChevronRight, Wand2 } from "lucide-react";
import { partsAPI } from "@/api";
import { Button, Card, Textarea, Spinner } from "@/components/ui";

export default function StoryStudio({ seriesId, characters }) {
  const [parts, setParts] = useState([]);
  const [storyState, setStoryState] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [direction, setDirection] = useState("");
  const navigate = useNavigate();

  const load = useCallback(() => {
    setLoading(true);
    partsAPI
      .list(seriesId)
      .then(({ data }) => {
        setParts(data.parts);
        setStoryState(data.story_state || "");
      })
      .catch(() => toast.error("Couldn't load the story"))
      .finally(() => setLoading(false));
  }, [seriesId]);
  useEffect(load, [load]);

  const generate = async () => {
    setGenerating(true);
    const first = parts.length === 0;
    const tid = toast.loading(first ? "Writing Part 1…" : "Writing the next part…");
    try {
      const { data } = await partsAPI.generate(seriesId, direction);
      toast.success(`Wrote “${data.part.title}”`, { id: tid });
      setDirection("");
      navigate(`/parts/${data.part.part_id}`);
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Generation failed", { id: tid });
    } finally {
      setGenerating(false);
    }
  };

  const remove = async (e, partId) => {
    e.stopPropagation();
    if (!window.confirm("Delete this part and its pages?")) return;
    try {
      await partsAPI.remove(partId);
      setParts((p) => p.filter((x) => x.part_id !== partId));
      toast.success("Deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  const hasLocked = characters?.some((c) => c.status === "locked");

  return (
    <div className="mt-6">
      {storyState && (
        <Card className="mb-6 p-5">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-indigo-300">
            <BookText className="h-4 w-4" /> Story so far
          </div>
          <p className="text-sm leading-relaxed text-slate-300">{storyState}</p>
        </Card>
      )}

      {!hasLocked && characters?.length > 0 && (
        <p className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-200">
          Tip: generate &amp; lock your main characters' portraits in the Cast tab first, so panel art
          stays consistent.
        </p>
      )}

      {loading ? (
        <div className="grid place-items-center py-12">
          <Spinner className="h-5 w-5 text-slate-500" />
        </div>
      ) : (
        <div className="space-y-3">
          {parts.map((p) => (
            <Card
              key={p.part_id}
              onClick={() => navigate(`/parts/${p.part_id}`)}
              className="group flex cursor-pointer items-center gap-4 p-4 transition hover:border-indigo-500/60"
            >
              <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-indigo-500/15 font-display text-2xl text-indigo-300">
                {p.number}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate font-semibold text-white">{p.title}</div>
                <div className="truncate text-sm text-slate-400">{p.synopsis}</div>
                <div className="mt-1 text-xs text-slate-500">
                  {p.page_count} pages · {p.panel_count} panels
                </div>
              </div>
              <button
                onClick={(e) => remove(e, p.part_id)}
                className="text-slate-600 opacity-0 transition hover:text-rose-400 group-hover:opacity-100"
                title="Delete part"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <ChevronRight className="h-5 w-5 text-slate-600" />
            </Card>
          ))}
        </div>
      )}

      <Card className="mt-6 p-5">
        <div className="mb-2 font-display text-xl tracking-wide text-white">
          {parts.length ? "Write the next part" : "Write Part 1"}
        </div>
        <Textarea
          rows={2}
          placeholder={
            parts.length
              ? "Optional direction — e.g. 'Ember confronts the Senator; reveal the artifact's purpose'"
              : "Optional direction for Part 1 (leave blank to let the studio decide)"
          }
          value={direction}
          onChange={(e) => setDirection(e.target.value)}
          disabled={generating}
        />
        <div className="mt-3 flex justify-end">
          <Button onClick={generate} disabled={generating}>
            {generating ? (
              <>
                <Spinner className="h-4 w-4" /> Writing…
              </>
            ) : (
              <>
                <Wand2 className="h-4 w-4" /> {parts.length ? "Generate next part" : "Generate Part 1"}
              </>
            )}
          </Button>
        </div>
      </Card>
    </div>
  );
}
