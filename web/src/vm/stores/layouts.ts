/**
 * Authored boutique layouts — implemented to the Aurelle VM playbook.
 *
 * TIER 1 — Flagship Maison (8 zones): Prince's Building HK, Tokyo Ginza Mansion
 * TIER 2 — Flagship (6 zones):        Beijing Flagship, Seoul Flagship
 *
 * The journey is choreographed: Arrival + fragrance → Fine Jewellery islands
 * (central-front) → Watches on the RIGHT (east wall) → High Jewellery pedestal
 * gallery at the back (deepest, carpet, low ambient) → VIC Consultation / HJ
 * Private Salon. Wall vitrines are placed first and face into the room; islands
 * anchor zone centres; the cash-wrap is mid-depth to one side; seating always
 * faces product. The 1.2 m Aurelle aisle minimum is respected (AisleGuard).
 *
 * Coordinates: floor centred at origin, x → east (client's RIGHT on entry),
 * z → south (the shopfront / entry is the +z wall). Deterministic by store id.
 */

import { Rng, hashString } from "../core/Seed";
import { skusForCategory } from "../data/catalog";
import type {
  BoutiqueLayout,
  BoutiqueTheme,
  FixtureInstance,
  Planogram,
  ProductCategory,
  SlotKey,
  SlotState,
  VelvetPalette,
  ZoneConfig,
  ZoneFloor,
  ZoneKind,
} from "../data/types";
import { slotKey } from "../data/types";
import { templateOf } from "../fixtures/FixtureCatalog";

// ───────────────────────────── helpers ─────────────────────────────

const DEG = Math.PI / 180;

function fx(
  rng: Rng,
  templateId: string,
  x: number,
  z: number,
  rotDeg: number,
  zoneId: string,
): FixtureInstance {
  const t = templateOf(templateId);
  return {
    id: `${zoneId}-${templateId}-${rng.int(1000, 9999)}`,
    templateId,
    zoneId,
    x,
    z,
    rotationY: rotDeg * DEG,
    dims: { ...t.dims.default },
    finish: t.finish,
    variationSeed: rng.int(1, 0x7fffffff),
  };
}

const VELVET = {
  navy: { baseColor: "#1c2740", hueJitterDeg: 5, valueJitter: 0.08 },
  charcoal: { baseColor: "#2b2b30", hueJitterDeg: 4, valueJitter: 0.07 },
  cream: { baseColor: "#e8dcc8", hueJitterDeg: 4, valueJitter: 0.06 },
  ivory: { baseColor: "#f0e9dc", hueJitterDeg: 3, valueJitter: 0.05 },
} as const;

// Per-zone defaults — colour, floor material, lighting temperature + preset.
interface ZoneDefault {
  color: string;
  floor: ZoneFloor;
  cct: number;
  preset: string;
}

const ZONE_DEFAULTS: Record<ZoneKind, ZoneDefault> = {
  entrance: { color: "#b8965a", floor: "marble", cct: 2900, preset: "PRESET-ARRIVAL-2900K" },
  "fine-jewelry": { color: "#c98a6a", floor: "marble", cct: 3000, preset: "PRESET-FJ-3000K" },
  watches: { color: "#1c2740", floor: "parquet", cct: 4000, preset: "PRESET-WATCH-4000K" },
  accessories: { color: "#2d5a3d", floor: "marble", cct: 3000, preset: "PRESET-FJ-3000K" },
  consultation: { color: "#6b4a8a", floor: "carpet", cct: 2700, preset: "PRESET-LOUNGE-2700K-LOW" },
  "high-jewelry": { color: "#8b1a2b", floor: "carpet", cct: 2700, preset: "PRESET-HJ-2700K-HIGH" },
  vip: { color: "#5a3d6b", floor: "carpet", cct: 2800, preset: "PRESET-SALON-ADJUSTABLE" },
  service: { color: "#8a6a3a", floor: "marble", cct: 3000, preset: "PRESET-FJ-3000K" },
};

function zone(
  id: string,
  name: string,
  kind: ZoneKind,
  polygon: Array<[number, number]>,
  velvet: VelvetPalette,
  expectedAssortment: Partial<Record<ProductCategory, number>>,
  overrides?: Partial<Pick<ZoneConfig, "floorMaterial" | "cct" | "color">>,
): ZoneConfig {
  const d = ZONE_DEFAULTS[kind];
  return {
    id,
    name,
    kind,
    polygon,
    velvet,
    expectedAssortment,
    color: overrides?.color ?? d.color,
    floorMaterial: overrides?.floorMaterial ?? d.floor,
    cct: overrides?.cct ?? d.cct,
    lightingPreset: d.preset,
  };
}

// ───────────────────────────── Architecture themes ─────────────────────────────
// Fixtures are brand-standard network-wide; the shell is local to each maison.

const THEMES: Record<string, BoutiqueTheme> = {
  hk: {
    id: "hk",
    marble: { field: "#ece7dd", cloud: "#dccfba", vein: "#b19a76", goldVein: "#c6a468" },
    wallField: "#e2dac9",
    wallStyle: "smooth",
    wainscotA: "#c8a96c",
    wainscotB: "#c2a366",
    wainscotStyle: "quilted",
    columnColor: "#d9c79f",
    rugColor: "#d2c6b0",
    floorStyle: "swirl-marble",
    floorWood: "#b98d54",
    ceilingStyle: "organic-oval",
    ceilingGlow: "#ffcf94",
    chandelier: "gold-petal",
    muralMotif: "panther",
    muralPalette: ["#efe6d6", "#c9784f", "#9aa0a6", "#c6a468"],
    accentUpholstery: ["#b5613a", "#c98a3a", "#6d7b52"],
  },
  bj: {
    id: "bj",
    marble: { field: "#ece3d0", cloud: "#d8c6a0", vein: "#b0946a", goldVein: "#c39a52" },
    wallField: "#e6dcc6",
    wallStyle: "smooth",
    wainscotA: "#d8cbb0",
    wainscotB: "#d2c3a4",
    wainscotStyle: "quilted",
    columnColor: "#cbb488",
    rugColor: "#cbb78c",
    floorStyle: "herringbone-oak",
    floorWood: "#bd9256",
    ceilingStyle: "gold-dome",
    ceilingGlow: "#ffbf6e",
    chandelier: "gold-petal",
    muralMotif: "cherry-blossom",
    muralPalette: ["#efe7d5", "#d98aa0", "#7a5240", "#c39a52"],
    accentUpholstery: ["#c9a13a", "#b5533a", "#5f7350", "#7a2f38"],
  },
  seoul: {
    id: "seoul",
    marble: { field: "#e7ddc8", cloud: "#d2c2a2", vein: "#a88f6a", goldVein: "#b6975f" },
    wallField: "#e4dac4",
    wallStyle: "travertine",
    wainscotA: "#d8ccb2",
    wainscotB: "#d0c3a6",
    wainscotStyle: "travertine",
    columnColor: "#d7c8a8",
    rugColor: "#bab4a6",
    floorStyle: "herringbone-oak",
    floorWood: "#b98a50",
    ceilingStyle: "organic-oval",
    ceilingGlow: "#ffd6a0",
    chandelier: "crystal-cascade",
    muralMotif: "marquetry-sunburst",
    muralPalette: ["#c39a5e", "#a9793f", "#8a5c2c", "#d8b878"],
    accentUpholstery: ["#2f3d5c", "#7a5236", "#5c5f52"],
  },
  tokyo: {
    id: "tokyo",
    marble: { field: "#edeae2", cloud: "#dcd6c8", vein: "#bcb4a2", goldVein: "#c6b48c" },
    wallField: "#e7e0d2",
    wallStyle: "fluted",
    wainscotA: "#dfd7c6",
    wainscotB: "#d8cfba",
    wainscotStyle: "fluted",
    columnColor: "#cba874",
    rugColor: "#bfbca4",
    floorStyle: "pale-marble",
    floorWood: "#7a5230",
    ceilingStyle: "amorphous",
    ceilingGlow: "#ffe0b4",
    chandelier: "none",
    muralMotif: "bamboo",
    muralPalette: ["#5f7a5a", "#8fa585", "#e7ecdf", "#c6a468"],
    accentUpholstery: ["#b5613a", "#6f7d55", "#8a8f7a"],
  },
};

// Which categories each zone kind prefers when auto-merchandising.
const ZONE_PREFS: Record<ZoneKind, ProductCategory[]> = {
  entrance: ["fragrance", "fragrance", "leather-goods"],
  "fine-jewelry": ["rings", "bracelets", "necklaces", "earrings"],
  watches: ["watches-dress", "watches-sport"],
  accessories: ["leather-goods", "leather-goods", "fragrance"],
  consultation: ["rings", "necklaces", "bracelets"],
  "high-jewelry": ["necklaces", "rings", "earrings", "brooches"],
  vip: ["necklaces", "rings", "brooches"],
  service: ["leather-goods"],
};

// ───────────────────────────── Tier 1 — Prince's Building, Hong Kong ─────────────────────────────

function princesBuildingHK(): BoutiqueLayout {
  const rng = new Rng(hashString("aurelle-hk-princes"));
  const W = 20;
  const D = 16;

  const zones: ZoneConfig[] = [
    zone("hk-arrival", "The Arrival", "entrance", [[-10, 5.2], [10, 5.2], [10, 8], [-10, 8]], VELVET.ivory, { fragrance: 2 }),
    zone("hk-fine", "Fine Jewellery", "fine-jewelry", [[-10, 1.8], [10, 1.8], [10, 5.2], [-10, 5.2]], VELVET.cream, { rings: 6, bracelets: 4, necklaces: 4, earrings: 2 }),
    zone("hk-watches", "Watches", "watches", [[3.8, -3.4], [10, -3.4], [10, 1.8], [3.8, 1.8]], VELVET.navy, { "watches-dress": 8, "watches-sport": 6 }),
    zone("hk-leather", "Leather & Accessories", "accessories", [[-10, -0.4], [-4, -0.4], [-4, 1.8], [-10, 1.8]], VELVET.charcoal, { "leather-goods": 8, fragrance: 3 }, { floorMaterial: "parquet" }),
    zone("hk-cashwrap", "Cash-Wrap", "service", [[-10, -3.4], [-5, -3.4], [-5, -0.4], [-10, -0.4]], VELVET.charcoal, {}),
    zone("hk-consult", "VIC Consultation Lounge", "consultation", [[-10, -8], [-3.2, -8], [-3.2, -3.4], [-10, -3.4]], VELVET.cream, { rings: 2, necklaces: 1 }),
    zone("hk-hj", "High Jewellery Gallery", "high-jewelry", [[-3.2, -8], [3.8, -8], [3.8, -3.4], [-3.2, -3.4]], VELVET.cream, { necklaces: 3, rings: 3, earrings: 2, brooches: 2 }),
    zone("hk-salon", "HJ Private Salon", "vip", [[3.8, -8], [10, -8], [10, -3.4], [3.8, -3.4]], VELVET.cream, { rings: 2, necklaces: 2 }),
  ];

  const fixtures: FixtureInstance[] = [
    // ── The Arrival — symmetrical gateway tables, fragrance, no showcases ──
    fx(rng, "display-table-round", -4.2, 6.5, 0, "hk-arrival"),
    fx(rng, "display-table-round", 3.0, 6.5, 0, "hk-arrival"),
    fx(rng, "light-track", 0, 6.8, 0, "hk-arrival"),
    fx(rng, "light-accent", -4.2, 6.5, 0, "hk-arrival"),
    fx(rng, "light-accent", 3.0, 6.5, 0, "hk-arrival"),

    // ── Fine Jewellery — V-formation grand islands + side-wall vitrines ──
    fx(rng, "showcase-island-180", -3.6, 3.8, 12, "hk-fine"),
    fx(rng, "showcase-island-180", 2.4, 3.8, -12, "hk-fine"),
    fx(rng, "showcase-wall-160", -9.6, 3.6, 90, "hk-fine"),
    fx(rng, "showcase-wall-160", 9.6, 3.6, -90, "hk-fine"),
    fx(rng, "showcase-low-90", -0.6, 5.0, 0, "hk-fine"),
    fx(rng, "light-track", 0, 3.8, 0, "hk-fine"),

    // ── Watches — dedicated watch wall on the RIGHT (east) + hero island ──
    fx(rng, "showcase-wall-watch", 9.6, 0.6, -90, "hk-watches"),
    fx(rng, "showcase-wall-watch", 9.6, -1.6, -90, "hk-watches"),
    fx(rng, "showcase-island-120", 7.4, 0.7, 0, "hk-watches"),
    fx(rng, "showcase-tower", 4.6, 1.1, 0, "hk-watches"),
    fx(rng, "counter-service", 5.2, -2.6, 90, "hk-watches"),
    fx(rng, "seating-chair", 6.5, -2.6, -90, "hk-watches"),
    fx(rng, "seating-chair", 6.5, -1.4, -90, "hk-watches"),
    fx(rng, "light-track", 7.5, -0.4, 0, "hk-watches"),

    // ── Leather & Accessories — left wall, shelving + table ──
    fx(rng, "wall-shelving", -9.7, 0.6, 90, "hk-leather"),
    fx(rng, "display-table-rect", -7.0, 0.5, 0, "hk-leather"),
    fx(rng, "light-recessed", -7.6, 0.6, 0, "hk-leather"),

    // ── Cash-Wrap — recessed to the left, mid-depth, parallel to entry axis ──
    fx(rng, "counter-cashwrap", -9.4, -1.8, 90, "hk-cashwrap"),
    fx(rng, "light-recessed", -8.4, -1.8, 0, "hk-cashwrap"),

    // ── VIC Consultation Lounge — semi-private room: curved sofa + jewel
    //    armchairs around a bronze coffee table, appointment case, SA counter ──
    fx(rng, "seating-sofa-curved", -6.2, -7.0, 0, "hk-consult"),
    fx(rng, "seating-chair", -7.6, -4.3, 155, "hk-consult"),
    fx(rng, "seating-chair", -5.2, -4.3, 205, "hk-consult"),
    fx(rng, "showcase-low-90", -9.3, -4.2, 90, "hk-consult"),
    fx(rng, "counter-service", -9.0, -7.0, 90, "hk-consult"),
    fx(rng, "light-recessed", -6.6, -5.7, 0, "hk-consult"),

    // ── High Jewellery Gallery — pedestals only, no islands, rear-wall vitrines ──
    fx(rng, "showcase-wall-160", -2.4, -7.6, 0, "hk-hj"),
    fx(rng, "showcase-wall-160", 3.0, -7.6, 0, "hk-hj"),
    fx(rng, "pedestal-solo", -2.4, -5.2, 0, "hk-hj"),
    fx(rng, "pedestal-solo", 0.4, -4.6, 0, "hk-hj"),
    fx(rng, "pedestal-solo", 2.6, -5.4, 0, "hk-hj"),
    fx(rng, "pedestal-duo", 0.2, -6.4, 0, "hk-hj"),
    fx(rng, "light-accent", -2.4, -5.2, 0, "hk-hj"),
    fx(rng, "light-accent", 0.4, -4.6, 0, "hk-hj"),
    fx(rng, "light-accent", 2.6, -5.4, 0, "hk-hj"),

    // ── HJ Private Salon — enclosed jewel box: curved sofa lounge + hero pedestal ──
    fx(rng, "seating-sofa-curved", 6.6, -7.0, 0, "hk-salon"),
    fx(rng, "seating-chair", 5.6, -4.3, 155, "hk-salon"),
    fx(rng, "seating-chair", 7.4, -4.3, 205, "hk-salon"),
    fx(rng, "pedestal-solo", 9.3, -3.6, 0, "hk-salon"),
    fx(rng, "counter-service", 9.3, -6.8, 90, "hk-salon"),
    fx(rng, "light-accent", 6.9, -5.7, 0, "hk-salon"),
  ];

  return {
    id: "hk-princes",
    name: "Prince's Building, Hong Kong",
    market: "Hong Kong SAR",
    tier: "tier1",
    theme: THEMES.hk,
    floor: {
      width: W,
      depth: D,
      ceilingHeight: 4.2,
      apertures: [
        { wall: "south", offset: 8.2, width: 2.4, height: 2.9, sill: 0, kind: "door" },
        { wall: "south", offset: 1.6, width: 5.6, height: 3.2, sill: 0.35, kind: "shopfront" },
        { wall: "south", offset: 12.8, width: 5.6, height: 3.2, sill: 0.35, kind: "shopfront" },
        { wall: "east", offset: 11.5, width: 2.6, height: 2.6, sill: 0.8, kind: "window" },
      ],
      columns: [
        { x: -4, z: 3.4, size: 0.5 },
        { x: 4, z: 3.4, size: 0.5 },
      ],
    },
    zones,
    fixtures,
  };
}

// ───────────────────────────── Tier 1 — Tokyo Ginza Mansion ─────────────────────────────
// Narrow, deep Ginza plot — the choreographed journey reads as a vertical
// promenade front-to-back.

function tokyoGinza(): BoutiqueLayout {
  const rng = new Rng(hashString("aurelle-tokyo-ginza"));
  const W = 13;
  const D = 19;

  const zones: ZoneConfig[] = [
    zone("tk-arrival", "The Arrival", "entrance", [[-6.5, 6.2], [6.5, 6.2], [6.5, 9.5], [-6.5, 9.5]], VELVET.ivory, { fragrance: 2 }),
    zone("tk-fine", "Fine Jewellery", "fine-jewelry", [[-6.5, 2.4], [6.5, 2.4], [6.5, 6.2], [-6.5, 6.2]], VELVET.cream, { rings: 5, bracelets: 3, necklaces: 3, earrings: 2 }),
    zone("tk-watches", "Watches", "watches", [[0.5, -3.4], [6.5, -3.4], [6.5, 2.4], [0.5, 2.4]], VELVET.navy, { "watches-dress": 7, "watches-sport": 5 }),
    zone("tk-leather", "Leather & Accessories", "accessories", [[-6.5, -0.6], [0.5, -0.6], [0.5, 2.4], [-6.5, 2.4]], VELVET.charcoal, { "leather-goods": 7, fragrance: 3 }, { floorMaterial: "parquet" }),
    zone("tk-cashwrap", "Cash-Wrap", "service", [[-6.5, -3.4], [-2.5, -3.4], [-2.5, -0.6], [-6.5, -0.6]], VELVET.charcoal, {}),
    zone("tk-consult", "VIC Consultation Lounge", "consultation", [[-6.5, -9.5], [-1, -9.5], [-1, -3.4], [-6.5, -3.4]], VELVET.cream, { rings: 2, necklaces: 1 }),
    zone("tk-hj", "High Jewellery Gallery", "high-jewelry", [[-1, -9.5], [6.5, -9.5], [6.5, -6], [-1, -6]], VELVET.cream, { necklaces: 3, rings: 3, earrings: 2, brooches: 2 }),
    zone("tk-salon", "HJ Private Salon", "vip", [[-1, -6], [6.5, -6], [6.5, -3.4], [-1, -3.4]], VELVET.cream, { rings: 2, necklaces: 2 }),
  ];

  const fixtures: FixtureInstance[] = [
    // Arrival — single gateway table (narrow façade), fragrance
    fx(rng, "display-table-round", 0, 8.1, 0, "tk-arrival"),
    fx(rng, "light-track", 0, 8.4, 0, "tk-arrival"),
    fx(rng, "light-accent", 0, 8.1, 0, "tk-arrival"),

    // Fine Jewellery — V islands + side-wall vitrines
    fx(rng, "showcase-island-180", -2.6, 4.3, 14, "tk-fine"),
    fx(rng, "showcase-island-120", 2.8, 4.5, -14, "tk-fine"),
    fx(rng, "showcase-wall-160", -6.1, 4.4, 90, "tk-fine"),
    fx(rng, "showcase-wall-160", 6.1, 4.4, -90, "tk-fine"),
    fx(rng, "showcase-low-90", 0.1, 5.9, 0, "tk-fine"),
    fx(rng, "light-track", 0, 4.3, 0, "tk-fine"),

    // Watches — watch wall on the RIGHT (east), hero island, tower marker.
    // (The narrow Ginza plot hosts watch consultation at the hero island —
    // a dedicated SA counter would break the 1.2 m aisle to the salon behind.)
    fx(rng, "showcase-wall-watch", 6.1, 0.6, -90, "tk-watches"),
    fx(rng, "showcase-wall-watch", 6.1, -1.6, -90, "tk-watches"),
    fx(rng, "showcase-island-120", 4.0, 0.8, 0, "tk-watches"),
    fx(rng, "showcase-tower", 1.4, 1.2, 0, "tk-watches"),
    fx(rng, "seating-chair", 2.2, -2.6, -90, "tk-watches"),
    fx(rng, "seating-chair", 3.5, -2.6, -90, "tk-watches"),
    fx(rng, "light-track", 4.0, -0.4, 0, "tk-watches"),

    // Leather — left wall
    fx(rng, "wall-shelving", -6.25, 0.6, 90, "tk-leather"),
    fx(rng, "display-table-rect", -3.6, 0.5, 90, "tk-leather"),
    fx(rng, "light-recessed", -4.4, 0.6, 0, "tk-leather"),

    // Cash-Wrap — left, mid-depth
    fx(rng, "counter-cashwrap", -5.9, -2.0, 90, "tk-cashwrap"),
    fx(rng, "light-recessed", -4.8, -2.0, 0, "tk-cashwrap"),

    // VIC Consultation — semi-private room: curved sofa + jewel armchairs
    fx(rng, "seating-sofa-curved", -3.75, -7.8, 0, "tk-consult"),
    fx(rng, "seating-chair", -4.9, -5.2, 150, "tk-consult"),
    fx(rng, "seating-chair", -2.6, -5.2, 210, "tk-consult"),
    fx(rng, "showcase-low-90", -6.0, -8.6, 0, "tk-consult"),
    fx(rng, "counter-service", -6.0, -4.4, 90, "tk-consult"),
    fx(rng, "light-recessed", -3.75, -6.45, 0, "tk-consult"),

    // High Jewellery Gallery — deepest, pedestals only, rear-wall vitrines
    fx(rng, "showcase-wall-160", 0.6, -9.15, 0, "tk-hj"),
    fx(rng, "showcase-wall-160", 4.6, -9.15, 0, "tk-hj"),
    fx(rng, "pedestal-solo", 0.6, -6.8, 0, "tk-hj"),
    fx(rng, "pedestal-solo", 3.0, -7.2, 0, "tk-hj"),
    fx(rng, "pedestal-duo", 5.2, -6.8, 0, "tk-hj"),
    fx(rng, "light-accent", 0.6, -6.8, 0, "tk-hj"),
    fx(rng, "light-accent", 3.0, -7.2, 0, "tk-hj"),
    fx(rng, "light-accent", 5.2, -6.8, 0, "tk-hj"),

    // HJ Private Salon — jewel box: curved sofa lounge + hero pedestal
    fx(rng, "seating-sofa-curved", 2.6, -5.4, 0, "tk-salon"),
    fx(rng, "seating-chair", 1.2, -3.8, 180, "tk-salon"),
    fx(rng, "seating-chair", 4.0, -3.8, 180, "tk-salon"),
    fx(rng, "pedestal-solo", 5.9, -4.2, 0, "tk-salon"),
    fx(rng, "light-accent", 2.75, -4.7, 0, "tk-salon"),
  ];

  return {
    id: "tokyo-ginza",
    name: "Tokyo Ginza Mansion",
    market: "Japan",
    tier: "tier1",
    theme: THEMES.tokyo,
    floor: {
      width: W,
      depth: D,
      ceilingHeight: 3.8,
      apertures: [
        { wall: "south", offset: 5.1, width: 2.8, height: 3.0, sill: 0, kind: "door" },
        { wall: "south", offset: 0.8, width: 3.6, height: 3.2, sill: 0.25, kind: "shopfront" },
        { wall: "south", offset: 8.6, width: 3.6, height: 3.2, sill: 0.25, kind: "shopfront" },
        { wall: "east", offset: 15.0, width: 2.4, height: 2.2, sill: 0.8, kind: "window" },
      ],
      columns: [
        { x: -3.2, z: 3.0, size: 0.45 },
        { x: 3.2, z: 3.0, size: 0.45 },
      ],
    },
    zones,
    fixtures,
  };
}

// ───────────────────────────── Tier 2 — Beijing Flagship ─────────────────────────────
// 6 zones — HJ is a semi-enclosed gallery with an in-zone consultation nook
// (no separate private salon at this tier).

function beijingFlagship(): BoutiqueLayout {
  const rng = new Rng(hashString("aurelle-beijing-flagship"));
  const W = 18;
  const D = 16.5;

  const zones: ZoneConfig[] = [
    zone("bj-arrival", "Arrival & Fragrance", "entrance", [[-9, 5], [9, 5], [9, 8.25], [-9, 8.25]], VELVET.ivory, { fragrance: 2 }),
    zone("bj-fine", "Fine Jewellery", "fine-jewelry", [[-9, 0.5], [9, 0.5], [9, 5], [-9, 5]], VELVET.cream, { rings: 5, bracelets: 3, necklaces: 3 }),
    zone("bj-watches", "Watches", "watches", [[3.5, -3.5], [9, -3.5], [9, 0.5], [3.5, 0.5]], VELVET.navy, { "watches-dress": 7, "watches-sport": 5 }),
    zone("bj-leather", "Leather & Accessories", "accessories", [[-9, -1.5], [-3.5, -1.5], [-3.5, 0.5], [-9, 0.5]], VELVET.charcoal, { "leather-goods": 7, fragrance: 3 }),
    zone("bj-hj", "High Jewellery Gallery", "high-jewelry", [[-3.5, -8.25], [9, -8.25], [9, -3.5], [-3.5, -3.5]], VELVET.cream, { necklaces: 3, rings: 3, earrings: 2, brooches: 2 }),
    zone("bj-cashwrap", "Cash-Wrap & Service", "service", [[-9, -8.25], [-3.5, -8.25], [-3.5, -1.5], [-9, -1.5]], VELVET.charcoal, {}),
  ];

  const fixtures: FixtureInstance[] = [
    // Arrival — one table (space does not allow a symmetrical pair at this tier)
    fx(rng, "display-table-round", -4.4, 6.4, 0, "bj-arrival"),
    fx(rng, "light-track", 0, 6.8, 0, "bj-arrival"),
    fx(rng, "light-accent", -4.4, 6.4, 0, "bj-arrival"),

    // Fine Jewellery — hero + secondary island, one side-wall vitrine, low-case boundary
    fx(rng, "showcase-island-180", -2.0, 3.2, 10, "bj-fine"),
    fx(rng, "showcase-island-120", 1.8, 2.0, -8, "bj-fine"),
    fx(rng, "showcase-wall-160", -8.6, 3.0, 90, "bj-fine"),
    fx(rng, "showcase-low-90", 6.0, 4.2, 0, "bj-fine"),
    fx(rng, "light-track", -1.0, 2.6, 0, "bj-fine"),

    // Watches — watch wall RIGHT (east), tower marker, SA counter + chairs
    fx(rng, "showcase-wall-watch", 8.6, -0.4, -90, "bj-watches"),
    fx(rng, "showcase-wall-watch", 8.6, -2.6, -90, "bj-watches"),
    fx(rng, "showcase-tower", 4.4, 0.0, 0, "bj-watches"),
    fx(rng, "counter-service", 5.2, -2.8, 90, "bj-watches"),
    fx(rng, "seating-chair", 6.4, -2.4, -90, "bj-watches"),
    fx(rng, "seating-chair", 6.4, -1.2, -90, "bj-watches"),
    fx(rng, "light-track", 6.8, -1.4, 0, "bj-watches"),

    // Leather — left wall
    fx(rng, "wall-shelving", -8.6, -0.4, 90, "bj-leather"),
    fx(rng, "display-table-rect", -6.0, -0.5, 0, "bj-leather"),
    fx(rng, "light-recessed", -6.6, -0.5, 0, "bj-leather"),

    // High Jewellery Gallery — pedestals + rear vitrine + low-case + consultation nook
    fx(rng, "showcase-wall-160", 5.0, -7.9, 0, "bj-hj"),
    fx(rng, "pedestal-solo", 5.5, -5.4, 0, "bj-hj"),
    fx(rng, "pedestal-solo", 7.5, -5.6, 0, "bj-hj"),
    fx(rng, "pedestal-duo", 3.2, -5.4, 0, "bj-hj"),
    // Consultation nook (semi-private): curved sofa + jewel chairs, screened
    // from the gallery by a partition run (Tier 2 has no separate salon).
    fx(rng, "showcase-low-90", -3.2, -4.0, 0, "bj-hj"),
    fx(rng, "seating-sofa-curved", -1.5, -7.4, 0, "bj-hj"),
    fx(rng, "seating-chair", -2.6, -5.2, 150, "bj-hj"),
    fx(rng, "seating-chair", -0.4, -5.2, 210, "bj-hj"),
    fx(rng, "wall-paneling", 1.0, -6.2, 90, "bj-hj"),
    fx(rng, "light-accent", 5.5, -5.4, 0, "bj-hj"),
    fx(rng, "light-accent", -1.5, -6.4, 0, "bj-hj"),

    // Cash-Wrap & Service — left, mid-to-rear, doubles as packaging station
    fx(rng, "counter-cashwrap", -8.4, -3.0, 90, "bj-cashwrap"),
    fx(rng, "counter-service", -8.4, -5.6, 90, "bj-cashwrap"),
    fx(rng, "wall-paneling", -6.2, -8.05, 0, "bj-cashwrap"),
    fx(rng, "light-recessed", -6.5, -4.5, 0, "bj-cashwrap"),
  ];

  return {
    id: "bj-flagship",
    name: "Beijing Flagship",
    market: "Chinese Mainland",
    tier: "tier2",
    theme: THEMES.bj,
    floor: {
      width: W,
      depth: D,
      ceilingHeight: 4.5,
      apertures: [
        { wall: "south", offset: 7.6, width: 2.8, height: 3.1, sill: 0, kind: "door" },
        { wall: "south", offset: 1.2, width: 5.2, height: 3.4, sill: 0.3, kind: "shopfront" },
        { wall: "south", offset: 11.6, width: 5.2, height: 3.4, sill: 0.3, kind: "shopfront" },
      ],
      columns: [
        { x: -2.5, z: 2.0, size: 0.55 },
        { x: 4, z: 2.0, size: 0.55 },
      ],
    },
    zones,
    fixtures,
  };
}

// ───────────────────────────── Tier 2 — Seoul Flagship ─────────────────────────────
// Wide, shallow plate — the journey compresses front-to-back but keeps the
// watch wall on the right and HJ across the back.

function seoulFlagship(): BoutiqueLayout {
  const rng = new Rng(hashString("aurelle-seoul-flagship"));
  const W = 22;
  const D = 14;

  const zones: ZoneConfig[] = [
    zone("se-arrival", "Arrival & Fragrance", "entrance", [[-11, 4.5], [11, 4.5], [11, 7], [-11, 7]], VELVET.ivory, { fragrance: 2 }),
    zone("se-fine", "Fine Jewellery", "fine-jewelry", [[-11, 0.5], [11, 0.5], [11, 4.5], [-11, 4.5]], VELVET.cream, { rings: 5, bracelets: 3, necklaces: 3 }),
    zone("se-watches", "Watches", "watches", [[5, -3], [11, -3], [11, 0.5], [5, 0.5]], VELVET.navy, { "watches-dress": 7, "watches-sport": 5 }),
    zone("se-leather", "Leather & Accessories", "accessories", [[-11, -1.5], [-5, -1.5], [-5, 0.5], [-11, 0.5]], VELVET.charcoal, { "leather-goods": 7, fragrance: 3 }),
    zone("se-hj", "High Jewellery Gallery", "high-jewelry", [[-4, -7], [11, -7], [11, -3], [-4, -3]], VELVET.cream, { necklaces: 3, rings: 3, earrings: 2, brooches: 2 }),
    zone("se-cashwrap", "Cash-Wrap & Service", "service", [[-11, -7], [-4, -7], [-4, -1.5], [-11, -1.5]], VELVET.charcoal, {}),
  ];

  const fixtures: FixtureInstance[] = [
    // Arrival
    fx(rng, "display-table-round", -5.4, 5.6, 0, "se-arrival"),
    fx(rng, "display-table-round", 5.4, 5.6, 0, "se-arrival"),
    fx(rng, "light-track", 0, 6.0, 0, "se-arrival"),
    fx(rng, "light-accent", -5.4, 5.6, 0, "se-arrival"),

    // Fine Jewellery — hero + secondary island, one side-wall vitrine
    fx(rng, "showcase-island-180", -3.4, 2.4, 10, "se-fine"),
    fx(rng, "showcase-island-120", 2.2, 2.4, -10, "se-fine"),
    fx(rng, "showcase-wall-160", -10.6, 2.4, 90, "se-fine"),
    fx(rng, "showcase-low-90", -0.6, 4.0, 0, "se-fine"),
    fx(rng, "light-track", -0.6, 2.4, 0, "se-fine"),

    // Watches — watch wall RIGHT (east)
    fx(rng, "showcase-wall-watch", 10.6, -0.4, -90, "se-watches"),
    fx(rng, "showcase-wall-watch", 10.6, -2.4, -90, "se-watches"),
    fx(rng, "showcase-tower", 5.2, 0.2, 0, "se-watches"),
    fx(rng, "counter-service", 6.4, -2.5, 90, "se-watches"),
    fx(rng, "seating-chair", 7.6, -2.3, -90, "se-watches"),
    fx(rng, "seating-chair", 7.6, -1.1, -90, "se-watches"),
    fx(rng, "light-track", 8.4, -1.2, 0, "se-watches"),

    // Leather — left wall
    fx(rng, "wall-shelving", -10.6, -0.4, 90, "se-leather"),
    fx(rng, "display-table-rect", -8.0, -0.5, 0, "se-leather"),
    fx(rng, "light-recessed", -8.6, -0.5, 0, "se-leather"),

    // High Jewellery Gallery — pedestals across the back + rear vitrines + nook
    fx(rng, "showcase-wall-160", 2.5, -6.6, 0, "se-hj"),
    fx(rng, "showcase-wall-160", 7.5, -6.6, 0, "se-hj"),
    fx(rng, "pedestal-solo", 3.2, -4.2, 0, "se-hj"),
    fx(rng, "pedestal-solo", 5.0, -5.0, 0, "se-hj"),
    fx(rng, "pedestal-duo", 9.5, -4.4, 0, "se-hj"),
    // Consultation nook (semi-private): curved sofa + jewel chairs + round
    // coffee table, screened from the gallery (Tier 2 has no separate salon).
    fx(rng, "seating-sofa-curved", -1.6, -6.0, 0, "se-hj"),
    fx(rng, "display-table-round", -1.6, -4.5, 0, "se-hj"),
    fx(rng, "seating-chair", -2.9, -3.7, 150, "se-hj"),
    fx(rng, "seating-chair", -0.3, -3.7, 210, "se-hj"),
    fx(rng, "wall-paneling", 1.2, -5.0, 90, "se-hj"),
    fx(rng, "light-accent", 3.2, -4.2, 0, "se-hj"),
    fx(rng, "light-accent", 9.5, -4.4, 0, "se-hj"),

    // Cash-Wrap & Service — left rear
    fx(rng, "counter-cashwrap", -10.4, -3.0, 90, "se-cashwrap"),
    fx(rng, "counter-service", -10.4, -5.2, 90, "se-cashwrap"),
    fx(rng, "wall-paneling", -7.0, -6.85, 0, "se-cashwrap"),
    fx(rng, "light-recessed", -8.0, -4.4, 0, "se-cashwrap"),
  ];

  return {
    id: "seoul-flagship",
    name: "Seoul Flagship",
    market: "South Korea",
    tier: "tier2",
    theme: THEMES.seoul,
    floor: {
      width: W,
      depth: D,
      ceilingHeight: 4.0,
      apertures: [
        { wall: "south", offset: 9.6, width: 2.8, height: 3.0, sill: 0, kind: "door" },
        { wall: "south", offset: 1.5, width: 6.5, height: 3.2, sill: 0.3, kind: "shopfront" },
        { wall: "south", offset: 14.0, width: 6.5, height: 3.2, sill: 0.3, kind: "shopfront" },
        { wall: "west", offset: 9.0, width: 3.0, height: 2.4, sill: 0.9, kind: "window" },
      ],
      columns: [
        { x: -4, z: 2.4, size: 0.5 },
        { x: 4, z: 2.4, size: 0.5 },
      ],
    },
    zones,
    fixtures,
  };
}

// ───────────────────────────── Initial merchandising ─────────────────────────────

export function generateInitialSlots(layout: BoutiqueLayout): Map<SlotKey, SlotState> {
  const rng = new Rng(hashString(`${layout.id}-merch`));
  const slots = new Map<SlotKey, SlotState>();
  const zoneById = new Map(layout.zones.map((z) => [z.id, z]));
  // Stock is a per-SKU inventory signal: every slot holding the same SKU must
  // read the same level (planogram round-trip exactness depends on it).
  const skuStock = new Map<string, number>();

  for (const fixture of layout.fixtures) {
    const grid = templateOf(fixture.templateId).slotGrid;
    if (!grid) continue;
    const zone = zoneById.get(fixture.zoneId);
    const prefs = zone ? ZONE_PREFS[zone.kind] : grid.accepts;
    const usable = prefs.filter((c) => grid.accepts.includes(c));
    const pool = usable.length ? usable : grid.accepts;

    for (let layer = 0; layer < grid.layers; layer++) {
      for (let row = 0; row < grid.rows; row++) {
        for (let col = 0; col < grid.cols; col++) {
          const key = slotKey({ fixtureId: fixture.id, row, col, layer });
          // ~85% fill; unoccupied slots are a signal, not a default (Pillar C —
          // they surface in the assortment-gap overlay).
          if (rng.chance(0.15)) {
            slots.set(key, {
              sku: null,
              stockLevel: 0,
              campaignFlag: false,
              exclusivityTier: "standard",
            });
            continue;
          }
          const category = pool[rng.int(0, pool.length - 1)];
          const candidates = skusForCategory(category);
          const sku = candidates[rng.int(0, candidates.length - 1)];
          let stockLevel = skuStock.get(sku.id);
          if (stockLevel === undefined) {
            // Stock skews healthy with a deliberate low-stock tail for signals.
            const roll = rng.next();
            stockLevel = roll < 0.08 ? 0 : roll < 0.22 ? rng.int(3, 19) : rng.int(35, 100);
            skuStock.set(sku.id, stockLevel);
          }
          slots.set(key, {
            sku: sku.id,
            stockLevel,
            campaignFlag: rng.chance(0.12),
            exclusivityTier: sku.tier,
          });
        }
      }
    }
  }
  return slots;
}

// ───────────────────────────── Template planograms ─────────────────────────────

export function buildTemplatePlanograms(): Planogram[] {
  const rng = new Rng(hashString("aurelle-template-planograms"));
  const out: Planogram[] = [];

  const make = (
    name: string,
    fixtureKind: Planogram["fixtureKind"],
    rows: number,
    cols: number,
    categories: ProductCategory[],
    campaignEvery = 0,
  ): Planogram => {
    const slots: Record<SlotKey, SlotState> = {};
    let i = 0;
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const category = categories[i % categories.length];
        const candidates = skusForCategory(category);
        const sku = candidates[rng.int(0, candidates.length - 1)];
        slots[`*#${row},${col},0`] = {
          sku: sku.id,
          stockLevel: rng.int(55, 100),
          campaignFlag: campaignEvery > 0 && i % campaignEvery === 0,
          exclusivityTier: sku.tier,
        };
        i++;
      }
    }
    return {
      id: `pg-template-${out.length + 1}`,
      name,
      fixtureKind,
      slots,
      createdAt: new Date().toISOString(),
    };
  };

  out.push(
    make("Fine Jewellery — LOVE / Trinity Icons", "showcase-island", 2, 6, [
      "rings",
      "bracelets",
      "necklaces",
      "rings",
      "bracelets",
      "earrings",
    ]),
    make("Watch Wall — FW26 Novelties", "showcase-wall", 3, 4, [
      "watches-dress",
      "watches-sport",
      "watches-dress",
    ]),
    make(
      "Fragrance Library — Standard",
      "wall-shelving",
      4,
      3,
      ["fragrance", "leather-goods", "fragrance"],
      5,
    ),
    make("HJ Salon — Exceptional Pieces", "showcase-low", 2, 3, ["necklaces", "rings", "brooches"]),
    make("Campaign Focus — Icons Push", "showcase-island", 2, 6, ["rings", "necklaces"], 2),
  );

  // Reference baseline planograms per boutique (naming convention
  // LAYOUT-[ID]-[TIER]-[DATE]) — the DiffEngine baseline for the hero island.
  const refs: Array<[string, ProductCategory[]]> = [
    ["LAYOUT-HK1-MAISON-2025Q3", ["rings", "bracelets", "necklaces", "earrings"]],
    ["LAYOUT-TK1-MAISON-2025Q3", ["rings", "necklaces", "bracelets", "earrings"]],
    ["LAYOUT-BJ2-FLAGSHIP-2025Q3", ["rings", "bracelets", "necklaces"]],
    ["LAYOUT-SE2-FLAGSHIP-2025Q3", ["necklaces", "rings", "bracelets"]],
  ];
  for (const [name, cats] of refs) out.push(make(name, "showcase-island", 2, 6, cats));

  return out;
}

// ───────────────────────────── Column-avoidance pass ─────────────────────────────
// Checks every non-ceiling fixture in the layout and nudges it away from any
// structural column it overlaps with.  Called once at layout-build time so that
// authored positions never clip through a pillar.

const COLUMN_CLEARANCE = 0.15; // extra gap (m) beyond the exact AABB touch

function nudgeFixturesOffColumns(layout: BoutiqueLayout): BoutiqueLayout {
  for (const f of layout.fixtures) {
    const t = templateOf(f.templateId);
    if (t.kind.startsWith("light-")) continue; // ceiling rigs don't intersect columns

    const turns = Math.round(f.rotationY / (Math.PI / 2)) % 2 !== 0;
    const halfW = ((turns ? t.dims.default.depth : t.dims.default.width) / 2);
    const halfD = ((turns ? t.dims.default.width : t.dims.default.depth) / 2);

    for (const col of layout.floor.columns) {
      const colHalf = col.size / 2;
      const dx = f.x - col.x;
      const dz = f.z - col.z;
      const overlapX = (halfW + colHalf) - Math.abs(dx);
      const overlapZ = (halfD + colHalf) - Math.abs(dz);

      if (overlapX > 0 && overlapZ > 0) {
        // Nudge along the axis with the smaller overlap (least-disruptive).
        if (overlapX <= overlapZ) {
          f.x += (dx >= 0 ? 1 : -1) * (overlapX + COLUMN_CLEARANCE);
        } else {
          f.z += (dz >= 0 ? 1 : -1) * (overlapZ + COLUMN_CLEARANCE);
        }
        // Snap back to the 0.1 m grid the store uses.
        f.x = Math.round(f.x * 10) / 10;
        f.z = Math.round(f.z * 10) / 10;
      }
    }
  }
  return layout;
}

export const LAYOUTS: BoutiqueLayout[] = [
  princesBuildingHK(),
  tokyoGinza(),
  beijingFlagship(),
  seoulFlagship(),
].map(nudgeFixturesOffColumns);

export function layoutById(id: string | null): BoutiqueLayout {
  const found = LAYOUTS.find((l) => l.id === id);
  return found ?? LAYOUTS[0];
}
