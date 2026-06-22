import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Wand2, Users, BookText, Share2, ArrowRight } from "lucide-react";
import { showcaseAPI, assetUrl } from "@/api";
import PublicNav from "@/components/PublicNav";
import { Button } from "@/components/ui";

const FEATURES = [
  {
    icon: Users,
    title: "Consistent characters",
    body: "Define a cast once. Locked reference art keeps every character looking the same across every panel and issue.",
  },
  {
    icon: BookText,
    title: "Stories that continue",
    body: "Generate issue after issue — the studio remembers the plot and picks up where you left off.",
  },
  {
    icon: Wand2,
    title: "A real studio",
    body: "Script editor, panel art, drag-and-drop lettering, page layouts, and PDF export — end to end.",
  },
  {
    icon: Share2,
    title: "Publish & share",
    body: "Send any finished issue to the public showcase with one click and share a link.",
  },
];

export default function Landing() {
  const [comics, setComics] = useState([]);
  useEffect(() => {
    showcaseAPI
      .list()
      .then(({ data }) => setComics(data.comics.slice(0, 4)))
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen">
      <PublicNav />

      <section className="mx-auto max-w-5xl px-5 py-20 text-center sm:py-28">
        <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-700 bg-slate-900/60 px-3 py-1 text-xs text-slate-300">
          <Sparkles className="h-3.5 w-3.5 text-fuchsia-400" /> AI comic studio
        </span>
        <h1 className="mt-5 font-display text-5xl leading-tight tracking-wide text-white sm:text-7xl">
          Make comics where your characters <span className="text-fuchsia-400">stay consistent</span>
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-300">
          Give a theme. Get a cast you can shape, a story that continues across issues, and finished,
          lettered pages — then publish to the world.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Link to="/app">
            <Button size="lg">
              <Wand2 className="h-5 w-5" /> Start creating
            </Button>
          </Link>
          <Link to="/showcase">
            <Button size="lg" variant="secondary">
              Browse the showcase <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-5 py-8">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-2xl border border-slate-800 bg-slate-900/50 p-5">
              <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-500/15 text-indigo-300">
                <f.icon className="h-5 w-5" />
              </div>
              <h3 className="mt-3 font-semibold text-white">{f.title}</h3>
              <p className="mt-1 text-sm text-slate-400">{f.body}</p>
            </div>
          ))}
        </div>
      </section>

      {comics.length > 0 && (
        <section className="mx-auto max-w-6xl px-5 py-12">
          <div className="mb-5 flex items-end justify-between">
            <h2 className="font-display text-3xl tracking-wide text-white">From the showcase</h2>
            <Link to="/showcase" className="text-sm text-indigo-400 transition hover:text-indigo-300">
              See all →
            </Link>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {comics.map((c) => (
              <Link
                key={c.slug}
                to={`/c/${c.slug}`}
                className="group overflow-hidden rounded-xl border border-slate-800 bg-slate-900 transition hover:border-indigo-500/60"
              >
                <div className="aspect-[3/4] overflow-hidden bg-slate-950">
                  {c.cover_url ? (
                    <img
                      src={assetUrl(c.cover_url)}
                      alt=""
                      className="h-full w-full object-cover transition duration-300 group-hover:scale-105"
                    />
                  ) : (
                    <div className="halftone grid h-full place-items-center text-xs text-slate-600">no cover</div>
                  )}
                </div>
                <div className="p-3">
                  <div className="truncate text-sm font-semibold text-white">{c.series_title}</div>
                  <div className="truncate text-xs text-slate-400">by {c.author_name}</div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      )}

      <section className="mx-auto max-w-4xl px-5 py-20 text-center">
        <h2 className="font-display text-4xl tracking-wide text-white">Your comic is one sentence away</h2>
        <p className="mx-auto mt-3 max-w-xl text-slate-300">
          Describe an idea and watch the studio build the cast, the story, and the art.
        </p>
        <Link to="/app" className="mt-6 inline-block">
          <Button size="lg">
            <Sparkles className="h-5 w-5" /> Open the studio
          </Button>
        </Link>
      </section>

      <footer className="border-t border-slate-800/80 py-8 text-center text-sm text-slate-500">
        Comic Studio
      </footer>
    </div>
  );
}
