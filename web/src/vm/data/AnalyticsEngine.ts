/**
 * Analytics aggregates — MOCK data, clearly labelled as such in the UI
 * (isMock: true). Deterministic where possible and reactive to the live
 * planogram: revenue and coverage are functions of the actual slot states,
 * so a VM decision moves the numbers immediately (Pillar F).
 *
 * Live feed integration replaces this module behind StoreAdapter.getAnalytics
 * (see EXTENSION.md — BI platform query).
 */

import { Rng, hashString } from "../core/Seed";
import { SKU_BY_ID } from "./catalog";
import type {
  AdjacencyViolation,
  AnalyticsResult,
  AssortmentGap,
  ProductCategory,
  TrafficPath,
  ZoneAnalytics,
  ZoneConfig,
} from "./types";
import { polygonArea, polygonCentroid } from "./types";
import type { VMStore } from "../store/VMStore";
import { templateOf } from "../fixtures/FixtureCatalog";

// Brand VM adjacency standards: which zone pairings raise a flag.
const ADJACENCY_RULES: Array<{
  a: ZoneConfig["kind"];
  b: ZoneConfig["kind"];
  rule: string;
  severity: "warn" | "flag";
}> = [
  {
    a: "high-jewelry",
    b: "accessories",
    rule: "Fragrance & leather goods should not neighbour High Jewelry — scent transfer and price-story dissonance.",
    severity: "flag",
  },
  {
    a: "service",
    b: "high-jewelry",
    rule: "Service counter traffic dilutes the High Jewelry contemplation zone.",
    severity: "warn",
  },
  {
    a: "entrance",
    b: "vip",
    rule: "VIP salon must not open directly onto the entrance sightline.",
    severity: "warn",
  },
];

const TRAFFIC_WEIGHT: Record<ZoneConfig["kind"], number> = {
  entrance: 1.0,
  watches: 0.72,
  accessories: 0.66,
  "high-jewelry": 0.48,
  service: 0.38,
  vip: 0.18,
};

const DWELL_BASE: Record<ZoneConfig["kind"], number> = {
  entrance: 35,
  watches: 160,
  accessories: 110,
  "high-jewelry": 240,
  service: 300,
  vip: 540,
};

function zonesAdjacent(a: ZoneConfig, b: ZoneConfig): boolean {
  const bb = (z: ZoneConfig) => {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const [x, zz] of z.polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, zz);
      maxZ = Math.max(maxZ, zz);
    }
    return { minX, maxX, minZ, maxZ };
  };
  const A = bb(a);
  const B = bb(b);
  const gap = 0.6; // zones sharing a boundary within 0.6 m count as adjacent
  return (
    A.minX < B.maxX + gap && B.minX < A.maxX + gap && A.minZ < B.maxZ + gap && B.minZ < A.maxZ + gap
  );
}

export function computeAnalytics(store: VMStore): AnalyticsResult {
  const layout = store.layout;
  const rng = new Rng(hashString(`${layout.id}-analytics`));

  // Per-zone occupancy from the live slot map.
  const zoneSkuCount = new Map<string, Map<ProductCategory, number>>();
  const zoneRevenue = new Map<string, number>();
  const zoneSlotTotals = new Map<string, { total: number; healthy: number }>();

  for (const zone of layout.zones) {
    zoneSkuCount.set(zone.id, new Map());
    zoneRevenue.set(zone.id, 0);
    zoneSlotTotals.set(zone.id, { total: 0, healthy: 0 });
  }

  for (const fixture of layout.fixtures) {
    const grid = templateOf(fixture.templateId).slotGrid;
    if (!grid) continue;
    const totals = zoneSlotTotals.get(fixture.zoneId);
    for (const key of store.slotKeysForFixture(fixture.id)) {
      const s = store.slot(key);
      if (totals) totals.total++;
      if (!s?.sku) continue;
      const sku = SKU_BY_ID.get(s.sku);
      if (!sku) continue;
      if (totals && s.stockLevel >= 20) totals.healthy++;
      const counts = zoneSkuCount.get(fixture.zoneId);
      if (counts) counts.set(sku.category, (counts.get(sku.category) ?? 0) + 1);
      // Mock sell-through: price × stock-availability × campaign uplift.
      const uplift = s.campaignFlag ? 1.35 : 1;
      const availability = 0.25 + 0.75 * (s.stockLevel / 100);
      const rev = zoneRevenue.get(fixture.zoneId) ?? 0;
      zoneRevenue.set(fixture.zoneId, rev + sku.price * 0.011 * availability * uplift);
    }
  }

  // Gaps: expected assortment vs live occupancy.
  const gaps: AssortmentGap[] = [];
  for (const zone of layout.zones) {
    const counts = zoneSkuCount.get(zone.id) ?? new Map<ProductCategory, number>();
    for (const [category, expected] of Object.entries(zone.expectedAssortment) as Array<
      [ProductCategory, number]
    >) {
      const actual = counts.get(category) ?? 0;
      if (actual < expected) gaps.push({ zoneId: zone.id, category, expected, actual });
    }
  }

  // Adjacency violations per brand standards.
  const adjacency: AdjacencyViolation[] = [];
  for (let i = 0; i < layout.zones.length; i++) {
    for (let j = i + 1; j < layout.zones.length; j++) {
      const a = layout.zones[i];
      const b = layout.zones[j];
      if (!zonesAdjacent(a, b)) continue;
      for (const rule of ADJACENCY_RULES) {
        const match =
          (a.kind === rule.a && b.kind === rule.b) || (a.kind === rule.b && b.kind === rule.a);
        if (match) {
          adjacency.push({ zoneA: a.id, zoneB: b.id, rule: rule.rule, severity: rule.severity });
        }
      }
    }
  }

  // Zone rows.
  const zones: ZoneAnalytics[] = layout.zones.map((zone) => {
    const area = Math.max(polygonArea(zone.polygon), 1);
    const totals = zoneSlotTotals.get(zone.id) ?? { total: 0, healthy: 0 };
    const trafficJitter = rng.range(0.9, 1.1);
    return {
      zoneId: zone.id,
      revenuePerSqm: Math.round(((zoneRevenue.get(zone.id) ?? 0) * 30) / area),
      trafficShare: Math.min(1, TRAFFIC_WEIGHT[zone.kind] * trafficJitter),
      dwellSeconds: Math.round(DWELL_BASE[zone.kind] * rng.range(0.85, 1.2)),
      stockCoverage: totals.total ? totals.healthy / totals.total : 0,
      gapCount: gaps.filter((g) => g.zoneId === zone.id).length,
      adjacencyFlags: adjacency.filter((v) => v.zoneA === zone.id || v.zoneB === zone.id).length,
    };
  });

  // Traffic paths: entrance → each zone, ranked by traffic share.
  const entrance = layout.zones.find((z) => z.kind === "entrance") ?? layout.zones[0];
  const paths: TrafficPath[] = [];
  if (entrance) {
    const [ex, ez] = polygonCentroid(entrance.polygon);
    for (const zone of layout.zones) {
      if (zone.id === entrance.id) continue;
      const za = zones.find((z) => z.zoneId === zone.id);
      const [cx, cz] = polygonCentroid(zone.polygon);
      // Quadratic Bézier bowed sideways for an organic walk line.
      const mx = (ex + cx) / 2 + rng.range(-1.6, 1.6);
      const mz = (ez + cz) / 2 + rng.range(-1.6, 1.6);
      paths.push({
        points: [
          [ex, ez],
          [mx, mz],
          [cx, cz],
        ],
        intensity: za?.trafficShare ?? 0.3,
      });
    }
  }

  return {
    layoutId: layout.id,
    generatedAt: new Date().toISOString(),
    isMock: true,
    zones,
    paths,
    gaps,
    adjacency,
  };
}
