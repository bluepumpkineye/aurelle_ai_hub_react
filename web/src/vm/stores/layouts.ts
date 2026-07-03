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
    fx(rng, "wall-shelving", -9.7, 2.0, 90, "hk-accessories"),
    fx(rng, "wall-shelving", -9.7, 0.0, 90, "hk-accessories"),
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
    fx(rng, "seating-chair", 3.0, -4.7, 0, "hk-service"),
    fx(rng, "seating-chair", 4.5, -4.7, 0, "hk-service"),
    fx(rng, "wall-paneling", 5.2, -7.93, 0, "hk-service"),
    fx(rng, "light-recessed", 5.0, -5.0, 0, "hk-service"),
  ];

  return {
    id: "hk-princes",
    name: "Prince's Building, Hong Kong",
    market: "Hong Kong SAR",
    tier: "tier1",
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
    fx(rng, "showcase-tower", -3.3, 3.6, 0, "bj-watches"),
    fx(rng, "light-track", -5.4, 1.2, 90, "bj-watches"),

    // High Jewelry Court — center stage
    fx(rng, "showcase-island-180", 0.6, 2.6, 0, "bj-high-jewelry"),
    fx(rng, "showcase-island-120", 0.6, -0.9, 0, "bj-high-jewelry"),
    fx(rng, "pedestal-solo", 3.0, 0.8, 0, "bj-high-jewelry"),
    fx(rng, "showcase-tower", -1.8, -2.2, 0, "bj-high-jewelry"),
    fx(rng, "light-track", 0.6, 0.8, 0, "bj-high-jewelry"),

    // Maison Accessories — east wall
    fx(rng, "wall-shelving", 8.7, 2.6, -90, "bj-accessories"),
    fx(rng, "wall-shelving", 8.7, 0.6, -90, "bj-accessories"),
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

export const LAYOUTS: BoutiqueLayout[] = [princesBuildingHK(), beijingFlagship()];

export function layoutById(id: string | null): BoutiqueLayout {
  const found = LAYOUTS.find((l) => l.id === id);
  return found ?? LAYOUTS[0];
}
