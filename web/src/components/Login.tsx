import { useState } from "react";
import { motion } from "framer-motion";
import { api, setToken } from "../lib/api";

export function Login({ onAuthed }: { onAuthed: () => void }) {
  const [email, setEmail] = useState("admin@aurelle.com");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    setBusy(true);
    try {
      const res = await api.login(email, password);
      if (res.ok) {
        setToken(res.token);
        onAuthed();
      } else {
        setErr(res.message || "Invalid login credentials.");
      }
    } catch {
      setErr("Could not reach the API. Is the backend running on :8000?");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Brand panel */}
      <div className="relative hidden lg:flex flex-col justify-between bg-sidebar p-14 overflow-hidden">
        <div
          className="absolute inset-0 opacity-60"
          style={{
            background:
              "radial-gradient(circle at 30% 20%, rgba(184,150,90,0.16), transparent 45%)",
          }}
        />
        <div className="relative label text-gold">Asia Pacific</div>
        <div className="relative">
          <div className="font-display text-6xl font-light tracking-[0.2em] text-cream">
            AURELLE
          </div>
          <div className="mt-4 h-px w-28 bg-gold" />
          <div className="mt-5 font-display italic text-2xl text-[#b8965a]">
            One governed intelligence stack.
          </div>
          <div className="mt-3 font-sans text-sm font-light text-[#8A857B] max-w-sm leading-relaxed">
            Executive intelligence for luxury Maisons in APAC — governed end to end.
          </div>
        </div>
        <div className="relative label text-[#6b675f]">
          RBAC · PII · Residency · Audit
        </div>
      </div>

      {/* Form */}
      <div className="flex items-center justify-center bg-cream p-8">
        <motion.form
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          onSubmit={submit}
          className="w-full max-w-sm"
        >
          <div className="lg:hidden font-display text-4xl font-light tracking-[0.18em] text-ink mb-8">
            AURELLE
          </div>
          <div className="label">Sign in</div>
          <h1 className="font-display text-3xl font-light text-ink mt-1 mb-8">
            Welcome back.
          </h1>

          <label className="label block mb-2">Email</label>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full bg-card border border-line px-4 py-3 text-sm text-ink outline-none focus:border-gold transition mb-5"
            autoComplete="username"
          />

          <label className="label block mb-2">Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full bg-card border border-line px-4 py-3 text-sm text-ink outline-none focus:border-gold transition mb-2"
            autoComplete="current-password"
          />

          {err && <div className="text-bordeaux text-xs mt-2 mb-2">{err}</div>}

          <button
            disabled={busy}
            className="w-full mt-5 bg-sidebar text-cream text-xs font-medium uppercase tracking-[0.2em] py-4 hover:bg-[#222] transition disabled:opacity-60"
          >
            {busy ? "Authenticating…" : "Enter the workspace"}
          </button>

          <p className="text-muted text-[11px] mt-6 leading-relaxed">
            Demo access · <span className="text-ink">admin@aurelle.com</span> /
            the demo password configured in your <code>.env</code>.
          </p>
        </motion.form>
      </div>
    </div>
  );
}
