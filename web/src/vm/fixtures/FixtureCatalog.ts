/**
 * Aurelle equipment template library — 20 named, parametric fixture templates
 * (PRD §2). Dimensions are configurable within brand-specified ranges; the
 * 3D constructors in FixtureBuilder.ts derive all geometry from these configs.
 */

import type { FixtureTemplate, ProductCategory } from "../data/types";

const JEWELRY: ProductCategory[] = ["rings", "bracelets", "necklaces", "earrings", "brooches"];
const WATCHES: ProductCategory[] = ["watches-dress", "watches-sport"];
const SOFT: ProductCategory[] = ["leather-goods", "fragrance"];
const ALL: ProductCategory[] = [...JEWELRY, ...WATCHES, ...SOFT];

export const FIXTURE_TEMPLATES: FixtureTemplate[] = [
  {
    id: "showcase-island-120",
    name: "Island Showcase 120",
    kind: "showcase-island",
    categoryLabel: "Showcases",
    dims: {
      min: { width: 1.0, depth: 0.7, height: 0.95 },
      max: { width: 1.5, depth: 0.9, height: 1.05 },
      default: { width: 1.2, depth: 0.8, height: 1.0 },
    },
    finish: "champagne-gold",
    slotGrid: { rows: 2, cols: 4, layers: 1, accepts: JEWELRY },
    lighting: [{ offset: [0, 0.92, 0], coneDeg: 32, cct: 2900, intensity: 5 }],
    description: "Freestanding glass island case for high jewelry, velvet tray inserts.",
  },
  {
    id: "showcase-island-180",
    name: "Island Showcase 180 Grand",
    kind: "showcase-island",
    categoryLabel: "Showcases",
    dims: {
      min: { width: 1.6, depth: 0.8, height: 0.95 },
      max: { width: 2.2, depth: 1.0, height: 1.05 },
      default: { width: 1.8, depth: 0.9, height: 1.0 },
    },
    finish: "champagne-gold",
    slotGrid: { rows: 2, cols: 6, layers: 1, accepts: JEWELRY },
    lighting: [
      { offset: [-0.45, 0.92, 0], coneDeg: 30, cct: 2900, intensity: 5 },
      { offset: [0.45, 0.92, 0], coneDeg: 30, cct: 2900, intensity: 5 },
    ],
    description: "Grand island case anchoring a high-jewelry zone.",
  },
  {
    id: "showcase-wall-160",
    name: "Wall Vitrine 160",
    kind: "showcase-wall",
    categoryLabel: "Showcases",
    dims: {
      min: { width: 1.2, depth: 0.5, height: 2.0 },
      max: { width: 2.0, depth: 0.65, height: 2.4 },
      default: { width: 1.6, depth: 0.55, height: 2.2 },
    },
    finish: "champagne-gold",
    slotGrid: { rows: 3, cols: 4, layers: 1, accepts: [...JEWELRY, ...WATCHES] },
    lighting: [{ offset: [0, 2.1, 0.1], coneDeg: 40, cct: 2900, intensity: 4 }],
    description: "Wall-mounted vitrine with three lit shelves and mirror back.",
  },
  {
    id: "showcase-wall-watch",
    name: "Watch Wall Vitrine",
    kind: "showcase-wall",
    categoryLabel: "Showcases",
    dims: {
      min: { width: 1.0, depth: 0.5, height: 2.0 },
      max: { width: 1.8, depth: 0.6, height: 2.4 },
      default: { width: 1.4, depth: 0.55, height: 2.2 },
    },
    finish: "brushed-platinum",
    slotGrid: { rows: 3, cols: 3, layers: 1, accepts: WATCHES },
    lighting: [{ offset: [0, 2.1, 0.1], coneDeg: 38, cct: 3000, intensity: 4 }],
    description: "Navy-velvet watch wall with brushed platinum frame.",
  },
  {
    id: "showcase-tower",
    name: "Tower Vitrine",
    kind: "showcase-tower",
    categoryLabel: "Showcases",
    dims: {
      min: { width: 0.55, depth: 0.55, height: 1.7 },
      max: { width: 0.8, depth: 0.8, height: 2.1 },
      default: { width: 0.65, depth: 0.65, height: 1.9 },
    },
    finish: "champagne-gold",
    slotGrid: { rows: 3, cols: 1, layers: 1, accepts: [...JEWELRY, "fragrance"] },
    lighting: [{ offset: [0, 1.8, 0], coneDeg: 26, cct: 2900, intensity: 4 }],
    description: "Four-sided glass tower for hero pieces, viewable in the round.",
  },
  {
    id: "showcase-low-90",
    name: "Low-Profile Case 90",
    kind: "showcase-low",
    categoryLabel: "Showcases",
    dims: {
      min: { width: 0.8, depth: 0.6, height: 0.55 },
      max: { width: 1.2, depth: 0.8, height: 0.7 },
      default: { width: 0.9, depth: 0.7, height: 0.6 },
    },
    finish: "champagne-gold",
    slotGrid: { rows: 2, cols: 3, layers: 1, accepts: JEWELRY },
    lighting: [{ offset: [0, 0.55, 0], coneDeg: 36, cct: 2900, intensity: 3 }],
    description: "Seated-height viewing case for VIP salon consultations.",
  },
  {
    id: "display-table-round",
    name: "Round Display Table",
    kind: "display-table",
    categoryLabel: "Tables & Pedestals",
    dims: {
      min: { width: 0.8, depth: 0.8, height: 0.75 },
      max: { width: 1.3, depth: 1.3, height: 0.8 },
      default: { width: 1.0, depth: 1.0, height: 0.78 },
    },
    finish: "champagne-gold",
    slotGrid: { rows: 1, cols: 4, layers: 1, accepts: SOFT },
    lighting: [],
    description: "Lacquered round table for leather goods and fragrance display.",
  },
  {
    id: "display-table-rect",
    name: "Rectangular Display Table",
    kind: "display-table",
    categoryLabel: "Tables & Pedestals",
    dims: {
      min: { width: 1.2, depth: 0.6, height: 0.75 },
      max: { width: 2.0, depth: 0.9, height: 0.8 },
      default: { width: 1.6, depth: 0.75, height: 0.78 },
    },
    finish: "brushed-platinum",
    slotGrid: { rows: 2, cols: 4, layers: 1, accepts: SOFT },
    lighting: [],
    description: "Long presentation table for accessories runs and seasonal stories.",
  },
  {
    id: "pedestal-solo",
    name: "Solo Pedestal",
    kind: "pedestal",
    categoryLabel: "Tables & Pedestals",
    dims: {
      min: { width: 0.4, depth: 0.4, height: 0.9 },
      max: { width: 0.6, depth: 0.6, height: 1.2 },
      default: { width: 0.45, depth: 0.45, height: 1.05 },
    },
    finish: "champagne-gold",
    slotGrid: { rows: 1, cols: 1, layers: 1, accepts: ALL },
    lighting: [{ offset: [0, 1.5, 0], coneDeg: 22, cct: 2900, intensity: 4 }],
    description: "Single hero pedestal with glass bonnet and dedicated accent spot.",
  },
  {
    id: "pedestal-duo",
    name: "Duo Pedestal",
    kind: "pedestal",
    categoryLabel: "Tables & Pedestals",
    dims: {
      min: { width: 0.8, depth: 0.4, height: 0.9 },
      max: { width: 1.1, depth: 0.6, height: 1.15 },
      default: { width: 0.9, depth: 0.45, height: 1.0 },
    },
    finish: "champagne-gold",
    slotGrid: { rows: 1, cols: 2, layers: 1, accepts: ALL },
    lighting: [{ offset: [0, 1.45, 0], coneDeg: 28, cct: 2900, intensity: 4 }],
    description: "Paired pedestal for dialogue pieces at zone thresholds.",
  },
  {
    id: "counter-service",
    name: "Service Counter",
    kind: "counter-service",
    categoryLabel: "Counters",
    dims: {
      min: { width: 1.6, depth: 0.7, height: 0.9 },
      max: { width: 2.6, depth: 0.9, height: 1.0 },
      default: { width: 2.0, depth: 0.8, height: 0.95 },
    },
    finish: "champagne-gold",
    slotGrid: { rows: 1, cols: 3, layers: 1, accepts: SOFT },
    lighting: [{ offset: [0, 1.6, 0], coneDeg: 45, cct: 3000, intensity: 3 }],
    description: "Client service counter with tray, collateral holder and seating side.",
  },
  {
    id: "counter-cashwrap",
    name: "Cash-Wrap Counter",
    kind: "counter-cashwrap",
    categoryLabel: "Counters",
    dims: {
      min: { width: 1.2, depth: 0.6, height: 0.95 },
      max: { width: 1.8, depth: 0.8, height: 1.05 },
      default: { width: 1.5, depth: 0.7, height: 1.0 },
    },
    finish: "brushed-platinum",
    slotGrid: null,
    lighting: [{ offset: [0, 1.6, 0], coneDeg: 40, cct: 3000, intensity: 3 }],
    description: "Discreet transaction counter with under-counter storage.",
  },
  {
    id: "seating-chair",
    name: "Client Chair",
    kind: "seating-chair",
    categoryLabel: "Seating",
    dims: {
      min: { width: 0.55, depth: 0.55, height: 0.8 },
      max: { width: 0.7, depth: 0.7, height: 0.9 },
      default: { width: 0.6, depth: 0.6, height: 0.85 },
    },
    finish: "champagne-gold",
    slotGrid: null,
    lighting: [],
    description: "Upholstered client chair, velvet seat with gold frame.",
  },
  {
    id: "seating-ottoman",
    name: "Salon Ottoman",
    kind: "seating-ottoman",
    categoryLabel: "Seating",
    dims: {
      min: { width: 0.9, depth: 0.5, height: 0.42 },
      max: { width: 1.4, depth: 0.7, height: 0.48 },
      default: { width: 1.1, depth: 0.6, height: 0.45 },
    },
    finish: "champagne-gold",
    slotGrid: null,
    lighting: [],
    description: "Low velvet ottoman for VIP salon and fitting moments.",
  },
  {
    id: "seating-sofa-curved",
    name: "Salon Curved Sofa",
    kind: "seating-sofa",
    categoryLabel: "Seating",
    dims: {
      min: { width: 1.8, depth: 0.9, height: 0.78 },
      max: { width: 2.6, depth: 1.1, height: 0.85 },
      default: { width: 2.2, depth: 1.0, height: 0.8 },
    },
    finish: "champagne-gold",
    slotGrid: null,
    lighting: [],
    description: "Kidney-curved velvet salon sofa for the private VIP lounge.",
  },
  {
    id: "wall-paneling",
    name: "Wall Panel Run",
    kind: "wall-paneling",
    categoryLabel: "Wall Systems",
    dims: {
      min: { width: 1.5, depth: 0.08, height: 2.4 },
      max: { width: 4.0, depth: 0.12, height: 3.2 },
      default: { width: 2.4, depth: 0.1, height: 2.8 },
    },
    finish: "champagne-gold",
    slotGrid: null,
    lighting: [],
    description: "Lacquered panel run with joint reveals and brand artwork frame.",
  },
  {
    id: "wall-shelving",
    name: "Wall Shelving System",
    kind: "wall-shelving",
    categoryLabel: "Wall Systems",
    dims: {
      min: { width: 1.2, depth: 0.35, height: 2.0 },
      max: { width: 2.4, depth: 0.45, height: 2.8 },
      default: { width: 1.8, depth: 0.4, height: 2.4 },
    },
    finish: "brushed-platinum",
    slotGrid: { rows: 4, cols: 3, layers: 1, accepts: SOFT },
    lighting: [{ offset: [0, 2.3, 0.15], coneDeg: 50, cct: 3000, intensity: 3 }],
    description: "Open shelving for leather goods and fragrance libraries.",
  },
  {
    id: "wall-bracket",
    name: "Bracket Display System",
    kind: "wall-bracket",
    categoryLabel: "Wall Systems",
    dims: {
      min: { width: 0.9, depth: 0.3, height: 1.6 },
      max: { width: 1.6, depth: 0.4, height: 2.2 },
      default: { width: 1.2, depth: 0.35, height: 1.9 },
    },
    finish: "champagne-gold",
    slotGrid: { rows: 3, cols: 2, layers: 1, accepts: [...SOFT, "necklaces"] },
    lighting: [],
    description: "Adjustable bracket wall for rotating seasonal presentations.",
  },
  {
    id: "light-track",
    name: "Track Lighting Rig",
    kind: "light-track",
    categoryLabel: "Lighting Rigs",
    dims: {
      min: { width: 1.5, depth: 0.1, height: 0.15 },
      max: { width: 4.0, depth: 0.12, height: 0.18 },
      default: { width: 2.5, depth: 0.1, height: 0.16 },
    },
    finish: "brushed-platinum",
    slotGrid: null,
    lighting: [
      { offset: [-0.8, -0.05, 0], coneDeg: 30, cct: 2900, intensity: 6 },
      { offset: [0, -0.05, 0], coneDeg: 30, cct: 2900, intensity: 6 },
      { offset: [0.8, -0.05, 0], coneDeg: 30, cct: 2900, intensity: 6 },
    ],
    description: "Ceiling track with three aimable 2900 K spots.",
  },
  {
    id: "light-recessed",
    name: "Recessed Downlight Set",
    kind: "light-recessed",
    categoryLabel: "Lighting Rigs",
    dims: {
      min: { width: 0.12, depth: 0.12, height: 0.05 },
      max: { width: 0.2, depth: 0.2, height: 0.08 },
      default: { width: 0.15, depth: 0.15, height: 0.06 },
    },
    finish: "brushed-platinum",
    slotGrid: null,
    lighting: [{ offset: [0, -0.02, 0], coneDeg: 55, cct: 3000, intensity: 4 }],
    description: "Flush ceiling downlight for ambient wash.",
  },
  {
    id: "light-accent",
    name: "Accent Spot",
    kind: "light-accent",
    categoryLabel: "Lighting Rigs",
    dims: {
      min: { width: 0.1, depth: 0.1, height: 0.2 },
      max: { width: 0.15, depth: 0.15, height: 0.3 },
      default: { width: 0.12, depth: 0.12, height: 0.25 },
    },
    finish: "champagne-gold",
    slotGrid: null,
    lighting: [{ offset: [0, -0.1, 0], coneDeg: 18, cct: 2900, intensity: 8 }],
    description: "Narrow-beam accent spot for hero pedestals and artwork.",
  },
];

export const TEMPLATE_BY_ID: Map<string, FixtureTemplate> = new Map(
  FIXTURE_TEMPLATES.map((t) => [t.id, t]),
);

export function templateOf(templateId: string): FixtureTemplate {
  const t = TEMPLATE_BY_ID.get(templateId);
  if (!t) throw new Error(`Unknown fixture template: ${templateId}`);
  return t;
}

export const TEMPLATE_CATEGORIES: string[] = Array.from(
  new Set(FIXTURE_TEMPLATES.map((t) => t.categoryLabel)),
);
