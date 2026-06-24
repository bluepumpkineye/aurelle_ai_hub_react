import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { api, streamReport } from "../lib/api";
import { AiReport, C, CHART_COLORS, Card, Eyebrow, Kpi, MultiSelect, fmtUsd, fmtNum, fmtPct } from "../components/ui";

// Original Aurelle heat scale: cream → champagne → deep bordeaux.
function heat(t: number): string {
  const lerp = (a: number, b: number, x: number) => Math.round(a + (b - a) * x);
  if (t < 0.5) {
    const x = t / 0.5; // #FAF8F5 → #D4C5A9
    return `rgb(${lerp(250, 212, x)},${lerp(248, 197, x)},${lerp(245, 169, x)})`;
  }
  const x = (t - 0.5) / 0.5; // #D4C5A9 → #8B0000
  return `rgb(${lerp(212, 139, x)},${lerp(197, 0, x)},${lerp(169, 0, x)})`;
}

function Matrix({ m }: { m: { labels: string[]; rows: number[][] } }) {
  const max = Math.max(1, ...m.rows.flat());
  return (
    <div className="overflow-auto">
      <table className="border-separate" style={{ borderSpacing: 3 }}>
        <tbody>
          {m.rows.map((row, i) => (
            <tr key={i}>
              <td className="text-[10px] text-gold pr-2 text-right whitespace-nowrap">{m.labels[i]}</td>
              {row.map((v, j) => {
                const t = v / max;
                return (
                  <td
                    key={j}
                    title={`${m.labels[i]} × ${m.labels[j]}: ${v}`}
                    className="w-14 h-10 text-center text-[11px] font-medium"
                    style={{ background: heat(t), color: t > 0.6 ? "#fff" : "#7A5A3A" }}
                  >
                    {fmtNum(v)}
                  </td>
                );
              })}
            </tr>
          ))}
          <tr>
            <td />
            {m.labels.map((l) => (
              <td key={l} className="text-[9px] text-muted text-center pt-1">{l}</td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-[13px]">
      <span className="text-muted">{label}: </span>
      <span className="text-ink font-medium tracking-tight">{value}</span>
    </div>
  );
}

// Per-category performance card with a sell-through-vs-target gauge.
function CategoryCard({ c, onExplore }: { c: any; onExplore: (name: string) => void }) {
  const sell = Math.max(0, Math.min(100, c.sell_through));
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onExplore(c.name)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onExplore(c.name);
        }
      }}
      className="cursor-pointer outline-none"
    >
      <Card className="shine group p-6 transition duration-300 hover:shadow-lift hover:-translate-y-[2px]">
        <div className="absolute inset-x-0 top-0 h-[2px] w-0 bg-gold transition-all duration-500 group-hover:w-full" />
        <div className="flex items-start justify-between gap-3">
          <div className="font-display text-2xl font-light text-ink uppercase tracking-wide leading-tight">{c.name}</div>
          <div className="label whitespace-nowrap mt-1">Sell-through vs target</div>
        </div>
        <div className="grid grid-cols-2 gap-x-8 gap-y-2.5 mt-4">
          <Metric label="Revenue" value={fmtUsd(c.revenue)} />
          <Metric label="Units" value={fmtNum(c.units)} />
          <Metric label="Avg Price" value={"$" + Math.round(c.avg_price).toLocaleString("en-US")} />
          <Metric label="Margin" value={`${c.margin.toFixed(0)}%`} />
        </div>
        <div className="mt-3 -mb-1">
          <ResponsiveContainer width="100%" height={96}>
            <PieChart>
              <Pie
                data={[{ v: sell }, { v: 100 - sell }]}
                dataKey="v"
                startAngle={180}
                endAngle={0}
                cx="50%"
                cy="100%"
                innerRadius={48}
                outerRadius={72}
                stroke="none"
                isAnimationActive={false}
              >
                <Cell fill={C.gold} />
                <Cell fill="#2C2C2C" />
              </Pie>
            </PieChart>
          </ResponsiveContainer>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-[11px] text-muted">{sell}% achieved · target {c.target}%</span>
          <span className="text-[11px] text-gold">Click to explore →</span>
        </div>
      </Card>
    </div>
  );
}

export function ProductPerformance() {
  const [opts, setOpts] = useState<any>({ markets: [], channels: [], categories: [] });
  const [markets, setMarkets] = useState<string[]>([]);
  const [channels, setChannels] = useState<string[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/api/product/filters").then(setOpts).catch(() => {});
  }, []);
  useEffect(() => {
    api
      .post("/api/product/overview", { markets, channels, categories })
      .then(setD)
      .catch(() => setErr("Could not load data. Is the API running on :8000?"));
  }, [markets, channels, categories]);

  if (err) return <div className="text-bordeaux">{err}</div>;
  if (!d) return <div className="text-muted">Loading product performance…</div>;
  if (d.empty) return <div className="text-muted">No transactions match these filters.</div>;

  const k = d.kpis;
  const filters = { markets, channels, categories };

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label text-gold">Product Performance</div>
          <h1 className="font-display text-4xl font-light text-ink mt-1">Collection Analysis</h1>
          <p className="text-sm text-muted mt-2 max-w-xl">
            Revenue splits, price-tier distribution, gross margins and cross-purchase behaviour.
          </p>
        </div>
        <span className="label text-muted border border-line px-3 py-1.5">Demonstration · synthetic data</span>
      </div>

      <div className="flex flex-wrap gap-5 mt-8">
        <MultiSelect label="Markets" options={opts.markets} value={markets} onChange={setMarkets} />
        <MultiSelect label="Channels" options={opts.channels} value={channels} onChange={setChannels} />
        <MultiSelect label="Categories" options={opts.categories} value={categories} onChange={setCategories} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
        <Kpi label="Total Revenue" amount={k.total_rev} format={fmtUsd} />
        <Kpi label="Units Sold" amount={k.units} format={fmtNum} />
        <Kpi label="Avg Trans. Value" amount={k.atv} format={fmtUsd} />
        <Kpi label="Avg Gross Margin" amount={k.margin} format={fmtPct} tone="good" />
        <Card className="p-6">
          <div className="label">Top Collection</div>
          <div className="font-display text-2xl font-light text-ink mt-3 leading-tight">{k.top_product}</div>
        </Card>
      </div>

      <div className="mt-6">
        <AiReport
          title="Merchandising Strategy Report"
          buttonLabel="◆ Generate Collection Portfolio Strategy"
          action={`Rebalance the collection mix toward ${k.top_product} and protect the ${k.margin.toFixed(1)}% margin floor.`}
          stream={(onT, onD) => streamReport("/api/product/report", filters, onT, onD)}
        />
      </div>

      {d.categories && d.categories.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-5 mt-8">
          {d.categories.map((c: any) => (
            <CategoryCard key={c.name} c={c} onExplore={(name) => setCategories([name])} />
          ))}
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-5 mt-8">
        <Card className="p-6">
          <Eyebrow>Revenue Split by Product Collection</Eyebrow>
          <div className="flex items-center gap-4">
            <div className="flex-1 min-w-0">
              <ResponsiveContainer width="100%" height={340}>
                <PieChart>
                  <Pie
                    data={d.charts.by_product}
                    dataKey="value"
                    nameKey="name"
                    innerRadius={56}
                    outerRadius={94}
                    paddingAngle={1}
                    labelLine={{ stroke: "#D4C5A9" }}
                    label={({ percent }: any) => (percent > 0.025 ? `${(percent * 100).toFixed(1)}%` : "")}
                    style={{ fontSize: 10, fill: C.ink }}
                  >
                    {d.charts.by_product.map((_: any, i: number) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: any) => fmtUsd(v)} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="w-[180px] max-h-[320px] overflow-y-auto scroll-thin pr-1">
              <ul className="space-y-1.5">
                {d.charts.by_product.map((p: any, i: number) => (
                  <li key={p.name} className="flex items-center gap-2 text-[11px] text-ink">
                    <span
                      className="w-2.5 h-2.5 rounded-[2px] shrink-0"
                      style={{ background: CHART_COLORS[i % CHART_COLORS.length] }}
                    />
                    <span className="truncate" title={p.name}>{p.name}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>

        <Card className="p-6">
          <Eyebrow>Volume vs Revenue by Price Band</Eyebrow>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={d.charts.bands} margin={{ top: 8, right: 8 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.muted }} interval={0} angle={-18} textAnchor="end" height={64} />
              <YAxis yAxisId="l" tick={{ fontSize: 9, fill: C.muted }} />
              <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 9, fill: C.muted }} tickFormatter={fmtUsd} />
              <Tooltip formatter={(v: any, n: any) => (n === "revenue" ? fmtUsd(v) : fmtNum(v))} cursor={{ fill: "#00000008" }} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar yAxisId="l" dataKey="transactions" name="Transactions" fill="#2C2C2C" radius={[2, 2, 0, 0]} />
              <Bar yAxisId="r" dataKey="revenue" name="Revenue" fill={C.bordeaux} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Margin vs Sales Volume</Eyebrow>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ left: 2, top: 8, right: 12, bottom: 6 }}>
              <CartesianGrid stroke="#F0EBE1" />
              <XAxis
                type="number"
                dataKey="units"
                name="Units Sold"
                domain={[0, "dataMax + 200"]}
                tick={{ fontSize: 9, fill: C.muted }}
              />
              <YAxis
                type="number"
                dataKey="margin"
                name="Margin"
                unit="%"
                domain={["dataMin - 0.1", "dataMax + 0.1"]}
                tickFormatter={(v) => v.toFixed(1)}
                tick={{ fontSize: 9, fill: C.muted }}
              />
              <ZAxis type="number" dataKey="revenue" range={[80, 620]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: any, n: any) => (n === "revenue" ? fmtUsd(v) : n === "margin" ? `${v.toFixed(2)}%` : fmtNum(v))} />
              <Scatter data={d.charts.scatter}>
                {d.charts.scatter.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} fillOpacity={0.78} />
                ))}
              </Scatter>
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Category Cross-Purchase Matrix</Eyebrow>
          <p className="text-[11px] text-muted -mt-2 mb-4">Clients buying multiple categories (co-occurrence).</p>
          <Matrix m={d.charts.matrix} />
        </Card>
      </div>

      <div className="h-12" />
    </motion.div>
  );
}
