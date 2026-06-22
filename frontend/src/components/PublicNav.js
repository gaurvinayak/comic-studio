import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export default function PublicNav() {
  return (
    <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
        <Link to="/" className="flex items-center gap-2">
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow-lg shadow-fuchsia-500/30">
            <Sparkles className="h-5 w-5 text-white" />
          </span>
          <span className="font-display text-2xl tracking-wider text-white">
            COMIC<span className="text-fuchsia-400">STUDIO</span>
          </span>
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link to="/showcase" className="font-medium text-slate-300 transition hover:text-white">
            Showcase
          </Link>
          <Link
            to="/app"
            className="rounded-lg bg-indigo-500 px-3 py-1.5 font-medium text-white transition hover:bg-indigo-400"
          >
            Open Studio
          </Link>
        </nav>
      </div>
    </header>
  );
}
