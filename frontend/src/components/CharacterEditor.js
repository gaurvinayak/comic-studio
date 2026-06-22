import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Sparkles, Lock, Unlock, Trash2, ImagePlus, Check } from "lucide-react";
import { charactersAPI, pollJob, assetUrl } from "@/api";
import { Button, Badge, Field, Input, Textarea, Spinner } from "@/components/ui";
import { cn } from "@/lib/utils";

export default function CharacterEditor({ character, onClose, onSaved, onDeleted }) {
  const [c, setC] = useState(character);
  const [form, setForm] = useState(() => toForm(character));
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);

  // Re-sync when a different character is opened
  useEffect(() => {
    setC(character);
    setForm(toForm(character));
  }, [character]);

  const locked = c.status === "locked";

  const sync = (fresh) => {
    setC(fresh);
    setForm(toForm(fresh));
    onSaved(fresh);
  };

  const generate = async () => {
    setGenerating(true);
    const tid = toast.loading("Drawing reference portrait…");
    try {
      const { data } = await charactersAPI.generatePortrait(c.character_id);
      const final = await pollJob(data.job_id);
      if (final.status === "error") throw new Error(final.error || "Generation failed");
      const fresh = (await charactersAPI.get(c.character_id)).data.character;
      sync(fresh);
      toast.success("Portrait ready", { id: tid });
    } catch (e) {
      toast.error(e?.message || "Generation failed", { id: tid });
    } finally {
      setGenerating(false);
    }
  };

  const choose = async (assetId) => {
    try {
      const fresh = (await charactersAPI.setPortrait(c.character_id, assetId)).data.character;
      sync(fresh);
    } catch {
      toast.error("Couldn't set portrait");
    }
  };

  const toggleLock = async () => {
    try {
      const fresh = locked
        ? (await charactersAPI.unlock(c.character_id)).data.character
        : (await charactersAPI.lock(c.character_id)).data.character;
      sync(fresh);
      toast.success(locked ? "Unlocked for editing" : "Locked — consistent across panels");
    } catch (e) {
      toast.error(e?.response?.data?.detail || "Action failed");
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      const body = {
        name: form.name,
        role: form.role,
        backstory: form.backstory,
        appearance_anchor: form.appearance_anchor,
        portrait_prompt: form.portrait_prompt,
        personality: {
          traits: form.traits.split(",").map((t) => t.trim()).filter(Boolean),
          motivations: form.motivations,
          voice: form.voice,
        },
      };
      const fresh = (await charactersAPI.update(c.character_id, body)).data.character;
      sync(fresh);
      toast.success("Saved");
    } catch {
      toast.error("Save failed");
    } finally {
      setSaving(false);
    }
  };

  const del = async () => {
    if (!window.confirm(`Delete ${c.name}?`)) return;
    try {
      await charactersAPI.remove(c.character_id);
      onDeleted(c.character_id);
      toast.success("Character deleted");
    } catch {
      toast.error("Delete failed");
    }
  };

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/70 backdrop-blur-sm"
      onMouseDown={onClose}
    >
      <div
        className="flex h-full w-full max-w-5xl flex-col bg-slate-900 shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center justify-between border-b border-slate-800 px-6 py-4">
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl tracking-wide text-white">{c.name}</h2>
            {locked ? (
              <Badge className="bg-emerald-500/90 text-emerald-950">
                <Lock className="h-3 w-3" /> locked
              </Badge>
            ) : (
              <Badge className="bg-slate-800 text-slate-300">draft</Badge>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={del} className="text-rose-300 hover:text-rose-200">
              <Trash2 className="h-4 w-4" /> Delete
            </Button>
            <Button variant="secondary" size="sm" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[340px_1fr]">
          {/* ── Portrait / reference column ── */}
          <div className="space-y-4">
            <div className="relative aspect-[3/4] overflow-hidden rounded-xl border border-slate-800 bg-slate-950">
              {c.portrait_url ? (
                <img src={assetUrl(c.portrait_url)} alt={c.name} className="h-full w-full object-cover" />
              ) : (
                <div className="halftone grid h-full place-items-center text-center text-slate-600">
                  <span className="px-6 text-sm">
                    No portrait yet.
                    <br />
                    Generate one to lock the look.
                  </span>
                </div>
              )}
              {generating && (
                <div className="absolute inset-0 grid place-items-center bg-slate-950/70">
                  <div className="flex flex-col items-center gap-2 text-slate-200">
                    <Spinner className="h-6 w-6" />
                    <span className="text-xs">drawing…</span>
                  </div>
                </div>
              )}
            </div>

            <Button onClick={generate} disabled={generating} className="w-full">
              {c.portrait_url ? <ImagePlus className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
              {c.portrait_url ? "Generate variant" : "Generate portrait"}
            </Button>

            {c.reference_urls?.length > 1 && (
              <div>
                <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-400">
                  References · pick the canonical look
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {c.reference_urls.map((url) => {
                    const active = url === c.portrait_url;
                    return (
                      <button
                        key={url}
                        onClick={() => choose(url.split("/").pop())}
                        className={cn(
                          "relative aspect-square overflow-hidden rounded-lg border-2 transition",
                          active ? "border-emerald-400" : "border-transparent hover:border-slate-600"
                        )}
                      >
                        <img src={assetUrl(url)} alt="" className="h-full w-full object-cover" />
                        {active && (
                          <span className="absolute right-0.5 top-0.5 rounded-full bg-emerald-400 p-0.5 text-emerald-950">
                            <Check className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <Button
              variant={locked ? "outline" : "secondary"}
              onClick={toggleLock}
              disabled={!c.portrait_url && !locked}
              className="w-full"
            >
              {locked ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />}
              {locked ? "Unlock to edit" : "Lock character"}
            </Button>
            <p className="text-center text-[11px] text-slate-500">
              Locking feeds this portrait into every panel so the character stays consistent.
            </p>
          </div>

          {/* ── Details column ── */}
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Name">
                <Input value={form.name} onChange={set("name")} disabled={locked} />
              </Field>
              <Field label="Role">
                <Input value={form.role} onChange={set("role")} disabled={locked} />
              </Field>
            </div>

            <Field label="Personality traits" hint="comma separated">
              <Input value={form.traits} onChange={set("traits")} disabled={locked} />
            </Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Motivations">
                <Textarea rows={2} value={form.motivations} onChange={set("motivations")} disabled={locked} />
              </Field>
              <Field label="Voice / speech">
                <Textarea rows={2} value={form.voice} onChange={set("voice")} disabled={locked} />
              </Field>
            </div>

            <Field label="Backstory">
              <Textarea rows={3} value={form.backstory} onChange={set("backstory")} disabled={locked} />
            </Field>

            <Field label="Appearance anchor" hint="injected into every render — be specific">
              <Textarea
                rows={4}
                value={form.appearance_anchor}
                onChange={set("appearance_anchor")}
                disabled={locked}
              />
            </Field>

            <Field label="Portrait framing" hint="pose & framing for the reference">
              <Textarea
                rows={2}
                value={form.portrait_prompt}
                onChange={set("portrait_prompt")}
                disabled={locked}
              />
            </Field>

            {!locked && (
              <div className="flex justify-end pt-1">
                <Button onClick={save} disabled={saving}>
                  {saving ? <Spinner className="h-4 w-4" /> : <Check className="h-4 w-4" />} Save changes
                </Button>
              </div>
            )}
            {locked && (
              <p className="rounded-lg border border-slate-800 bg-slate-950/50 px-3 py-2 text-xs text-slate-400">
                This character is locked. Unlock to edit personality or appearance — note that changing
                the appearance may break visual consistency with already-drawn panels.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function toForm(c) {
  const p = c.personality || {};
  return {
    name: c.name || "",
    role: c.role || "",
    traits: (p.traits || []).join(", "),
    motivations: p.motivations || "",
    voice: p.voice || "",
    backstory: c.backstory || "",
    appearance_anchor: c.appearance_anchor || "",
    portrait_prompt: c.portrait_prompt || "",
  };
}
