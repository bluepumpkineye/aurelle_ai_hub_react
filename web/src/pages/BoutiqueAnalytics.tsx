import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
  ZAxis,
} from "recharts";
import { api, streamReport } from "../lib/api";
import { AiReport, C, CHART_COLORS, Card, Eyebrow, Kpi, MultiSelect, fmtUsd, fmtNum } from "../components/ui";
import { BoutiqueMap } from "../components/BoutiqueMap";

const TIER_COLOR: Record<string, string> = {
  Flagship: C.bordeaux,
  Premium: C.gold,
  Standard: C.forest,
  Boutique: "#6B4E2D",
};

// Light → deep forest green revenue scale (darker green = higher revenue).
function greenScale(t: number): string {
  const lerp = (a: number, b: number, x: number) => Math.round(a + (b - a) * x);
  // #EDF5EF (near-white green) → #14401F (deep forest)
  return `rgb(${lerp(237, 20, t)},${lerp(245, 64, t)},${lerp(239, 31, t)})`;
}

export function BoutiqueAnalytics() {
  const [opts, setOpts] = useState<any>({ markets: [], tiers: [], boutiques: [] });
  const [markets, setMarkets] = useState<string[]>([]);
  const [tiers, setTiers] = useState<string[]>([]);
  const [compare, setCompare] = useState<string[]>([]);
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/api/boutique/filters").then(setOpts).catch(() => {});
  }, []);
  useEffect(() => {
    api
      .post("/api/boutique/overview", { markets, tiers })
      .then(setD)
      .catch(() => setErr("Could not load data. Is the API running on :8000?"));
  }, [markets, tiers]);

  // default radar selection: top 3 boutiques by revenue
  useEffect(() => {
    if (d && compare.length === 0 && d.ranking?.length) {
      setCompare(d.ranking.slice(0, 3).map((r: any) => r.name));
    }
  }, [d]);

  const radarData = useMemo(() => {
    if (!d) return [];
    const sel = d.radar.boutiques.filter((b: any) => compare.includes(b.name));
    if (!sel.length) return [];
    return d.radar.metrics.map((label: string, mi: number) => {
      const vals = sel.map((b: any) => b.raw[mi]);
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      const row: any = { metric: label };
      sel.forEach((b: any) => {
        const v = b.raw[mi];
        row[b.name] = max === min ? 100 : ((v - min) / (max - min)) * 80 + 20;
      });
      return row;
    });
  }, [d, compare]);

  if (err) return <div className="text-bordeaux">{err}</div>;
  if (!d) return <div className="text-muted">Loading boutique network…</div>;
  if (d.empty) return <div className="text-muted">No boutiques match these filters.</div>;

  const k = d.kpis;
  const compareNames = d.radar.boutiques.map((b: any) => b.name);

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label text-gold">Boutique Analytics</div>
          <h1 className="font-display text-4xl font-light text-ink mt-1">Network &amp; Radar</h1>
          <p className="text-sm text-muted mt-2 max-w-xl">
            Compare regional flagships, geographic distribution and Sales Associate productivity.
          </p>
        </div>
        <span className="label text-muted border border-line px-3 py-1.5">Demonstration · synthetic data</span>
      </div>

      <div className="flex flex-wrap gap-5 mt-8">
        <MultiSelect label="Markets" options={opts.markets} value={markets} onChange={setMarkets} />
        <MultiSelect label="Boutique tiers" options={opts.tiers} value={tiers} onChange={setTiers} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <Kpi label="Selected Boutiques" amount={k.count} format={fmtNum} />
        <Kpi label="Total Annual Revenue" amount={k.total_rev} format={fmtUsd} />
        <Card className="p-6">
          <div className="label">Top Boutique</div>
          <div className="font-display text-2xl font-light text-ink mt-3 leading-tight">{k.top_bt}</div>
        </Card>
        <Kpi label="Active SAs" amount={k.sas} format={fmtNum} />
      </div>

      <div className="mt-6">
        <AiReport
          title="Boutique Performance Insight"
          buttonLabel="◆ Generate Boutique Insight Report"
          action="Replicate the top boutique's SA playbook in the lowest-tier stores and rebalance staffing to client load."
          stream={(onT, onD) => streamReport("/api/boutique/report", { markets, tiers }, onT, onD)}
        />
      </div>

      {/* APAC boutique map */}
      {d.geo && d.geo.length > 0 && (
        <div className="mt-6">
          <BoutiqueMap boutiques={d.geo} />
        </div>
      )}

      {/* Radar */}
      <div className="mt-8">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <Eyebrow>Boutique Radar Comparison</Eyebrow>
          <MultiSelect label="" options={compareNames} value={compare} onChange={setCompare} />
        </div>
        <Card className="p-6">
          {radarData.length ? (
            <ResponsiveContainer width="100%" height={360}>
              <RadarChart data={radarData} outerRadius="72%">
                <PolarGrid stroke="#E6DFD3" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: C.muted }} />
                <PolarRadiusAxis domain={[0, 100]} tick={false} axisLine={false} />
                {compare.map((name, i) => (
                  <Radar
                    key={name}
                    name={name}
                    dataKey={name}
                    stroke={CHART_COLORS[i % CHART_COLORS.length]}
                    fill={CHART_COLORS[i % CHART_COLORS.length]}
                    fillOpacity={0.18}
                    strokeWidth={2}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 11 }} />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <div className="text-sm text-muted py-10 text-center">Select boutiques to compare.</div>
          )}
        </Card>
      </div>

      {/* Network + SA productivity */}
      <div className="grid lg:grid-cols-2 gap-5 mt-5">
        <Card className="p-6">
          <Eyebrow>Boutique Network · by location</Eyebrow>
          <ResponsiveContainer width="100%" height={300}>
            <ScatterChart margin={{ left: -10, top: 8, right: 8 }}>
              <XAxis type="number" dataKey="lng" name="Lng" domain={["dataMin-5", "dataMax+5"]} tick={{ fontSize: 9, fill: C.muted }} />
              <YAxis type="number" dataKey="lat" name="Lat" domain={["dataMin-5", "dataMax+5"]} tick={{ fontSize: 9, fill: C.muted }} />
              <ZAxis type="number" dataKey="revenue" range={[60, 700]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: any, n: any) => (n === "revenue" ? fmtUsd(v) : v)} />
              <Scatter data={d.map} fill={C.bordeaux} fillOpacity={0.65} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Sales Associate Productivity</Eyebrow>
          <p className="text-[11px] text-muted -mt-2 mb-2">Tenure × revenue, sized by active clients.</p>
          <ResponsiveContainer width="100%" height={278}>
            <ScatterChart margin={{ left: -6, top: 8, right: 8 }}>
              <XAxis type="number" dataKey="tenure" name="Tenure" unit="y" tick={{ fontSize: 9, fill: C.muted }} />
              <YAxis type="number" dataKey="revenue" name="Revenue" tick={{ fontSize: 9, fill: C.muted }} tickFormatter={fmtUsd} />
              <ZAxis type="number" dataKey="clients" range={[40, 400]} />
              <Tooltip cursor={{ strokeDasharray: "3 3" }} formatter={(v: any, n: any) => (n === "revenue" ? fmtUsd(v) : fmtNum(v))} />
              <Scatter data={d.sa_scatter} fill={C.gold} fillOpacity={0.6} />
            </ScatterChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {/* Ranking */}
      <div className="mt-8">
        <Eyebrow>Boutique Ranking &amp; Store Profiles</Eyebrow>
        <Card className="overflow-hidden">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left label border-b border-line">
                {["Boutique", "Market", "Tier", "SAs", "Annual revenue"].map((h) => (
                  <th key={h} className="font-medium py-3 px-5">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(() => {
                const maxRev = Math.max(...d.ranking.map((x: any) => x.revenue));
                return d.ranking.map((r: any, i: number) => {
                  const t = r.revenue / maxRev;
                  return (
                    <tr key={i} className="border-b border-line/70 hover:bg-cream/60">
                      <td className="py-3 px-5 text-ink">{r.name}</td>
                      <td className="py-3 px-5 text-muted">{r.market}</td>
                      <td className="py-3 px-5">
                        <span
                          className="text-[10px] uppercase tracking-wide px-2 py-0.5 border"
                          style={{ color: TIER_COLOR[r.tier] || C.muted, borderColor: (TIER_COLOR[r.tier] || C.muted) + "55" }}
                        >
                          {r.tier}
                        </span>
                      </td>
                      <td className="py-3 px-5 text-ink">{r.sas}</td>
                      <td
                        className="py-3 px-5 font-medium text-right"
                        style={{ background: greenScale(t), color: t > 0.5 ? "#fff" : C.ink }}
                      >
                        {fmtUsd(r.revenue)}
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
