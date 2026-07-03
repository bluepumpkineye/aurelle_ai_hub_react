/**
 * InMemoryStoreAdapter — the implementation of StoreAdapter that ships with
 * the app (PRD §7). All data lives in typed maps for the session. A network
 * implementation (REST/GraphQL against the retail platform) is a drop-in
 * replacement documented in EXTENSION.md — no caller changes.
 */

import type {
  AnalyticsQuery,
  AnalyticsResult,
  BoutiqueLayout,
  FixtureKind,
  InventoryRecord,
  LayoutMeta,
  Planogram,
  PlanogramMeta,
  StoreAdapter,
} from "./types";
import { polygonArea } from "./types";

export class InMemoryStoreAdapter implements StoreAdapter {
  private layouts = new Map<string, BoutiqueLayout>();
  private planograms = new Map<string, Planogram>();
  private inventory = new Map<string, InventoryRecord>();
  private analyticsProvider: ((query: AnalyticsQuery) => AnalyticsResult) | null = null;

  /** Wire the live analytics computation (in-memory build only). */
  setAnalyticsProvider(fn: (query: AnalyticsQuery) => AnalyticsResult): void {
    this.analyticsProvider = fn;
  }

  async saveLayout(layout: BoutiqueLayout): Promise<void> {
    this.layouts.set(layout.id, structuredClone(layout));
  }

  async loadLayout(id: string): Promise<BoutiqueLayout> {
    const l = this.layouts.get(id);
    if (!l) throw new Error(`Layout not found: ${id}`);
    return structuredClone(l);
  }

  async listLayouts(): Promise<LayoutMeta[]> {
    return Array.from(this.layouts.values()).map((l) => ({
      id: l.id,
      name: l.name,
      market: l.market,
      tier: l.tier,
      areaSqm: Math.round(l.floor.width * l.floor.depth),
      fixtureCount: l.fixtures.length,
    }));
  }

  async savePlanogram(p: Planogram): Promise<void> {
    this.planograms.set(p.id, structuredClone(p));
  }

  async loadPlanogram(id: string): Promise<Planogram> {
    const p = this.planograms.get(id);
    if (!p) throw new Error(`Planogram not found: ${id}`);
    return structuredClone(p);
  }

  async listPlanograms(fixtureKind?: FixtureKind): Promise<PlanogramMeta[]> {
    return Array.from(this.planograms.values())
      .filter((p) => !fixtureKind || p.fixtureKind === fixtureKind)
      .map((p) => ({
        id: p.id,
        name: p.name,
        fixtureKind: p.fixtureKind,
        slotCount: Object.keys(p.slots).length,
        createdAt: p.createdAt,
      }));
  }

  async getInventorySignals(zone?: string): Promise<InventoryRecord[]> {
    const all = Array.from(this.inventory.values());
    return zone ? all.filter((r) => r.zoneAssignment.includes(zone)) : all;
  }

  async pushInventoryUpdate(records: InventoryRecord[]): Promise<void> {
    for (const r of records) this.inventory.set(r.sku, structuredClone(r));
  }

  async getAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult> {
    if (!this.analyticsProvider) {
      throw new Error("Analytics provider not wired (in-memory build requires setAnalyticsProvider)");
    }
    return this.analyticsProvider(query);
  }

  /** Utility for the layout picker — area of a zone polygon, m². */
  static zoneArea(polygon: Array<[number, number]>): number {
    return polygonArea(polygon);
  }
}
