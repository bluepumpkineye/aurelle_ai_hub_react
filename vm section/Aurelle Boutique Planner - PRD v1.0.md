Aurelle Boutique Planner — PRD v1.0
Adapted from PROJECT LAAS for Luxury Visual Merchandising
Executive Summary
Aurelle (operating on the Cartier APAC network) requires a browser-based 3D Visual Merchandiser delivering showroom-quality spatial planning for luxury boutiques. The system must feel as deliberate and refined as the product it presents: every showcase case, every lighting angle, every planogram decision rendered with the precision of a physical store walk-through — not a CAD floor plan, not a retail SaaS grid, but an immersive, real-time spatial intelligence tool.

The bar is set by how a Cartier regional VM director experiences a boutique opening walk: materials that read as glass and brushed gold, lighting that behaves like LED spots on velvet, spatial decisions that feel consequential because the room looks real.

The Bar
The visual target is architectural visualization quality — the kind produced by luxury interior render studios for boutique opening approvals. Reference frames live in /reference (five images: a Cartier-style watch display case interior, a jewelry atelier counter with spot lighting, a boutique entrance with marble flooring, a ring tray planogram close-up, and an APAC flagship exterior). Every phase is judged against those images, not against "functional retail software."

You will not fully reach photorealism. That is expected. The task is to close as much of the gap as WebGPU allows while maintaining the interactive performance a VM director needs during a live planning session, and to know precisely how far you got.

Reference-delta loop (mandatory, every phase): render the closest matching shot, place it side-by-side with the relevant reference, write DELTA.md: the ten most visually significant differences, ranked by impact. Fix the top three. Re-render. Only then does the phase close.

The Six Pillars
Every requirement serves one of these. If a decision arises that the document doesn't cover, resolve it in favor of the pillar.

A. Material Fidelity, Not Flat Surfaces.
Detail must live in geometry and PBR material response, not in flat-mapped approximations. Display cases have real glass thickness with refraction. Velvet trays show microfiber normal detail. Marble floors reflect display lighting with correct fresnel. Metal fixtures have brushed vs. polished zones. Rule: within 2 m of camera in a showcase shot, no surface may read as a uniform diffuse plane — every material shows specular response, micro-roughness variation, or geometry detail.

B. Lighting Transport.
No flat-lit interiors, ever. Spot-lit jewelry glows with caustic halos on velvet. Case interiors fill with soft-bounced LED warmth. Shadow edges contact-harden correctly under display spots. Ambient light sources (daylight from shopfront) fight correctly against interior spots. Rule: sample any jewelry piece in a showcase render — if it reads as uniformly lit without specular hotspot and shadow graduation, lighting has failed.

C. Nothing is Bare.
Every surface class has dressing. Empty cases are a planning error, not a valid state. Walls carry artwork, brand signage, material paneling. Floors have baseboards, transition strips, rugs. Counters have service elements. The boutique reads as a living commercial environment, not as assets placed on a floor plan. Unoccupied zones are flagged in the analytics overlay — they are a signal, not a default.

D. Distance Holds.
The full boutique floor readable from the entrance camera. Individual products legible in cases from 3 m. Zone labels and planogram overlays readable without zoom. A boutique that collapses into visual noise at the entrance-to-back-wall distance has failed spatial communication. Rule: the VM director must be able to read zone intent from the default "entrance standing" camera position.

E. Brand Direction.
Aurelle's color script is enforced: warm white spot lighting (2700–3200 K) against cool marble and glass, champagne gold fixture tones, deep navy/charcoal wall panels as shadow anchors, cream and ivory product surfaces as midground subjects. Every time-of-day or lighting-scenario mode obeys this palette. Showcase views are composed by the system's authored cameras, not accidentally found.

F. The Plan is Live.
Every VM decision — moving a case, swapping a planogram, changing an assortment — updates immediately in 3D. Inventory signals pulse on affected zones. Analytics overlays breathe with the data. A frozen planogram frame should still feel one product-swap away from change.

Operating Instructions
Build, don't describe. No plan-approval round trips. Long autonomous stretches.
Between two approaches, build the more deliberate, luxury-appropriate one.
Expect 15,000+ LOC across real modules (src/gpu/, src/boutique/, src/fixtures/, src/planogram/, src/lighting/, src/analytics/, src/ui/). One giant file = fail.
No stubs. A // TODO in a closed phase fails the phase.
Never ask the user to reduce scope. Infeasible item → nearest feasible alternative + entry in DEVIATIONS.md.
Under-rendering is a failure mode. A boutique shot that could support more geometric detail but doesn't is wasting the GPU and the director's trust.
1. Fixed Constraints
Constraint	Value
Language	TypeScript, strict: true, zero any
Build	Vite
Renderer	three.js (current) WebGPURenderer + TSL; raw WGSL compute passes where TSL limits
Fallback	None. No WebGL path. Fail loudly with diagnostics panel.
Assets	Zero external assets at runtime. Every mesh, texture, LUT, normal map: generated procedurally or from bundled parametric descriptions. Fixture library ships as parametric TypeScript constructors, not .glb files.
Data	In-memory only. All store layouts, planograms, assortment signals, and analytics are held in a typed in-memory store with a clearly documented StoreAdapter interface for future API/DB integration.
Determinism	?store=N reproduces a complete boutique layout.
Brand	All UI, color, and spatial defaults reflect Aurelle identity. No Cartier name exposed in UI or code strings.
2. Floors — These Numbers Define the Experience
Dimension	Floor
Store space	Full boutique floor plate up to 500 m²; multi-zone support (Entrance, High Jewelry, Watches, Accessories, VIP Room, Service Counter); wall/ceiling/floor as first-class geometry
Fixture library	≥ 20 parametric fixture templates: showcases (island, wall-mounted, tower, low-profile), display tables, pedestals, counters (service, cash-wrap), seating (client chairs, ottomans), wall systems (paneling, shelving, bracket), lighting rigs (track, recessed, accent). Each has configurable dimensions within brand-specified ranges.
Planogram engine	Per-fixture slot grid; products placed into slots; planogram saved as typed slot-map; bulk update applies new planogram to a zone or entire floor in one action; planogram diff view shows changes
Product templates	≥ 8 Aurelle product categories: rings, bracelets, necklaces, watches (dress / sport), earrings, brooches, small leather goods, fragrance. Each category has a parametric mesh generator producing display-quality silhouettes + PBR material response.
Material fidelity	Every fixture material: glass (IOR 1.52, thickness refraction), polished metal, brushed metal, velvet (fabric BRDF), marble (procedural veining, 3-frequency), lacquered wood, stone tile, carpet. No MeshBasicMaterial anywhere in the scene.
Rendered triangles	≥ 500k per frame in showcase close-up shots; ≥ 200k in full-floor overview shots (HUD-verified). Ceiling: whatever holds 60 fps.
Lighting	Per-fixture LED spot simulation (cone angle, beam spread, color temperature, intensity); ambient fill from shopfront daylight (time-of-day); shadow cascades for floor/case shadows; caustic approximation on jewelry pieces; display case interior bounce fill
GI approximation	Irradiance probe grid per zone (≥ 8×8×4 probes per zone), async updated; GTAO for contact shadows; screen-space bounce for display case interior glow; no flat-ambient anywhere
Shadows	3 CSM cascades (≥ 1024²) + PCSS contact hardening + screen-space contact shadows under every product and fixture foot
Analytics overlays	Per-zone: revenue/sqm heat map, traffic flow path (Bézier arc visualization), dwell time rings, stock-coverage signal (green/amber/red per slot), assortment-gap flags, adjacency-conflict warnings. All toggleable. All driven from in-memory signal store.
Assortment signals	In-memory inventory state per slot: SKU, stock level (0–100%), last-replenishment date, campaign flag, exclusivity tier. Signals pulse on low-stock. Bulk-update modal applies signal changes across selected zones.
Planogram bulk update	Select zone(s) or entire floor → apply planogram template → preview diff → confirm. Undo stack depth ≥ 20.
Camera system	≥ 6 authored boutique viewpoints (entrance, each zone, VIP close-up, overview aerial); orbit controls; first-person walk mode; photo-mode DoF; smooth transition animation between bookmarks
Post-processing	TAA, GTAO, HDR bloom (display spots bloom correctly), filmic grade with Aurelle color script (warm-spot / cool-ambient split toning), ACES or AgX tone mapping, subtle vignette
Visible range	Full 500 m² floor legible without LOD pop; product labels readable at 3 m camera distance
3. Core Systems — Enumerated
3.1 Spatial Foundation
Floor plate generator — parametric room from dimension spec (width × depth × ceiling height); wall segments with door/window apertures; column placement; multi-room adjacency for VIP suite
Surface material system — marble floor (3-octave procedural veining, macro/meso/micro per Pillar A), wall panel material (lacquer, fabric, stone), ceiling (plaster, cove lighting reveals), carpet zones
Fixture placement engine — grid-snapped placement with collision detection; rotation in 90° increments (free rotation opt-in); alignment guides; minimum aisle-width enforcement (brand standard: 1.2 m)
Zone management — named zones with boundary polygons; zone color coding in overlay mode; cross-zone adjacency rules engine
3.2 Fixture & Product Geometry
Parametric fixture constructors — every fixture built from typed config (ShowcaseConfig, PedestalConfig, etc.); dimensions, material assignments, slot-grid definition, lighting attachment points all derived from config; no hardcoded geometry
Product mesh generators — category-specific silhouette generators; watches get crown/subdial/bracelet detail; rings get band profile + stone facets; necklaces get chain link approximation + pendant geometry
Display prop dressing — every fixture auto-populates dressing geometry: velvet tray inserts, product stands, price card holders, mirror backs, lighting baffles. Dressing obeys Pillar C.
Equipment template library — 20+ named templates saveable/loadable; template stores fixture type + dimensions + material preset + planogram slot map; applying a template to a space positions and dresses the fixture
3.3 Lighting Engine
Spot light simulation — each fixture lighting attachment emits a physical spot: cone half-angle, penumbra, color temperature (2700–6500 K range, Aurelle standard 2900 K), intensity in lux; up to 64 active spots per zone
Daylight portal — shopfront windows/doors inject directional + diffuse daylight; time-of-day slider shifts color and angle; daylight vs. spot balance controls "boutique ambiance" feel
Display case interior fill — per-case irradiance fill simulating internal LED strip; controls case brightness relative to ambient; jewel caustic approximation (screen-space disc projection on velvet)
Shadow system — CSM + PCSS as specified; every fixture foot, product base, and tray edge casts grounded shadow
3.4 Planogram Engine
Slot map system — fixture defines a SlotGrid (rows × cols × layers for stacked cases); each slot holds SlotState: { sku: string | null, stockLevel: number, campaignFlag: boolean, exclusivityTier: 'standard' | 'high' | 'exceptional' }
Planogram serialization — Planogram type: named snapshot of all slot states for a fixture or zone; stored in in-memory PlanogramStore; StoreAdapter interface exposes save / load / list for future persistence
Diff engine — given two planograms, produces PlanogramDiff[]: added/removed/moved/changed slots with before/after state; rendered as overlay on fixture in 3D (green = new, red = removed, amber = changed)
Bulk update pipeline — BulkUpdateJob: target (slot / fixture / zone / floor) × operation (apply template / set campaign flag / clear / restock signal); preview → confirm → undo-stack push; executes in < 100 ms for full-floor updates
3.5 Assortment & Inventory Signals
In-memory signal store — InventorySignalStore: map of sku → InventoryRecord { stockLevel, replenishmentDate, campaignActive, zoneAssignment[] }; updated by mock signal generator (configurable pulse rate) or manual UI input
Signal propagation — store changes propagate to slot states → planogram overlays → analytics aggregates in one reactive pass; no polling loops
Low-stock pulse — slots below threshold (configurable, default 20%) emit pulsing amber glow in 3D overlay; critical (0%) emits red; slot tooltip shows SKU, stock%, last replenishment
Assortment gap detection — zone expected-assortment spec (defined in zone config) diffed against current slot occupancy; gap flags rendered as floating alert cards in 3D space
3.6 Analytics Overlays
Revenue/sqm heat map — per-zone revenue signal (mock data, clearly labeled as mock; AnalyticsAdapter interface for live feed) rendered as floor-projected heat gradient; opacity slider; zones ranked in sidebar
Traffic flow visualization — per-zone dwell-time signal drives arc thickness and opacity for customer path Bézier curves; entry/exit node markers; configurable time window
Adjacency analysis — rules engine checks product-category adjacency against brand VM standards (e.g., watches adjacent to leather goods = acceptable; fragrance adjacent to high jewelry = flag); violations rendered as warning arcs between zones
Performance dashboard — sidebar panel: zone-by-zone table (revenue/sqm, stock coverage %, gap count, adjacency flags, traffic rank); sortable; click-to-navigate to zone in 3D
3.7 UI Layer
Command palette — Cmd+K / Ctrl+K: fuzzy search over fixtures, zones, planograms, SKUs, actions; keyboard-first power-user flow
Properties panel — right sidebar: context-sensitive to selection (fixture → dimensions/material/planogram; zone → analytics/assortment spec; slot → SKU/stock/flags)
Fixture library panel — left sidebar: categorized fixture templates; drag-to-place onto floor plan; search + filter
Planogram panel — slot grid editor for selected fixture; drag SKU chips to slots; see stock signal per slot; save/load named planograms
Bulk update modal — target selection → operation → diff preview → confirm/cancel; progress indicator for large operations
HUD (F3) — fps, frame ms, draw calls, triangle count (floor-checked), active spots, probe update budget, VRAM estimate, per-pass GPU timings
4. Surface & Asset Law
Macro–meso–micro rule: every material shows detail at three frequency bands — shape (fixture geometry), meso (surface normal detail ~1–20 cm, e.g., velvet pile, marble vein, brushed metal direction), micro (roughness variance, specular response). Single-color materials are banned.
Per-instance variation law: no two showcase cases in the same zone share identical velvet color, wear state, or internal arrangement. Uniformity reads as off-the-shelf retail software.
Dressing rules (Pillar C), enforced per fixture class:
Showcases → velvet tray insert geometry, product stands at correct spacing, mirror or metal back panel, LED baffle geometry visible at top
Counters → service tray, pen holder, brand collateral card holder, under-counter shadow
Walls → panel joint reveals, brand artwork frames (procedural frame geometry), signage geometry
Floors → baseboard geometry, rug edge geometry (where applicable), threshold strip between materials
Specimen gallery (?scene=gallery): every fixture template × 2 configs on labeled pedestals; every product category × 3 SKU variants; a full dressed 3 m² zone section showing all surface classes. Gallery is a primary review surface for phase sign-off.
5. Lighting, Camera, Post
HDR with physical units: EV-based auto-exposure; illuminance-scaled spots; shopfront daylight as sky-portal luminance
IBL from interior environment capture (prefiltered specular for glass/metal, SH irradiance for fill)
Post: TAA (mandatory — high specular density shimmers without it), GTAO, HDR bloom (spots bloom on metal and glass edges), filmic grade with Aurelle color script (warm-spot split toning: 2900 K spots as orange-warm key, daylight and glass as cool fill, deep shadow as near-black with warm undertone), ACES or AgX, restrained vignette
Composition: ≥ 6 authored boutique viewpoints (1–6): entrance wide, high-jewelry zone close, watch zone close, VIP room, service counter, overhead floor overview. Each obeys: dark architectural frame edges / lit product subject / luminous glass or window background.
Smooth animated transition between bookmarks (0.8 s ease-in-out)
Photo-mode DoF: aperture + focus-distance controls; bokeh on background fixtures when focused on foreground showcase
6. Performance & Instrumentation
Targets: 60 fps @ 1440p on RTX-3060-class; 30 fps @ 1080p on iGPU for field-use on a VM director's laptop
HUD (F3): fps, frame ms avg/p95, draw calls, triangles rendered (floor-checked against §2), active light count, probe update %, VRAM estimate, per-pass GPU timings, active overlay count
All boutique data mutations (planogram edits, bulk updates, signal changes): < 100 ms to 3D reflect
CPU per-frame per-instance updates: banned. Instance data on GPU. Fixture transforms updated only on user edit.
Main-thread stall budget per interaction: ≤ 16 ms (violations logged to console with stack)
7. In-Memory Data Architecture & Extension Path
TypeScript

// Every interface here is the extension seam.
// Replace the in-memory implementation with an API call without touching callers.

interface StoreAdapter {
  // Boutique layout
  saveLayout(layout: BoutiqueLayout): Promise<void>;
  loadLayout(id: string): Promise<BoutiqueLayout>;
  listLayouts(): Promise<LayoutMeta[]>;

  // Planograms
  savePlanogram(p: Planogram): Promise<void>;
  loadPlanogram(id: string): Promise<Planogram>;
  listPlanograms(fixtureType?: string): Promise<PlanogramMeta[]>;

  // Inventory signals
  getInventorySignals(zone?: string): Promise<InventoryRecord[]>;
  pushInventoryUpdate(records: InventoryRecord[]): Promise<void>;

  // Analytics
  getAnalytics(query: AnalyticsQuery): Promise<AnalyticsResult>;
}

// In-memory implementation ships with the app.
// Cartier network API implementation: drop-in replacement, same interface.
class InMemoryStoreAdapter implements StoreAdapter { /* ... */ }

// Future:
class CartierAPIStoreAdapter implements StoreAdapter { /* ... */ }
Extension path documentation (EXTENSION.md):

StoreAdapter → REST/GraphQL API connection
InventorySignalStore → WebSocket live feed from Cartier retail system
AnalyticsAdapter → BI platform query (Looker, Tableau embed, etc.)
FixtureLibrary → CMS-driven fixture catalog with brand-approved locked dimensions
PlanogramStore → Version-controlled planogram repository with approval workflow
UserSession → SSO integration with Cartier APAC identity provider
AurelleRegionConfig → Per-market VM standard overrides (country-level brand rules)
8. Verification Battery (Scripted, Playwright)
Run at every phase close:

Reference-delta loop — side-by-sides + DELTA.md top-ten + fix top three
Material test: sample 16 pixels on glass, metal, velvet surfaces; each must show specular variation (no uniform flat-diffuse reads)
Shadow-grounding test: every fixture foot and product base must show contact shadow (no floating objects)
Dressing completeness test: every placed fixture must have ≥ 3 dressing elements (tray, stand, panel, etc.); bare-fixture fail
Planogram round-trip test: create planogram → save → clear → load → verify slot states match exactly
Bulk update test: apply template to full floor → verify all targeted fixtures updated → undo → verify rollback
Signal propagation test: set slot to 0% stock → verify 3D pulse, overlay flag, analytics aggregate all update < 100 ms
Analytics overlay test: enable all overlays simultaneously → verify no z-fighting, all labels readable, no performance cliff
Throughput check: HUD triangle counts vs §2 floors in showcase close-up and full-floor shots
Contact sheet: 6 authored viewpoints rendered + labeled, gallery sheet, planogram diff view, analytics-all-overlays view, bulk-update-in-progress view
9. Phase Plan — Gated
Phase	Deliverable	Gate
0	Scaffold, WebGPU init + diagnostics, HUD, Playwright harness, reference images wired into side-by-side comparison tool, InMemoryStoreAdapter skeleton with all interfaces defined	Harness produces comparisons; adapter interface compiles with zero any
1	Floor plate generator, surface materials (marble, wall panel, carpet, ceiling), baseboard/threshold geometry, zone boundary system, StoreAdapter layout save/load	Full 500 m² floor renders at 60 fps; material macro-meso-micro audit passes; no bare planes
2	Fixture library (all 20 templates), parametric constructors, dressing system, product mesh generators (all 8 categories), specimen gallery scene	Gallery sheet passes dressing-completeness test; all materials non-basic; silhouette test on products passes
3	Lighting engine (spot simulation, daylight portal, case interior fill, CSM+PCSS+contact shadows, caustic approximation), IBL, post stack + Aurelle color script	Showcase close-up vs reference; shadow-grounding test; material specular test; no flat-lit surface
4	Slot map system, planogram engine, diff engine, planogram UI (slot editor, save/load, diff overlay), bulk update pipeline, undo stack	Planogram round-trip test; bulk update test; diff overlay readable; undo depth ≥ 20
5	Assortment/inventory signal store, signal propagation, low-stock pulse 3D, gap detection, assortment-gap alert cards	Signal propagation test < 100 ms; gap flags render correctly; all signal types distinguishable
6	Analytics overlays (heat map, traffic flow, adjacency analysis, dashboard), GI probe grid, GTAO, screen-space bounce	Analytics overlay test; all overlays co-visible; no z-fighting; GI fills case interiors
7	TAA, bloom, filmic grade, authored camera bookmarks, photo-mode DoF, walk mode, performance pass (iGPU 30 fps target), EXTENSION.md complete	Full verification battery passes; all 6 bookmarks composed; iGPU target met; delta loop closes
A phase closes only after: build → run → verification battery → DELTA.md → fix top three → re-shoot.

10. Banned Outcomes — Instant Fail
Flat-lit display cases or product surfaces with no specular response
MeshBasicMaterial anywhere in the boutique scene
Floating fixtures or products (no contact shadow)
Empty fixtures without dressing geometry (bare case = Pillar C violation)
Uniform velvet color across all cases in a zone; uniform metal finish with no variation
Planogram state lost on page reload (in-memory is fine; state must survive within session)
Bulk update taking > 1 s for full-floor operations
Analytics overlays with z-fighting or unreadable labels
StoreAdapter interface with any types or missing extension seams
"Cartier" appearing in any UI string, export, or user-visible code comment
One-file architecture; CPU per-frame instance updates; asking the user to lower the bar
Triangle counts below §2 floors in showcase or floor-overview shots
11. Self-Score Rubric — Anchored to References
Per row: 10 = passes a one-second glance against the reference at 1080p; 7 = clearly synthetic but same class of image; 4 = good prototype; 2 = flat retail SaaS grid. Score after every phase; for each row write "what raises this by 2 points"; implement the two cheapest before proceeding.

Row	What it measures
Floor & wall material fidelity	Marble reads as marble; panels have depth
Fixture geometry quality	Showcase silhouettes, glass thickness, metal edges
Product silhouette fidelity	Ring/watch/necklace reads as category from 2 m
Display dressing completeness	Trays, stands, props populate every case
Lighting transport	Spots behave physically; no flat-ambient zones
Shadow quality	Contact hardening; every object grounded
Glass & metal material response	Fresnel, refraction, reflection correct
Analytics overlay clarity	Readable, non-cluttered, layerable
Planogram UX fluency	Slot edit feels direct and fast
Color script & composition	Aurelle warmth/cool split present; bookmarks composed
Performance	iGPU target met; interaction latency < 100 ms
Extension path clarity	EXTENSION.md + StoreAdapter reviewable without code knowledge
12. Tier 3 — Only After Battery Passes
Ray-traced reflections on glass showcase tops (WebGPU ray query extension where available)
Product configurator integration — change metal/stone on a product mesh in-slot; planogram records configuration variant
Daylight study mode — animate sun arc for APAC market latitude (Shanghai, Singapore, Tokyo presets); evaluate shopfront glare on display cases
Rendered output export — high-resolution still from any authored viewpoint; PDF planogram sheet with slot labels
Multi-boutique comparison — split-screen two layout variants; overlay analytics diff between them
VM approval workflow hooks — StoreAdapter extension point for "submit for approval" action; status badge on layout
AR preview stub — ?mode=ar route that outputs the floor plan as a WebXR overlay anchor (marker-based); full AR out of scope, seam documented
Seasonal changeover assistant — given two planograms (current / seasonal), generate a sequenced move list minimizing case disruption
13. Aurelle Brand Constraints (Non-Negotiable)
Constraint	Specification
Brand name	Aurelle throughout; never Cartier in UI, exports, or user-visible strings
Color temperature default	2900 K spot lighting
Aisle minimum	1.2 m (brand VM standard, enforced by collision system)
Case glass type	Museum-grade low-iron (IOR 1.52, green-cast suppressed)
Velvet standard	Deep navy / charcoal for watch zone; cream / ivory for high jewelry; configurable per zone
Fixture finish standard	Champagne gold (metalness 0.95, roughness 0.15) or brushed platinum (metalness 0.9, roughness 0.4); no chrome
Typography (UI)	System font stack; no brand font files shipped (licensing); placeholder brand-adjacent serif for in-scene signage geometry
Market	APAC; default store templates sized for Tier 1 APAC flagship (approx. 250–350 m²) and Tier 2 (80–150 m²)
14. Final Acceptance — The Two-Frame Test
Produce two frames:

(1) A showcase close-up: a high-jewelry island case, interior LED fill glowing on cream velvet, three ring stands with distinct silhouettes, spot lighting casting contact shadows on the velvet surface, glass top showing fresnel reflection of the ceiling spot, case metal frame in champagne gold with brushed-zone variation.

(2) A full-floor overview: the complete Tier 1 boutique floor from entrance position, all zones readable by spatial arrangement, analytics heat map overlay active at 50% opacity, traffic flow arcs visible in warm amber, zone labels legible, shopfront daylight bleeding in from the entrance wall against interior spot warmth.

Place each beside its reference. If a viewer's eye doesn't snag within one second on a category error — flat glass, floating products, bare cases, unreadable analytics, wrong brand color temperature — the project has done its job.

Until then, iterate.

The VM director must be able to walk the boutique in first-person, select any fixture, edit its planogram, apply a bulk update to its zone, read the assortment signal on every slot, and switch to any analytics overlay — all without leaving the 3D view and all reflecting immediately in the scene. Their feedback after that full walk-through is the final gate. Until you are satisfied with the two frames and the full verification battery, that gate does not open.

Aurelle Boutique Planner PRD v1.0 — adapted for APAC luxury VM operations from PROJECT LAAS v2 framework. All Cartier network specifics are internal implementation context only; the user-facing product is Aurelle throughout.





