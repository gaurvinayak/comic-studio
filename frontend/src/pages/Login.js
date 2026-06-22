import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { authAPI, setSessionToken } from "@/api";
import { Button, Card, Field, Input, Spinner } from "@/components/ui";

export default function Login() {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const navigate = useNavigate();

  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const { data } =
        mode === "login"
          ? await authAPI.login(email.trim(), password)
          : await authAPI.register(email.trim(), password, name.trim());
      setSessionToken(data.session_token);
      toast.success(mode === "login" ? `Welcome back, ${data.user.name}` : `Welcome, ${data.user.name}!`);
      navigate("/");
    } catch (err) {
      toast.error(err?.response?.data?.detail || "Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen place-items-center px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-gradient-to-br from-indigo-500 to-fuchsia-600 shadow-lg shadow-fuchsia-500/30">
            <Sparkles className="h-6 w-6 text-white" />
          </span>
          <h1 className="font-display text-3xl tracking-wider text-white">
            COMIC<span className="text-fuchsia-400">STUDIO</span>
          </h1>
          <p className="text-sm text-slate-400">
            {mode === "login" ? "Sign in to your studio" : "Create your studio account"}
          </p>
        </div>

        <Card className="p-6">
          <form onSubmit={submit} className="space-y-3">
            {mode === "register" && (
              <Field label="Name">
                <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoFocus />
              </Field>
            )}
            <Field label="Email">
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus={mode === "login"}
              />
            </Field>
            <Field label="Password">
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </Field>
            <Button type="submit" disabled={busy} className="w-full">
              {busy ? <Spinner className="h-4 w-4" /> : null}
              {mode === "login" ? "Sign in" : "Create account"}
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-sm text-slate-400">
          {mode === "login" ? "New here? " : "Already have an account? "}
          <button
            onClick={() => setMode(mode === "login" ? "register" : "login")}
            className="font-semibold text-indigo-400 transition hover:text-indigo-300"
          >
            {mode === "login" ? "Create an account" : "Sign in"}
          </button>
        </p>
      </div>
    </div>
  );
}
