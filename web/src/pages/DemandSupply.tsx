import { useEffect, useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ComposedChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, streamReport } from "../lib/api";
import {
  AiReport,
  C,
  CHART_COLORS,
  Card,
  Eyebrow,
  Kpi,
  MultiSelect,
  fmtNum,
  fmtWks,
  fmtDays,
  fmtUsd,
  fmtPct0,
} from "../components/ui";

const RISK_COLOR: Record<string, string> = { High: C.bordeaux, Medium: C.gold, Low: C.forest };

function Slider({ label, value, onChange, min, max, step }: any) {
  return (
    <div>
      <div className="flex justify-between text-[11px] mb-1">
        <span className="text-muted">{label}</span>
        <span className="text-ink font-medium">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full accent-[#8B1A2B]"
      />
    </div>
  );
}

// Simple client-side CSV downloader helper
function exportToCSV(data: any[], filename: string) {
  if (data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((row) =>
    headers
      .map((header) => {
        const val = row[header];
        const stringVal = val === null || val === undefined ? "" : String(val);
        return `"${stringVal.replace(/"/g, '""')}"`;
      })
      .join(",")
  );
  const csvContent = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export function DemandSupply() {
  const [activeTab, setActiveTab] = useState("overview");

  // ────────────────────────────────────────────────────────
  // TABS 1 & 2: GLOBAL DEMAND/SUPPLY STATES
  // ────────────────────────────────────────────────────────
  const [opts, setOpts] = useState<any>({ categories: [], markets: [], risks: [], products: [] });
  const [category, setCategory] = useState("All");
  const [market, setMarket] = useState("All");
  const [risks, setRisks] = useState<string[]>(["High", "Medium", "Low"]);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  // Allocation Optimizer (Tab 2)
  const [product, setProduct] = useState("");
  const [units, setUnits] = useState(120);
  const [w, setW] = useState({ w_wait: 0.45, w_vel: 0.3, w_tier: 0.15, w_cover: 0.1 });
  const [alloc, setAlloc] = useState<any>(null);

  // Load Tab 1 & 2 filters & initial data
  useEffect(() => {
    api.get("/api/supply/filters").then((o) => {
      setOpts(o);
      const def = o.products.includes("Santos de Aurelle") ? "Santos de Aurelle" : o.products[0];
      setProduct(def);
    });
  }, []);

  useEffect(() => {
    api
      .post("/api/supply/overview", { category, market, risks })
      .then(setD)
      .catch(() => setErr("Could not load data. Is the API running on :8000?"));
  }, [category, market, risks]);

  function runAlloc() {
    if (!product) return;
    api.post("/api/supply/allocate", { product, total_units: units, ...w }).then(setAlloc);
  }

  useEffect(() => {
    if (product) runAlloc();
  }, [product]);

  // ────────────────────────────────────────────────────────
  // TAB 3: MODEL STOCK STATES
  // ────────────────────────────────────────────────────────
  const [msFilters, setMsFilters] = useState<any>(null);
  const [msData, setMsData] = useState<any>(null);
  const [msLoading, setMsLoading] = useState(false);

  // Active Model Stock filter states
  const [msAsOfDate, setMsAsOfDate] = useState("");
  const [msSelectedMarkets, setMsSelectedMarkets] = useState<string[]>([]);
  const [msSelectedBoutiques, setMsSelectedBoutiques] = useState<string[]>([]);
  const [msSelectedCategory, setMsSelectedCategory] = useState("All");
  const [msSelectedCollections, setMsSelectedCollections] = useState<string[]>([]);
  const [msSelectedTier, setMsSelectedTier] = useState("All");
  const [msShowOnly, setMsShowOnly] = useState("All");

  const [expandedCat, setExpandedCat] = useState<string | null>("Watches");
  const [expandedCol, setExpandedCol] = useState<string | null>(null);
  const [msSearchQuery, setMsSearchQuery] = useState("");
  const [msVisibleCount, setMsVisibleCount] = useState(25);

  // Load Model Stock Filters on first access of Tab 3
  useEffect(() => {
    if (activeTab === "model_stock" && !msFilters) {
      api.get("/api/supply/model-stock/filters").then((res) => {
        setMsFilters(res);
        if (res.dates && res.dates.length > 0) {
          setMsAsOfDate(res.dates[res.dates.length - 1]); // default to latest date
        }
      });
    }
  }, [activeTab, msFilters]);

  // Fetch Model Stock Overview whenever filters change
  useEffect(() => {
    if (activeTab === "model_stock" && msAsOfDate) {
      setMsLoading(true);
      api
        .post("/api/supply/model-stock/overview", {
          as_of_date: msAsOfDate,
          markets: msSelectedMarkets,
          boutiques: msSelectedBoutiques,
          category: msSelectedCategory,
          collections: msSelectedCollections,
          tier: msSelectedTier,
          show_only: msShowOnly,
        })
        .then((res) => {
          setMsData(res);
          setMsLoading(false);
        })
        .catch(() => {
          setMsLoading(false);
        });
    }
  }, [
    activeTab,
    msAsOfDate,
    msSelectedMarkets,
    msSelectedBoutiques,
    msSelectedCategory,
    msSelectedCollections,
    msSelectedTier,
    msShowOnly,
  ]);

  // Client-side search filter for SKU Gaps Registry
  const filteredGaps = useMemo(() => {
    if (!msData?.gaps_registry) return [];
    if (!msSearchQuery) return msData.gaps_registry;
    const q = msSearchQuery.toLowerCase();
    return msData.gaps_registry.filter(
      (r: any) =>
        r.reference_sku?.toLowerCase().includes(q) ||
        r.reference_name?.toLowerCase().includes(q) ||
        r.boutique_name?.toLowerCase().includes(q) ||
        r.collection?.toLowerCase().includes(q) ||
        r.market?.toLowerCase().includes(q)
    );
  }, [msData?.gaps_registry, msSearchQuery]);

  // ────────────────────────────────────────────────────────
  // TAB 4: PLANNING & FORECAST STATES
  // ────────────────────────────────────────────────────────
  const [fcFilters, setFcFilters] = useState<any>(null);
  const [fcData, setFcData] = useState<any>(null);
  const [fcLoading, setFcLoading] = useState(false);

  // Active Planning & Forecast filter states
  const [fcMarket, setFcMarket] = useState("All APAC");
  const [fcCategory, setFcCategory] = useState("Watches");
  const [fcCollections, setFcCollections] = useState<string[]>([]);
  const [fcSkus, setFcSkus] = useState<string[]>([]);
  const [fcHorizon, setFcHorizon] = useState(90);
  const [fcSeasonality, setFcSeasonality] = useState(true);
  const [fcIncludeInbound, setFcIncludeInbound] = useState(true);

  // Scenario Simulator States
  const [simFromMarket, setSimFromMarket] = useState("Singapore");
  const [simToMarket, setSimToMarket] = useState("Australia");
  const [simUnits, setSimUnits] = useState(50);
  const [simLeadDays, setSimLeadDays] = useState(5);
  const [simResult, setSimResult] = useState<any>(null);
  const [simLoading, setSimLoading] = useState(false);
  const [simError, setSimError] = useState("");

  // Load Planning & Forecast Filters on first access of Tab 4
  useEffect(() => {
    if (activeTab === "forecast" && !fcFilters) {
      api.get("/api/supply/forecast/filters").then((res) => {
        setFcFilters(res);
        if (res.skus && res.skus.length > 0) {
          setFcSkus([res.skus[0]]); // default to first SKU
        }
      });
    }
  }, [activeTab, fcFilters]);

  // Fetch Forecast Overview
  useEffect(() => {
    if (activeTab === "forecast" && fcFilters) {
      setFcLoading(true);
      api
        .post("/api/supply/forecast/overview", {
          market: fcMarket,
          category: fcCategory,
          collections: fcCollections,
          skus: fcSkus,
          horizon: fcHorizon,
          seasonality: fcSeasonality,
          include_inbound: fcIncludeInbound,
        })
        .then((res) => {
          setFcData(res);
          setFcLoading(false);
        })
        .catch(() => {
          setFcLoading(false);
        });
    }
  }, [
    activeTab,
    fcFilters,
    fcMarket,
    fcCategory,
    fcCollections,
    fcSkus,
    fcHorizon,
    fcSeasonality,
    fcIncludeInbound,
  ]);

  // Run Scenario Reallocation Simulation
  function handleSimulate() {
    if (fcSkus.length === 0) {
      setSimError("Please select at least one reference SKU in filters to simulate.");
      return;
    }
    setSimError("");
    setSimLoading(true);
    api
      .post("/api/supply/forecast/scenario", {
        from_market: simFromMarket,
        to_market: simToMarket,
        units: simUnits,
        lead_days: simLeadDays,
        skus: fcSkus,
        horizon: fcHorizon,
        seasonality: fcSeasonality,
      })
      .then((res) => {
        setSimResult(res);
        setSimLoading(false);
      })
      .catch((err) => {
        setSimError("Simulation request failed.");
        setSimLoading(false);
      });
  }

  // Combined Chart Data Parser
  const combinedChartData = useMemo(() => {
    if (!fcData?.chart?.dates) return [];
    return fcData.chart.dates.map((date: string, i: number) => ({
      date,
      forecast: fcData.chart.forecast[i],
      stock: fcData.chart.stock[i] !== undefined ? fcData.chart.stock[i] : 0,
      inbound: fcData.chart.inbound[i] !== undefined ? fcData.chart.inbound[i] : 0,
    }));
  }, [fcData]);

  if (err) return <div className="text-bordeaux p-6 font-display text-lg">{err}</div>;
  if (!d) return <div className="text-muted p-8 text-center font-display">Loading supply intelligence…</div>;

  const k = d.kpis;
  const fc = d.charts.forecast;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }} className="px-1 py-3">
      {/* Top Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label text-gold">Demand &amp; Supply Planning</div>
          <h1 className="font-display text-4xl font-light text-ink mt-1">Inventory Intelligence</h1>
          <p className="text-sm text-muted mt-2 max-w-xl">
            Forecast regional demand, flag stockout risk, and optimise allocation across the boutique network.
          </p>
        </div>
        <span className="label text-muted border border-line px-3 py-1.5 bg-card">Demonstration · synthetic data</span>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-line mt-8 mb-6 overflow-x-auto scroll-thin">
        {[
          { id: "overview", label: "Allocation Overview" },
          { id: "cover", label: "Stock Cover Analysis" },
          { id: "model_stock", label: "Model Stock" },
          { id: "forecast", label: "Planning & Forecast" },
        ].map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`py-3.5 px-6 text-xs font-semibold tracking-[0.12em] uppercase transition-all border-b-2 outline-none whitespace-nowrap ${
              activeTab === t.id
                ? "border-gold text-gold font-bold"
                : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ────────────────────────────────────────────────────────
          TAB 1: ALLOCATION OVERVIEW
          ──────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div>
          {/* Filters */}
          <div className="flex flex-wrap gap-5 mt-4 items-end bg-cream/10 p-5 border border-line/60 rounded">
            <div>
              <div className="label mb-2">Category</div>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="bg-card border border-line px-3.5 py-2.5 text-sm text-ink focus:border-gold outline-none min-w-[150px]"
              >
                {["All", ...opts.categories].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <div className="label mb-2">Market</div>
              <select
                value={market}
                onChange={(e) => setMarket(e.target.value)}
                className="bg-card border border-line px-3.5 py-2.5 text-sm text-ink focus:border-gold outline-none min-w-[150px]"
              >
                {["All", ...opts.markets].map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <MultiSelect label="Stockout risk" options={["High", "Medium", "Low"]} value={risks} onChange={setRisks} />
          </div>

          {/* KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
            <Kpi label="High Stockout SKUs" amount={k.high_stockout} format={fmtNum} sub="Needs replenishment" tone="risk" />
            <Kpi label="High Overstock SKUs" amount={k.high_overstock} format={fmtNum} sub="Capital tied up" />
            <Kpi label="Avg Stock Cover" amount={k.avg_cover} format={fmtWks} />
            <Kpi label="Avg Lead Time" amount={k.avg_lead} format={fmtDays} />
          </div>

          {/* AI Report */}
          <div className="mt-6">
            <AiReport
              title="Supply Chain Intelligence Report"
              buttonLabel="◆ Generate Supply Chain Intelligence"
              action={`Prioritise replenishment for ${k.high_stockout} high-risk SKUs while unwinding ${k.high_overstock} overstocked lines.`}
              stream={(onT, onD) => streamReport("/api/supply/report", { category, market, risks }, onT, onD)}
            />
          </div>

          {/* Charts */}
          <div className="grid lg:grid-cols-2 gap-5 mt-8">
            <Card className="p-6">
              <Eyebrow>Forecast vs Actual Demand by Category</Eyebrow>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={d.charts.forecast_actual} margin={{ left: -8, top: 4 }}>
                  <XAxis dataKey="category" tick={{ fontSize: 9, fill: C.muted }} interval={0} angle={-15} textAnchor="end" height={48} />
                  <YAxis tick={{ fontSize: 9, fill: C.muted }} />
                  <Tooltip cursor={{ fill: "#00000008" }} formatter={(v: any) => fmtNum(v)} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  <Bar dataKey="forecast" name="Forecast" fill="#2C2C2C" radius={[2, 2, 0, 0]} />
                  <Bar dataKey="actual" name="Actual" fill={C.bordeaux} radius={[2, 2, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-6">
              <Eyebrow>Stockout Risk Distribution by Market</Eyebrow>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={d.charts.risk_by_market} margin={{ left: -8, top: 4 }}>
                  <XAxis dataKey="market" tick={{ fontSize: 8, fill: C.muted }} interval={0} angle={-30} textAnchor="end" height={54} />
                  <YAxis tick={{ fontSize: 9, fill: C.muted }} />
                  <Tooltip cursor={{ fill: "#00000008" }} />
                  <Legend wrapperStyle={{ fontSize: 10 }} />
                  {["High", "Medium", "Low"].map((r) => (
                    <Bar key={r} dataKey={r} stackId="s" fill={RISK_COLOR[r]} />
                  ))}
                </BarChart>
              </ResponsiveContainer>
            </Card>
          </div>

          <Card className="p-6 mt-5">
            <Eyebrow>Demand Forecast · 6-month category projection</Eyebrow>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={fc.data} margin={{ left: -8, top: 8 }}>
                <CartesianGrid stroke="#F0EBE1" vertical={false} />
                <XAxis dataKey="period" tick={{ fontSize: 10, fill: C.muted }} />
                <YAxis tick={{ fontSize: 9, fill: C.muted }} />
                <Tooltip formatter={(v: any) => fmtNum(v)} />
                <Legend wrapperStyle={{ fontSize: 10 }} />
                {fc.categories.map((cat: string, i: number) => (
                  <Line key={cat} type="monotone" dataKey={cat} stroke={CHART_COLORS[i % CHART_COLORS.length]} strokeWidth={2} dot={{ r: 2 }} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </Card>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────
          TAB 2: STOCK COVER ANALYSIS
          ──────────────────────────────────────────────────────── */}
      {activeTab === "cover" && (
        <div>
          <div className="label text-gold">AI-Powered Allocation</div>
          <h2 className="font-display text-2xl font-light text-ink mt-1 mb-6">Boutique Stock Allocation Optimizer</h2>
          
          <div className="grid lg:grid-cols-2 gap-6">
            <Card className="p-6 space-y-4">
              <div>
                <div className="label mb-2">Constrained collection item</div>
                <select
                  value={product}
                  onChange={(e) => setProduct(e.target.value)}
                  className="w-full bg-card border border-line px-3.5 py-2.5 text-sm text-ink focus:border-gold outline-none"
                >
                  {opts.products.map((p: string) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
              <Slider label="Total stock available (units)" value={units} onChange={setUnits} min={10} max={500} step={10} />
              <div className="label pt-2">Optimization weights</div>
              <Slider label="Waitlist backlog (VIC priority)" value={w.w_wait} onChange={(v: number) => setW({ ...w, w_wait: v })} min={0} max={1} step={0.05} />
              <Slider label="Sales velocity (sell-through)" value={w.w_vel} onChange={(v: number) => setW({ ...w, w_vel: v })} min={0} max={1} step={0.05} />
              <Slider label="Boutique tier (flagship vs standard)" value={w.w_tier} onChange={(v: number) => setW({ ...w, w_tier: v })} min={0} max={1} step={0.05} />
              <Slider label="Stock cover balance" value={w.w_cover} onChange={(v: number) => setW({ ...w, w_cover: v })} min={0} max={1} step={0.05} />
              <button onClick={runAlloc} className="w-full bg-sidebar text-cream text-xs font-medium uppercase tracking-[0.2em] py-3 hover:bg-[#222] transition">
                Run allocation optimization
              </button>
            </Card>

            <Card className="p-6">
              <Eyebrow>Proposed allocation vs waitlist · {alloc?.product || product}</Eyebrow>
              {alloc ? (
                <ResponsiveContainer width="100%" height={320}>
                  <BarChart data={alloc.records.slice(0, 12)} margin={{ left: -8, top: 4 }}>
                    <XAxis dataKey="boutique" tick={{ fontSize: 8, fill: C.muted }} interval={0} angle={-40} textAnchor="end" height={70} />
                    <YAxis tick={{ fontSize: 9, fill: C.muted }} />
                    <Tooltip cursor={{ fill: "#00000008" }} />
                    <Legend wrapperStyle={{ fontSize: 10 }} />
                    <Bar dataKey="allocated" name="Proposed allocation" fill={C.bordeaux} radius={[2, 2, 0, 0]} />
                    <Bar dataKey="waitlist" name="Waitlist backlog" fill="#2C2C2C" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="text-sm text-muted py-10 text-center">Run the optimizer to see allocations.</div>
              )}
            </Card>
          </div>

          {alloc && (
            <Card className="overflow-hidden mt-5">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left label border-b border-line bg-cream/10">
                    {["Boutique", "Tier", "Stock", "Waitlist", "Velocity", "Allocated", "Post cover"].map((h) => (
                      <th key={h} className="font-medium py-3 px-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {alloc.records.slice(0, 10).map((r: any, i: number) => (
                    <tr key={i} className="border-b border-line/70 hover:bg-cream">
                      <td className="py-2.5 px-5 text-ink">{r.boutique}</td>
                      <td className="py-2.5 px-5 text-muted">{r.tier}</td>
                      <td className="py-2.5 px-5 text-ink">{r.stock}</td>
                      <td className="py-2.5 px-5 text-ink">{r.waitlist}</td>
                      <td className="py-2.5 px-5 text-muted">{r.velocity}</td>
                      <td className="py-2.5 px-5"><span className="text-bordeaux font-medium">{r.allocated}</span></td>
                      <td className="py-2.5 px-5 text-ink">{r.post_cover} wks</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}

          <div className="mt-5">
            <AiReport
              title="AI Allocation Advisor"
              buttonLabel="◆ Consult AI Allocation Advisor"
              action="Apply the suggested transfers before committing to protect flagship VIP waitlists."
              disabled={!alloc}
              stream={(onT, onD) => streamReport("/api/supply/allocation-report", { product, total_units: units, ...w }, onT, onD)}
            />
          </div>

          {/* Critical alerts */}
          <div className="mt-10">
            <Eyebrow>Critical Stockout Alerts</Eyebrow>
            <Card className="overflow-hidden">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left label border-b border-line bg-cream/10">
                    {["Product", "Market", "Category", "Stock", "Forecast", "Cover", "Lead"].map((h) => (
                      <th key={h} className="font-medium py-3 px-5">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {d.critical.slice(0, 10).map((r: any, i: number) => (
                    <tr key={i} className="border-b border-line/70 hover:bg-cream">
                      <td className="py-2.5 px-5 text-ink">{r.product}</td>
                      <td className="py-2.5 px-5 text-muted">{r.market}</td>
                      <td className="py-2.5 px-5 text-muted">{r.category}</td>
                      <td className="py-2.5 px-5 text-ink">{r.stock}</td>
                      <td className="py-2.5 px-5 text-ink">{fmtNum(r.forecast)}</td>
                      <td className="py-2.5 px-5"><span className={r.cover <= 4 ? "text-bordeaux font-medium" : "text-ink"}>{r.cover} wks</span></td>
                      <td className="py-2.5 px-5 text-muted">{r.lead}d</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          </div>
        </div>
      )}

      {/* ────────────────────────────────────────────────────────
          TAB 3: MODEL STOCK BOUTIQUE
          ──────────────────────────────────────────────────────── */}
      {activeTab === "model_stock" && (
        <div>
          {/* Filters Bar */}
          {msFilters ? (
            <div className="flex flex-wrap gap-5 items-end bg-cream/10 p-5 border border-line/60 rounded">
              <div>
                <div className="label mb-2">As of Date</div>
                <select
                  value={msAsOfDate}
                  onChange={(e) => setMsAsOfDate(e.target.value)}
                  className="bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none min-w-[140px]"
                >
                  {msFilters.dates.map((d: string) => (
                    <option key={d}>{d}</option>
                  ))}
                </select>
              </div>

              <MultiSelect label="Markets" options={msFilters.markets} value={msSelectedMarkets} onChange={setMsSelectedMarkets} />

              <MultiSelect label="Boutiques" options={msFilters.boutiques} value={msSelectedBoutiques} onChange={setMsSelectedBoutiques} />

              <div>
                <div className="label mb-2">Category</div>
                <select
                  value={msSelectedCategory}
                  onChange={(e) => setMsSelectedCategory(e.target.value)}
                  className="bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none min-w-[130px]"
                >
                  {msFilters.categories.map((c: string) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              <MultiSelect label="Collections" options={msFilters.collections} value={msSelectedCollections} onChange={setMsSelectedCollections} />

              <div>
                <div className="label mb-2">Boutique Tier</div>
                <select
                  value={msSelectedTier}
                  onChange={(e) => setMsSelectedTier(e.target.value)}
                  className="bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none min-w-[130px]"
                >
                  <option value="All">All Tiers</option>
                  {msFilters.tiers.map((t: string) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <div className="label mb-2">Show Filters</div>
                <select
                  value={msShowOnly}
                  onChange={(e) => setMsShowOnly(e.target.value)}
                  className="bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none min-w-[180px]"
                >
                  <option value="All">Show All SKU status</option>
                  <option value="Under-stocked boutiques only">Under-stocked boutiques only</option>
                  <option value="Missing references only">Missing references only (stock = 0)</option>
                  <option value="Over-stocked only">Over-stocked only (&gt; 140% target)</option>
                </select>
              </div>
            </div>
          ) : (
            <div className="text-muted text-xs">Loading Model Stock Filters…</div>
          )}

          {msLoading ? (
            <div className="text-muted py-20 text-center font-display">Recalculating boutique stock achievements…</div>
          ) : msData ? (
            <div className="space-y-8 mt-6">
              {/* Section A: KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi
                  label="Boutique Network On-Target"
                  value={`${msData.kpis.on_target}/${msData.kpis.total_boutiques}`}
                  sub={`${msData.kpis.pct_on_target}% of targets satisfied`}
                  tone={msData.kpis.pct_on_target >= 85 ? "good" : "risk"}
                />
                <Kpi label="Critical Gaps" amount={msData.kpis.critical_gaps} format={fmtNum} sub="Urgent replenishment needed" tone="risk" />
                <Kpi label="Overstock Positions" amount={msData.kpis.overstock_positions} format={fmtNum} sub="Capital tied up" />
                <Kpi label="Capital at Risk" amount={msData.kpis.capital_at_risk} format={fmtUsd} sub="Deficit vs Model Stock target value" />
              </div>

              {/* Section B: Boutique Stock Achievement Heatmap */}
              <Card className="p-6">
                <div className="flex justify-between items-center mb-4 flex-wrap gap-2">
                  <Eyebrow>Boutique vs Collection Stock Achievement Heatmap (%)</Eyebrow>
                  <span className="text-[10px] text-muted tracking-wider uppercase bg-cream px-2 py-1 rounded">
                    Hover for target gap and stock cover
                  </span>
                </div>
                
                {msData.heatmap && msData.heatmap.boutiques.length > 0 ? (
                  <div>
                    <div className="overflow-x-auto shadow-inner bg-[#FAF7F0]/40 border border-line/60 p-4 rounded max-h-[500px] scroll-thin">
                      <table className="min-w-full text-center border-collapse">
                        <thead>
                          <tr>
                            <th className="sticky top-0 left-0 z-10 bg-[#FAF7F0] border border-line/60 p-2 text-left label text-xs min-w-[130px]">
                              Collection
                            </th>
                            {msData.heatmap.boutiques.map((bt: string, btIdx: number) => (
                              <th key={btIdx} className="sticky top-0 bg-[#FAF7F0] border border-line/60 p-2 text-[10px] uppercase font-semibold text-ink whitespace-nowrap min-w-[80px]">
                                {bt}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {msData.heatmap.collections.map((col: string, colIdx: number) => (
                            <tr key={colIdx} className="hover:bg-cream/40">
                              <td className="sticky left-0 z-10 bg-[#FAF7F0] border border-line/60 p-2 text-left text-xs font-semibold text-ink whitespace-nowrap">
                                {col}
                              </td>
                              {msData.heatmap.boutiques.map((bt: string, btIdx: number) => {
                                const val = msData.heatmap.achievement[colIdx]?.[btIdx];
                                const txt = msData.heatmap.text[colIdx]?.[btIdx];
                                const hvr = msData.heatmap.hover[colIdx]?.[btIdx];
                                
                                let bgClass = "bg-cream/20 text-muted/30";
                                let textClass = "text-muted/50";
                                if (val !== null && val !== undefined) {
                                  if (val < 50) {
                                    bgClass = "bg-[#8B1A2B]/10 hover:bg-[#8B1A2B]/20";
                                    textClass = "text-[#8B1A2B] font-bold";
                                  } else if (val < 90) {
                                    bgClass = "bg-[#B8965A]/15 hover:bg-[#B8965A]/25";
                                    textClass = "text-[#8B1A2B] font-medium";
                                  } else if (val <= 110) {
                                    bgClass = "bg-[#2D5A3D]/15 hover:bg-[#2D5A3D]/25";
                                    textClass = "text-[#2D5A3D] font-semibold";
                                  } else {
                                    bgClass = "bg-[#6c8ead]/15 hover:bg-[#6c8ead]/25";
                                    textClass = "text-slate-700 font-medium";
                                  }
                                }

                                return (
                                  <td
                                    key={btIdx}
                                    title={hvr?.replace(/<br>/g, "\n")}
                                    className={`border border-line/60 p-2 text-[11px] cursor-help transition-all ${bgClass}`}
                                  >
                                    <div className={textClass}>
                                      {val !== null && val !== undefined ? `${val}%` : "—"}
                                    </div>
                                    {txt && (
                                      <div className="text-[9px] opacity-75 mt-0.5 whitespace-nowrap">
                                        {txt}
                                      </div>
                                    )}
                                  </td>
                                );
                              })}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Heatmap Legend */}
                    <div className="flex flex-wrap gap-5 mt-4 justify-center text-[11px]">
                      <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 bg-[#8B1A2B]/10 border border-[#8B1A2B]/30 rounded-sm" />
                        <span className="text-muted">&lt; 50% (Critical Target Gap)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 bg-[#B8965A]/15 border border-[#B8965A]/30 rounded-sm" />
                        <span className="text-muted">50% - 90% (Under-stocked)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 bg-[#2D5A3D]/15 border border-[#2D5A3D]/30 rounded-sm" />
                        <span className="text-muted">90% - 110% (On Target)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 bg-[#6c8ead]/15 border border-[#6c8ead]/30 rounded-sm" />
                        <span className="text-muted">&gt; 110% (Overstocked)</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="w-3.5 h-3.5 bg-cream/20 border border-line/60 rounded-sm" />
                        <span className="text-muted">No Stock Target Defined</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="text-muted text-center py-6 text-sm">No heatmap records found for current filters.</div>
                )}
              </Card>

              {/* Section C: Category Deep Dive */}
              <div className="space-y-4">
                <div className="label text-gold uppercase tracking-[0.1em]">Section C · Category Target Achievement Deep Dives</div>
                {Object.entries(msData.category_deep_dive || {}).map(([catName, catData]: [string, any]) => {
                  const isExpanded = expandedCat === catName;
                  return (
                    <Card key={catName} className="overflow-hidden">
                      <div
                        onClick={() => setExpandedCat(isExpanded ? null : catName)}
                        className="flex items-center justify-between p-5 cursor-pointer bg-cream/10 hover:bg-cream/35 transition"
                      >
                        <div className="flex-1">
                          <div className="flex items-center gap-3">
                            <span className="font-display text-lg font-light text-ink">{catName}</span>
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-line font-medium text-muted">
                              {catData.total_actual} / {catData.total_target} units
                            </span>
                          </div>
                          {/* Horizontal progress bar */}
                          <div className="w-full bg-line h-1.5 rounded-full mt-3 overflow-hidden max-w-md">
                            <div
                              className={`h-full rounded-full transition-all duration-500 ${
                                catData.achievement >= 90
                                  ? "bg-[#2D5A3D]"
                                  : catData.achievement >= 70
                                  ? "bg-[#B8965A]"
                                  : "bg-[#8B1A2B]"
                              }`}
                              style={{ width: `${Math.min(catData.achievement, 100)}%` }}
                            />
                          </div>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className={`text-lg font-display ${
                            catData.achievement >= 90
                              ? "text-[#2D5A3D]"
                              : catData.achievement >= 70
                              ? "text-[#B8965A]"
                              : "text-[#8B1A2B]"
                          }`}>
                            {catData.achievement}%
                          </span>
                          <span className="text-muted text-sm">{isExpanded ? "▲" : "▼"}</span>
                        </div>
                      </div>

                      {/* Collapsed area */}
                      {isExpanded && (
                        <div className="p-5 border-t border-line/40 space-y-4">
                          {catData.breakdowns.map((col: any, idx: number) => {
                            const isColExpanded = expandedCol === `${catName}-${col.collection}`;
                            return (
                              <div key={idx} className="border border-line/60 rounded p-4 bg-cream/5">
                                <div
                                  onClick={() => setExpandedCol(isColExpanded ? null : `${catName}-${col.collection}`)}
                                  className="flex flex-wrap items-center justify-between gap-4 cursor-pointer"
                                >
                                  <div>
                                    <div className="font-medium text-ink text-sm">{col.collection} Collection</div>
                                    <div className="text-[11px] text-muted mt-0.5">
                                      Stock: {col.actual} | Target: {col.target} | Gap: {col.gap} units ({fmtUsd(col.gap_value)})
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-3">
                                    {col.zeros > 0 && (
                                      <span className="bg-[#8B1A2B]/10 text-[#8B1A2B] text-[10px] font-semibold px-2 py-0.5 uppercase tracking-wider rounded">
                                        {col.zeros} boutiques at zero stock
                                      </span>
                                    )}
                                    <span className="text-muted text-xs">{isColExpanded ? "▲" : "▼"}</span>
                                  </div>
                                </div>

                                {isColExpanded && (
                                  <div className="mt-4 border-t border-line/50 pt-3">
                                    <table className="w-full text-xs text-left">
                                      <thead>
                                        <tr className="border-b border-line text-muted font-medium">
                                          <th className="py-2">SKU</th>
                                          <th className="py-2">Name</th>
                                          <th className="py-2 text-right">Target</th>
                                          <th className="py-2 text-right">Actual</th>
                                          <th className="py-2 text-right">Gap</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {col.skus.map((sku: any, skuIdx: number) => (
                                          <tr key={skuIdx} className="border-b border-line/30 hover:bg-cream/20">
                                            <td className="py-2 font-mono text-[11px] text-ink">{sku.reference_sku}</td>
                                            <td className="py-2 text-muted">{sku.reference_name}</td>
                                            <td className="py-2 text-right text-ink font-medium">{sku.Target}</td>
                                            <td className="py-2 text-right text-ink">{sku.Actual}</td>
                                            <td className={`py-2 text-right font-medium ${sku.Gap > 0 ? "text-[#8B1A2B]" : "text-muted"}`}>
                                              {sku.Gap}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </Card>
                  );
                })}
              </div>

              {/* Section D: Detailed SKU Gaps Registry Table */}
              <div className="space-y-3">
                <div className="flex justify-between items-center flex-wrap gap-4">
                  <Eyebrow>Section D · Detailed SKU Gaps Registry</Eyebrow>
                  
                  {/* Registry search and export */}
                  <div className="flex items-center gap-3">
                    <input
                      type="text"
                      placeholder="Search Registry..."
                      value={msSearchQuery}
                      onChange={(e) => setMsSearchQuery(e.target.value)}
                      className="bg-card border border-line px-3 py-1.5 text-xs text-ink focus:border-gold outline-none min-w-[200px]"
                    />
                    <button
                      onClick={() => exportToCSV(filteredGaps, "model_stock_gaps_registry.csv")}
                      disabled={filteredGaps.length === 0}
                      className="bg-[#B8965A] text-cream text-[10px] font-semibold uppercase tracking-wider px-3.5 py-2 hover:bg-[#8B1A2B] transition disabled:opacity-40"
                    >
                      Export CSV
                    </button>
                  </div>
                </div>

                <Card className="overflow-hidden">
                  <div className="overflow-x-auto scroll-thin">
                    <table className="w-full text-[12px] text-left border-collapse min-w-[1200px]">
                      <thead>
                        <tr className="label border-b border-line bg-cream/10 text-ink">
                          <th className="py-3 px-4 font-semibold">SKU</th>
                          <th className="py-3 px-4 font-semibold">Name</th>
                          <th className="py-3 px-4 font-semibold">Collection</th>
                          <th className="py-3 px-4 font-semibold">Boutique</th>
                          <th className="py-3 px-4 font-semibold">Market</th>
                          <th className="py-3 px-4 font-semibold text-right">Target</th>
                          <th className="py-3 px-4 font-semibold text-right">Stock</th>
                          <th className="py-3 px-4 font-semibold text-right">Gap</th>
                          <th className="py-3 px-4 font-semibold text-right">Gap Value</th>
                          <th className="py-3 px-4 font-semibold text-right">Velocity</th>
                          <th className="py-3 px-4 font-semibold text-right">Stockout</th>
                          <th className="py-3 px-4 font-semibold text-right">Inbound</th>
                          <th className="py-3 px-4 font-semibold text-right">Net Gap</th>
                          <th className="py-3 px-4 font-semibold">Urgency</th>
                          <th className="py-3 px-4 font-semibold">Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredGaps.length > 0 ? (
                          filteredGaps.slice(0, msVisibleCount).map((r: any, i: number) => {
                            let urgencyBadge = "bg-gray-100 text-muted";
                            if (r.urgency === "CRITICAL") urgencyBadge = "bg-[#8B1A2B]/10 text-[#8B1A2B] font-bold";
                            else if (r.urgency === "HIGH") urgencyBadge = "bg-[#B8965A]/20 text-[#8B1A2B] font-semibold";
                            else if (r.urgency === "OVER-STOCKED") urgencyBadge = "bg-[#2D5A3D]/10 text-[#2D5A3D] font-semibold";

                            let actionStyle = "text-muted";
                            if (r.action.includes("emergency")) actionStyle = "text-[#8B1A2B] font-semibold";
                            else if (r.action.includes("reallocation")) actionStyle = "text-[#B8965A] font-semibold";
                            else if (r.action.includes("resolves")) actionStyle = "text-[#2D5A3D] font-medium";

                            return (
                              <tr key={i} className="border-b border-line/40 hover:bg-cream/20">
                                <td className="py-2.5 px-4 font-mono text-[11px] text-ink">{r.reference_sku}</td>
                                <td className="py-2.5 px-4 text-ink font-medium">{r.reference_name}</td>
                                <td className="py-2.5 px-4 text-muted">{r.collection}</td>
                                <td className="py-2.5 px-4 text-ink">{r.boutique_name}</td>
                                <td className="py-2.5 px-4 text-muted">{r.market}</td>
                                <td className="py-2.5 px-4 text-right text-ink font-medium">{r.model_stock_target}</td>
                                <td className="py-2.5 px-4 text-right text-ink">{r.stock_available}</td>
                                <td className={`py-2.5 px-4 text-right font-bold ${r.gap > 0 ? "text-[#8B1A2B]" : "text-muted"}`}>{r.gap}</td>
                                <td className="py-2.5 px-4 text-right text-ink font-mono">{fmtUsd(r.gap_value)}</td>
                                <td className="py-2.5 px-4 text-right text-muted">{r.sales_velocity?.toFixed(1)}/wk</td>
                                <td className="py-2.5 px-4 text-right text-ink">
                                  {r.weeks_stockout === 999.0 ? "—" : r.weeks_stockout <= 0.1 ? "0.0 wks" : fmtWks(r.weeks_stockout)}
                                </td>
                                <td className="py-2.5 px-4 text-right text-ink">{r.inbound_units}</td>
                                <td className={`py-2.5 px-4 text-right font-medium ${r.net_gap > 0 ? "text-[#8B1A2B]" : "text-muted"}`}>{r.net_gap}</td>
                                <td className="py-2.5 px-4">
                                  <span className={`px-2 py-0.5 rounded text-[9px] tracking-wide uppercase ${urgencyBadge}`}>
                                    {r.urgency}
                                  </span>
                                </td>
                                <td className={`py-2.5 px-4 text-[11px] ${actionStyle}`}>{r.action}</td>
                              </tr>
                            );
                          })
                        ) : (
                          <tr>
                            <td colSpan={15} className="py-10 text-center text-muted">
                              No gaps registry records match current filters or search terms.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {filteredGaps.length > msVisibleCount && (
                    <div className="flex justify-center py-4 border-t border-line/40 bg-cream/5">
                      <button
                        onClick={() => setMsVisibleCount((prev) => prev + 50)}
                        className="bg-card border border-line text-ink text-xs font-semibold px-5 py-2.5 hover:border-gold transition uppercase tracking-wider rounded"
                      >
                        Show More (+50 rows)
                      </button>
                    </div>
                  )}
                </Card>
              </div>

              {/* Section E: AI Model Stock Report */}
              <div className="mt-8">
                <AiReport
                  title="AI Model Stock Advisor"
                  buttonLabel="◆ Consult AI Model Stock Advisor"
                  action="Prioritise addressing critical SKU gaps in flagship boutiques to prevent VIP waitlist abandonment."
                  stream={(onT, onD) =>
                    streamReport(
                      "/api/supply/model-stock/report",
                      {
                        as_of_date: msAsOfDate,
                        markets: msSelectedMarkets,
                        boutiques: msSelectedBoutiques,
                        category: msSelectedCategory,
                        collections: msSelectedCollections,
                        tier: msSelectedTier,
                        show_only: msShowOnly,
                      },
                      onT,
                      onD
                    )
                  }
                />
              </div>
            </div>
          ) : (
            <div className="text-muted py-20 text-center font-display">Select an As-Of Date to calculate model stocks.</div>
          )}
        </div>
      )}

      {/* ────────────────────────────────────────────────────────
          TAB 4: PLANNING & FORECAST
          ──────────────────────────────────────────────────────── */}
      {activeTab === "forecast" && (
        <div>
          {/* Filters Bar */}
          {fcFilters ? (
            <div className="flex flex-wrap gap-5 items-end bg-cream/10 p-5 border border-line/60 rounded">
              <div>
                <div className="label mb-2">Market Region</div>
                <select
                  value={fcMarket}
                  onChange={(e) => setFcMarket(e.target.value)}
                  className="bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none min-w-[150px]"
                >
                  {fcFilters.markets.map((m: string) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="label mb-2">Category</div>
                <select
                  value={fcCategory}
                  onChange={(e) => setFcCategory(e.target.value)}
                  className="bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none min-w-[130px]"
                >
                  {fcFilters.categories.map((c: string) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </div>

              <MultiSelect label="Collections" options={fcFilters.collections} value={fcCollections} onChange={setFcCollections} />

              <MultiSelect label="Reference SKUs" options={fcFilters.skus} value={fcSkus} onChange={setFcSkus} />

              <div>
                <div className="label mb-2">Forecast Horizon</div>
                <select
                  value={fcHorizon}
                  onChange={(e) => setFcHorizon(parseInt(e.target.value))}
                  className="bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none min-w-[100px]"
                >
                  {fcFilters.horizons.map((h: number) => (
                    <option key={h} value={h}>
                      {h} Days
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center gap-5 py-2">
                <label className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink cursor-pointer uppercase">
                  <input
                    type="checkbox"
                    checked={fcSeasonality}
                    onChange={(e) => setFcSeasonality(e.target.checked)}
                    className="accent-[#B8965A] w-4 h-4"
                  />
                  Seasonality
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold tracking-wide text-ink cursor-pointer uppercase">
                  <input
                    type="checkbox"
                    checked={fcIncludeInbound}
                    onChange={(e) => setFcIncludeInbound(e.target.checked)}
                    className="accent-[#B8965A] w-4 h-4"
                  />
                  Inbound pipeline
                </label>
              </div>
            </div>
          ) : (
            <div className="text-muted text-xs">Loading Planning &amp; Forecast Filters…</div>
          )}

          {fcLoading ? (
            <div className="text-muted py-20 text-center font-display">Generating time-series demand projections…</div>
          ) : fcData ? (
            <div className="space-y-8 mt-6">
              {/* Section A: Forecast KPIs */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <Kpi label="Forecast Demand" amount={fcData.kpis.forecast_demand} format={fmtNum} sub="Total units projected" />
                <Kpi label="Available Supply" amount={fcData.kpis.available_supply} format={fmtNum} sub="Stock + Inbound Pipeline" />
                <Kpi
                  label="Supply Gap"
                  value={fcData.kpis.gap > 0 ? `${fmtNum(fcData.kpis.gap)} units` : "0 units"}
                  sub={`Estimated Value: ${fmtUsd(fcData.kpis.gap_usd)}`}
                  tone={fcData.kpis.gap > 0 ? "risk" : "good"}
                />
                <Kpi
                  label="Stockout Risk"
                  value={fcData.kpis.stockout_date ? fcData.kpis.stockout_date : "No Risk Detected"}
                  sub={`Risk Classification: ${fcData.kpis.risk_level}`}
                  tone={fcData.kpis.stockout_date ? "risk" : "good"}
                />
              </div>

              {/* Section B: Combined Forecast & Supply Projection Chart */}
              <Card className="p-6">
                <Eyebrow>Daily Projected Stock Cover vs Cumulative Demand &amp; Inbounds</Eyebrow>
                {combinedChartData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={320}>
                    <ComposedChart data={combinedChartData} margin={{ left: -10, top: 10, right: 10, bottom: 5 }}>
                      <CartesianGrid stroke="#F0EBE1" vertical={false} />
                      <XAxis dataKey="date" tick={{ fontSize: 9, fill: C.muted }} />
                      <YAxis tick={{ fontSize: 9, fill: C.muted }} />
                      <Tooltip formatter={(v: any) => fmtNum(v)} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="stock" name="Projected Stock Level" fill={C.gold} opacity={0.65} barSize={8} />
                      <Line type="monotone" dataKey="forecast" name="Cumulative Forecasted Demand" stroke={C.bordeaux} strokeWidth={2} dot={false} />
                      <Line type="monotone" dataKey="inbound" name="Cumulative Confirmed Inbounds" stroke={C.forest} strokeWidth={2} strokeDasharray="4 4" dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="text-muted py-20 text-center">No chart coordinates generated.</div>
                )}
              </Card>

              {/* Section C: Market Granularity (only when "All APAC" is active) */}
              {fcMarket === "All APAC" && fcData.market_stats && fcData.market_stats.length > 0 && (
                <div className="grid lg:grid-cols-2 gap-6">
                  <Card className="p-6 overflow-hidden">
                    <Eyebrow>Regional Market Breakdowns</Eyebrow>
                    <div className="overflow-x-auto scroll-thin">
                      <table className="w-full text-xs text-left border-collapse">
                        <thead>
                          <tr className="border-b border-line text-muted font-medium bg-cream/10">
                            <th className="py-2.5 px-3">Market</th>
                            <th className="py-2.5 px-3 text-right">Current Stock</th>
                            <th className="py-2.5 px-3 text-right">Proj Demand</th>
                            <th className="py-2.5 px-3 text-right">Pipeline</th>
                            <th className="py-2.5 px-3 text-right">Supply Gap</th>
                            <th className="py-2.5 px-3">Risk Level</th>
                            <th className="py-2.5 px-3">Stockout Date</th>
                          </tr>
                        </thead>
                        <tbody>
                          {fcData.market_stats.map((mkt: any, idx: number) => {
                            let badge = "text-muted";
                            if (mkt.risk === "High") badge = "text-[#8B1A2B] font-bold bg-[#8B1A2B]/10 px-1.5 py-0.5 rounded text-[10px]";
                            else if (mkt.risk === "Medium") badge = "text-[#8B1A2B] font-medium bg-[#B8965A]/15 px-1.5 py-0.5 rounded text-[10px]";
                            else if (mkt.risk === "Low") badge = "text-[#2D5A3D] font-medium bg-[#2D5A3D]/10 px-1.5 py-0.5 rounded text-[10px]";

                            return (
                              <tr key={idx} className="border-b border-line/40 hover:bg-cream/20">
                                <td className="py-2.5 px-3 font-semibold text-ink">{mkt.market}</td>
                                <td className="py-2.5 px-3 text-right text-ink">{mkt.stock}</td>
                                <td className="py-2.5 px-3 text-right text-ink font-medium">{mkt.demand}</td>
                                <td className="py-2.5 px-3 text-right text-ink">{mkt.inbound}</td>
                                <td className={`py-2.5 px-3 text-right font-semibold ${mkt.gap > 0 ? "text-[#8B1A2B]" : "text-muted"}`}>
                                  {mkt.gap}
                                </td>
                                <td className="py-2.5 px-3">
                                  <span className={badge}>{mkt.risk}</span>
                                </td>
                                <td className="py-2.5 px-3 font-mono text-[11px] text-muted">{mkt.stockout_date}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </Card>

                  <Card className="p-6">
                    <Eyebrow>Projected Supply Gap by Market (Units)</Eyebrow>
                    <ResponsiveContainer width="100%" height={240}>
                      <BarChart data={fcData.market_stats} margin={{ left: -10, top: 10 }}>
                        <XAxis dataKey="market" tick={{ fontSize: 9, fill: C.muted }} />
                        <YAxis tick={{ fontSize: 9, fill: C.muted }} />
                        <Tooltip formatter={(v: any) => fmtNum(v)} />
                        <Bar dataKey="gap" name="Supply Gap" fill={C.bordeaux} radius={[2, 2, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </Card>
                </div>
              )}

              {/* Section D: Inbound Pipeline Timelines */}
              <Card className="p-6 overflow-hidden">
                <Eyebrow>Section D · Inbound Shipments &amp; Pipelines schedule</Eyebrow>
                {fcData.pipeline && fcData.pipeline.length > 0 ? (
                  <div className="overflow-x-auto scroll-thin">
                    <table className="w-full text-[12px] text-left border-collapse min-w-[900px]">
                      <thead>
                        <tr className="label border-b border-line bg-cream/10 text-ink">
                          <th className="py-3 px-4 font-semibold">Shipment ID</th>
                          <th className="py-3 px-4 font-semibold">Origin Hub</th>
                          <th className="py-3 px-4 font-semibold">Boutique Destination</th>
                          <th className="py-3 px-4 font-semibold">Reference SKU</th>
                          <th className="py-3 px-4 font-semibold text-right">Units</th>
                          <th className="py-3 px-4 font-semibold">Ship Date</th>
                          <th className="py-3 px-4 font-semibold">Estimated Arrival</th>
                          <th className="py-3 px-4">Transit Status</th>
                          <th className="py-3 px-4 text-right">Priority</th>
                        </tr>
                      </thead>
                      <tbody>
                        {fcData.pipeline.map((ship: any, idx: number) => {
                          const isDelayed = ship.status.includes("Delayed");
                          return (
                            <tr key={idx} className="border-b border-line/40 hover:bg-cream/20">
                              <td className="py-2.5 px-4 font-mono font-semibold text-ink">{ship.shipment_id}</td>
                              <td className="py-2.5 px-4 text-muted">{ship.origin}</td>
                              <td className="py-2.5 px-4 text-ink font-medium">{ship.destination}</td>
                              <td className="py-2.5 px-4 font-mono text-[11px] text-ink">{ship.sku}</td>
                              <td className="py-2.5 px-4 text-right font-medium text-ink">{ship.units}</td>
                              <td className="py-2.5 px-4 text-muted font-mono text-[11px]">{ship.ship_date}</td>
                              <td className="py-2.5 px-4 text-ink font-semibold font-mono text-[11px]">{ship.eta}</td>
                              <td className="py-2.5 px-4">
                                <span
                                  className={`px-2 py-0.5 rounded text-[10px] font-medium ${
                                    isDelayed
                                      ? "bg-[#8B1A2B]/10 text-[#8B1A2B] font-bold"
                                      : "bg-[#2D5A3D]/10 text-[#2D5A3D]"
                                  }`}
                                >
                                  {ship.status}
                                </span>
                              </td>
                              <td className="py-2.5 px-4 text-right">
                                {ship.vic === "YES" ? (
                                  <span className="bg-[#B8965A]/10 text-[#8B1A2B] font-bold text-[9px] px-2 py-0.5 rounded border border-[#B8965A]/45 uppercase tracking-wide">
                                    ◆ VIP waitlist linked
                                  </span>
                                ) : (
                                  <span className="text-muted text-[10px]">Standard</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="text-muted text-center py-6 text-sm">No active inbound shipments in transit.</div>
                )}
              </Card>

              {/* Section E: Scenario Modelling (Reallocation Simulator) */}
              <div className="space-y-4">
                <div className="label text-gold uppercase tracking-[0.1em]">Section E · Regional Reallocation Scenario Calculator</div>
                
                <div className="grid lg:grid-cols-2 gap-6">
                  {/* Inputs */}
                  <Card className="p-6 space-y-4">
                    <Eyebrow>Simulate Stock Reallocation</Eyebrow>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="label mb-2">From Market</div>
                        <select
                          value={simFromMarket}
                          onChange={(e) => setSimFromMarket(e.target.value)}
                          className="w-full bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none"
                        >
                          {opts.markets.map((m: string) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <div className="label mb-2">To Market</div>
                        <select
                          value={simToMarket}
                          onChange={(e) => setSimToMarket(e.target.value)}
                          className="w-full bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none"
                        >
                          {opts.markets.map((m: string) => (
                            <option key={m}>{m}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="label mb-1">Transfer Units</div>
                        <input
                          type="number"
                          value={simUnits}
                          onChange={(e) => setSimUnits(parseInt(e.target.value) || 1)}
                          className="w-full bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none"
                          min={1}
                        />
                      </div>
                      <div>
                        <div className="label mb-1">Lead Days</div>
                        <input
                          type="number"
                          value={simLeadDays}
                          onChange={(e) => setSimLeadDays(parseInt(e.target.value) || 1)}
                          className="w-full bg-card border border-line px-3 py-2 text-sm text-ink focus:border-gold outline-none"
                          min={1}
                        />
                      </div>
                    </div>

                    <div className="bg-[#FAF7F0] p-3 text-[11px] text-muted border border-line/60 rounded">
                      <span className="font-semibold text-ink uppercase tracking-wider block mb-1">Active Simulation Context</span>
                      Simulating reallocation for the <strong>{fcSkus.length} SKU(s)</strong> selected in the filters above.
                    </div>

                    {simError && <div className="text-bordeaux text-xs font-semibold">{simError}</div>}

                    <button
                      onClick={handleSimulate}
                      disabled={simLoading || fcSkus.length === 0}
                      className="w-full bg-sidebar text-cream text-xs font-semibold uppercase tracking-[0.2em] py-3 hover:bg-[#222] transition disabled:opacity-40"
                    >
                      {simLoading ? "Calculating timelines…" : "Simulate Transfer"}
                    </button>
                  </Card>

                  {/* Results */}
                  <Card className="p-6 flex flex-col justify-between">
                    <div>
                      <Eyebrow>Simulation Output comparison</Eyebrow>
                      
                      {simResult ? (
                        <div className="space-y-4">
                          <div className="overflow-x-auto scroll-thin">
                            <table className="w-full text-xs border-collapse">
                              <thead>
                                <tr className="border-b border-line text-muted font-medium bg-cream/10">
                                  <th className="py-2 px-1 text-left">Metric</th>
                                  <th className="py-2 px-1 text-right">{simFromMarket} (Before)</th>
                                  <th className="py-2 px-1 text-right bg-[#8B1A2B]/5 text-[#8B1A2B] font-semibold">{simFromMarket} (After)</th>
                                  <th className="py-2 px-1 text-right">{simToMarket} (Before)</th>
                                  <th className="py-2 px-1 text-right bg-[#2D5A3D]/5 text-[#2D5A3D] font-semibold">{simToMarket} (After)</th>
                                </tr>
                              </thead>
                              <tbody>
                                <tr className="border-b border-line/40">
                                  <td className="py-2 px-1 font-medium text-ink">Stockout Date</td>
                                  <td className="py-2 px-1 text-right text-muted">{simResult.from_market.before.stockout_date || "No Risk"}</td>
                                  <td className="py-2 px-1 text-right text-bordeaux font-bold bg-[#8B1A2B]/5">{simResult.from_market.after.stockout_date || "No Risk"}</td>
                                  <td className="py-2 px-1 text-right text-muted">{simResult.to_market.before.stockout_date || "No Risk"}</td>
                                  <td className="py-2 px-1 text-right text-forest font-bold bg-[#2D5A3D]/5">{simResult.to_market.after.stockout_date || "No Risk"}</td>
                                </tr>
                                <tr className="border-b border-line/40">
                                  <td className="py-2 px-1 font-medium text-ink">Supply Gap (Units)</td>
                                  <td className="py-2 px-1 text-right text-muted">{simResult.from_market.before.supply_gap_units}</td>
                                  <td className="py-2.5 px-1 text-right text-bordeaux font-bold bg-[#8B1A2B]/5">{simResult.from_market.after.supply_gap_units}</td>
                                  <td className="py-2 px-1 text-right text-muted">{simResult.to_market.before.supply_gap_units}</td>
                                  <td className="py-2.5 px-1 text-right text-forest font-bold bg-[#2D5A3D]/5">{simResult.to_market.after.supply_gap_units}</td>
                                </tr>
                                <tr className="border-b border-line/40">
                                  <td className="py-2 px-1 font-medium text-ink">Risk Level</td>
                                  <td className="py-2 px-1 text-right text-muted">{simResult.from_market.before.risk_level}</td>
                                  <td className="py-2 px-1 text-right text-bordeaux font-semibold bg-[#8B1A2B]/5">{simResult.from_market.after.risk_level}</td>
                                  <td className="py-2 px-1 text-right text-muted">{simResult.to_market.before.risk_level}</td>
                                  <td className="py-2 px-1 text-right text-forest font-semibold bg-[#2D5A3D]/5">{simResult.to_market.after.risk_level}</td>
                                </tr>
                              </tbody>
                            </table>
                          </div>

                          <div className="flex items-center gap-2 mt-2">
                            <span className="text-xs uppercase font-bold tracking-wider text-ink">Verdict:</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase ${
                              simResult.overall_verdict.includes("APPROVED") || simResult.overall_verdict.includes("VIABLE")
                                ? "bg-[#2D5A3D]/10 text-[#2D5A3D]"
                                : "bg-[#8B1A2B]/10 text-[#8B1A2B]"
                            }`}>
                              {simResult.overall_verdict}
                            </span>
                          </div>

                          <div className="border-l-2 border-gold pl-4 text-xs italic text-ink py-1 bg-cream/10">
                            <strong>AI Reallocation Recommendation:</strong> {simResult.recommendation}
                          </div>
                        </div>
                      ) : (
                        <div className="text-sm text-muted py-12 text-center">
                          Select the origin/destination markets, input transfer volume, and click simulate to view the reallocation impact comparison.
                        </div>
                      )}
                    </div>
                    {simResult && (
                      <button
                        onClick={() =>
                          exportToCSV(
                            [
                              {
                                market: simFromMarket,
                                before_stockout: simResult.from_market.before.stockout_date || "No Risk",
                                after_stockout: simResult.from_market.after.stockout_date || "No Risk",
                                before_gap: simResult.from_market.before.supply_gap_units,
                                after_gap: simResult.from_market.after.supply_gap_units,
                                before_risk: simResult.from_market.before.risk_level,
                                after_risk: simResult.from_market.after.risk_level,
                                verdict: simResult.from_market.verdict,
                              },
                              {
                                market: simToMarket,
                                before_stockout: simResult.to_market.before.stockout_date || "No Risk",
                                after_stockout: simResult.to_market.after.stockout_date || "No Risk",
                                before_gap: simResult.to_market.before.supply_gap_units,
                                after_gap: simResult.to_market.after.supply_gap_units,
                                before_risk: simResult.to_market.before.risk_level,
                                after_risk: simResult.to_market.after.risk_level,
                                verdict: simResult.to_market.verdict,
                              },
                            ],
                            `reallocation_${simFromMarket}_to_${simToMarket}.csv`
                          )
                        }
                        className="w-full bg-[#B8965A] text-cream text-[10px] font-semibold uppercase tracking-wider py-2 hover:bg-[#8B1A2B] transition mt-4"
                      >
                        Export Simulation CSV
                      </button>
                    )}
                  </Card>
                </div>
              </div>

              {/* Section F: AI Planning Report */}
              <div className="mt-8">
                <AiReport
                  title="AI Demand &amp; Supply Planning Advisor"
                  buttonLabel="◆ Consult AI Demand Planning Advisor"
                  action="Deploy recommended regional stock transfers and expedite inbound pipeline shipments to avoid critical stockouts."
                  stream={(onT, onD) =>
                    streamReport(
                      "/api/supply/forecast/report",
                      {
                        market: fcMarket,
                        category: fcCategory,
                        collections: fcCollections,
                        skus: fcSkus,
                        horizon: fcHorizon,
                        seasonality: fcSeasonality,
                        include_inbound: fcIncludeInbound,
                      },
                      onT,
                      onD
                    )
                  }
                />
              </div>
            </div>
          ) : (
            <div className="text-muted py-20 text-center font-display">Configure filters above to project inventories.</div>
          )}
        </div>
      )}

      <div className="h-12" />
    </motion.div>
  );
}
