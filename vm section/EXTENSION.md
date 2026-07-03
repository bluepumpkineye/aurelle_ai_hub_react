# EXTENSION.md — Aurelle Boutique Planner integration seams

The planner ships fully in-memory. Every integration point is a typed
interface in `web/src/vm/data/types.ts`; the in-memory implementations can be
replaced without touching callers. This document is written to be reviewable
without reading the code.

## 1. StoreAdapter → retail platform API

`StoreAdapter` (types.ts) is the single persistence seam:

- `saveLayout / loadLayout / listLayouts` — boutique layouts
- `savePlanogram / loadPlanogram / listPlanograms` — named planograms
- `getInventorySignals / pushInventoryUpdate` — inventory records
- `getAnalytics` — analytics aggregates

`InMemoryStoreAdapter` (data/InMemoryStoreAdapter.ts) ships with the app and
is constructed in `VMController`. A network implementation (REST or GraphQL
against the maison retail platform) implements the same interface and is a
one-line swap in `VMController`'s constructor. All methods are already
async — no caller changes for network latency.

## 2. InventorySignalStore → live WebSocket feed

Live stock signals currently come from a deterministic mock pulse
(`VMStore.startSignalPulse`, configurable rate, default 4 s). A live feed
replaces the pulse by calling the same entry point the UI uses:

```ts
socket.onmessage = (m) => {
  const { sku, stockLevel } = JSON.parse(m.data);
  store.setStockLevel(sku, stockLevel); // propagates: slots → overlays → analytics, <100 ms
};
```

Propagation is one reactive pass (no polling): slot states update, low-stock
pulses re-render, gap detection re-runs, the dashboard re-aggregates.
Measured propagation: ~17 ms for a full pass.

## 3. AnalyticsAdapter → BI platform

`AnalyticsResult` (zones, traffic paths, gaps, adjacency) is produced by
`data/AnalyticsEngine.ts` and clearly labelled `isMock: true`. A BI-backed
provider (Looker/Tableau query) plugs in via
`InMemoryStoreAdapter.setAnalyticsProvider()` or a full `StoreAdapter`
replacement. The 3D overlays and the dashboard consume only the
`AnalyticsResult` shape — they do not know where numbers come from.

## 4. FixtureLibrary → CMS-driven catalog

Fixture templates are typed configs in `fixtures/FixtureCatalog.ts`
(`FixtureTemplate`: dims ranges, slot grid, lighting attachments, finish).
A CMS catalog with brand-approved locked dimensions replaces the static
array; the parametric constructors in `fixtures/FixtureBuilder.ts` consume
the config unchanged.

## 5. PlanogramStore → versioned repository with approval workflow

Planograms serialize as plain JSON (`Planogram` type: named snapshot of slot
states, wildcard fixture addressing so templates apply across fixtures of a
kind). A version-controlled repository adds `status: draft|submitted|approved`
metadata around the same payload; `savePlanogram` is the natural submit hook.

## 6. UserSession → SSO

The hub's existing bearer-token session wraps the planner (the VM page mounts
inside the authenticated Shell). Maison identity-provider SSO integrates at
the hub level; the planner itself is stateless with respect to identity.

## 7. Regional VM standards

- Aisle minimum (1.2 m) is a constant in `store/VMStore.ts` (`AISLE_MIN`).
- Brand lighting/material constants (2900 K, IOR 1.52, champagne gold /
  brushed platinum, zone velvet palettes) live in `fixtures/FixtureCatalog.ts`
  and `stores/layouts.ts`.
- Daylight latitude presets: `?lat=31.2` (Shanghai default), `?lat=1.3`
  (Singapore), `?lat=35.6` (Tokyo) — parsed in `core/Params.ts`.

A per-market `AurelleRegionConfig` would gather these into one injected
object; every consumer already reads them from config rather than literals.

## 8. Determinism / deep links

- `?store=hk-princes | bj-flagship` — boutique selection (deterministic
  layout + merchandising reproduction)
- `?hud=1` — boot with the F3 debug HUD open (tooling)
- `?quality=high|balanced|igpu` — override GPU auto-detection
- `?nogate=1` — bypass the browser gate (WebGPU probe still runs, fail-loud)
