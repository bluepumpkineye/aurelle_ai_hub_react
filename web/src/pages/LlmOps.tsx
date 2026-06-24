import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, streamReport } from "../lib/api";
import { C, CHART_COLORS, Card, Eyebrow, fmtNum } from "../components/ui";

function ModelCard({ m }: { m: any }) {
  return (
    <div className="bg-sidebar border border-bordeaux/60 rounded-md p-4">
      <div className="flex items-center gap-2">
        <span className="w-2 h-2 rounded-full" style={{ background: m.healthy ? "#7FB07F" : C.gold }} />
        <span className="text-gold text-[11px] font-semibold">{m.name}</span>
      </div>
      <div className="mt-3 space-y-1 text-[10px] text-[#cfc8ba]">
        <div>Version: {m.version}</div>
        <div>Latency: {m.latency}s</div>
        <div>Uptime: {m.uptime}%</div>
        <div>Queries/day: {m.queries}</div>
        <div className="text-gold">Cost/day: ${m.cost_day}</div>
      </div>
    </div>
  );
}

function Monitoring({ d }: { d: any }) {
  return (
    <div>
      <Eyebrow>Model Registry &amp; Health</Eyebrow>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {d.models.map((m: any) => <ModelCard key={m.name} m={m} />)}
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-8">
        <Card className="p-6">
          <Eyebrow>Query Volume · last 14 days</Eyebrow>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={d.charts.volume} margin={{ left: -10, top: 6 }}>
              <defs>
                <linearGradient id="vol" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.bordeaux} stopOpacity={0.25} />
                  <stop offset="100%" stopColor={C.bordeaux} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.muted }} interval={2} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} />
              <Tooltip formatter={(v: any) => fmtNum(v)} />
              <Area type="monotone" dataKey="value" stroke={C.bordeaux} strokeWidth={2} fill="url(#vol)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Guardrail Events · last 14 days</Eyebrow>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.charts.guardrails} margin={{ left: -10, top: 6 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.muted }} interval={0} angle={-12} textAnchor="end" height={40} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} allowDecimals={false} />
              <Tooltip cursor={{ fill: "#00000008" }} />
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {d.charts.guardrails.map((e: any, i: number) => (
                  <Cell key={i} fill={e.value > 5 ? C.bordeaux : e.value > 2 ? C.gold : C.forest} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Avg Response Latency (ms) by Model</Eyebrow>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={d.charts.latency} margin={{ left: -4, top: 6 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.muted }} interval={0} angle={-15} textAnchor="end" height={48} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} />
              <Tooltip cursor={{ fill: "#00000008" }} formatter={(v: any) => `${v} ms`} />
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {d.charts.latency.map((e: any, i: number) => (
                  <Cell key={i} fill={e.value > 1300 ? C.bordeaux : e.value > 500 ? C.gold : C.forest} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Daily AI Cost Breakdown (USD)</Eyebrow>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie data={d.charts.cost} dataKey="value" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={2}>
                {d.charts.cost.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => `$${v}`} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Eval log */}
      <div className="mt-8">
        <Eyebrow>Prompt Evaluation Log</Eyebrow>
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left label border-b border-line">
                {["Module", "Tokens in", "Tokens out", "Latency", "Guardrail", "Quality", "Cost"].map((h) => (
                  <th key={h} className="font-medium py-3 px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.evals.map((e: any, i: number) => (
                <tr key={i} className={`border-b border-line/70 ${!e.pass ? "bg-bordeaux/5" : "hover:bg-cream"}`}>
                  <td className="py-2.5 px-5 text-ink">{e.module}</td>
                  <td className="py-2.5 px-5 text-muted">{fmtNum(e.tokens_in)}</td>
                  <td className="py-2.5 px-5 text-muted">{fmtNum(e.tokens_out)}</td>
                  <td className="py-2.5 px-5 text-muted">{e.latency}s</td>
                  <td className="py-2.5 px-5">
                    <span className={e.pass ? "text-forest" : "text-bordeaux"}>{e.pass ? "✓ pass" : "⛔ flagged"}</span>
                  </td>
                  <td className="py-2.5 px-5 text-ink">{e.quality}</td>
                  <td className="py-2.5 px-5 text-muted">${e.cost.toFixed(4)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>

      {/* Architecture */}
      <div className="mt-8">
        <Eyebrow>GenAI Platform Architecture</Eyebrow>
        <Card className="p-6 bg-sidebar">
          <div className="space-y-2">
            {d.architecture.map((layer: string, i: number) => (
              <div key={i} className="flex items-center gap-3">
                <span className="font-display text-gold text-sm w-6">{String(i + 1).padStart(2, "0")}</span>
                <div className="flex-1 border border-[#333] rounded px-4 py-2.5 text-[13px] text-cream bg-[#1a1a1a]">{layer}</div>
                {i < d.architecture.length - 1 && <span className="text-gold">↓</span>}
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  );
}

function PromptLab({ templates }: { templates: any }) {
  const tmplNames = Object.keys(templates?.templates || {});
  const [system, setSystem] = useState("");
  const [user, setUser] = useState("");
  const [temp, setTemp] = useState(0.4);
  const [maxTokens, setMaxTokens] = useState(512);
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (tmplNames.length && !system) setSystem(templates.templates[tmplNames[0]]);
  }, [templates]);

  async function run() {
    setOut("");
    setBusy(true);
    try {
      await streamReport(
        "/api/llmops/run",
        { system, user, temperature: temp, max_tokens: maxTokens },
        (c) => setOut((t) => t + c),
        () => setBusy(false),
      );
    } catch {
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-6 space-y-4">
        <Eyebrow>Prompt Template Library</Eyebrow>
        <select
          onChange={(e) => setSystem(templates.templates[e.target.value])}
          className="w-full bg-card border border-line px-3.5 py-2.5 text-sm text-ink focus:border-gold outline-none"
        >
          {tmplNames.map((n) => <option key={n}>{n}</option>)}
        </select>
        <div>
          <div className="label mb-1.5">System prompt</div>
          <textarea
            value={system}
            onChange={(e) => setSystem(e.target.value)}
            rows={6}
            className="w-full bg-card border border-line px-3.5 py-2.5 text-[13px] text-ink focus:border-gold outline-none scroll-thin"
          />
        </div>
        <div>
          <div className="label mb-1.5">User message (optional)</div>
          <textarea
            value={user}
            onChange={(e) => setUser(e.target.value)}
            rows={2}
            placeholder="Leave blank to execute the system prompt…"
            className="w-full bg-card border border-line px-3.5 py-2.5 text-[13px] text-ink focus:border-gold outline-none"
          />
        </div>
        <div className="flex items-center gap-6">
          <div className="flex-1">
            <div className="flex justify-between text-[11px] mb-1">
              <span className="text-muted">Temperature</span>
              <span className="text-ink">{temp}</span>
            </div>
            <input type="range" min={0} max={1} step={0.1} value={temp} onChange={(e) => setTemp(parseFloat(e.target.value))} className="w-full accent-[#B8965A]" />
          </div>
          <div>
            <div className="label mb-1.5">Max tokens</div>
            <select value={maxTokens} onChange={(e) => setMaxTokens(parseInt(e.target.value))} className="bg-card border border-line px-3 py-2 text-[13px] text-ink focus:border-gold outline-none">
              {[256, 512, 768, 1024].map((n) => <option key={n}>{n}</option>)}
            </select>
          </div>
        </div>
        <button onClick={run} disabled={busy} className="w-full bg-sidebar text-cream text-xs font-medium uppercase tracking-[0.2em] py-3.5 hover:bg-[#222] transition disabled:opacity-40">
          {busy ? "Generating…" : "◆ Run prompt"}
        </button>
      </Card>

      <Card className="p-6 min-h-[320px]">
        <div className="flex items-center justify-between mb-3">
          <Eyebrow>Output</Eyebrow>
          {out && !busy && (
            <span className="text-[10px] uppercase tracking-[0.15em] text-forest">
              ✓ input safe · output brand-safe · PII sanitised
            </span>
          )}
        </div>
        {out || busy ? (
          <div className={`whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink ${busy ? "caret" : ""}`}>{out}</div>
        ) : (
          <div className="text-sm text-muted">The generated, guardrailed output will stream here.</div>
        )}
      </Card>
    </div>
  );
}

function ModulePrompts() {
  const [list, setList] = useState<any[]>([]);
  const [sel, setSel] = useState<string>("");
  const [text, setText] = useState("");
  const [out, setOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  function load() {
    api.get("/api/llmops/prompts").then((r) => {
      setList(r.prompts);
      if (!sel && r.prompts.length) {
        setSel(r.prompts[0].key);
        setText(r.prompts[0].text);
      }
    });
  }
  useEffect(load, []);

  function pick(p: any) {
    setSel(p.key);
    setText(p.text);
    setOut("");
    setSaved("");
  }
  async function save() {
    await api.post("/api/llmops/prompts/save", { key: sel, text });
    setSaved("Saved · now active across the hub");
    load();
  }
  async function reset() {
    const r = await api.post("/api/llmops/prompts/reset", { key: sel, text: "" });
    setText(r.text || "");
    setSaved("Reset to default");
    load();
  }
  async function test() {
    setOut("");
    setBusy(true);
    try {
      await streamReport("/api/llmops/prompts/test", { text, sample: "" }, (c) => setOut((t) => t + c), () => setBusy(false));
    } catch {
      setBusy(false);
    }
  }

  const current = list.find((p) => p.key === sel);

  return (
    <div className="grid lg:grid-cols-[260px_1fr] gap-6">
      <div className="space-y-1">
        <Eyebrow>System prompts</Eyebrow>
        {list.map((p) => (
          <button
            key={p.key}
            onClick={() => pick(p)}
            className={`w-full text-left px-4 py-2.5 text-[13px] border-l-2 transition ${
              sel === p.key ? "border-gold bg-card text-ink" : "border-transparent text-muted hover:text-ink hover:bg-card/60"
            }`}
          >
            <div className="flex items-center justify-between">
              <span>{p.label}</span>
              {p.customised && <span className="text-[8px] uppercase tracking-wide text-gold">edited</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="space-y-4">
        <Card className="p-6">
          <div className="flex items-center justify-between mb-3">
            <Eyebrow>{current?.label || "Prompt"}</Eyebrow>
            {saved && <span className="text-[10px] uppercase tracking-[0.15em] text-forest">{saved}</span>}
          </div>
          <textarea
            value={text}
            onChange={(e) => { setText(e.target.value); setSaved(""); }}
            rows={12}
            className="w-full bg-cream/40 border border-line px-4 py-3 text-[13px] leading-relaxed text-ink focus:border-gold outline-none scroll-thin font-sans"
          />
          <div className="flex gap-3 mt-4">
            <button onClick={save} className="flex-1 bg-sidebar text-cream text-xs font-medium uppercase tracking-[0.2em] py-3 hover:bg-[#222] transition">
              Save &amp; activate
            </button>
            <button onClick={reset} className="px-5 border border-line text-xs font-medium uppercase tracking-[0.18em] text-muted hover:text-ink hover:border-gold transition">
              Reset
            </button>
            <button onClick={test} disabled={busy} className="px-5 border border-gold text-xs font-medium uppercase tracking-[0.18em] text-gold hover:bg-gold/10 transition disabled:opacity-40">
              {busy ? "Testing…" : "Test"}
            </button>
          </div>
        </Card>

        {(out || busy) && (
          <Card className="p-6">
            <Eyebrow>Test output</Eyebrow>
            <div className={`whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink ${busy && !out ? "caret" : ""}`}>{out}</div>
          </Card>
        )}
      </div>
    </div>
  );
}

export function LlmOps() {
  const [tab, setTab] = useState<"monitor" | "lab" | "prompts">("monitor");
  const [mon, setMon] = useState<any>(null);
  const [tmpl, setTmpl] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/api/llmops/monitor").then(setMon).catch(() => setErr("Could not load data. Is the API running on :8000?"));
    api.get("/api/llmops/templates").then(setTmpl).catch(() => {});
  }, []);

  if (err) return <div className="text-bordeaux">{err}</div>;
  if (!mon) return <div className="text-muted">Loading LLMOps…</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label text-gold">LLMOps &amp; Prompt Lab</div>
          <h1 className="font-display text-4xl font-light text-ink mt-1">Model Monitoring &amp; Governance</h1>
          <p className="text-sm text-muted mt-2 max-w-xl">
            AI platform observability — latency, cost, guardrail events — and a prompt engineering playground.
          </p>
        </div>
        <span className="label text-muted border border-line px-3 py-1.5">Internal · observability</span>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mt-8 border-b border-line">
        {[
          ["monitor", "Model Monitoring"],
          ["lab", "Prompt Laboratory"],
          ["prompts", "Module System Prompts"],
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as any)}
            className={`px-5 py-3 text-sm font-light transition border-b-2 -mb-px ${
              tab === key ? "border-gold text-ink" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="mt-8">
        {tab === "monitor" && <Monitoring d={mon} />}
        {tab === "lab" && <PromptLab templates={tmpl} />}
        {tab === "prompts" && <ModulePrompts />}
      </div>

      <div className="h-12" />
    </motion.div>
  );
}
