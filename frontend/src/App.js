import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { healthAPI, authAPI, getSessionToken } from "@/api";
import { Spinner } from "@/components/ui";
import Layout from "./components/Layout";
import Library from "./pages/Library";
import SeriesStudio from "./pages/SeriesStudio";
import PartView from "./pages/PartView";
import Login from "./pages/Login";
import Landing from "./pages/Landing";
import Showcase from "./pages/Showcase";
import PublicReader from "./pages/PublicReader";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* public */}
        <Route path="/" element={<Landing />} />
        <Route path="/login" element={<Login />} />
        <Route path="/showcase" element={<Showcase />} />
        <Route path="/c/:slug" element={<PublicReader />} />
        {/* studio (auth-gated when AUTH_ENABLED) */}
        <Route path="/app" element={<Protected><Library /></Protected>} />
        <Route path="/series/:id" element={<Protected><SeriesStudio /></Protected>} />
        <Route path="/parts/:partId" element={<Protected><PartView /></Protected>} />
      </Routes>
    </BrowserRouter>
  );
}

function Protected({ children }) {
  const [state, setState] = useState({ loading: true, authEnabled: false, user: null });

  useEffect(() => {
    let cancelled = false;
    const done = (s) => !cancelled && setState({ loading: false, ...s });
    healthAPI
      .get()
      .then(({ data }) => {
        if (!data.auth_enabled) return done({ authEnabled: false, user: null });
        if (!getSessionToken()) return done({ authEnabled: true, user: null });
        return authAPI
          .me()
          .then(({ data }) => done({ authEnabled: true, user: data.user }))
          .catch(() => done({ authEnabled: true, user: null }));
      })
      .catch(() => done({ authEnabled: false, user: null }));
    return () => {
      cancelled = true;
    };
  }, []);

  if (state.loading)
    return (
      <div className="grid min-h-screen place-items-center">
        <Spinner className="h-6 w-6 text-slate-500" />
      </div>
    );
  if (state.authEnabled && !state.user) return <Navigate to="/login" replace />;
  return <Layout user={state.user}>{children}</Layout>;
}
