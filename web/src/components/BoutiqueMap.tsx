import { useEffect, useMemo, useState } from "react";
import { MapContainer, TileLayer, Marker, Tooltip, ZoomControl, useMap } from "react-leaflet";
import * as L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Card, C, fmtUsd, fmtNum } from "./ui";

const LIGHT_TILE = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/">CARTO</a>';

export type Boutique = {
  id: string;
  name: string;
  full_name: string;
  market: string;
  tier: string;
  lat: number;
  lng: number;
  revenue: number;
  sas: number;
  conversion: number;
  atv: number;
  traffic: number;
  yoy: number;
};

const TIER_SIZE: Record<string, number> = { Flagship: 26, Major: 20, Standard: 16 };

function dotIcon(tier: string, selected: boolean) {
  const s = TIER_SIZE[tier] || 16;
  return L.divIcon({
    className: "aurelle-marker" + (selected ? " is-selected" : ""),
    html: `<span class="am-dot" style="width:${s}px;height:${s}px"></span>`,
    iconSize: [s, s],
    iconAnchor: [s / 2, s / 2],
  });
}

// Frames the map to the currently shown boutiques whenever the selection changes.
function FitBounds({ pts }: { pts: [number, number][] }) {
  const map = useMap();
  useEffect(() => {
    map.invalidateSize();
    if (!pts.length) return;
    if (pts.length === 1) {
      map.setView(pts[0], 11, { animate: true });
      return;
    }
    map.fitBounds(L.latLngBounds(pts), { padding: [44, 44], maxZoom: 10, animate: true });
  }, [pts, map]);
  return null;
}

function SideKpi({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-line/70 rounded-sm px-3 py-2">
      <div className="text-[9px] uppercase tracking-[0.15em] text-muted">{label}</div>
      <div className="font-display text-lg text-ink mt-0.5">{value}</div>
    </div>
  );
}

function BoutiqueDetail({ b, onClose }: { b: Boutique; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[2000]">
      <div className="absolute inset-0 bg-ink/30 backdrop-blur-[2px]" onClick={onClose} />
      <div className="absolute right-0 top-0 h-full w-full max-w-[420px] bg-card shadow-2xl border-l border-line p-7 overflow-y-auto scroll-thin animate-[slideIn_0.3s_ease]">
        <button
          onClick={onClose}
          aria-label="Close boutique profile"
          className="absolute top-5 right-6 text-muted hover:text-ink text-lg leading-none"
        >
          ✕
        </button>
        <div className="label text-gold">{b.tier} · {b.market}</div>
        <h3 className="font-display text-2xl font-light text-ink mt-1 pr-8">{b.full_name}</h3>
        <div className="grid grid-cols-2 gap-x-6 gap-y-5 mt-7">
          {[
            ["Annual revenue", fmtUsd(b.revenue)],
            ["YoY growth", `${b.yoy >= 0 ? "+" : ""}${b.yoy}%`],
            ["Conversion rate", `${b.conversion}%`],
            ["Avg transaction", "$" + Math.round(b.atv).toLocaleString("en-US")],
            ["Monthly traffic", fmtNum(b.traffic)],
            ["Sales associates", String(b.sas)],
          ].map(([k, v]) => (
            <div key={k}>
              <div className="text-[10px] uppercase tracking-[0.15em] text-muted">{k}</div>
              <div className="font-display text-xl font-light text-ink mt-1">{v}</div>
            </div>
          ))}
        </div>
        <div className="mt-8 border-l-2 border-gold pl-4 text-[13px] text-muted leading-relaxed">
          {b.name} contributes {fmtUsd(b.revenue)} in annual revenue at a {b.conversion}% conversion
          rate across {b.sas} sales associates — {b.yoy >= 0 ? "growing" : "down"}{" "}
          {Math.abs(b.yoy)}% year on year.
        </div>
        <div className="mt-6 text-[10px] uppercase tracking-[0.18em] text-muted">
          Demonstration · synthetic operational KPIs
        </div>
      </div>
    </div>
  );
}

const navBtn = (active: boolean) =>
  `px-3 py-1.5 rounded-sm text-[11px] font-medium tracking-wide transition whitespace-nowrap border ${
    active
      ? "bg-gold text-white border-gold"
      : "bg-card/90 backdrop-blur-sm text-muted border-line hover:text-ink hover:border-gold"
  }`;

export function BoutiqueMap({ boutiques }: { boutiques: Boutique[] }) {
  const [market, setMarket] = useState("All");
  const [selected, setSelected] = useState<Boutique | null>(null);

  const markets = useMemo(() => {
    const counts: Record<string, number> = {};
    boutiques.forEach((b) => (counts[b.market] = (counts[b.market] || 0) + 1));
    return Object.entries(counts).sort((a, b) => b[1] - a[1]);
  }, [boutiques]);

  const shown = useMemo(
    () => (market === "All" ? boutiques : boutiques.filter((b) => b.market === market)),
    [boutiques, market],
  );

  const pts = useMemo(() => shown.map((b) => [b.lat, b.lng] as [number, number]), [shown]);

  const agg = useMemo(() => {
    const n = shown.length || 1;
    return {
      revenue: shown.reduce((s, b) => s + b.revenue, 0),
      count: shown.length,
      conversion: shown.reduce((s, b) => s + b.conversion, 0) / n,
      atv: shown.reduce((s, b) => s + b.atv, 0) / n,
      traffic: shown.reduce((s, b) => s + b.traffic, 0),
    };
  }, [shown]);

  const top = useMemo(() => [...shown].sort((a, b) => b.revenue - a.revenue).slice(0, 5), [shown]);

  return (
    <Card className="overflow-hidden">
      {/* Header */}
      <div className="px-6 pt-5 pb-3 flex items-start justify-between gap-4">
        <div>
          <div className="font-display text-lg font-light text-ink">APAC Boutique Network</div>
          <p className="text-[12px] text-muted mt-0.5">
            {boutiques.length} boutiques across {markets.length} markets · hover for KPIs, click for full profile
          </p>
          <p className="text-gold text-[11px] mt-1 tracking-wide">Period · FY2025</p>
        </div>
      </div>

      <div className="flex flex-col lg:flex-row" style={{ minHeight: 520 }}>
        {/* Map */}
        <div className="relative flex-1" style={{ minHeight: 380 }}>
          <MapContainer
            center={[20, 118]}
            zoom={3}
            minZoom={2}
            style={{ height: "100%", width: "100%", minHeight: 380, background: "#EDE7DC" }}
            zoomControl={false}
            scrollWheelZoom={false}
            worldCopyJump
          >
            <TileLayer url={LIGHT_TILE} attribution={TILE_ATTRIBUTION} subdomains="abcd" />
            <ZoomControl position="topright" />
            <FitBounds pts={pts} />
            {shown.map((b) => (
              <Marker
                key={b.id + (selected?.id === b.id ? "-s" : "")}
                position={[b.lat, b.lng]}
                icon={dotIcon(b.tier, selected?.id === b.id)}
                eventHandlers={{ click: () => setSelected(b) }}
              >
                <Tooltip direction="top" offset={[0, -8]} className="aurelle-tip" opacity={1}>
                  <div style={{ minWidth: 190 }}>
                    <div style={{ fontWeight: 600, fontSize: 13, color: C.ink }}>{b.name}</div>
                    <div
                      style={{
                        fontSize: 10,
                        letterSpacing: "0.08em",
                        textTransform: "uppercase",
                        color: C.gold,
                        margin: "1px 0 8px",
                      }}
                    >
                      {b.tier} · {b.market}
                    </div>
                    <div style={{ display: "flex", gap: 18 }}>
                      <div>
                        <div style={{ fontSize: 9, textTransform: "uppercase", color: C.muted }}>Revenue</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{fmtUsd(b.revenue)}</div>
                      </div>
                      <div>
                        <div style={{ fontSize: 9, textTransform: "uppercase", color: C.muted }}>Conversion</div>
                        <div style={{ fontSize: 13, fontWeight: 600, color: C.ink }}>{b.conversion}%</div>
                      </div>
                    </div>
                    <div style={{ marginTop: 8, fontSize: 10, color: C.gold }}>Click for full profile →</div>
                  </div>
                </Tooltip>
              </Marker>
            ))}
          </MapContainer>

          {/* Market quick-nav */}
          <div className="absolute top-3 left-3 z-[1000] flex flex-col gap-1 max-h-[480px] overflow-y-auto scroll-thin pr-1">
            <button onClick={() => setMarket("All")} className={navBtn(market === "All")}>
              All Markets
            </button>
            {markets.map(([m, n]) => (
              <button key={m} onClick={() => setMarket(m)} className={navBtn(market === m)}>
                {m} <span className="opacity-60">({n})</span>
              </button>
            ))}
          </div>
        </div>

        {/* Summary sidebar */}
        <div className="w-full lg:w-[280px] shrink-0 border-t lg:border-t-0 lg:border-l border-line bg-cream/40 p-5 overflow-y-auto scroll-thin">
          <div className="label mb-3">{market === "All" ? "Network Overview" : market}</div>
          <div className="space-y-2.5">
            <SideKpi label="Total Revenue" value={fmtUsd(agg.revenue)} />
            <SideKpi label="Boutiques" value={String(agg.count)} />
            <SideKpi label="Avg Conversion" value={`${agg.conversion.toFixed(1)}%`} />
            <SideKpi label="Avg ATV" value={fmtUsd(agg.atv)} />
            <SideKpi label="Total Traffic / mo" value={fmtNum(agg.traffic)} />
          </div>

          <div className="mt-5 pt-4 border-t border-line">
            <div className="label mb-2">Top Performers</div>
            <div className="space-y-0.5">
              {top.map((b, i) => (
                <button
                  key={b.id}
                  onClick={() => setSelected(b)}
                  className="w-full flex items-center gap-2 py-1.5 px-1 -mx-1 rounded-sm hover:bg-cream text-left transition"
                >
                  <span className="text-gold text-[11px] w-4 shrink-0">#{i + 1}</span>
                  <span className="flex-1 min-w-0 truncate text-[12px] text-ink">{b.name}</span>
                  <span className="text-[11px] text-muted shrink-0">{fmtUsd(b.revenue)}</span>
                  <span className={`text-[10px] shrink-0 ${b.yoy >= 0 ? "text-forest" : "text-bordeaux"}`}>
                    {b.yoy >= 0 ? "↑" : "↓"}
                    {Math.abs(b.yoy)}%
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {selected && <BoutiqueDetail b={selected} onClose={() => setSelected(null)} />}
    </Card>
  );
}
