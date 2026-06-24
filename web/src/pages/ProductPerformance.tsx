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

      <div className="grid lg:grid-cols-2 gap-5 mt-8">
        <Card className="p-6">
          <Eyebrow>Revenue Split by Collection</Eyebrow>
          <ResponsiveContainer width="100%" height={340}>
            <PieChart>
              <Pie
                data={d.charts.by_product}
                dataKey="value"
                nameKey="name"
                innerRadius={58}
                outerRadius={96}
                paddingAngle={1}
                labelLine={{ stroke: "#D4C5A9" }}
                label={({ name, percent }: any) => (percent > 0.03 ? name : "")}
                style={{ fontSize: 10, fill: C.ink }}
              >
                {d.charts.by_product.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => fmtUsd(v)} />
            </PieChart>
          </ResponsiveContainer>
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
