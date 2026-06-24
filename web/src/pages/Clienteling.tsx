import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
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
import { api, streamOutreach, streamReport } from "../lib/api";
import { AnimatedNumber } from "../components/AnimatedNumber";

// ── formatting ─────────────────────────────────────────────
const fmtUsd = (v: number) => {
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
};
const fmtNum = (v: number) => Math.round(v).toLocaleString("en-US");

const C = { gold: "#B8965A", bordeaux: "#8B1A2B", forest: "#2D5A3D", ink: "#1A1A1A", muted: "#8A857B" };
const CHURN_COLOR: Record<string, string> = { High: C.bordeaux, Medium: C.gold, Low: C.forest };

// ── small UI atoms ─────────────────────────────────────────
function Card({ children, className = "" }: any) {
  return (
    <div className={`bg-card border border-line/80 rounded-[5px] shadow-soft ${className}`}>{children}</div>
  );
}
function Eyebrow({ children }: any) {
  return <div className="label mb-4">{children}</div>;
}

function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const toggle = (o: string) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="relative" ref={ref}>
      <div className="label mb-2">{label}</div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="min-w-[180px] flex items-center justify-between gap-3 bg-card border border-line px-3.5 py-2.5 text-sm text-ink hover:border-gold transition"
      >
        <span className={value.length ? "text-ink" : "text-muted"}>
          {value.length ? `${value.length} selected` : "All"}
        </span>
        <span className="text-muted text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-auto bg-card border border-line shadow-soft scroll-thin">
          {value.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full text-left px-3.5 py-2 text-xs text-bordeaux hover:bg-cream"
            >
              Clear selection
            </button>
          )}
          {options.map((o) => (
            <label
              key={o}
              className="flex items-center gap-3 px-3.5 py-2 text-sm text-ink hover:bg-cream cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(o)}
                onChange={() => toggle(o)}
                className="accent-[#B8965A]"
              />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value, amount, format, sub, tone }: any) {
  const color = tone === "risk" ? "text-bordeaux" : tone === "good" ? "text-forest" : "text-ink";
  return (
    <Card className="shine group p-6 transition duration-300 hover:shadow-lift hover:-translate-y-[2px]">
      <div className="absolute inset-x-0 top-0 h-[2px] w-0 bg-gold transition-all duration-500 group-hover:w-full" />
      <div className="label">{label}</div>
      <div className={`font-display text-4xl font-light mt-3 tracking-tight ${color}`}>
        {amount !== undefined && format ? <AnimatedNumber value={amount} format={format} /> : value}
      </div>
      {sub && <div className="text-xs text-muted mt-2">{sub}</div>}
    </Card>
  );
}

// ── governance trace ───────────────────────────────────────
function GovTrace({ gov }: { gov: any }) {
  if (!gov) return null;
  const cost = gov.cost || {};
  return (
    <Card className="p-5 bg-sidebar border-[#2a2a2a]">
      <div className="flex items-center gap-2 mb-4">
        <span className="w-1.5 h-1.5 rounded-full bg-gold" />
        <span className="font-sans text-[10px] font-medium uppercase tracking-[0.25em] text-gold">
          Governance trace — what happened underneath
        </span>
      </div>
      <div className="space-y-2">
        {(gov.stages || []).map((s: any, i: number) => (
          <div key={i} className="flex items-start gap-3 text-[13px]">
            <span className={s.status === "ok" ? "text-[#7FB07F]" : "text-bordeaux"}>
              {s.status === "ok" ? "✓" : "⛔"}
            </span>
            <span className="text-cream font-medium uppercase tracking-wide text-[11px] w-20 shrink-0">
              {s.stage}
            </span>
            <span className="text-[#9a958c] font-light">{s.detail}</span>
          </div>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-3 mt-5 pt-4 border-t border-[#262626]">
        {[
          ["PII redactions", (gov.redactions || []).length],
          ["Rows blocked", gov.rows_blocked ?? 0],
          ["Approval", gov.approval_required ? "Required" : "—"],
          ["Query cost", `$${(cost.cost_usd ?? 0).toFixed(4)}`],
        ].map(([k, v]: any) => (
          <div key={k}>
            <div className="text-[9px] uppercase tracking-[0.18em] text-[#6b675f]">{k}</div>
            <div className="font-display text-xl text-cream mt-1">{v}</div>
          </div>
        ))}
      </div>
      {gov.audit_event_hash && (
        <div className="text-[10px] text-[#6b675f] mt-3 font-mono">
          audit · {String(gov.audit_event_hash).slice(0, 18)}… · route {cost.model || "—"}
          {gov.engine ? ` · ${gov.engine}` : ""}
        </div>
      )}
    </Card>
  );
}

// ── co-pilot ───────────────────────────────────────────────
const CHANNELS = ["WeChat Message", "Personal Email", "WhatsApp Brief"];
const LANGS = ["English", "Japanese", "Simplified Chinese", "Korean"];
const OCCASIONS = [
  "Private High Jewellery Salon Invitation",
  "Anniversary Greeting & Gift Offering",
  "New Collection Relaunch Preview",
  "Custom Jewellery Bespoke Inquiry",
];

function CoPilot({ roles, pool }: { roles: any; pool: any[] }) {
  const [role, setRole] = useState<string>("");
  const [clientId, setClientId] = useState<string>("");
  const [res, setRes] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [channel, setChannel] = useState(CHANNELS[0]);
  const [lang, setLang] = useState(LANGS[0]);
  const [occasion, setOccasion] = useState(OCCASIONS[0]);
  const [draft, setDraft] = useState("");
  const [streaming, setStreaming] = useState(false);

  useEffect(() => {
    if (roles?.default && !role) setRole(roles.default);
  }, [roles]);
  useEffect(() => {
    if (pool.length && !pool.find((p) => p.client_id === clientId))
      setClientId(pool[0]?.client_id || "");
  }, [pool]);

  async function doLookup() {
    if (!role || !clientId) return;
    setLoading(true);
    setDraft("");
    try {
      setRes(await api.lookup(role, clientId));
    } catch {
      setRes(null);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    doLookup();
  }, [role, clientId]);

  async function generate() {
    setDraft("");
    setStreaming(true);
    try {
      await streamOutreach(
        { role, client_id: clientId, channel, language: lang, occasion },
        (chunk) => setDraft((d) => d + chunk),
        () => setStreaming(false),
      );
    } catch {
      setStreaming(false);
    }
  }

  const profile = res?.kind === "profile" ? res.profile : null;

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      {/* Left: identity + selection */}
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <div className="label mb-2">Acting role (governed access)</div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value)}
              className="w-full bg-card border border-line px-3.5 py-2.5 text-sm text-ink outline-none focus:border-gold"
            >
              {(roles?.roles || []).map((r: string) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </div>
          <div>
            <div className="label mb-2">Client profile</div>
            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              className="w-full bg-card border border-line px-3.5 py-2.5 text-sm text-ink outline-none focus:border-gold"
            >
              {pool.map((p) => (
                <option key={p.client_id} value={p.client_id}>
                  {p.name} · {p.market}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Governed result */}
        {loading && <div className="text-sm text-muted">Governing the request…</div>}
        {res && res.kind === "denied" && (
          <Card className="p-4 border-l-[3px] border-bordeaux">
            <div className="text-sm text-bordeaux font-medium">🔒 Access denied</div>
            <div className="text-xs text-muted mt-1">
              This role has no clienteling grant — the query was blocked and the attempt logged.
            </div>
          </Card>
        )}
        {res && res.kind === "out_of_region" && (
          <Card className="p-4 border-l-[3px] border-bordeaux">
            <div className="text-sm text-bordeaux font-medium">🔒 Out of region</div>
            <div className="text-xs text-muted mt-1">
              The client sits in another residency zone; the record was withheld and audited.
            </div>
          </Card>
        )}
        {res && res.kind === "cohort" && (
          <Card className="p-4 border-l-[3px] border-gold">
            <div className="text-sm text-ink font-medium">Aggregate-only clearance</div>
            <div className="text-xs text-muted mt-1">
              The individual dossier was withheld; only cohort metrics are returned at this access level.
            </div>
          </Card>
        )}
        {profile && (
          <Card className="p-6 border-t-2 border-t-gold">
            <div className="label">Maison Profile · governed</div>
            <div className="font-display text-2xl text-ink mt-1">{profile.name}</div>
            <div className="grid grid-cols-2 gap-y-2 gap-x-6 mt-4 text-[13px]">
              {[
                ["Region", profile.region],
                ["Residency", profile.residency_zone],
                ["Tier", profile.tier],
                ["Lifetime value", fmtUsd(profile.lifetime_spend_usd || 0)],
                ["Home boutique", profile.home_boutique],
                ["Stylist", profile.preferred_sa],
                ["Preferred", (profile.preferred_categories || []).join(", ")],
                ["Last purchase", profile.last_purchase_date],
              ].map(([k, v]: any) => (
                <div key={k} className="flex flex-col">
                  <span className="text-[10px] uppercase tracking-[0.15em] text-muted">{k}</span>
                  <span className="text-ink">{v || "—"}</span>
                </div>
              ))}
            </div>
            {profile.notes && (
              <div className="text-xs text-muted mt-4 italic">“{profile.notes}”</div>
            )}
          </Card>
        )}

        {res?.governance && <GovTrace gov={res.governance} />}
      </div>

      {/* Right: outreach generation */}
      <div className="space-y-4">
        <Card className="p-6">
          <Eyebrow>AI Stylist Outreach · governed</Eyebrow>
          <div className="grid grid-cols-3 gap-3">
            {[
              ["Channel", channel, setChannel, CHANNELS],
              ["Language", lang, setLang, LANGS],
            ].map(([lbl, val, set, opts]: any) => (
              <div key={lbl}>
                <div className="label mb-1.5">{lbl}</div>
                <select
                  value={val}
                  onChange={(e) => set(e.target.value)}
                  className="w-full bg-card border border-line px-3 py-2 text-[13px] text-ink outline-none focus:border-gold"
                >
                  {opts.map((o: string) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              </div>
            ))}
            <div className="col-span-1">
              <div className="label mb-1.5">Occasion</div>
              <select
                value={occasion}
                onChange={(e) => setOccasion(e.target.value)}
                className="w-full bg-card border border-line px-3 py-2 text-[13px] text-ink outline-none focus:border-gold"
              >
                {OCCASIONS.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            </div>
          </div>

          <button
            onClick={generate}
            disabled={!profile || streaming}
            className="w-full mt-5 bg-sidebar text-cream text-xs font-medium uppercase tracking-[0.2em] py-3.5 hover:bg-[#222] transition disabled:opacity-40"
          >
            {streaming ? "Drafting…" : "◆ Generate governed outreach"}
          </button>
          {!profile && (
            <div className="text-[11px] text-muted mt-3">
              Outreach drafting is unavailable for this role / selection under the current policy.
            </div>
          )}
        </Card>

        <Card className="p-6 min-h-[280px]">
          <div className="flex items-center justify-between mb-3">
            <Eyebrow>Outreach Draft</Eyebrow>
            {draft && !streaming && (
              <span className="text-[10px] uppercase tracking-[0.15em] text-forest">
                ✓ generated · review before sending
              </span>
            )}
          </div>
          {draft ? (
            <div
              className={`whitespace-pre-wrap font-display text-[15px] leading-relaxed text-ink ${
                streaming ? "caret" : ""
              }`}
            >
              {draft}
            </div>
          ) : (
            <div className="text-sm text-muted">
              The governed draft — assembled only from Atelier-governed fields, never the raw CRM
              row — will stream here.
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ── Maison Strategy Assistant (RAG) ────────────────────────
const TONES = ["Executive Summary", "Detailed Brief", "Action-Oriented"];
const MARKETS = ["All APAC", "China", "Japan", "South Korea", "Singapore", "Australia"];

function RagAssistant() {
  const [examples, setExamples] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [tone, setTone] = useState(TONES[0]);
  const [market, setMarket] = useState(MARKETS[0]);
  const [k, setK] = useState(2);
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [warn, setWarn] = useState("");

  useEffect(() => {
    api.get("/api/clienteling/rag-examples").then((r) => setExamples(r.examples)).catch(() => {});
  }, []);

  async function submit() {
    if (!query.trim()) return;
    setBusy(true);
    setAnswer("");
    setSources([]);
    setWarn("");
    try {
      const res = await api.post("/api/clienteling/rag-search", { query, k });
      if (!res.ok) {
        setWarn(res.reason || "Query blocked by guardrails.");
        setBusy(false);
        return;
      }
      setSources(res.sources || []);
      await streamReport(
        "/api/clienteling/rag-answer",
        { query, tone, market, k },
        (c) => setAnswer((t) => t + c),
        () => setBusy(false),
      );
    } catch {
      setWarn("The knowledge assistant is unavailable.");
      setBusy(false);
    }
  }

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <Card className="p-6 space-y-4">
        <Eyebrow>Ask the APAC Knowledge Assistant</Eyebrow>
        <select
          value=""
          onChange={(e) => e.target.value && setQuery(e.target.value)}
          className="w-full bg-card border border-line px-3.5 py-2.5 text-sm text-muted focus:border-gold outline-none"
        >
          <option value="">— Example queries —</option>
          {examples.map((q) => <option key={q} value={q}>{q}</option>)}
        </select>
        <textarea
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          rows={3}
          placeholder="e.g. What is our CRM approach for VIP clients in South Korea?"
          className="w-full bg-card border border-line px-3.5 py-2.5 text-sm text-ink focus:border-gold outline-none"
        />
        <div className="grid grid-cols-3 gap-3">
          <div>
            <div className="label mb-1.5">Tone</div>
            <select value={tone} onChange={(e) => setTone(e.target.value)} className="w-full bg-card border border-line px-2.5 py-2 text-[12px] text-ink focus:border-gold outline-none">
              {TONES.map((t) => <option key={t}>{t}</option>)}
            </select>
          </div>
          <div>
            <div className="label mb-1.5">Market</div>
            <select value={market} onChange={(e) => setMarket(e.target.value)} className="w-full bg-card border border-line px-2.5 py-2 text-[12px] text-ink focus:border-gold outline-none">
              {MARKETS.map((m) => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div className="label mb-1.5">Sources · {k}</div>
            <input type="range" min={1} max={4} value={k} onChange={(e) => setK(parseInt(e.target.value))} className="w-full mt-2 accent-[#B8965A]" />
          </div>
        </div>
        <button onClick={submit} disabled={busy} className="w-full bg-sidebar text-cream text-xs font-medium uppercase tracking-[0.2em] py-3.5 hover:bg-[#222] transition disabled:opacity-40">
          {busy ? "Retrieving & generating…" : "◆ Submit query"}
        </button>
        {warn && <div className="text-bordeaux text-xs">{warn}</div>}
      </Card>

      <Card className="p-6 min-h-[280px]">
        <div className="flex items-center justify-between mb-3">
          <Eyebrow>Maison Strategy Response</Eyebrow>
          {answer && !busy && <span className="text-[10px] uppercase tracking-[0.15em] text-forest">✓ source-grounded · sanitised</span>}
        </div>
        {answer || busy ? (
          <div className={`whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink ${busy && !answer ? "caret" : ""}`}>{answer}</div>
        ) : (
          <div className="text-sm text-muted">Grounded answers from the Aurelle APAC knowledge base appear here.</div>
        )}
        {sources.length > 0 && (
          <div className="mt-5 pt-4 border-t border-line">
            <div className="label mb-2">Source documents</div>
            <div className="space-y-2">
              {sources.map((s, i) => (
                <div key={i} className="text-[12px]">
                  <span className="text-ink font-medium">{s.title}</span>
                  <span className="text-muted"> · {s.category} · {(s.relevance * 100).toFixed(0)}% match</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}

// ── page ───────────────────────────────────────────────────
export function Clienteling() {
  const [opts, setOpts] = useState<any>({ markets: [], segments: [], boutiques: [] });
  const [roles, setRoles] = useState<any>(null);
  const [markets, setMarkets] = useState<string[]>([]);
  const [segments, setSegments] = useState<string[]>([]);
  const [boutiques, setBoutiques] = useState<string[]>([]);
  const [data, setData] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.filters().then(setOpts).catch(() => {});
    api.roles().then(setRoles).catch(() => {});
  }, []);

  useEffect(() => {
    api
      .overview({ markets, segments, boutiques })
      .then(setData)
      .catch(() => setErr("Could not load data. Is the API running on :8000?"));
  }, [markets, segments, boutiques]);

  const k = data?.kpis;
  const funnelMax = useMemo(
    () => Math.max(1, ...(data?.charts?.funnel || []).map((f: any) => f.number)),
    [data],
  );

  if (err) return <div className="text-bordeaux">{err}</div>;
  if (!data) return <div className="text-muted">Loading governed data…</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label text-gold">Clienteling &amp; CRM</div>
          <h1 className="font-display text-4xl font-light text-ink mt-1">Client-360</h1>
          <p className="text-sm text-muted mt-2 max-w-xl">
            Identify high-value cohorts, mobilise VIP outreach, and draft governed communications —
            every record access governed end to end.
          </p>
        </div>
        <span className="label text-muted border border-line px-3 py-1.5">
          Demonstration · synthetic data
        </span>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-5 mt-8">
        <MultiSelect label="Markets" options={opts.markets} value={markets} onChange={setMarkets} />
        <MultiSelect label="Segments" options={opts.segments} value={segments} onChange={setSegments} />
        <MultiSelect label="Home boutique" options={opts.boutiques} value={boutiques} onChange={setBoutiques} />
      </div>

      {/* KPIs */}
      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-6">
        <Kpi label="Selected Clients" amount={k.total} format={fmtNum} />
        <Kpi label="Maison VIPs" amount={k.vips} format={fmtNum} sub={`${k.vip_pct.toFixed(1)}% of cohort`} />
        <Kpi label="Avg Lifetime Value" amount={k.avg_ltv} format={fmtUsd} />
        <Kpi
          label="CLV at Risk"
          amount={k.churn_book}
          format={fmtUsd}
          sub={`${fmtNum(k.high_churn)} clients — mobilise outreach`}
          tone="risk"
        />
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-5 mt-5">
        <Card className="p-6">
          <Eyebrow>Clienteling Funnel</Eyebrow>
          <div className="space-y-3">
            {data.charts.funnel.map((f: any) => (
              <div key={f.stage}>
                <div className="flex justify-between text-[12px] mb-1">
                  <span className="text-ink">{f.stage}</span>
                  <span className="text-muted">{fmtNum(f.number)}</span>
                </div>
                <div className="h-2 bg-cream">
                  <div
                    className="h-2 bg-bordeaux"
                    style={{ width: `${(f.number / funnelMax) * 100}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <Eyebrow>CLV by Preferred Category</Eyebrow>
          <ResponsiveContainer width="100%" height={210}>
            <BarChart data={data.charts.category} margin={{ left: -18, top: 4 }}>
              <XAxis dataKey="category" tick={{ fontSize: 9, fill: C.muted }} interval={0} angle={-18} textAnchor="end" height={50} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} tickFormatter={fmtUsd} />
              <Tooltip formatter={(v: any) => fmtUsd(v)} cursor={{ fill: "#00000008" }} />
              <Bar dataKey="clv" radius={[2, 2, 0, 0]}>
                {data.charts.category.map((_: any, i: number) => (
                  <Cell key={i} fill={[C.bordeaux, C.gold, C.forest, "#6B4E2D", "#4A4A6A", C.ink][i % 6]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Churn Risk · total base</Eyebrow>
          <ResponsiveContainer width="100%" height={210}>
            <PieChart>
              <Pie data={data.charts.churn} dataKey="value" nameKey="name" innerRadius={48} outerRadius={78} paddingAngle={2}>
                {data.charts.churn.map((e: any, i: number) => (
                  <Cell key={i} fill={CHURN_COLOR[e.name] || C.muted} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => fmtNum(v)} />
            </PieChart>
          </ResponsiveContainer>
          <div className="flex justify-center gap-4 mt-1">
            {data.charts.churn.map((e: any) => (
              <div key={e.name} className="flex items-center gap-1.5 text-[11px] text-muted">
                <span className="w-2 h-2 rounded-full" style={{ background: CHURN_COLOR[e.name] }} />
                {e.name}
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Watchlist */}
      <div className="mt-8">
        <Eyebrow>VIP Churn Watchlist · dormant &gt; 180 days</Eyebrow>
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left label border-b border-line">
                {["Client", "Boutique", "Lifetime value", "Days dormant", "Risk", "Stylist"].map((h) => (
                  <th key={h} className="font-medium py-3 px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.watchlist.slice(0, 8).map((r: any, i: number) => (
                <tr key={i} className="border-b border-line/70 hover:bg-cream">
                  <td className="py-3 px-5 text-ink">{r.name}</td>
                  <td className="py-3 px-5 text-muted">{r.boutique}</td>
                  <td className="py-3 px-5 text-ink">{fmtUsd(r.ltv)}</td>
                  <td className="py-3 px-5">
                    <span className={r.days >= 270 ? "text-bordeaux font-medium" : "text-ink"}>{r.days}</span>
                  </td>
                  <td className="py-3 px-5">
                    <span className="text-[10px] uppercase tracking-wide px-2 py-0.5 border border-bordeaux/40 text-bordeaux">
                      {r.churn}
                    </span>
                  </td>
                  <td className="py-3 px-5 text-muted">{r.stylist}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {data.watchlist.length === 0 && (
            <div className="p-5 text-sm text-forest">No at-risk VIP profiles in this selection.</div>
          )}
        </Card>
      </div>

      {/* Co-pilot */}
      <div className="mt-12">
        <div className="label text-gold">AI Clienteling Co-Pilot</div>
        <h2 className="font-display text-3xl font-light text-ink mt-1 mb-6">
          Governed lookup → outreach, in one motion.
        </h2>
        <CoPilot roles={roles} pool={data.pool} />
      </div>

      {/* Maison Strategy Assistant (RAG) */}
      <div className="mt-12">
        <div className="label text-gold">Maison Strategy Assistant</div>
        <h2 className="font-display text-3xl font-light text-ink mt-1 mb-6">
          Query the Maison knowledge base.
        </h2>
        <RagAssistant />
      </div>

      <div className="h-16" />
    </motion.div>
  );
}
