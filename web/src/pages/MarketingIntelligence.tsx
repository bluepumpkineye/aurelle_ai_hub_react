import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Bar,
  BarChart,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { api, streamReport } from "../lib/api";
import { AiReport, C, Card, Eyebrow, Kpi, MultiSelect, fmtUsd, fmtNum, fmtPct0 } from "../components/ui";

const STATUS_COLOR: Record<string, string> = { Active: C.forest, Completed: C.gold, Planned: C.muted };

// Pale → deep forest green ROI scale (matches the original RdYlGn-style table).
function greenScale(t: number): string {
  const lerp = (a: number, b: number, x: number) => Math.round(a + (b - a) * x);
  return `rgb(${lerp(233, 27, t)},${lerp(243, 94, t)},${lerp(234, 42, t)})`;
}

export function MarketingIntelligence() {
  const [opts, setOpts] = useState<any>({ markets: [], quarters: [], statuses: [] });
  const [markets, setMarkets] = useState<string[]>([]);
  const [quarters, setQuarters] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/api/marketing/filters").then(setOpts).catch(() => {});
  }, []);
  useEffect(() => {
    api
      .post("/api/marketing/overview", { markets, quarters, statuses })
      .then(setD)
      .catch(() => setErr("Could not load data. Is the API running on :8000?"));
  }, [markets, quarters, statuses]);

  if (err) return <div className="text-bordeaux">{err}</div>;
  if (!d) return <div className="text-muted">Loading marketing intelligence…</div>;
  if (d.empty) return <div className="text-muted">No campaigns match these filters.</div>;

  const k = d.kpis;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label text-gold">Marketing Intelligence</div>
          <h1 className="font-display text-4xl font-light text-ink mt-1">Budget vs Actual</h1>
          <p className="text-sm text-muted mt-2 max-w-xl">
            Campaign ROI, channel attribution and spend variance across markets.
          </p>
        </div>
        <span className="label text-muted border border-line px-3 py-1.5">Demonstration · synthetic data</span>
      </div>

      <div className="flex flex-wrap gap-5 mt-8">
        <MultiSelect label="Markets" options={opts.markets} value={markets} onChange={setMarkets} />
        <MultiSelect label="Quarter" options={opts.quarters} value={quarters} onChange={setQuarters} />
        <MultiSelect label="Status" options={opts.statuses} value={statuses} onChange={setStatuses} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mt-6">
        <Kpi label="Total Budget" amount={k.budget} format={fmtUsd} />
        <Kpi label="Total Actual" amount={k.actual} format={fmtUsd} />
        <Kpi label="Variance" amount={k.variance} format={fmtUsd} sub={`${k.variance_pct.toFixed(1)}%`} tone={k.variance > 0 ? "risk" : "good"} />
        <Kpi label="Avg ROI" amount={k.avg_roi} format={fmtPct0} tone="good" />
        <Kpi label="Revenue Attributed" amount={k.rev_attr} format={fmtUsd} />
      </div>

      <div className="mt-6">
        <AiReport
          title="Marketing Intelligence Report"
          buttonLabel="◆ Generate Marketing Intelligence Report"
          action={`Reallocate budget toward the highest-ROI channels to lift blended ROI above ${k.avg_roi.toFixed(0)}%.`}
          stream={(onT, onD) => streamReport("/api/marketing/report", { markets, quarters, statuses }, onT, onD)}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-5 mt-8">
        <Card className="p-6">
          <Eyebrow>Budget vs Actual by Campaign</Eyebrow>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.charts.campaigns} margin={{ left: -8, top: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.muted }} interval={0} angle={-25} textAnchor="end" height={60} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} tickFormatter={fmtUsd} />
              <Tooltip cursor={{ fill: "#00000008" }} formatter={(v: any) => fmtUsd(v)} />
              <Legend wrapperStyle={{ fontSize: 10 }} />
              <Bar dataKey="budget" name="Budget" fill="#2C2C2C" radius={[2, 2, 0, 0]} />
              <Bar dataKey="actual" name="Actual" fill={C.bordeaux} radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>ROI by Media Type</Eyebrow>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.charts.media_roi} layout="vertical" margin={{ left: 20, top: 4 }}>
              <XAxis type="number" tick={{ fontSize: 9, fill: C.muted }} />
              <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: C.muted }} width={70} />
              <Tooltip cursor={{ fill: "#00000008" }} formatter={(v: any) => `${v.toFixed(0)}%`} />
              <Bar dataKey="roi" radius={[0, 2, 2, 0]}>
                {d.charts.media_roi.map((e: any, i: number) => (
                  <Cell key={i} fill={e.roi < 0 ? C.bordeaux : C.gold} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Spend Variance by Market</Eyebrow>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={d.charts.market_variance} margin={{ left: -8, top: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 8, fill: C.muted }} interval={0} angle={-30} textAnchor="end" height={54} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} tickFormatter={(v) => `${v.toFixed(0)}%`} />
              <Tooltip cursor={{ fill: "#00000008" }} formatter={(v: any) => `${v.toFixed(1)}%`} />
              <ReferenceLine y={0} stroke={C.muted} strokeDasharray="3 3" />
              <Bar dataKey="variance_pct" radius={[2, 2, 0, 0]}>
                {d.charts.market_variance.map((e: any, i: number) => (
                  <Cell key={i} fill={e.variance_pct > 5 ? C.bordeaux : e.variance_pct > 0 ? C.gold : C.forest} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Impressions vs Revenue Attributed</Eyebrow>
          <ResponsiveContainer width="100%" height={260}>
            <ScatterChart margin={{ left: 4, top: 8, right: 8 }}>
              <XAxis type="number" dataKey="impressions" name="Impressions" tick={{ fontSize: 9, fill: C.muted }} tickFormatter={(v) => `${(v / 1e6).toFixed(0)}M`} />
              <YAxis type="number" dataKey="revenue" name="Revenue" tick={{ fontSize: 9, fill: C.muted }} tickFormatter={fmtUsd} />
              <ZAxis type="number" dataKey="roi" range={[40, 400]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: any, n: any) => (n === "revenue" ? fmtUsd(v) : n === "roi" ? `${v.toFixed(0)}%` : fmtNum(v))} />
              <Scatter data={d.charts.scatter} fill={C.bordeaux} fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      </div>

      <div className="mt-8">
        <Eyebrow>Campaign Detail</Eyebrow>
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left label border-b border-line">
                {["Campaign", "Market", "Media", "Budget", "Actual", "Variance", "ROI", "Status"].map((h) => (
                  <th key={h} className="font-medium py-3 px-4">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const rows = d.detail.slice(0, 12);
                const rois = rows.map((x: any) => x.roi);
                const lo = Math.min(...rois);
                const hi = Math.max(...rois);
                return rows.map((r: any, i: number) => {
                  const t = hi > lo ? (r.roi - lo) / (hi - lo) : 1;
                  return (
                    <tr key={i} className="border-b border-line/70 hover:bg-cream/60">
                      <td className="py-2.5 px-4 text-ink">{r.campaign}</td>
                      <td className="py-2.5 px-4 text-muted">{r.market}</td>
                      <td className="py-2.5 px-4 text-muted">{r.media}</td>
                      <td className="py-2.5 px-4 text-ink">{fmtUsd(r.budget)}</td>
                      <td className="py-2.5 px-4 text-ink">{fmtUsd(r.actual)}</td>
                      <td className="py-2.5 px-4"><span className={r.variance_pct > 0 ? "text-bordeaux" : "text-forest"}>{r.variance_pct.toFixed(1)}%</span></td>
                      <td
                        className="py-2.5 px-4 font-medium text-center"
                        style={{ background: greenScale(t), color: t > 0.5 ? "#fff" : "#2D5A3D" }}
                      >
                        {r.roi.toFixed(0)}%
                      </td>
                      <td className="py-2.5 px-4">
                        <span className="text-[10px] uppercase tracking-wide" style={{ color: STATUS_COLOR[r.status] || C.muted }}>{r.status}</span>
                      </td>
                    </tr>
                  );
                });
              })()}
            </tbody>
          </table>
        </Card>
      </div>

      <div className="h-12" />
    </motion.div>
  );
}
