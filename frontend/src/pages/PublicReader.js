import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Sparkles } from "lucide-react";
import { showcaseAPI, assetUrl } from "@/api";
import PublicNav from "@/components/PublicNav";
import { Button, Spinner, Badge } from "@/components/ui";

export default function PublicReader() {
  const { slug } = useParams();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(false);

  useEffect(() => {
    showcaseAPI
      .get(slug)
      .then(({ data }) => setData(data))
      .catch(() => setErr(true))
      .finally(() => setLoading(false));
  }, [slug]);

  if (loading)
    return (
      <div className="min-h-screen">
        <PublicNav />
        <div className="grid place-items-center py-24">
          <Spinner className="h-6 w-6 text-slate-500" />
        </div>
      </div>
    );
  if (err || !data)
    return (
      <div className="min-h-screen">
        <PublicNav />
        <div className="mx-auto max-w-3xl px-5 py-24 text-center text-slate-400">
          This comic isn't available.{" "}
          <Link to="/showcase" className="text-indigo-400">
            Back to showcase
          </Link>
        </div>
      </div>
    );

  const { series, part, pages } = data;
  return (
    <div className="min-h-screen">
      <PublicNav />
      <div className="mx-auto max-w-3xl px-5 py-8">
        <Link
          to="/showcase"
          className="mb-4 inline-flex items-center gap-1 text-sm text-slate-400 transition hover:text-slate-200"
        >
          <ArrowLeft className="h-4 w-4" /> Showcase
        </Link>
        {series.genre && <Badge className="bg-indigo-500/15 text-indigo-300">{series.genre}</Badge>}
        <h1 className="mt-1 font-display text-4xl tracking-wide text-white">{series.title}</h1>
        <div className="mt-1 text-slate-300">
          {part.title} · <span className="text-slate-400">by {part.author_name}</span>
        </div>
        {part.synopsis && <p className="mt-3 max-w-2xl text-sm text-slate-400">{part.synopsis}</p>}

        <div className="mt-6 flex flex-col items-center gap-6">
          {pages.map((pg) => (
            <img
              key={pg.number}
              src={assetUrl(pg.url)}
              alt={`Page ${pg.number}`}
              className="w-full rounded-lg border border-slate-800 shadow-panel"
            />
          ))}
        </div>

        <div className="mt-10 rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center">
          <h3 className="font-display text-2xl tracking-wide text-white">Make your own</h3>
          <p className="mt-1 text-sm text-slate-400">
            Spin up a comic with consistent characters in minutes.
          </p>
          <Link to="/app" className="mt-4 inline-block">
            <Button>
              <Sparkles className="h-4 w-4" /> Open the studio
            </Button>
          </Link>
        </div>
      </div>
    </div>
  );
}
