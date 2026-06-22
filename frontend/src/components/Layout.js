import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, LogOut, Image as ImageIcon } from "lucide-react";
import { healthAPI, authAPI, setSessionToken, usageAPI } from "@/api";
import { cn } from "@/lib/utils";

export default function Layout({ children, user }) {
  const [online, setOnline] = useState(null);
  const [usage, setUsage] = useState(null);
  useEffect(() => {
    healthAPI
      .get()
      .then(() => setOnline(true))
      .catch(() => setOnline(false));
    usageAPI
      .get()
      .then(({ data }) => setUsage(data))
      .catch(() => {});
  }, []);

  const logout = async () => {
    try {
      await authAPI.logout();
    } catch {
      /* ignore */
    }
    setSessionToken(null);
    window.location.href = "/login";
  };

  return (
    <div className="min-h-full">
      <header className="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3">
          <Link to="/app" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow-lg shadow-fuchsia-500/30">
              <Sparkles className="h-5 w-5 text-white" />
            </span>
            <span className="font-display text-2xl tracking-wider text-white">
              COMIC<span className="text-fuchsia-400">STUDIO</span>
            </span>
          </Link>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 text-xs text-slate-400">
              <span
                className={cn(
                  "h-2 w-2 rounded-full",
                  online === null ? "bg-slate-500" : online ? "bg-emerald-400" : "bg-rose-500"
                )}
              />
              {online === null ? "connecting…" : online ? "online" : "offline"}
            </div>
            {usage && (
              <span
                className="hidden items-center gap-1 rounded-full border border-slate-800 px-2.5 py-1 text-xs text-slate-300 sm:inline-flex"
                title={`${usage.images} AI images generated across all your comics`}
              >
                <ImageIcon className="h-3.5 w-3.5 text-slate-400" /> ~${usage.est_cost_usd}
              </span>
            )}
            {user && (
              <div className="flex items-center gap-2">
                <span className="hidden text-sm text-slate-300 sm:inline">{user.name}</span>
                <button
                  onClick={logout}
                  className="inline-flex items-center gap-1 rounded-md border border-slate-700 px-2 py-1 text-xs text-slate-300 transition hover:border-slate-500 hover:text-white"
                  title="Sign out"
                >
                  <LogOut className="h-3.5 w-3.5" /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-7xl px-5 py-8">{children}</main>
    </div>
  );
}
