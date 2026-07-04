/**
 * Authored boutique layouts — the two launch flagships:
 *   · Aurelle Prince's Building, Hong Kong (Tier 1, ~320 m²)
 *   · Aurelle Beijing Flagship (Tier 1, ~297 m²)
 *
 * Coordinates: floor centred at origin, x → east, z → south. The shopfront
 * is always the south wall (+z). Layout generation is deterministic: the
 * same store id reproduces the same boutique, merchandising included.
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
  ZoneConfig,
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

const ZONE_COLORS: Record<ZoneKind, string> = {
  entrance: "#b8965a",
  "high-jewelry": "#8b1a2b",
  watches: "#1c2740",
  accessories: "#2d5a3d",
  vip: "#6b4a8a",
  service: "#8a6a3a",
};

// ───────────────────────────── Architecture themes ─────────────────────────────
// Fixtures are brand-standard network-wide; the shell is local to each maison.

const THEMES: Record<string, BoutiqueTheme> = {
  // Prince's Building HK — warm champagne: swirled cream marble, smooth
  // pebbled upper walls with champagne-gold quilted wainscot, an organic
  // oval ceiling cove with a suspended gold flock, coral-panther feature art.
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
  // Beijing — imperial opulence: gold woven dome ceiling with a gold-petal
  // chandelier, cream diamond-quilted walls, cherry-blossom mural, jewel-tone
  // velvet lounge furniture, warm herringbone + gold marble floor.
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
  // Seoul — warm classic: cream travertine walls, oak herringbone floor,
  // crystal chandeliers over a warm cove, marquetry-sunburst feature art,
  // navy/cognac lounge accents. The most restrained, traditional maison.
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
  // Tokyo Ginza — pale organic minimalism: pale cream marble, fluted upper
  // walls, natural reed columns, an amorphous illuminated ceiling cove, sage
  // bamboo feature art, coral/celadon accents. The lightest, airiest maison.
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
  entrance: ["necklaces", "rings", "watches-dress", "fragrance"],
  "high-jewelry": ["rings", "necklaces", "earrings", "bracelets", "brooches"],
  watches: ["watches-dress", "watches-sport"],
  accessories: ["leather-goods", "fragrance"],
  vip: ["rings", "necklaces", "brooches"],
  service: ["leather-goods"],
};

// ───────────────────────────── Prince's Building, Hong Kong ─────────────────────────────

function princesBuildingHK(): BoutiqueLayout {
  const rng = new Rng(hashString("aurelle-hk-princes"));
  const W = 20;
  const D = 16;

  const zones: ZoneConfig[] = [
    {
      id: "hk-entrance",
      name: "Entrance Gallery",
      kind: "entrance",
      polygon: [
        [-10, 4.5],
        [10, 4.5],
        [10, 8],
        [-10, 8],
      ],
      color: ZONE_COLORS.entrance,
      velvet: VELVET.ivory,
      expectedAssortment: { necklaces: 2, rings: 2, fragrance: 1 },
    },
    {
      id: "hk-high-jewelry",
      name: "High Jewelry Salon",
      kind: "high-jewelry",
      polygon: [
        [-4, -4],
        [2, -4],
        [2, 4.5],
        [-4, 4.5],
      ],
      color: ZONE_COLORS["high-jewelry"],
      velvet: VELVET.cream,
      expectedAssortment: { rings: 6, necklaces: 4, earrings: 3, bracelets: 3, brooches: 2 },
    },
    {
      id: "hk-watches",
      name: "Watch Atelier",
      kind: "watches",
      polygon: [
        [2, -2],
        [10, -2],
        [10, 4.5],
        [2, 4.5],
      ],
      color: ZONE_COLORS.watches,
      velvet: VELVET.navy,
      expectedAssortment: { "watches-dress": 8, "watches-sport": 6 },
    },
    {
      id: "hk-accessories",
      name: "Accessories Gallery",
      kind: "accessories",
      polygon: [
        [-10, -4],
        [-4, -4],
        [-4, 4.5],
        [-10, 4.5],
      ],
      color: ZONE_COLORS.accessories,
      velvet: VELVET.charcoal,
      expectedAssortment: { "leather-goods": 10, fragrance: 6 },
    },
    {
      id: "hk-vip",
      name: "VIP Salon Privé",
      kind: "vip",
      polygon: [
        [-10, -8],
        [-3, -8],
        [-3, -4],
        [-10, -4],
      ],
      color: ZONE_COLORS.vip,
      velvet: VELVET.cream,
      expectedAssortment: { rings: 2, necklaces: 1 },
    },
    {
      id: "hk-service",
      name: "Client Services",
      kind: "service",
      polygon: [
        [-3, -8],
        [10, -8],
        [10, -2],
        [-3, -2],
      ],
      color: ZONE_COLORS.service,
      velvet: VELVET.charcoal,
      expectedAssortment: { "leather-goods": 2 },
    },
  ];

  const fixtures: FixtureInstance[] = [
    // Entrance Gallery
    fx(rng, "pedestal-solo", 0, 5.7, 0, "hk-entrance"),
    fx(rng, "display-table-round", -4.6, 5.9, 0, "hk-entrance"),
    fx(rng, "display-table-rect", 4.9, 5.9, 0, "hk-entrance"),
    fx(rng, "light-track", 0, 6.6, 0, "hk-entrance"),
    fx(rng, "light-accent", 0.4, 5.7, 0, "hk-entrance"),

    // High Jewelry Salon
    fx(rng, "showcase-island-180", -1, 2.0, 0, "hk-high-jewelry"),
    fx(rng, "showcase-island-120", -1, -1.6, 90, "hk-high-jewelry"),
    fx(rng, "showcase-tower", -3.5, 0.2, 0, "hk-high-jewelry"),
    fx(rng, "pedestal-duo", 1.2, -3.5, 0, "hk-high-jewelry"),
    fx(rng, "light-track", -1, 0.2, 0, "hk-high-jewelry"),

    // Watch Atelier — three navy wall vitrines on the east wall
    fx(rng, "showcase-wall-watch", 9.7, 3.0, -90, "hk-watches"),
    fx(rng, "showcase-wall-watch", 9.7, 1.0, -90, "hk-watches"),
    fx(rng, "showcase-wall-watch", 9.7, -1.0, -90, "hk-watches"),
    fx(rng, "showcase-low-90", 5.5, 2.5, 0, "hk-watches"),
    fx(rng, "showcase-island-120", 5.5, -0.5, 0, "hk-watches"),
    fx(rng, "showcase-tower", 3.2, 1.0, 0, "hk-watches"),
    fx(rng, "light-track", 6.2, 1.2, 90, "hk-watches"),

    // Accessories Gallery — west wall systems
    fx(rng, "wall-shelving", -9.7, 2.1, 90, "hk-accessories"),
    fx(rng, "wall-shelving", -9.7, -0.1, 90, "hk-accessories"),
    fx(rng, "wall-bracket", -9.75, -2.1, 90, "hk-accessories"),
    fx(rng, "display-table-rect", -6.5, 2.8, 0, "hk-accessories"),
    fx(rng, "display-table-round", -6.5, -0.5, 0, "hk-accessories"),
    fx(rng, "pedestal-solo", -6.5, -3.1, 0, "hk-accessories"),
    fx(rng, "light-recessed", -7.5, 1.0, 0, "hk-accessories"),

    // VIP Salon Privé
    fx(rng, "showcase-low-90", -8.2, -6.2, 0, "hk-vip"),
    fx(rng, "seating-ottoman", -5.2, -7.2, 0, "hk-vip"),
    fx(rng, "seating-chair", -4.2, -5.2, 180, "hk-vip"),
    fx(rng, "wall-paneling", -9.93, -6.0, 90, "hk-vip"),
    fx(rng, "light-accent", -8.2, -5.8, 0, "hk-vip"),

    // Client Services
    fx(rng, "counter-service", 3.5, -6.5, 180, "hk-service"),
    fx(rng, "counter-cashwrap", 7.5, -6.5, 180, "hk-service"),
    fx(rng, "seating-chair", 3.2, -4.9, 0, "hk-service"),
    fx(rng, "seating-chair", 4.7, -4.9, 0, "hk-service"),
    fx(rng, "wall-paneling", 5.2, -7.93, 0, "hk-service"),
    fx(rng, "light-recessed", 5.0, -5.0, 0, "hk-service"),
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
        { x: -4, z: 0.5, size: 0.5 },
        { x: 4, z: 0.5, size: 0.5 },
      ],
    },
    zones,
    fixtures,
  };
}

// ───────────────────────────── Beijing Flagship ─────────────────────────────

function beijingFlagship(): BoutiqueLayout {
  const rng = new Rng(hashString("aurelle-beijing-flagship"));
  const W = 18;
  const D = 16.5;

  const zones: ZoneConfig[] = [
    {
      id: "bj-entrance",
      name: "Entrance Court",
      kind: "entrance",
      polygon: [
        [-9, 4.8],
        [9, 4.8],
        [9, 8.25],
        [-9, 8.25],
      ],
      color: ZONE_COLORS.entrance,
      velvet: VELVET.ivory,
      expectedAssortment: { necklaces: 2, rings: 1, fragrance: 1 },
    },
    {
      id: "bj-watches",
      name: "Watch Gallery",
      kind: "watches",
      polygon: [
        [-9, -3],
        [-2.5, -3],
        [-2.5, 4.8],
        [-9, 4.8],
      ],
      color: ZONE_COLORS.watches,
      velvet: VELVET.navy,
      expectedAssortment: { "watches-dress": 9, "watches-sport": 6 },
    },
    {
      id: "bj-high-jewelry",
      name: "High Jewelry Court",
      kind: "high-jewelry",
      polygon: [
        [-2.5, -3],
        [4, -3],
        [4, 4.8],
        [-2.5, 4.8],
      ],
      color: ZONE_COLORS["high-jewelry"],
      velvet: VELVET.cream,
      expectedAssortment: { rings: 7, necklaces: 4, earrings: 3, bracelets: 3, brooches: 2 },
    },
    {
      id: "bj-accessories",
      name: "Maison Accessories",
      kind: "accessories",
      polygon: [
        [4, -3],
        [9, -3],
        [9, 4.8],
        [4, 4.8],
      ],
      color: ZONE_COLORS.accessories,
      velvet: VELVET.charcoal,
      expectedAssortment: { "leather-goods": 12, fragrance: 6 },
    },
    {
      id: "bj-service",
      name: "Client Services",
      kind: "service",
      polygon: [
        [-9, -8.25],
        [1, -8.25],
        [1, -3],
        [-9, -3],
      ],
      color: ZONE_COLORS.service,
      velvet: VELVET.charcoal,
      expectedAssortment: { "leather-goods": 2 },
    },
    {
      id: "bj-vip",
      name: "Salon Impérial (VIP)",
      kind: "vip",
      polygon: [
        [1, -8.25],
        [9, -8.25],
        [9, -3],
        [1, -3],
      ],
      color: ZONE_COLORS.vip,
      velvet: VELVET.cream,
      expectedAssortment: { rings: 2, necklaces: 2 },
    },
  ];

  const fixtures: FixtureInstance[] = [
    // Entrance Court — twin hero pedestals flanking the axis
    fx(rng, "pedestal-duo", 0, 6.2, 0, "bj-entrance"),
    fx(rng, "display-table-round", -5.2, 6.1, 0, "bj-entrance"),
    fx(rng, "display-table-round", 5.2, 6.1, 0, "bj-entrance"),
    fx(rng, "light-track", 0, 6.8, 0, "bj-entrance"),
    fx(rng, "light-accent", 0.5, 6.2, 0, "bj-entrance"),

    // Watch Gallery — west wall
    fx(rng, "showcase-wall-watch", -8.7, 3.2, 90, "bj-watches"),
    fx(rng, "showcase-wall-watch", -8.7, 1.2, 90, "bj-watches"),
    fx(rng, "showcase-wall-watch", -8.7, -0.8, 90, "bj-watches"),
    fx(rng, "showcase-island-120", -5.2, 2.4, 90, "bj-watches"),
    fx(rng, "showcase-low-90", -5.2, -0.9, 0, "bj-watches"),
    fx(rng, "showcase-tower", -3.2, 3.7, 0, "bj-watches"),
    fx(rng, "light-track", -5.4, 1.2, 90, "bj-watches"),

    // High Jewelry Court — center stage
    fx(rng, "showcase-island-180", 0.6, 2.6, 0, "bj-high-jewelry"),
    fx(rng, "showcase-island-120", 0.6, -0.9, 0, "bj-high-jewelry"),
    fx(rng, "pedestal-solo", 3.0, 0.8, 0, "bj-high-jewelry"),
    fx(rng, "showcase-tower", -1.8, -2.2, 0, "bj-high-jewelry"),
    fx(rng, "light-track", 0.6, 0.8, 0, "bj-high-jewelry"),

    // Maison Accessories — east wall
    fx(rng, "wall-shelving", 8.7, 2.7, -90, "bj-accessories"),
    fx(rng, "wall-shelving", 8.7, 0.5, -90, "bj-accessories"),
    fx(rng, "wall-bracket", 8.75, -1.5, -90, "bj-accessories"),
    fx(rng, "display-table-rect", 5.9, 3.4, 90, "bj-accessories"),
    fx(rng, "display-table-round", 5.9, 0.2, 0, "bj-accessories"),
    fx(rng, "light-recessed", 6.6, 1.6, 0, "bj-accessories"),

    // Client Services — north-west
    fx(rng, "counter-service", -5.5, -6.6, 180, "bj-service"),
    fx(rng, "counter-cashwrap", -1.6, -6.8, 180, "bj-service"),
    fx(rng, "seating-chair", -6.0, -4.8, 0, "bj-service"),
    fx(rng, "seating-chair", -4.5, -4.8, 0, "bj-service"),
    fx(rng, "wall-paneling", -4.5, -8.18, 0, "bj-service"),
    fx(rng, "light-recessed", -4.0, -5.2, 0, "bj-service"),

    // Salon Impérial — VIP
    fx(rng, "showcase-low-90", 7.6, -6.6, -90, "bj-vip"),
    fx(rng, "pedestal-solo", 4.8, -7.2, 0, "bj-vip"),
    fx(rng, "seating-ottoman", 3.4, -4.6, 0, "bj-vip"),
    fx(rng, "seating-chair", 5.6, -4.4, 180, "bj-vip"),
    fx(rng, "wall-paneling", 8.93, -5.5, -90, "bj-vip"),
    fx(rng, "light-accent", 4.8, -6.8, 0, "bj-vip"),
  ];

  return {
    id: "bj-flagship",
    name: "Beijing Flagship",
    market: "Chinese Mainland",
    tier: "tier1",
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
        { x: -2.5, z: -0.2, size: 0.55 },
        { x: 4, z: -0.2, size: 0.55 },
      ],
    },
    zones,
    fixtures,
  };
}

// ───────────────────────────── Seoul Flagship ─────────────────────────────
// Wide, shallow plate with a central entrance court flanked by east/west
// wings — a gallery promenade rather than the HK/Beijing deep-hall plans.

function seoulFlagship(): BoutiqueLayout {
  const rng = new Rng(hashString("aurelle-seoul-flagship"));
  const W = 22;
  const D = 14;

  const zones: ZoneConfig[] = [
    {
      id: "se-entrance",
      name: "Entrance Court",
      kind: "entrance",
      polygon: [
        [-4, 3],
        [4, 3],
        [4, 7],
        [-4, 7],
      ],
      color: ZONE_COLORS.entrance,
      velvet: VELVET.ivory,
      expectedAssortment: { necklaces: 2, rings: 1 },
    },
    {
      id: "se-accessories",
      name: "Accessories Promenade",
      kind: "accessories",
      polygon: [
        [-11, 0],
        [-4, 0],
        [-4, 7],
        [-11, 7],
      ],
      color: ZONE_COLORS.accessories,
      velvet: VELVET.charcoal,
      expectedAssortment: { "leather-goods": 10, fragrance: 6 },
    },
    {
      id: "se-watches",
      name: "Watch Gallery",
      kind: "watches",
      polygon: [
        [4, 0],
        [11, 0],
        [11, 7],
        [4, 7],
      ],
      color: ZONE_COLORS.watches,
      velvet: VELVET.navy,
      expectedAssortment: { "watches-dress": 8, "watches-sport": 6 },
    },
    {
      id: "se-high-jewelry",
      name: "High Jewelry Salon",
      kind: "high-jewelry",
      polygon: [
        [-4, -7],
        [4, -7],
        [4, 3],
        [-4, 3],
      ],
      color: ZONE_COLORS["high-jewelry"],
      velvet: VELVET.cream,
      expectedAssortment: { rings: 6, necklaces: 4, earrings: 3, bracelets: 2, brooches: 2 },
    },
    {
      id: "se-service",
      name: "Client Services",
      kind: "service",
      polygon: [
        [-11, -7],
        [-4, -7],
        [-4, 0],
        [-11, 0],
      ],
      color: ZONE_COLORS.service,
      velvet: VELVET.charcoal,
      expectedAssortment: { "leather-goods": 2 },
    },
    {
      id: "se-vip",
      name: "Salon Privé (VIP)",
      kind: "vip",
      polygon: [
        [4, -7],
        [11, -7],
        [11, 0],
        [4, 0],
      ],
      color: ZONE_COLORS.vip,
      velvet: VELVET.cream,
      expectedAssortment: { rings: 2, necklaces: 1 },
    },
  ];

  const fixtures: FixtureInstance[] = [
    // Entrance court — twin towers framing a hero duo pedestal
    fx(rng, "pedestal-duo", 0, 5.4, 0, "se-entrance"),
    fx(rng, "showcase-tower", -2.8, 4.6, 0, "se-entrance"),
    fx(rng, "showcase-tower", 2.8, 4.6, 0, "se-entrance"),
    fx(rng, "light-track", 0, 5.0, 0, "se-entrance"),

    // Accessories promenade — west wing
    fx(rng, "wall-shelving", -10.7, 5.6, 90, "se-accessories"),
    fx(rng, "wall-shelving", -10.7, 3.4, 90, "se-accessories"),
    fx(rng, "wall-bracket", -10.75, 1.2, 90, "se-accessories"),
    fx(rng, "display-table-rect", -7.5, 5.5, 0, "se-accessories"),
    fx(rng, "display-table-round", -7.5, 2.5, 0, "se-accessories"),
    fx(rng, "pedestal-solo", -5.2, 0.8, 0, "se-accessories"),
    fx(rng, "light-recessed", -8, 4, 0, "se-accessories"),

    // Watch gallery — east wing
    fx(rng, "showcase-wall-watch", 10.7, 5.6, -90, "se-watches"),
    fx(rng, "showcase-wall-watch", 10.7, 3.6, -90, "se-watches"),
    fx(rng, "showcase-wall-watch", 10.7, 1.6, -90, "se-watches"),
    fx(rng, "showcase-island-120", 7, 4.5, 0, "se-watches"),
    fx(rng, "showcase-low-90", 7, 1.5, 0, "se-watches"),
    fx(rng, "showcase-tower", 4.8, 3, 0, "se-watches"),
    fx(rng, "light-track", 7.5, 3.5, 90, "se-watches"),

    // High jewelry salon — central spine to the back wall
    fx(rng, "showcase-island-180", 0, 0.8, 0, "se-high-jewelry"),
    fx(rng, "showcase-island-120", 0, -2.6, 0, "se-high-jewelry"),
    fx(rng, "pedestal-solo", -2.9, -0.9, 0, "se-high-jewelry"),
    fx(rng, "pedestal-solo", 2.9, -0.9, 0, "se-high-jewelry"),
    fx(rng, "showcase-low-90", 0, -5.2, 0, "se-high-jewelry"),
    fx(rng, "light-track", 0, -1, 0, "se-high-jewelry"),
    fx(rng, "light-accent", 0.4, 0.8, 0, "se-high-jewelry"),

    // Client services — west-rear
    fx(rng, "counter-service", -8.5, -5, 180, "se-service"),
    fx(rng, "counter-cashwrap", -5.5, -5.8, 180, "se-service"),
    fx(rng, "seating-chair", -8.8, -3.2, 0, "se-service"),
    fx(rng, "seating-chair", -7.3, -3.2, 0, "se-service"),
    fx(rng, "wall-paneling", -7.5, -6.93, 0, "se-service"),
    fx(rng, "light-recessed", -7.5, -4, 0, "se-service"),

    // Salon Privé — east-rear
    fx(rng, "showcase-low-90", 9.5, -4.5, -90, "se-vip"),
    fx(rng, "seating-ottoman", 6.2, -5.4, 0, "se-vip"),
    fx(rng, "seating-chair", 5, -3, 180, "se-vip"),
    fx(rng, "pedestal-solo", 8.2, -2, 0, "se-vip"),
    fx(rng, "wall-paneling", 10.93, -2.5, -90, "se-vip"),
    fx(rng, "light-accent", 8.2, -1.8, 0, "se-vip"),
  ];

  return {
    id: "seoul-flagship",
    name: "Seoul Flagship",
    market: "South Korea",
    tier: "tier1",
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
        { x: -4, z: 0.5, size: 0.5 },
        { x: 4, z: 0.5, size: 0.5 },
      ],
    },
    zones,
    fixtures,
  };
}

// ───────────────────────────── Tokyo Ginza ─────────────────────────────
// Narrow, deep Ginza plot: a vertical promenade — zones stack front to back,
// vertical emphasis (towers, wall systems), lighter minimal shell.

function tokyoGinza(): BoutiqueLayout {
  const rng = new Rng(hashString("aurelle-tokyo-ginza"));
  const W = 13;
  const D = 19;

  const zones: ZoneConfig[] = [
    {
      id: "tk-entrance",
      name: "Entrance Gallery",
      kind: "entrance",
      polygon: [
        [-6.5, 6],
        [6.5, 6],
        [6.5, 9.5],
        [-6.5, 9.5],
      ],
      color: ZONE_COLORS.entrance,
      velvet: VELVET.ivory,
      expectedAssortment: { necklaces: 1, rings: 1, fragrance: 1 },
    },
    {
      id: "tk-watches",
      name: "Watch Salon",
      kind: "watches",
      polygon: [
        [-6.5, 0],
        [0, 0],
        [0, 6],
        [-6.5, 6],
      ],
      color: ZONE_COLORS.watches,
      velvet: VELVET.navy,
      expectedAssortment: { "watches-dress": 6, "watches-sport": 5 },
    },
    {
      id: "tk-accessories",
      name: "Maison Accessories",
      kind: "accessories",
      polygon: [
        [0, 0],
        [6.5, 0],
        [6.5, 6],
        [0, 6],
      ],
      color: ZONE_COLORS.accessories,
      velvet: VELVET.charcoal,
      expectedAssortment: { "leather-goods": 9, fragrance: 5 },
    },
    {
      id: "tk-high-jewelry",
      name: "High Jewelry Atelier",
      kind: "high-jewelry",
      polygon: [
        [-6.5, -5],
        [6.5, -5],
        [6.5, 0],
        [-6.5, 0],
      ],
      color: ZONE_COLORS["high-jewelry"],
      velvet: VELVET.cream,
      expectedAssortment: { rings: 5, necklaces: 3, earrings: 2, brooches: 2 },
    },
    {
      id: "tk-service",
      name: "Client Services",
      kind: "service",
      polygon: [
        [-6.5, -9.5],
        [0, -9.5],
        [0, -5],
        [-6.5, -5],
      ],
      color: ZONE_COLORS.service,
      velvet: VELVET.charcoal,
      expectedAssortment: { "leather-goods": 1 },
    },
    {
      id: "tk-vip",
      name: "Salon Ginza (VIP)",
      kind: "vip",
      polygon: [
        [0, -9.5],
        [6.5, -9.5],
        [6.5, -5],
        [0, -5],
      ],
      color: ZONE_COLORS.vip,
      velvet: VELVET.cream,
      expectedAssortment: { rings: 2, necklaces: 1 },
    },
  ];

  const fixtures: FixtureInstance[] = [
    // Entrance gallery — vertical statement pieces
    fx(rng, "pedestal-solo", 0, 7.6, 0, "tk-entrance"),
    fx(rng, "showcase-tower", -3.5, 7.8, 0, "tk-entrance"),
    fx(rng, "showcase-tower", 3.5, 7.8, 0, "tk-entrance"),
    fx(rng, "light-track", 0, 7.0, 0, "tk-entrance"),
    fx(rng, "light-accent", 0.4, 7.6, 0, "tk-entrance"),

    // Watch salon — west side
    fx(rng, "showcase-wall-watch", -6.2, 4.4, 90, "tk-watches"),
    fx(rng, "showcase-wall-watch", -6.2, 2.2, 90, "tk-watches"),
    fx(rng, "showcase-island-120", -3, 4.2, 90, "tk-watches"),
    fx(rng, "showcase-low-90", -3, 1.2, 0, "tk-watches"),
    fx(rng, "light-track", -3, 2.8, 90, "tk-watches"),

    // Maison accessories — east side
    fx(rng, "wall-shelving", 6.2, 4.6, -90, "tk-accessories"),
    fx(rng, "wall-bracket", 6.25, 2.4, -90, "tk-accessories"),
    fx(rng, "display-table-round", 3, 4.6, 0, "tk-accessories"),
    fx(rng, "display-table-rect", 3, 1.4, 90, "tk-accessories"),
    fx(rng, "light-recessed", 3.5, 3, 0, "tk-accessories"),

    // High jewelry atelier — full-width band mid-store
    fx(rng, "showcase-island-180", 0, -2.4, 0, "tk-high-jewelry"),
    fx(rng, "showcase-tower", -4.4, -2.4, 0, "tk-high-jewelry"),
    fx(rng, "showcase-tower", 4.4, -2.4, 0, "tk-high-jewelry"),
    fx(rng, "pedestal-duo", 0, -0.4, 0, "tk-high-jewelry"),
    fx(rng, "light-track", 0, -2.4, 90, "tk-high-jewelry"),

    // Client services — rear-west (no cash-wrap: the Ginza service counter
    // handles transactions — furniture mix differs from the other maisons)
    fx(rng, "counter-service", -3.5, -7.6, 180, "tk-service"),
    fx(rng, "seating-chair", -4.2, -5.9, 0, "tk-service"),
    fx(rng, "seating-chair", -2.8, -5.9, 0, "tk-service"),
    fx(rng, "wall-paneling", -3.5, -9.43, 0, "tk-service"),
    fx(rng, "light-recessed", -3.5, -6.5, 0, "tk-service"),

    // Salon Ginza — rear-east
    fx(rng, "showcase-low-90", 5.2, -7.5, -90, "tk-vip"),
    fx(rng, "seating-ottoman", 2.2, -8.2, 0, "tk-vip"),
    fx(rng, "seating-chair", 1.6, -5.9, 180, "tk-vip"),
    fx(rng, "wall-paneling", 6.43, -6.5, -90, "tk-vip"),
    fx(rng, "light-accent", 5.2, -7.2, 0, "tk-vip"),
  ];

  return {
    id: "tokyo-ginza",
    name: "Tokyo Ginza",
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
        { x: -3.2, z: -0.5, size: 0.45 },
        { x: 3.2, z: -0.5, size: 0.45 },
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
    make("High Jewelry — Icons", "showcase-island", 2, 6, [
      "rings",
      "necklaces",
      "earrings",
      "rings",
      "bracelets",
      "brooches",
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
    make("VIP Salon — Exceptional Pieces", "showcase-low", 2, 3, ["rings", "necklaces", "brooches"]),
    make("Campaign Focus — Icons Push", "showcase-island", 2, 6, ["rings", "necklaces"], 2),
  );
  return out;
}

export const LAYOUTS: BoutiqueLayout[] = [
  princesBuildingHK(),
  beijingFlagship(),
  seoulFlagship(),
  tokyoGinza(),
];

export function layoutById(id: string | null): BoutiqueLayout {
  const found = LAYOUTS.find((l) => l.id === id);
  return found ?? LAYOUTS[0];
}
