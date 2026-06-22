import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { showcaseAPI, assetUrl } from "@/api";
import PublicNav from "@/components/PublicNav";
import { Spinner } from "@/components/ui";

export default function Showcase() {
  const [comics, setComics] = useState([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    showcaseAPI
      .list()
      .then(({ data }) => setComics(data.comics))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="min-h-screen">
      <PublicNav />
      <div className="mx-auto max-w-7xl px-5 py-10">
        <h1 className="font-display text-4xl tracking-wide text-white">Showcase</h1>
        <p className="mt-1 text-slate-400">Comics published by the community.</p>

        {loading ? (
          <div className="grid place-items-center py-24">
            <Spinner className="h-6 w-6 text-slate-500" />
          </div>
        ) : comics.length === 0 ? (
          <div className="mt-12 rounded-2xl border border-dashed border-slate-800 py-20 text-center text-slate-400">
            No published comics yet. Be the first — make one in the studio and hit Publish.
          </div>
        ) : (
          <div className="mt-8 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
            {comics.map((c) => (
              <Link
                key={c.slug}
                to={`/c/${c.slug}`}
                className="group overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 transition hover:border-indigo-500/60"
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
                  <div className="truncate font-semibold text-white">{c.series_title}</div>
                  <div className="truncate text-xs text-slate-400">{c.title}</div>
                  <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                    <span>by {c.author_name}</span>
                    <span>{c.pages}p</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
