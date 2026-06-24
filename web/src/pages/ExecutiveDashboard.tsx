import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { api, streamReport } from "../lib/api";
import { AiReport, C, CHART_COLORS, Card, Eyebrow, Kpi, fmtUsd, fmtNum } from "../components/ui";
import { AnimatedNumber } from "../components/AnimatedNumber";

const TONE: Record<string, string> = { positive: C.forest, risk: C.bordeaux, opportunity: C.gold };

function ValueCallout({ p }: { p: any }) {
  const color = TONE[p.tone] || C.ink;
  return (
    <Card className="shine group p-6 transition duration-300 hover:shadow-lift hover:-translate-y-[2px]">
      <div className="h-0.5 mb-6" style={{ background: color }} />
      <div className="label">{p.label}</div>
      <div className="font-display text-4xl font-light mt-3 tracking-tight" style={{ color }}>
        <AnimatedNumber value={p.amount} format={fmtUsd} />
      </div>
      <div className="text-xs text-muted mt-3 leading-relaxed">{p.sub}</div>
    </Card>
  );
}

export function ExecutiveDashboard() {
  const [d, setD] = useState<any>(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/api/executive/overview").then(setD).catch(() => setErr("Could not load data. Is the API running on :8000?"));
  }, []);

  if (err) return <div className="text-bordeaux">{err}</div>;
  if (!d) return <div className="text-muted">Loading executive intelligence…</div>;

  return (
    <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="label text-gold">Executive Dashboard</div>
          <h1 className="font-display text-4xl font-light text-ink mt-1">APAC Intelligence</h1>
          <p className="text-sm text-muted mt-2 max-w-xl">
            Where the value is this morning — translated into money, with the one move that matters.
          </p>
        </div>
        <span className="label text-muted border border-line px-3 py-1.5">Demonstration · synthetic data</span>
      </div>

      {/* Priorities */}
      <div className="label text-muted mt-8 mb-3">Executive priorities · where the value is</div>
      <div className="grid md:grid-cols-3 gap-5">
        {d.priorities.map((p: any) => (
          <ValueCallout key={p.label} p={p} />
        ))}
      </div>

      {/* AI brief */}
      <div className="mt-6">
        <AiReport
          title="AI Executive Briefing"
          buttonLabel="◆ Generate Morning Intelligence Brief"
          action={`Mobilise VIP outreach against the ${fmtUsd(d.context.at_risk_book)} at-risk book and double down on Travel Retail (+${d.context.tr_growth}%).`}
          stream={(onT, onD) => streamReport("/api/executive/report", {}, onT, onD)}
        />
      </div>

      {/* KPI strip */}
      <div className="label text-muted mt-10 mb-3">Key performance indicators · YTD</div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {d.kpis.slice(0, 5).map((k: any) => (
          <Kpi key={k.label} label={k.label} value={k.value} sub={k.delta} />
        ))}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
        {d.kpis.slice(5).map((k: any) => (
          <Card key={k.label} className="p-5">
            <div className="label">{k.label}</div>
            <div className="font-display text-3xl font-light text-ink mt-2">{k.value}</div>
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid lg:grid-cols-3 gap-5 mt-8">
        <Card className="p-6">
          <Eyebrow>Revenue by Market</Eyebrow>
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={d.charts.by_market} margin={{ left: -10, top: 4 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: C.muted }} interval={0} angle={-30} textAnchor="end" height={54} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} tickFormatter={fmtUsd} />
              <Tooltip formatter={(v: any) => fmtUsd(v)} cursor={{ fill: "#00000008" }} />
              <Bar dataKey="value" radius={[2, 2, 0, 0]}>
                {d.charts.by_market.map((_: any, i: number) => (
                  <Cell key={i} fill={i === 0 ? C.bordeaux : C.gold} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Revenue by Category</Eyebrow>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={d.charts.by_category}
                dataKey="value"
                nameKey="name"
                innerRadius={42}
                outerRadius={70}
                paddingAngle={2}
                labelLine={false}
                label={({ percent }: any) => (percent >= 0.05 ? `${(percent * 100).toFixed(0)}%` : "")}
                style={{ fontSize: 10, fill: C.ink }}
              >
                {d.charts.by_category.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => fmtUsd(v)} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>

        <Card className="p-6">
          <Eyebrow>Client Segment Mix</Eyebrow>
          <ResponsiveContainer width="100%" height={250}>
            <PieChart>
              <Pie
                data={d.charts.segment_mix}
                dataKey="value"
                nameKey="name"
                innerRadius={42}
                outerRadius={70}
                paddingAngle={2}
                labelLine={false}
                label={({ percent }: any) => (percent >= 0.05 ? `${(percent * 100).toFixed(0)}%` : "")}
                style={{ fontSize: 10, fill: C.ink }}
              >
                {d.charts.segment_mix.map((_: any, i: number) => (
                  <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                ))}
              </Pie>
              <Tooltip formatter={(v: any) => fmtNum(v)} />
              <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 10 }} />
            </PieChart>
          </ResponsiveContainer>
        </Card>
      </div>

      {d.charts.trend.length > 0 && (
        <Card className="p-6 mt-5">
          <Eyebrow>Revenue Trend · monthly</Eyebrow>
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={d.charts.trend} margin={{ left: 6, right: 6, top: 6 }}>
              <defs>
                <linearGradient id="rev" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={C.bordeaux} stopOpacity={0.28} />
                  <stop offset="100%" stopColor={C.bordeaux} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: C.muted }} />
              <YAxis tick={{ fontSize: 9, fill: C.muted }} tickFormatter={fmtUsd} />
              <Tooltip formatter={(v: any) => fmtUsd(v)} />
              <Area type="monotone" dataKey="value" stroke={C.bordeaux} strokeWidth={2} fill="url(#rev)" />
            </AreaChart>
          </ResponsiveContainer>
        </Card>
      )}

      <div className="h-12" />
    </motion.div>
  );
}
