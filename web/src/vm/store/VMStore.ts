/**
 * VMStore — the live, reactive runtime state of the boutique planner.
 *
 * Single source of truth for the current layout, every slot state, saved
 * planograms, inventory signals and selection. The 3D scene and the React
 * panels both subscribe to the same events; every mutation propagates
 * store → slot states → overlays → analytics in one reactive pass
 * (PRD §3.5 — no polling loops). Persistence goes through StoreAdapter.
 */

import { Emitter } from "../core/Events";
import { Rng, hashString } from "../core/Seed";
import { SKU_BY_ID, skusForCategory } from "../data/catalog";
import type {
  AnalyticsResult,
  BoutiqueLayout,
  BulkUpdateJob,
  BulkUpdatePreview,
  FixtureInstance,
  FixtureTemplate,
  Planogram,
  PlanogramDiff,
  SlotAddress,
  SlotKey,
  SlotState,
  StoreAdapter,
} from "../data/types";
import { pointInPolygon, slotKey } from "../data/types";
import { templateOf } from "../fixtures/FixtureCatalog";
import { computeAnalytics } from "../data/AnalyticsEngine";
import { diffPlanograms } from "../planogram/DiffEngine";
import { UndoStack } from "../planogram/UndoStack";

// ───────────────────────────── UI state types ─────────────────────────────

export type VMSelection =
  | { kind: "none" }
  | { kind: "fixture"; fixtureId: string }
  | { kind: "slot"; slot: SlotAddress }
  | { kind: "zone"; zoneId: string };

export interface OverlayState {
  heatmap: boolean;
  heatmapOpacity: number;
  traffic: boolean;
  dwell: boolean;
  stock: boolean;
  gaps: boolean;
  adjacency: boolean;
  zones: boolean;
}

export const DEFAULT_OVERLAYS: OverlayState = {
  heatmap: false,
  heatmapOpacity: 0.5,
  traffic: false,
  dwell: false,
  stock: true,
  gaps: true,
  adjacency: false,
  zones: false,
};

export interface VMEvents extends Record<string, unknown> {
  "layout-loaded": BoutiqueLayout;
  "slots-changed": SlotKey[];
  "fixtures-changed": string[];
  "inventory-changed": string[];
  "planograms-changed": undefined;
  "selection-changed": VMSelection;
  "overlays-changed": OverlayState;
  "diff-preview": PlanogramDiff[] | null;
  "undo-changed": { depth: number; redoDepth: number };
  "analytics-changed": AnalyticsResult;
  toast: { message: string; tone: "info" | "warn" | "error" };
}

const AISLE_MIN = 1.2; // metres — Aurelle brand VM standard, enforced at placement time.

// ───────────────────────────── Store ─────────────────────────────

export class VMStore {
  readonly events = new Emitter<VMEvents>();
  readonly undoStack = new UndoStack(32);

  private layoutState: BoutiqueLayout | null = null;
  private slots = new Map<SlotKey, SlotState>();
  private planograms = new Map<string, Planogram>();
  private stock = new Map<string, number>(); // sku → 0..100
  private campaigns = new Set<string>();
  private replenishment = new Map<string, string>();
  private selectionState: VMSelection = { kind: "none" };
  private overlayState: OverlayState = { ...DEFAULT_OVERLAYS };
  private analyticsCache: AnalyticsResult | null = null;
  private planogramCounter = 1;
  private pulseTimer: number | null = null;
  private pulseRng = new Rng(0x51677a1);

  constructor(readonly adapter: StoreAdapter) {}

  // ── Layout ──

  get layout(): BoutiqueLayout {
    if (!this.layoutState) throw new Error("VMStore: no layout loaded");
    return this.layoutState;
  }

  get hasLayout(): boolean {
    return this.layoutState !== null;
  }

  loadLayout(layout: BoutiqueLayout, initialSlots: Map<SlotKey, SlotState>): void {
    this.layoutState = layout;
    this.slots = new Map(initialSlots);
    this.undoStack.clear();
    this.selectionState = { kind: "none" };
    this.analyticsCache = null;

    // Seed inventory from the slots present in this layout.
    this.stock.clear();
    this.campaigns.clear();
    this.replenishment.clear();
    const dateRng = new Rng(hashString(layout.id));
    for (const state of this.slots.values()) {
      if (!state.sku) continue;
      if (!this.stock.has(state.sku)) {
        this.stock.set(state.sku, state.stockLevel);
        const daysAgo = dateRng.int(1, 28);
        const d = new Date(Date.now() - daysAgo * 86400000);
        this.replenishment.set(state.sku, d.toISOString().slice(0, 10));
        if (state.campaignFlag) this.campaigns.add(state.sku);
      }
    }

    this.events.emit("layout-loaded", layout);
    this.events.emit("slots-changed", Array.from(this.slots.keys()));
    this.emitUndo();
    this.refreshAnalytics();
  }

  fixture(fixtureId: string): FixtureInstance | undefined {
    return this.layout.fixtures.find((f) => f.id === fixtureId);
  }

  template(fixtureId: string): FixtureTemplate | undefined {
    const f = this.fixture(fixtureId);
    return f ? templateOf(f.templateId) : undefined;
  }

  // ── Slot access ──

  slot(key: SlotKey): SlotState | undefined {
    return this.slots.get(key);
  }

  slotStates(): ReadonlyMap<SlotKey, SlotState> {
    return this.slots;
  }

  slotKeysForFixture(fixtureId: string): SlotKey[] {
    const f = this.fixture(fixtureId);
    if (!f) return [];
    const grid = templateOf(f.templateId).slotGrid;
    if (!grid) return [];
    const keys: SlotKey[] = [];
    for (let layer = 0; layer < grid.layers; layer++)
      for (let row = 0; row < grid.rows; row++)
        for (let col = 0; col < grid.cols; col++)
          keys.push(slotKey({ fixtureId, row, col, layer }));
    return keys;
  }

  slotKeysForZone(zoneId: string): SlotKey[] {
    const out: SlotKey[] = [];
    for (const f of this.layout.fixtures) {
      if (f.zoneId === zoneId) out.push(...this.slotKeysForFixture(f.id));
    }
    return out;
  }

  allSlotKeys(): SlotKey[] {
    const out: SlotKey[] = [];
    for (const f of this.layout.fixtures) out.push(...this.slotKeysForFixture(f.id));
    return out;
  }

  // ── Slot mutation (undoable) ──

  setSlot(address: SlotAddress, next: SlotState, label = "Edit slot"): void {
    const key = slotKey(address);
    const prev = this.slots.get(key) ?? null;
    this.applySlotBatch(new Map([[key, next]]), label, new Map([[key, prev]]));
  }

  clearSlot(address: SlotAddress): void {
    this.setSlot(
      address,
      { sku: null, stockLevel: 0, campaignFlag: false, exclusivityTier: "standard" },
      "Clear slot",
    );
  }

  placeSku(address: SlotAddress, skuId: string): void {
    const sku = SKU_BY_ID.get(skuId);
    if (!sku) return;
    const stockLevel = this.stock.get(skuId) ?? 75;
    this.setSlot(
      address,
      {
        sku: skuId,
        stockLevel,
        campaignFlag: this.campaigns.has(skuId),
        exclusivityTier: sku.tier,
      },
      `Place ${skuId}`,
    );
  }

  private applySlotBatch(
    next: Map<SlotKey, SlotState>,
    label: string,
    prevOverride?: Map<SlotKey, SlotState | null>,
  ): void {
    const prev =
      prevOverride ??
      new Map<SlotKey, SlotState | null>(
        Array.from(next.keys()).map((k) => [k, this.slots.get(k) ?? null]),
      );

    const write = (states: Map<SlotKey, SlotState | null>) => {
      const changed: SlotKey[] = [];
      for (const [k, s] of states) {
        if (s === null) this.slots.delete(k);
        else this.slots.set(k, s);
        changed.push(k);
      }
      this.afterSlotsChanged(changed);
    };

    this.undoStack.push({
      label,
      undo: () => write(prev),
      redo: () => write(new Map(next)),
    });
    write(new Map(next));
    this.emitUndo();
  }

  private afterSlotsChanged(keys: SlotKey[]): void {
    this.events.emit("slots-changed", keys);
    this.refreshAnalytics();
  }

  // ── Fixture placement (aisle-guarded, undoable) ──

  /** Returns null if valid, otherwise a human-readable rejection reason. */
  validatePlacement(instance: FixtureInstance, ignoreId?: string): string | null {
    const t = templateOf(instance.templateId);
    const floor = this.layout.floor;
    const isWall = t.kind.startsWith("wall-") || t.kind === "showcase-wall";
    const isCeiling = t.kind.startsWith("light-");
    // Quarter-turn rotations swap the footprint extents.
    const quarterTurns = Math.round(instance.rotationY / (Math.PI / 2)) % 2 !== 0;
    const halfW = (quarterTurns ? instance.dims.depth : instance.dims.width) / 2;
    const halfD = (quarterTurns ? instance.dims.width : instance.dims.depth) / 2;
    const r = Math.max(halfW, halfD);

    if (
      instance.x - r < -floor.width / 2 + 0.05 ||
      instance.x + r > floor.width / 2 - 0.05 ||
      instance.z - r < -floor.depth / 2 + 0.05 ||
      instance.z + r > floor.depth / 2 - 0.05
    ) {
      return "Placement rejected: fixture would extend beyond the floor plate.";
    }

    if (isCeiling) return null; // Lighting rigs live on the ceiling plane — no aisle impact.

    for (const other of this.layout.fixtures) {
      if (other.id === instance.id || other.id === ignoreId) continue;
      const ot = templateOf(other.templateId);
      if (ot.kind.startsWith("light-")) continue;
      const otherWall = ot.kind.startsWith("wall-") || ot.kind === "showcase-wall";
      const isSeat = t.kind.startsWith("seating-");
      const otherSeat = ot.kind.startsWith("seating-");
      const otherCounter = ot.kind.startsWith("counter-");
      const isCounter = t.kind.startsWith("counter-");
      // The 1.2 m minimum protects circulation aisles between display fixtures.
      // Wall-mounted runs sit flush; seating groups and client chairs at
      // counters are furnishing clusters, not aisles.
      let clearance = AISLE_MIN;
      if (isWall || otherWall) clearance = 0.3;
      if (isSeat && otherSeat) clearance = 0.1;
      else if ((isSeat && otherCounter) || (isCounter && otherSeat)) clearance = 0.4;
      const otherTurns = Math.round(other.rotationY / (Math.PI / 2)) % 2 !== 0;
      const otherHalfW = (otherTurns ? other.dims.depth : other.dims.width) / 2;
      const otherHalfD = (otherTurns ? other.dims.width : other.dims.depth) / 2;
      const dx = Math.abs(instance.x - other.x);
      const dz = Math.abs(instance.z - other.z);
      const minX = halfW + otherHalfW + clearance;
      const minZ = halfD + otherHalfD + clearance;
      if (dx < minX && dz < minZ) {
        return `Placement rejected: ${ot.name} nearby — the 1.2 m Aurelle aisle minimum would be violated.`;
      }
    }
    return null;
  }

  moveFixture(fixtureId: string, x: number, z: number, rotationY?: number): boolean {
    const f = this.fixture(fixtureId);
    if (!f) return false;
    const candidate: FixtureInstance = {
      ...f,
      x,
      z,
      rotationY: rotationY ?? f.rotationY,
    };
    const rejection = this.validatePlacement(candidate, fixtureId);
    if (rejection) {
      this.toast(rejection, "warn");
      return false;
    }
    const prev = { x: f.x, z: f.z, rotationY: f.rotationY, zoneId: f.zoneId };
    const nextZone = this.zoneAt(x, z) ?? f.zoneId;
    const write = (px: number, pz: number, rot: number, zone: string) => {
      f.x = px;
      f.z = pz;
      f.rotationY = rot;
      f.zoneId = zone;
      this.events.emit("fixtures-changed", [fixtureId]);
      this.refreshAnalytics();
    };
    this.undoStack.push({
      label: "Move fixture",
      undo: () => write(prev.x, prev.z, prev.rotationY, prev.zoneId),
      redo: () => write(x, z, candidate.rotationY, nextZone),
    });
    write(x, z, candidate.rotationY, nextZone);
    this.emitUndo();
    return true;
  }

  addFixture(templateId: string, x: number, z: number): FixtureInstance | null {
    const t = templateOf(templateId);
    const id = `fx-${templateId}-${Date.now().toString(36)}-${Math.floor(Math.random() * 1e4)}`;
    const zoneId = this.zoneAt(x, z) ?? this.layout.zones[0]?.id ?? "";
    const instance: FixtureInstance = {
      id,
      templateId,
      zoneId,
      x,
      z,
      rotationY: 0,
      dims: { ...t.dims.default },
      finish: t.finish,
      variationSeed: hashString(id),
    };
    const rejection = this.validatePlacement(instance);
    if (rejection) {
      this.toast(rejection, "warn");
      return null;
    }
    const write = (add: boolean) => {
      if (add) this.layout.fixtures.push(instance);
      else {
        const i = this.layout.fixtures.findIndex((f) => f.id === id);
        if (i >= 0) this.layout.fixtures.splice(i, 1);
      }
      this.events.emit("fixtures-changed", [id]);
      this.refreshAnalytics();
    };
    this.undoStack.push({ label: `Add ${t.name}`, undo: () => write(false), redo: () => write(true) });
    write(true);
    this.emitUndo();
    this.toast(`${t.name} placed`, "info");
    return instance;
  }

  removeFixture(fixtureId: string): void {
    const idx = this.layout.fixtures.findIndex((f) => f.id === fixtureId);
    if (idx < 0) return;
    const instance = this.layout.fixtures[idx];
    const removedSlots = new Map<SlotKey, SlotState>();
    for (const k of this.slotKeysForFixture(fixtureId)) {
      const s = this.slots.get(k);
      if (s) removedSlots.set(k, s);
    }
    const write = (remove: boolean) => {
      if (remove) {
        const i = this.layout.fixtures.findIndex((f) => f.id === fixtureId);
        if (i >= 0) this.layout.fixtures.splice(i, 1);
        for (const k of removedSlots.keys()) this.slots.delete(k);
      } else {
        this.layout.fixtures.splice(Math.min(idx, this.layout.fixtures.length), 0, instance);
        for (const [k, s] of removedSlots) this.slots.set(k, s);
      }
      this.events.emit("fixtures-changed", [fixtureId]);
      this.events.emit("slots-changed", Array.from(removedSlots.keys()));
      this.refreshAnalytics();
    };
    this.undoStack.push({
      label: "Remove fixture",
      undo: () => write(false),
      redo: () => write(true),
    });
    write(true);
    if (this.selectionState.kind === "fixture" && this.selectionState.fixtureId === fixtureId) {
      this.select({ kind: "none" });
    }
    this.emitUndo();
  }

  zoneAt(x: number, z: number): string | null {
    for (const zone of this.layout.zones) {
      if (pointInPolygon(x, z, zone.polygon)) return zone.id;
    }
    return null;
  }

  // ── Planograms ──

  savePlanogramFromFixture(fixtureId: string, name: string): Planogram | null {
    const f = this.fixture(fixtureId);
    if (!f) return null;
    const t = templateOf(f.templateId);
    if (!t.slotGrid) return null;
    const slots: Record<SlotKey, SlotState> = {};
    for (const k of this.slotKeysForFixture(fixtureId)) {
      const s = this.slots.get(k);
      if (!s) continue;
      // Template planograms use the wildcard fixture id so they apply anywhere.
      const generic = k.replace(`${fixtureId}#`, "*#");
      slots[generic] = { ...s };
    }
    const p: Planogram = {
      id: `pg-${this.planogramCounter++}-${Date.now().toString(36)}`,
      name,
      fixtureKind: t.kind,
      slots,
      createdAt: new Date().toISOString(),
    };
    this.planograms.set(p.id, p);
    void this.adapter.savePlanogram(p);
    this.events.emit("planograms-changed", undefined);
    this.toast(`Planogram “${name}” saved`, "info");
    return p;
  }

  registerPlanogram(p: Planogram): void {
    this.planograms.set(p.id, p);
    void this.adapter.savePlanogram(p);
    this.events.emit("planograms-changed", undefined);
  }

  planogram(id: string): Planogram | undefined {
    return this.planograms.get(id);
  }

  listPlanogramsSync(): Planogram[] {
    return Array.from(this.planograms.values());
  }

  /** Slot assignments a planogram template would produce on one fixture. */
  private projectPlanogram(p: Planogram, fixtureId: string): Map<SlotKey, SlotState> {
    const out = new Map<SlotKey, SlotState>();
    const f = this.fixture(fixtureId);
    if (!f) return out;
    const grid = templateOf(f.templateId).slotGrid;
    if (!grid) return out;
    for (const [generic, state] of Object.entries(p.slots)) {
      const addr = generic.split("#")[1];
      const [row, col, layer] = addr.split(",").map((n) => parseInt(n, 10));
      if (row >= grid.rows || col >= grid.cols || layer >= grid.layers) continue;
      const sku = state.sku ? SKU_BY_ID.get(state.sku) : null;
      if (state.sku && sku && !grid.accepts.includes(sku.category)) continue;
      out.set(slotKey({ fixtureId, row, col, layer }), {
        ...state,
        stockLevel: state.sku ? (this.stock.get(state.sku) ?? state.stockLevel) : 0,
      });
    }
    return out;
  }

  // ── Bulk update pipeline: target → operation → preview → confirm → undo ──

  targetFixtureIds(target: BulkUpdateJob["target"]): string[] {
    switch (target.scope) {
      case "slot":
        return [target.slot.fixtureId];
      case "fixture":
        return [target.fixtureId];
      case "zone":
        return this.layout.fixtures.filter((f) => f.zoneId === target.zoneId).map((f) => f.id);
      case "floor":
        return this.layout.fixtures.map((f) => f.id);
    }
  }

  previewBulkUpdate(job: BulkUpdateJob): BulkUpdatePreview {
    const next = this.computeBulkNext(job);
    const before = new Map<SlotKey, SlotState>();
    for (const k of next.keys()) {
      const s = this.slots.get(k);
      if (s) before.set(k, s);
    }
    const diffs = diffPlanograms(before, next);
    const fixtures = new Set<string>();
    for (const k of next.keys()) fixtures.add(k.split("#")[0]);
    return { job, diffs, affectedFixtures: fixtures.size, affectedSlots: next.size };
  }

  applyBulkUpdate(job: BulkUpdateJob): number {
    const t0 = performance.now();
    const next = this.computeBulkNext(job);
    if (next.size === 0) {
      this.toast("Bulk update: no matching slots for this target.", "warn");
      return 0;
    }
    const label =
      job.operation.op === "apply-template"
        ? "Bulk: apply planogram"
        : job.operation.op === "set-campaign"
          ? "Bulk: campaign flags"
          : job.operation.op === "clear"
            ? "Bulk: clear slots"
            : "Bulk: restock";
    this.applySlotBatch(next, label);
    const ms = performance.now() - t0;
    this.toast(`${label} — ${next.size} slots in ${ms.toFixed(1)} ms`, "info");
    if (ms > 100) {
      // eslint-disable-next-line no-console
      console.warn(`[Aurelle VM] bulk update exceeded 100 ms budget: ${ms.toFixed(1)} ms`);
    }
    return next.size;
  }

  private computeBulkNext(job: BulkUpdateJob): Map<SlotKey, SlotState> {
    const next = new Map<SlotKey, SlotState>();
    const op = job.operation;

    if (job.target.scope === "slot") {
      const k = slotKey(job.target.slot);
      const cur = this.slots.get(k) ?? {
        sku: null,
        stockLevel: 0,
        campaignFlag: false,
        exclusivityTier: "standard" as const,
      };
      const n = this.applyOpToSlot(cur, op, k);
      if (n) next.set(k, n);
      return next;
    }

    const fixtureIds = this.targetFixtureIds(job.target);
    for (const fid of fixtureIds) {
      if (op.op === "apply-template") {
        const p = this.planograms.get(op.planogramId);
        if (!p) continue;
        const f = this.fixture(fid);
        if (!f) continue;
        if (p.fixtureKind && templateOf(f.templateId).kind !== p.fixtureKind) continue;
        for (const [k, s] of this.projectPlanogram(p, fid)) next.set(k, s);
      } else {
        for (const k of this.slotKeysForFixture(fid)) {
          const cur = this.slots.get(k);
          if (!cur) continue;
          const n = this.applyOpToSlot(cur, op, k);
          if (n) next.set(k, n);
        }
      }
    }
    return next;
  }

  private applyOpToSlot(
    cur: SlotState,
    op: BulkUpdateJob["operation"],
    _key: SlotKey,
  ): SlotState | null {
    switch (op.op) {
      case "apply-template":
        return null; // handled at fixture level
      case "set-campaign":
        if (!cur.sku) return null;
        return { ...cur, campaignFlag: op.active };
      case "clear":
        if (!cur.sku) return null;
        return { sku: null, stockLevel: 0, campaignFlag: false, exclusivityTier: "standard" };
      case "restock":
        if (!cur.sku) return null;
        return { ...cur, stockLevel: op.stockLevel };
    }
  }

  // ── Inventory signals ──

  stockOf(skuId: string): number {
    return this.stock.get(skuId) ?? 0;
  }

  replenishmentOf(skuId: string): string {
    return this.replenishment.get(skuId) ?? "—";
  }

  /** Store change → slot states → overlays → analytics, one reactive pass. */
  setStockLevel(skuId: string, level: number, source: "manual" | "pulse" = "manual"): void {
    const clamped = Math.max(0, Math.min(100, Math.round(level)));
    this.stock.set(skuId, clamped);
    if (source === "pulse" && clamped > 60) {
      this.replenishment.set(skuId, new Date().toISOString().slice(0, 10));
    }
    const changed: SlotKey[] = [];
    for (const [k, s] of this.slots) {
      if (s.sku === skuId && s.stockLevel !== clamped) {
        this.slots.set(k, { ...s, stockLevel: clamped });
        changed.push(k);
      }
    }
    this.events.emit("inventory-changed", [skuId]);
    if (changed.length) this.afterSlotsChanged(changed);
    else this.refreshAnalytics();
  }

  /** Mock live-signal generator; configurable pulse rate (ms). 0 stops it. */
  startSignalPulse(intervalMs: number): void {
    this.stopSignalPulse();
    if (intervalMs <= 0) return;
    this.pulseTimer = window.setInterval(() => {
      const skus = Array.from(this.stock.keys());
      if (!skus.length) return;
      const sku = skus[this.pulseRng.int(0, skus.length - 1)];
      const cur = this.stock.get(sku) ?? 50;
      // Sell-through drains stock; occasional replenishment tops it up.
      const replenish = this.pulseRng.chance(0.18);
      const next = replenish ? this.pulseRng.int(70, 100) : cur - this.pulseRng.int(4, 16);
      this.setStockLevel(sku, next, "pulse");
    }, intervalMs);
  }

  stopSignalPulse(): void {
    if (this.pulseTimer !== null) {
      window.clearInterval(this.pulseTimer);
      this.pulseTimer = null;
    }
  }

  get pulseActive(): boolean {
    return this.pulseTimer !== null;
  }

  // ── Selection / overlays / diff preview ──

  get selection(): VMSelection {
    return this.selectionState;
  }

  select(sel: VMSelection): void {
    this.selectionState = sel;
    this.events.emit("selection-changed", sel);
  }

  get overlays(): OverlayState {
    return this.overlayState;
  }

  setOverlays(next: Partial<OverlayState>): void {
    this.overlayState = { ...this.overlayState, ...next };
    this.events.emit("overlays-changed", this.overlayState);
  }

  showDiffPreview(diffs: PlanogramDiff[] | null): void {
    this.events.emit("diff-preview", diffs);
  }

  // ── Undo / redo ──

  undo(): void {
    const label = this.undoStack.undo();
    if (label) this.toast(`Undo: ${label}`, "info");
    this.emitUndo();
  }

  redo(): void {
    const label = this.undoStack.redo();
    if (label) this.toast(`Redo: ${label}`, "info");
    this.emitUndo();
  }

  private emitUndo(): void {
    this.events.emit("undo-changed", {
      depth: this.undoStack.depth,
      redoDepth: this.undoStack.redoDepth,
    });
  }

  // ── Analytics ──

  get analytics(): AnalyticsResult {
    if (!this.analyticsCache) this.analyticsCache = computeAnalytics(this);
    return this.analyticsCache;
  }

  private refreshAnalytics(): void {
    this.analyticsCache = computeAnalytics(this);
    this.events.emit("analytics-changed", this.analyticsCache);
  }

  toast(message: string, tone: "info" | "warn" | "error"): void {
    this.events.emit("toast", { message, tone });
  }

  dispose(): void {
    this.stopSignalPulse();
    this.events.clear();
  }
}
