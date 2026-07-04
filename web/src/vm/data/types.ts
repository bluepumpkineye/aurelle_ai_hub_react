/**
 * Aurelle Boutique Planner — shared data contracts.
 *
 * Every interface in this file is an extension seam (PRD §7): the in-memory
 * implementations that ship with the app can be replaced by API-backed
 * adapters without touching callers. Zero `any` — enforced by tsconfig.vm.json.
 */

// ───────────────────────────── Product taxonomy ─────────────────────────────

export type ProductCategory =
  | "rings"
  | "bracelets"
  | "necklaces"
  | "watches-dress"
  | "watches-sport"
  | "earrings"
  | "brooches"
  | "leather-goods"
  | "fragrance";

export type ExclusivityTier = "standard" | "high" | "exceptional";

export interface SKU {
  id: string;
  name: string;
  category: ProductCategory;
  collection: string;
  tier: ExclusivityTier;
  /** Retail price in EUR — mock data, used by analytics aggregates. */
  price: number;
  /** Deterministic seed used by the parametric product mesh generator. */
  meshSeed: number;
}

// ───────────────────────────── Floor & zones ─────────────────────────────

export type ApertureKind = "door" | "window" | "shopfront";

export interface Aperture {
  /** Which wall the aperture lives in. */
  wall: "north" | "south" | "east" | "west";
  /** Offset along the wall from its start corner, metres. */
  offset: number;
  width: number;
  height: number;
  /** Sill height above the floor, metres (0 for doors). */
  sill: number;
  kind: ApertureKind;
}

export interface ColumnSpec {
  x: number;
  z: number;
  /** Column side length, metres (square section). */
  size: number;
}

export interface FloorSpec {
  /** Metres along X. */
  width: number;
  /** Metres along Z. */
  depth: number;
  ceilingHeight: number;
  apertures: Aperture[];
  columns: ColumnSpec[];
}

export type ZoneKind =
  | "entrance"
  | "high-jewelry"
  | "watches"
  | "accessories"
  | "vip"
  | "service";

export interface VelvetPalette {
  /** Base velvet color as hex; per-fixture jitter is applied from the store seed. */
  baseColor: string;
  hueJitterDeg: number;
  valueJitter: number;
}

export interface ZoneConfig {
  id: string;
  name: string;
  kind: ZoneKind;
  /** Boundary polygon on the floor plane, metres, [x, z] pairs, CCW. */
  polygon: Array<[number, number]>;
  /** Overlay accent color, hex. */
  color: string;
  velvet: VelvetPalette;
  /** Expected assortment spec: minimum SKU count per category (gap detection). */
  expectedAssortment: Partial<Record<ProductCategory, number>>;
}

// ───────────────────────────── Fixtures ─────────────────────────────

export type FixtureKind =
  | "showcase-island"
  | "showcase-wall"
  | "showcase-tower"
  | "showcase-low"
  | "display-table"
  | "pedestal"
  | "counter-service"
  | "counter-cashwrap"
  | "seating-chair"
  | "seating-ottoman"
  | "wall-paneling"
  | "wall-shelving"
  | "wall-bracket"
  | "light-track"
  | "light-recessed"
  | "light-accent";

export type MetalFinish = "champagne-gold" | "brushed-platinum";

export interface SlotGridSpec {
  rows: number;
  cols: number;
  layers: number;
  /** Which product categories this grid accepts. */
  accepts: ProductCategory[];
}

export interface FixtureDims {
  width: number;
  depth: number;
  height: number;
}

export interface FixtureDimRange {
  min: FixtureDims;
  max: FixtureDims;
  default: FixtureDims;
}

export interface LightingAttachment {
  /** Local-space offset from the fixture origin. */
  offset: [number, number, number];
  /** Cone half-angle, degrees. */
  coneDeg: number;
  /** Color temperature, Kelvin. Aurelle standard 2900 K. */
  cct: number;
  intensity: number;
}

export interface FixtureTemplate {
  id: string;
  name: string;
  kind: FixtureKind;
  categoryLabel: string;
  dims: FixtureDimRange;
  finish: MetalFinish;
  /** null for fixtures with no product slots (seating, lighting rigs). */
  slotGrid: SlotGridSpec | null;
  lighting: LightingAttachment[];
  description: string;
}

export interface FixtureInstance {
  id: string;
  templateId: string;
  zoneId: string;
  /** Floor position, metres. */
  x: number;
  z: number;
  /** Rotation about Y, radians (90° increments unless free rotation opted in). */
  rotationY: number;
  dims: FixtureDims;
  finish: MetalFinish;
  /** Per-instance variation seed (drives velvet jitter, wear, arrangement). */
  variationSeed: number;
}

// ───────────────────────────── Architecture theme ─────────────────────────────

/** Procedural marble tint set — field, tonal clouds, primary + warm veins. */
export interface MarblePalette {
  field: string;
  cloud: string;
  vein: string;
  goldVein: string;
}

/** Surface treatment for a wall plane — drives the procedural normal/color. */
export type WallStyle = "quilted" | "fluted" | "woven" | "travertine" | "smooth";
/** Statement ceiling over the hero zone. */
export type CeilingStyle = "organic-oval" | "gold-dome" | "marquetry-disc" | "amorphous";
/** Suspended lighting sculpture under the ceiling feature. */
export type ChandelierStyle = "gold-petal" | "crystal-cascade" | "none";
/** Floor treatment. */
export type FloorStyle = "swirl-marble" | "herringbone-oak" | "pale-marble" | "plank-walnut";
/** Feature-wall art motif. */
export type MuralMotif =
  | "panther"
  | "cherry-blossom"
  | "chinoiserie"
  | "bamboo"
  | "marquetry-sunburst"
  | "kintsugi";

/**
 * Per-boutique architecture identity. Fixtures stay brand-standard across the
 * network; the shell — stone, walls, wainscot, ceiling, chandelier, feature
 * art, floor, rugs and lounge upholstery — is local to each maison.
 */
export interface BoutiqueTheme {
  /** Stable key for material caches. */
  id: string;
  marble: MarblePalette;
  /** Upper wall field color. */
  wallField: string;
  wallStyle: WallStyle;
  /** Wainscot panel colors (alternating by wall orientation). */
  wainscotA: string;
  wainscotB: string;
  wainscotStyle: WallStyle;
  columnColor: string;
  rugColor: string;
  floorStyle: FloorStyle;
  /** Warm wood tone for herringbone/plank floors. */
  floorWood: string;
  ceilingStyle: CeilingStyle;
  /** Emissive glow color of the cove / dome. */
  ceilingGlow: string;
  chandelier: ChandelierStyle;
  muralMotif: MuralMotif;
  /** Motif colors: [ground, primary, secondary, accent]. */
  muralPalette: [string, string, string, string];
  /** Jewel-tone velvet options for lounge/VIP seating. */
  accentUpholstery: string[];
}

// ───────────────────────────── Layout ─────────────────────────────

export interface BoutiqueLayout {
  id: string;
  name: string;
  market: string;
  tier: "tier1" | "tier2";
  theme: BoutiqueTheme;
  floor: FloorSpec;
  zones: ZoneConfig[];
  fixtures: FixtureInstance[];
}

export interface LayoutMeta {
  id: string;
  name: string;
  market: string;
  tier: "tier1" | "tier2";
  areaSqm: number;
  fixtureCount: number;
}

// ───────────────────────────── Planograms ─────────────────────────────

export interface SlotAddress {
  fixtureId: string;
  row: number;
  col: number;
  layer: number;
}

/** Stable string key for a slot address. Never use positional array indices. */
export type SlotKey = string;

export interface SlotState {
  sku: string | null;
  /** 0–100. */
  stockLevel: number;
  campaignFlag: boolean;
  exclusivityTier: ExclusivityTier;
}

export interface Planogram {
  id: string;
  name: string;
  /** Optional fixture-kind scope: template planograms apply per fixture kind. */
  fixtureKind: FixtureKind | null;
  /** Snapshot of slot states keyed by SlotKey. */
  slots: Record<SlotKey, SlotState>;
  createdAt: string;
}

export interface PlanogramMeta {
  id: string;
  name: string;
  fixtureKind: FixtureKind | null;
  slotCount: number;
  createdAt: string;
}

export type PlanogramDiffKind = "added" | "removed" | "changed" | "moved";

export interface PlanogramDiff {
  slot: SlotAddress;
  kind: PlanogramDiffKind;
  before: SlotState | null;
  after: SlotState | null;
}

// ───────────────────────────── Bulk updates ─────────────────────────────

export type BulkTarget =
  | { scope: "slot"; slot: SlotAddress }
  | { scope: "fixture"; fixtureId: string }
  | { scope: "zone"; zoneId: string }
  | { scope: "floor" };

export type BulkOperation =
  | { op: "apply-template"; planogramId: string }
  | { op: "set-campaign"; active: boolean }
  | { op: "clear" }
  | { op: "restock"; stockLevel: number };

export interface BulkUpdateJob {
  target: BulkTarget;
  operation: BulkOperation;
}

export interface BulkUpdatePreview {
  job: BulkUpdateJob;
  diffs: PlanogramDiff[];
  affectedFixtures: number;
  affectedSlots: number;
}

// ───────────────────────────── Inventory signals ─────────────────────────────

export interface InventoryRecord {
  sku: string;
  /** 0–100. */
  stockLevel: number;
  /** ISO date of last replenishment. */
  replenishmentDate: string;
  campaignActive: boolean;
  zoneAssignment: string[];
}

export interface AssortmentGap {
  zoneId: string;
  category: ProductCategory;
  expected: number;
  actual: number;
}

export interface AdjacencyViolation {
  zoneA: string;
  zoneB: string;
  rule: string;
  severity: "warn" | "flag";
}

// ───────────────────────────── Analytics ─────────────────────────────

export interface AnalyticsQuery {
  layoutId: string;
  metric: "revenue-sqm" | "traffic" | "dwell" | "stock-coverage";
  /** Time window in days (mock generator honours it deterministically). */
  windowDays: number;
}

export interface ZoneAnalytics {
  zoneId: string;
  /** EUR per m² — mock data, clearly labelled as mock in UI. */
  revenuePerSqm: number;
  /** Relative traffic rank share, 0–1. */
  trafficShare: number;
  /** Average dwell seconds. */
  dwellSeconds: number;
  /** 0–1 share of slots at healthy stock. */
  stockCoverage: number;
  gapCount: number;
  adjacencyFlags: number;
}

export interface TrafficPath {
  /** Bézier control points on the floor plane, [x, z]. */
  points: Array<[number, number]>;
  /** 0–1 intensity driving arc thickness/opacity. */
  intensity: number;
}

export interface AnalyticsResult {
  layoutId: string;
  generatedAt: string;
  isMock: boolean;
  zones: ZoneAnalytics[];
  paths: TrafficPath[];
  gaps: AssortmentGap[];
  adjacency: AdjacencyViolation[];
}

// ───────────────────────────── Store adapter (extension seam) ─────────────────────────────

export interface StoreAdapter {
  // Boutique layout
  saveLayout(layout: BoutiqueLayout): Promise<void>;
  loadLayout(id: string): Promise<BoutiqueLayout>;
  listLayouts(): Promise<LayoutMeta[]>;

  // Planograms
  savePlanogram(p: Planogram): Promise<void>;
  loadPlanogram(id: string): Promise<Planogram>;
  listPlanograms(fixtureKind?: FixtureKind): Promise<PlanogramMeta[]>;

  // Inventory signals
  getInventorySignals(zone?: string): Promise<InventoryRecord[]>;
  pushInventoryUpdate(records: InventoryRecord[]): Promise<void>;

  // Analytics
  getAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult>;
}

// ───────────────────────────── Helpers ─────────────────────────────

export function slotKey(a: SlotAddress): SlotKey {
  return `${a.fixtureId}#${a.row},${a.col},${a.layer}`;
}

export function parseSlotKey(key: SlotKey): SlotAddress {
  const [fixtureId, rest] = key.split("#");
  const [row, col, layer] = rest.split(",").map((n) => parseInt(n, 10));
  return { fixtureId, row, col, layer };
}

export function polygonArea(poly: Array<[number, number]>): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const [x1, z1] = poly[i];
    const [x2, z2] = poly[(i + 1) % poly.length];
    s += x1 * z2 - x2 * z1;
  }
  return Math.abs(s) / 2;
}

export function pointInPolygon(x: number, z: number, poly: Array<[number, number]>): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, zi] = poly[i];
    const [xj, zj] = poly[j];
    if (zi > z !== zj > z && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
  }
  return inside;
}

export function polygonCentroid(poly: Array<[number, number]>): [number, number] {
  let cx = 0;
  let cz = 0;
  for (const [x, z] of poly) {
    cx += x;
    cz += z;
  }
  return [cx / poly.length, cz / poly.length];
}
