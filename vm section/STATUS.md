Aurelle Boutique Planner — STATUS v1.0
Rehydration protocol (for an agent resuming with no context): read this file fully, then
AURELLE_PLANNER_PRD_v1.md (the spec — binding), then docs/THREE-NOTES.md (API gotchas for
the pinned three.js), then the Current focus section below. Reference images: reference/.
Never re-plan from scratch; continue from "Next actions". Update this file after every
meaningful step. Commit per milestone with descriptive messages.

Mission (1 paragraph)
Browser-based 3D Visual Merchandiser for Aurelle luxury boutiques (Cartier APAC network, brand name Aurelle throughout). WebGPU only (three.js WebGPURenderer + TSL + raw WGSL compute), TypeScript strict, zero any, zero external assets, deterministic by ?store=N. All boutique layouts, planograms, assortment signals, and analytics held in a typed in-memory store with a StoreAdapter interface as the extension seam for future API/DB integration. Visual bar: the five reference images in reference/ (watch showcase interior; jewelry atelier counter with spot lighting; boutique entrance with marble flooring; ring tray planogram close-up; APAC flagship exterior). 7 gated phases; verification by Playwright screenshots compared against references; DELTA.md loop each phase. Must also be fully interactive for the VM director: walk the boutique in first-person, select fixtures, edit planograms, read assortment signals, toggle analytics overlays — all without leaving the 3D view.

Hard Rules Digest (full text = PRD §)
No flat-lit display cases or product surfaces with no specular response (Pillar B).
No MeshBasicMaterial anywhere in the boutique scene.
No floating fixtures or products (every object must have contact shadow).
No empty fixtures without dressing geometry (bare case = Pillar C violation).
No uniform velvet color across all cases in a zone; no uniform metal finish.
No planogram state lost within session; bulk update ≤ 100 ms for full-floor operations.
No analytics overlays with z-fighting or unreadable labels.
No StoreAdapter interface with any types or missing extension seams.
"Cartier" must never appear in any UI string, export, or user-visible code comment.
No one-file architecture; no CPU per-frame instance updates; never ask the user to lower the bar.
Floors (PRD §2): ≥ 500k tris showcase close-up / ≥ 200k full-floor overview (HUD-verified); ≥ 20 fixture templates; ≥ 8 product categories; every material macro-meso-micro compliant; ≥ 64 active spots per zone; 3 CSM cascades + PCSS + contact shadows; irradiance probe grid ≥ 8×8×4 per zone; TAA + GTAO + bloom + Aurelle color script; 6 authored viewpoints; all planogram operations ≤ 100 ms; signal propagation ≤ 100 ms.
Infeasible item → nearest feasible alternative + entry in DEVIATIONS.md. A closed phase has zero TODOs in its code.
Verified Environment Facts
(populated 2026-07-03, first build session)

OS: Windows 11 Home 10.0.26200. GPU: Intel Gen12 iGPU (gen-12lp) — this machine IS the iGPU field target.
Node v24.5.0, npm 11.5.2. Browser verified: Chromium 148 (embedded preview) — WebGPU hardware adapter acquired.
three.js pinned: 0.184.0 + @types/three 0.184.1 — installed in web/. VERIFIED against source: `PostProcessing` renamed → `RenderPipeline` (r183); `bloom` export confirmed in examples/jsm/tsl/display/BloomNode.js; `renderer.info.render.{drawCalls,triangles}` confirmed; WebGPU `renderer.shadowMap` has NO autoUpdate/needsUpdate — per-LIGHT `light.shadow.autoUpdate/needsUpdate` is the on-demand contract (ShadowNode.updateBefore).
Integration: the planner is NOT a standalone Vite app — it lives inside the existing Aurelle hub at web/src/vm/** with a lazy-loaded page (web/src/pages/VisualMerchandiser.tsx) and a Shell nav entry ("Visual Merchandiser 3D"). Strict zero-any enforced via web/tsconfig.vm.json (`tsc --noEmit -p tsconfig.vm.json` passes clean).
Dev server: npm run dev in web/ (port 5173). Verification hook: `window.__aurelleVM` (VMController) — the console battery drives store + scene + rig through it.
Sanity baseline (Intel Gen12, igpu preset, Prince's Building HK): 29 fps steady, ~295 draw calls in view (~772 total scene), 35–120k tris in view, CPU frame 8 ms (GPU-bound), 8 spots + 2 shadow casters + daylight, pixelRatio 1.
Phase Checklist
 Phase 0 — Scaffold, WebGPU init + fail-loud diagnostics, HUD, orbit + walk camera rig, ?store=N params, Playwright shot harness (headless WebGPU), compare tool, InMemoryStoreAdapter skeleton with all interfaces defined and compiling at zero any. Gate: harness produces comparisons; adapter interface compiles clean; diagnostics panel shown on non-WebGPU browsers.
 Phase 1 — Floor plate generator (parametric room from dimension spec, wall segments with apertures, column placement, multi-room adjacency for VIP suite), surface materials (marble 3-frequency procedural veining, wall panel lacquer/fabric/stone, carpet, ceiling plaster + cove reveal), baseboard/threshold geometry, zone boundary system, StoreAdapter layout save/load. Gate: full 500 m² floor renders at 60 fps; material macro-meso-micro audit passes; no bare planes; zone boundaries readable.
 Phase 2 — Full fixture library (all 20 parametric templates), dressing system (velvet tray inserts, product stands, price card holders, mirror backs, LED baffles), product mesh generators (all 8 categories with display-quality silhouettes + PBR materials), specimen gallery scene (?scene=gallery). Gate: gallery sheet passes dressing-completeness test; all materials non-basic; product silhouette test passes.
 Phase 3 — Lighting engine (per-fixture LED spot simulation, daylight portal from shopfront, display case interior fill, CSM×3 + PCSS + screen-space contact shadows, caustic approximation on jewelry, IBL from interior environment), post stack + Aurelle color script (warm-spot / cool-ambient split toning, ACES/AgX, TAA, GTAO, bloom, vignette). Gate: showcase close-up vs reference; shadow-grounding test; material specular test; no flat-lit surface.
 Phase 4 — Slot map system, planogram engine (slot grid, SKU assignment, stock signals), diff engine (before/after overlay in 3D), planogram UI (slot editor, save/load named planograms, diff overlay), bulk update pipeline (target selection → preview → confirm → undo), undo stack depth ≥ 20. Gate: planogram round-trip test; bulk update ≤ 100 ms; diff overlay readable; undo depth ≥ 20.
 Phase 5 — Assortment/inventory signal store, signal propagation (store change → slot state → overlay → analytics aggregate in one reactive pass), low-stock pulse 3D (amber/red per threshold), assortment gap detection (expected vs actual occupancy), gap alert cards in 3D space. Gate: signal propagation ≤ 100 ms; gap flags render correctly; all signal types (low-stock / critical / campaign / gap) visually distinguishable.
 Phase 6 — Analytics overlays (revenue/sqm heat map, traffic flow Bézier arcs, adjacency analysis, performance dashboard sidebar), GI probe grid (≥ 8×8×4 per zone, async time-sliced update), GTAO upgrade, screen-space bounce for display case interior glow, photo-mode DoF, walk mode, 6 authored camera bookmarks with smooth animated transitions. Gate: analytics overlay test (all overlays co-visible, no z-fighting, labels readable); GI fills case interiors; all 6 bookmarks composed per Pillar E; iGPU 30 fps target met.
 Phase 7 — Performance pass (60 fps @ 1440p RTX-3060-class; 30 fps @ 1080p iGPU), HUD per-pass GPU timings (fix any timestamp-query overflow), EXTENSION.md complete and reviewable without code knowledge, full verification battery, final two-frame test, self-score rubric. Gate: full verification battery passes; both frames vs references; iGPU target met; delta loop closes; EXTENSION.md approved.
 Tier 3 — Only after battery passes (PRD §12).
Current Focus
Phases 0–6 functional core SHIPPED in-hub (2026-07-03); Phase 3/7 visual upgrades remain.

What exists and passes:
· Phase 0 ✓ — WebGPU engine (fail-loud, no WebGL fallback), BrowserGate (mobile notice / non-Chrome / Chrome<113 / no-WebGPU diagnostics with chrome://gpu checklist, ?nogate=1), HUD (fps chip + F3 panel, ?hud=1), typed StoreAdapter + InMemoryStoreAdapter zero-any, console battery via window.__aurelleVM (Playwright port pending — DEVIATIONS D-2).
· Phase 1 ✓ — parametric floor plate (walls/apertures/shopfront glazing/columns/baseboards/wainscot+reveals/cove/VIP rug), procedural marble (3-freq domain-warped veining + roughness + normal), fabric/plaster/carpet, zone system. Static architecture merged (~15 draws).
· Phase 2 ✓ — 20 fixture templates, parametric constructors with full dressing (velvet trays w/ per-instance jitter, stands, price cards, mirror backs, LED baffles), 9 product category generators (rings/bracelets/necklaces/watches dress+sport/earrings/brooches/leather/fragrance), geometry merged per material. Gallery scene pending (D-8).
· Phase 3 PARTIAL — 2900K spot simulation (priority-sorted budget), daylight portal w/ time-of-day slider, case fills, PCF shadows (on-demand per light) + contact decals, procedural IBL, bloom + ACES + warm/cool split-tone + vignette. TAA/GTAO/GI probes/caustics/PCSS deferred (D-3).
· Phase 4 ✓ — slot map, planogram engine, diff engine (added/removed/changed/moved, 3D markers), slot editor UI, save/load named planograms, template planograms, bulk update pipeline (target→op→preview diff→confirm→undo), undo depth 32. Round-trip EXACT ✓; full-floor bulk 24.7 ms ✓.
· Phase 5 ✓ — inventory signal store, one-pass reactive propagation (17.1 ms ✓), low-stock amber / critical red pulses, campaign rings, gap detection + floating alert cards, mock pulse generator (4 s default) + manual input.
· Phase 6 MOSTLY ✓ — heat map (brand ramp, opacity slider), traffic Bézier arcs, dwell rings, adjacency rules + warning arcs, sortable dashboard w/ click-to-navigate, zone boundaries/labels, all co-visible without z-fighting (screen-size billboard labels). GI probes deferred.
· Boutiques (4): Prince's Building Hong Kong (320 m² · cool white marble / charcoal-navy — the network reference), Beijing Flagship (297 m² · warm cream marble / walnut-bordeaux), Seoul Flagship (308 m², 22×14 wide-gallery plan with central court + east/west wings · travertine / deep emerald), Tokyo Ginza (247 m², 13×19 narrow-deep Ginza plot, vertical emphasis, no cash-wrap · pale silver-grey stone / greige + navy). Architecture varies per BoutiqueTheme (marble palette, wall field, wainscot pair, columns, rug — data/types.ts); the 20-template fixture library is brand-standard everywhere. All four validate 0 aisle/bounds violations. Deterministic merchandising, ?store= deep link.
· Cameras: orbit + first-person walk (V, WASD, fixture collision), 6 authored bookmarks (keys 1–6, 0.8 s eased), photo-mode DoF pending (D-9).
· Quality presets: high/balanced/igpu auto-detected from adapter (?quality= override) — spots/shadows/transmission/pixelRatio/bloom scale.

Next Actions (always keep current)
1. Phase 3 completion: TAA (TRAANode) + GTAO behind high preset; caustic disc approximation; PCSS-style contact hardening.
2. Specimen gallery route (?scene=gallery) for template sign-off (D-8).
3. Playwright port of the console battery (D-2); reference images into reference/ + compare tool (D-1).
4. Raise geometry density under high preset toward PRD triangle floors (D-5); product LOD (D-7).
5. Photo-mode DoF behind high preset (D-9); palette→bulk-modal deep link (D-10).

Original Phase-0 notes follow (superseded by the above):
Bootstrap project: Vite + TypeScript strict config, zero any enforced via tsconfig.json. Directory scaffold per architecture map below. Git init on main.
src/core/Engine.ts: WebGPU init with fail-loud diagnostics (actionable error panel for non-WebGPU browsers: update / hardware acceleration / chrome://gpu). BrowserGate.ts: mobile/tablet block ("a desktop computer is required"), non-Chromium block ("Google Chrome is required"), WebGPU-absent diagnostics. ?nogate=1 escape hatch.
InMemoryStoreAdapter skeleton: all interfaces (StoreAdapter, BoutiqueLayout, Planogram, SlotState, InventoryRecord, AnalyticsQuery, AnalyticsResult, LayoutMeta, PlanogramMeta) defined in src/data/types.ts; InMemoryStoreAdapter in src/data/InMemoryStoreAdapter.ts; zero any; compiles clean.
HUD: fps chip always visible; F3 toggles debug panel (fps, ms avg/p95, draw calls, triangle count, active light count, VRAM estimate); ?hud=1 boots open (for tooling).
Camera rig: orbit controls for overview; first-person walk mode for boutique exploration; V toggles; smooth bookmark transitions wired (poses to be filled per phase).
Playwright harness: tools/shoot.ts, tools/compare.ts; headless WebGPU confirmed on local adapter; reference images wired into side-by-side tool.
Gate check: harness produces comparisons; InMemoryStoreAdapter compiles at zero any; diagnostics panel shown on non-WebGPU path; commit phase-0-complete.
Key Decisions Log
D1 Pin three@0.184.0; verify APIs against installed source before use; keep gotchas in docs/THREE-NOTES.md. Downgrade to 0.180.x only if 0.184 breaks something structural.
D2 Tracking: STATUS.md (this file) = source of truth; git commit per milestone; DELTA.md / DEVIATIONS.md per spec; EXTENSION.md documents all StoreAdapter extension seams for Cartier APAC integration.
D3 Brand name is Aurelle throughout all user-visible strings, UI labels, exports, and code comments. Cartier APAC context is internal implementation knowledge only — never surfaces in the product.
D4 All application data (layouts, planograms, inventory signals, analytics) is in-memory only at launch. The StoreAdapter interface is the single extension point for future REST/GraphQL/WebSocket/BI integration. InMemoryStoreAdapter ships; CartierAPIStoreAdapter is documented in EXTENSION.md as a drop-in replacement.
D5 Verification screenshots: prefer headless Playwright Chromium with WebGPU/Metal flags; fall back to headed if headless adapter unavailable. Record adapter resolution in verified environment facts above.
D6 Default boutique template: Tier 1 APAC flagship (300 m², 4 m ceiling, 4 zones + VIP room). ?store=tier2 loads 120 m² variant. ?store=N reproduces a full layout deterministically.
D7 Fixture geometry: purely parametric TypeScript constructors — no .glb files, no external assets. Every mesh, texture, normal map, LUT generated by code. Fixture library ships as typed config objects with parametric mesh builders.
D8 Aurelle lighting standard: 2900 K spot default; museum-grade low-iron glass (IOR 1.52, green-cast suppressed); champagne gold fixtures (metalness 0.95, roughness 0.15) or brushed platinum (metalness 0.90, roughness 0.40); deep navy/charcoal velvet for watch zone; cream/ivory velvet for high jewelry. These are non-negotiable brand constants, not configurable defaults.
D9 Aisle minimum 1.2 m enforced by the fixture placement collision system — fixtures cannot be placed in violation; a warning renders in the UI if a zone configuration would block egress.
D10 Per-instance fixture variation: no two showcases in the same zone share identical velvet tone, wear state, or internal arrangement. Uniformity reads as off-the-shelf retail software and fails Pillar A.
Architecture Map
text

src/
  core/
    Engine.ts              # WebGPU init, fail-loud diagnostics, render loop
    BrowserGate.ts         # Mobile/non-Chromium/no-WebGPU gates; ?nogate=1
    Params.ts              # URL param parsing (?store=N, ?scene=X, ?hud=1, etc.)
    Seed.ts                # Deterministic PRNG seeded by ?store=N
    Profiler.ts            # Per-pass GPU timestamp queries; HUD top-16 passes
    QualityPresets.ts      # RTX-3060 (60fps@1440p) and iGPU (30fps@1080p) configs

  data/
    types.ts               # ALL shared interfaces: StoreAdapter, BoutiqueLayout,
                           #   ZoneConfig, FixtureInstance, SlotGrid, SlotState,
                           #   Planogram, PlanogramDiff, BulkUpdateJob,
                           #   InventoryRecord, AnalyticsQuery, AnalyticsResult,
                           #   LayoutMeta, PlanogramMeta — zero any
    InMemoryStoreAdapter.ts  # In-memory implementation of StoreAdapter
    PlanogramStore.ts      # Named planogram CRUD on top of StoreAdapter
    InventorySignalStore.ts  # Reactive signal store; propagation to slot states
    AnalyticsStore.ts      # Aggregates from signal + layout; mock data generator

  boutique/
    FloorPlate.ts          # Parametric room: dimensions, walls, apertures, columns
    ZoneManager.ts         # Named zones, boundary polygons, adjacency rules engine
    SurfaceMaterials.ts    # Marble (3-freq veining), wall panel, carpet, ceiling TSL
    AisleGuard.ts          # 1.2 m aisle enforcement; egress collision detection

  fixtures/
    FixtureLibrary.ts      # Registry of all 20 named templates; drag-to-place API
    FixtureBuilder.ts      # Parametric mesh constructor from typed config
    ShowcaseBuilder.ts     # Island / wall-mounted / tower / low-profile variants
    CounterBuilder.ts      # Service counter, cash-wrap
    PedestalBuilder.ts     # Ring / watch / necklace pedestals
    SeatingBuilder.ts      # Client chairs, ottomans
    WallSystemBuilder.ts   # Paneling, shelving, bracket systems
    LightRigBuilder.ts     # Track, recessed, accent lighting geometry
    DressingSystem.ts      # Auto-populates velvet trays, stands, price cards,
                           #   mirror backs, LED baffles per fixture class

  products/
    ProductLibrary.ts      # Registry of 8 category generators + SKU assignment
    RingBuilder.ts         # Band profile + stone facets; PBR gold/platinum/stone
    BraceletBuilder.ts
    NecklaceBuilder.ts     # Chain link approximation + pendant geometry
    WatchBuilder.ts        # Dress / sport variants; crown, subdial, bracelet detail
    EarringBuilder.ts
    BroochBuilder.ts
    LeatherGoodsBuilder.ts
    FragranceBuilder.ts    # Bottle silhouette + stopper geometry

  planogram/
    SlotMap.ts             # SlotGrid definition; SlotState CRUD; per-fixture
    PlanogramEngine.ts     # Save / load / apply / clear planograms
    DiffEngine.ts          # PlanogramDiff[] computation; 3D overlay geometry
    BulkUpdatePipeline.ts  # Target selection → preview → confirm → undo stack
    UndoStack.ts           # Depth-20 command stack; undo/redo

  signals/
    SignalPropagation.ts   # Store change → slot state → overlay → analytics
    LowStockPulse.ts       # Amber/red pulsing 3D indicator per threshold
    GapDetector.ts         # Expected vs actual occupancy diff; alert card geometry

  lighting/
    SpotSimulator.ts       # Per-fixture LED spot: cone, spread, CCT, intensity (lux)
    DaylightPortal.ts      # Shopfront window/door daylight injection; ToD slider
    CaseInteriorFill.ts    # Per-case irradiance fill for internal LED strip
    CausticApprox.ts       # Screen-space caustic disc projection on velvet
    ShadowSetup.ts         # CSM×3 + PCSS + screen-space contact shadows
    IBL.ts                 # Interior env capture; prefiltered specular + SH irradiance

  analytics/
    HeatMap.ts             # Revenue/sqm floor-projected gradient; opacity slider
    TrafficFlow.ts         # Dwell-time Bézier arc visualization; entry/exit nodes
    AdjacencyAnalysis.ts   # VM standard rules engine; violation arc rendering
    Dashboard.ts           # Sidebar zone-by-zone table; sortable; click-to-navigate

  render/
    Materials.ts           # Glass (IOR 1.52), polished metal, brushed metal,
                           #   velvet (fabric BRDF), marble, lacquered wood,
                           #   stone tile, carpet — all TSL, zero MeshBasicMaterial
    PostStack.ts           # TAA, GTAO, HDR bloom, Aurelle color grade, ACES/AgX,
                           #   vignette, photo-mode DoF
    AutoExposure.ts        # EV-based; illuminance-scaled spots
    GIProbes.ts            # 8×8×4 irradiance probe grid per zone; time-sliced async
    DepthPrepass.ts        # Depth-only prepass for alpha-tested fixtures/products

  ui/
    CommandPalette.ts      # Cmd+K fuzzy search: fixtures, zones, planograms, SKUs
    PropertiesPanel.ts     # Right sidebar; context-sensitive to selection
    FixtureLibraryPanel.ts # Left sidebar; categorized templates; drag-to-place
    PlanogramPanel.ts      # Slot grid editor; SKU chips; stock signal per slot
    BulkUpdateModal.ts     # Target → operation → diff preview → confirm/cancel
    AnalyticsOverlayUI.ts  # Toggle panel for all overlay layers + opacity sliders
    HUD.ts                 # Always-on fps chip; F3 debug panel; ?hud=1 boots open

  camera/
    CameraRig.ts           # Orbit (overview) + first-person walk (boutique explore)
                           #   V toggles; walk is interactive default
    Bookmarks.ts           # 6 authored viewpoints (keys 1–6); smooth 0.8 s transitions
    PhotoMode.ts           # DoF: aperture + focus distance; bokeh controls

  debug/
    Scenes.ts              # ?scene=gallery, ?scene=floor, ?scene=fixture, ?scene=analytics
    GalleryScene.ts        # All 20 fixture templates × 2 configs + all 8 product
                           #   categories × 3 SKU variants on labeled pedestals
    PlanogramDebug.ts      # Diff overlay test harness
    SignalDebug.ts         # Signal propagation timing harness

tools/
  shoot.ts                 # Playwright screenshot: --scene X --cam "..." --out shots/x.png
  compare.ts               # Side-by-side pixel compare + DELTA output
  battery.ts               # Full verification battery (all 10 tests from PRD §8)
  probe-materials.ts       # Sample N pixels on glass/metal/velvet; verify specular variation
  probe-shadows.ts         # Verify contact shadow presence on all fixture feet
  probe-signals.ts         # Signal propagation timing; ≤100 ms assertion

shots/
  phase-0/                 # Curated phase-close screenshots (committed)
  phase-1/
  ...
  wip/                     # Working screenshots (gitignored)

docs/
  THREE-NOTES.md           # API gotchas for pinned three.js (inherited + Aurelle additions)
  DELTA.md                 # Per-phase reference-delta loop (top-10 diffs, top-3 fixed)
  DEVIATIONS.md            # Infeasible items → nearest feasible alternatives
  EXTENSION.md             # StoreAdapter extension path; CartierAPIStoreAdapter guide;
                           #   WebSocket signal feed; BI platform query; SSO; CMS fixture catalog
  COLOR-SCRIPT.md          # Aurelle color script: 2900K warm-spot / cool-ambient split;
                           #   per-ToD grading targets; value structure rules
Gotchas / Lessons Learned (Aurelle-specific; append-only)

Session 2026-07-03 (first build) — new entries:
· React StrictMode double-mount creates a ZOMBIE ENGINE: the first VMController's async start() keeps running after dispose(), appends a second canvas and renders every frame → exactly half the fps and a stale window.__aurelleVM. Guard every await inside start() with a disposed flag (VMController.ts). Symptom: document.querySelectorAll("canvas").length === 2.
· WebGPU renderer shadow control is PER LIGHT: renderer.shadowMap.{autoUpdate,needsUpdate} do not exist on WebGPURenderer (plain config object). Use light.shadow.autoUpdate=false + needsUpdate=true (LightingEngine.requestShadowUpdate) after scene mutations / time-of-day changes.
· Forward per-pixel lighting dominates iGPU frames: 44 lights at dpr2 = 0.2 fps on Gen12. Fix order that mattered: (1) kill zombie canvas, (2) quality presets (8 spots/dpr1/no transmission), (3) merge static geometry (fixtures ~40→~6 draws each, floor plate ~200→~15). Result 0.2 → 29 fps.
· MeshPhysicalMaterial.transmission adds a FULL extra scene pass per frame — preset-gate it; fresnel-transparent glass (opacity 0.14, IOR kept) reads acceptably in cases.
· A bare `new THREE.Mesh(geo)` defaults to MeshBasicMaterial and fails the audit — invisible pick spheres need an explicit material.
· Sprite labels: sizeAttenuation=false (constant screen size) is what "readable from the entrance, not monstrous at 0.5 m" means in practice; scale ≈ 0.055 of viewport height.
· Vite static-replaces import.meta.env.DEV — indirection through a cast object silently breaks it in dev.
· Planogram round-trip exactness requires per-SKU (not per-slot) stock levels at merchandising time: projectPlanogram re-reads live inventory, so two slots of one SKU with different seeded stock can never round-trip.
· mergeGeometries(box/cylinder primitives) is safe (same attribute sets, indexed); bucket per (material, castShadow) to keep glass/LED lenses out of the shadow pass.

Session 2026-07-05b (private salons — semi-enclosed VIP rooms + curved sofa) — new entries:
· New fixture "Salon Curved Sofa" (kind seating-sofa; adding a FixtureKind means updating the FixtureBuilder switch + guard startsWith checks — no Record<FixtureKind> exists so it's safe). Kidney-curved arc of seat/back segments, cream velvet body + jewel pillows.
· New src/vm/boutique/PrivateSalon.ts builds semi-enclosed rooms for consultation + vip zones: partition walls (2.8 m, doorway on the approach edge), green-celadon walls + gold kintsugi feature panel + warm gold cove + brass floating shelves + bronze coffee table + green rug. Called from BoutiqueScene ambience; returns partition colliders that VMController feeds to the rig (walk-mode collision).
· GOTCHA: green wall LINING on an exterior building wall is hidden behind the existing FloorPlate wainscot (panels at ~0.12 m inward). Line the salon walls at inset ≥0.17 m to sit IN FRONT of the wainscot, or the room won't read green.
· Aisle-guard: private salons are partition-enclosed, so a fixture inside a consultation/vip zone is wall-separated from other zones — the guard now SKIPS cross-zone pairs when either zone is consultation/vip. Fixes the false positive where a salon sofa "collides" with an HJ pedestal across the partition. All 4 boutiques still validate 0 violations.
· Tier-1 (HK, Tokyo) have dedicated consultation + vip rooms → full green salons with the curved-sofa lounge. Tier-2 (Beijing, Seoul) have no separate salon (per playbook) → the HJ consultation nook gets the curved sofa + a wall-paneling privacy screen instead.

Session 2026-07-05 (VM playbook — choreographed spatial layout logic) — new entries:
· Zone system split Fine Jewellery (islands, front) from High Jewellery (pedestals only, back gallery) — added ZoneKind "fine-jewelry" + "consultation"; every Record<ZoneKind> map must be updated together (ZONE_COLORS/ZONE_PREFS in layouts.ts, TRAFFIC_WEIGHT/DWELL_BASE + adjacency in AnalyticsEngine.ts) or tsc breaks.
· ZoneConfig gained floorMaterial (marble|carpet|parquet), cct, lightingPreset. FloorPlate lays carpet/parquet patches per zone over the maison base floor with a champagne threshold strip; Lighting drives per-zone spot CCT; Ambience hero ceiling now hangs over fine-jewelry (central destination).
· All 4 boutiques re-authored to the playbook journey (arrival+fragrance → FJ islands central-front → watch wall RIGHT/east → HJ pedestal gallery at back → consultation/salon). HK+Tokyo Tier-1 (8 zones), Beijing+Seoul Tier-2 (6 zones). Bookmarks 1-6 = entry / FJ hero / watch wall / HJ gallery / private salon / overview.
· CRITICAL gotcha: fixture template id is "showcase-wall-160" NOT "wall-vitrine-160" — using the wrong id makes templateOf() throw and blanks the whole page (no error boundary). Always cross-check template ids against FixtureCatalog.
· Aisle-guard refinement (VMStore.validatePlacement): the 1.2 m rule is a circulation-aisle rule between DISPLAY fixtures. Added furniture-cluster clearances — seating↔surface 0.35, counter↔counter 0.3, wall 0.3 — so chairs-at-a-table and a wrap+packaging counter pair are legal. This is a false-positive fix, not suppression; display↔display and display↔counter still enforce 1.2 m. All 4 layouts validate 0 violations.
· Wall fixtures must sit at wall ∓ (rotated-depth-half + margin): a Wall Vitrine 160 (depth 0.6) centre must be ≤ wall−0.32; placing at ±9.75 on a ±10 wall overhangs ("extend beyond floor plate"). Rear vitrines (rot 0): z = −(D/2) + 0.4. SA counters (rot 90, width 2.0): |z| ≤ D/2 − 1.05. Wall-paneling (rot 90, width 2.4): |z| ≤ D/2 − 1.25.
· Authored layouts still aren't validated at build — the console battery (window.__aurelleVM, loop validatePlacement over layout.fixtures) is the only gate; run it after ANY layout or clearance-rule edit.

Session 2026-07-04 (luxury art-direction pass from reference photos) — new entries:
· The four boutiques read "generic" until the maison SIGNATURES were added, not just colors: statement ceiling + chandelier, feature-wall mural, wall TEXTURE (quilted/fluted/woven/travertine), themed floor, jewel-tone lounge upholstery. Color-only theming was the weak version.
· BoutiqueTheme now carries full architecture DNA (wallStyle, wainscotStyle, floorStyle, floorWood, ceilingStyle, ceilingGlow, chandelier, muralMotif, muralPalette, accentUpholstery) — src/vm/data/types.ts. The 4 themes were rewritten to the references: HK warm-champagne (organic oval + gold flock + gold-petal chandelier, panther mural, quilted wainscot, swirl marble); Beijing opulent-gold (gold woven dome + gold-petal chandelier, cherry-blossom mural, quilted, herringbone); Seoul warm-classic (oval cove + crystal-cascade chandelier, marquetry-sunburst mural, travertine walls, herringbone) — NOT the earlier dark-emerald; Ginza pale-organic (amorphous cove, no chandelier, bamboo mural, fluted walls, pale marble).
· New: src/vm/boutique/Ambience.ts (statement ceilings + chandeliers + zone rugs, all merged geometry, glow via emissive not extra lights); Textures.ts generators generateWallPanelMaps / generateWoodFloorMaps / generateGoldWeaveMaps / generateMuralTexture; MaterialKit wallPanel/floorThemed/goldWeaveCeiling/mural helpers.
· Warmer/brighter grade: hemisphere fill warmed (#f2e6cf/0.72), scene.environmentIntensity 0.55→0.85, exposure 1.15→1.32. Cost: draws ~261→~290-311 (ceiling/chandelier/rugs), fps unchanged (~21-29 iGPU), material audit still passes.
· Chandeliers/flock use ~40-70 tiny merged meshes each + strong emissive; bloom does the "glow". Keep counts merged or draw calls spike.

Session 2026-07-04 (Seoul + Tokyo boutiques) — new entries:
· Floor-plate bounds check must be PER-AXIS half extents, not max-extent radius — the radius version rejects every wall-hugging fixture ("extends beyond floor plate") and would block users dragging fixtures to walls. Fixed in VMStore.validatePlacement.
· Authored layouts are never validated at load — run `for (f of layout.fixtures) validatePlacement(f, f.id)` as a battery step after ANY layout edit or clearance-rule change. Raising wall clearance 0.05→0.3 mid-build silently invalidated 4 HK/Beijing placements; the battery caught them only when run explicitly.
· HMR leaves the previewed React tree stale relative to window.__aurelleVM — a "controlled select didn't update" symptom after HMR edits is usually a stale tree, not a bug. Always re-verify UI-sync issues on a fresh full reload before chasing them.
· Per-boutique architecture = BoutiqueTheme on the layout (marble tints/wall field/wainscot pair/column/rug); MaterialKit caches themed marble by theme id so boutique switching pays texture generation once per theme per session.
Inherited wholesale from LAAS STATUS — all entries remain valid (WebGPU secure context traps, TSL expression-vs-Fn stack rules, RenderPipeline quad-camera uniform hazard, TRAA camera-update order contract, depth convention, pointer-lock traps, measurement methodology for M1 Max thermal drift, etc.). Re-read the full LAAS gotchas list before starting any new system. The following are Aurelle-specific additions:

"Cartier" string audit: run grep -ri "cartier" src/ ui/ tools/ before every commit. Zero permitted. The brand is Aurelle. Internal adapter classes (e.g. CartierAPIStoreAdapter) live in docs/EXTENSION.md as documentation only — never compiled into the app.
StoreAdapter zero-any contract: every method signature must use concrete types from src/data/types.ts. A Promise<any> return type fails the interface contract immediately. Enforce with tsc --noEmit in CI.
In-memory session persistence: planogram state must survive within-session navigation (route changes, scene switches) but need not survive page reload — this is the specified contract. Do not add localStorage without a DEVIATIONS entry explaining why.
Slot-grid coordinate contract: slots are addressed as { fixtureId: string, row: number, col: number, layer: number }. Never use positional array indices as external IDs — they shift on planogram edits and break diff / undo.
Bulk update ≤ 100 ms: this is a user-experience contract, not a stretch goal. Profile on full-floor (500 m², all fixtures populated) before closing Phase 4. If the reactive propagation chain is the bottleneck, batch slot state writes into a single dirty-set flush rather than per-slot reactive triggers.
Analytics overlay z-fighting: all overlay geometry (heat map floor projection, traffic arcs, gap alert cards) must render with polygonOffset or a small camera-forward bias. Labels must use screen-space billboard placement with depth-test disabled and a legibility background quad. Test with all overlays enabled simultaneously.
Aisle guard at fixture placement time: the 1.2 m minimum is a brand standard — enforce at the moment of fixture placement (not as a post-hoc warning). A placed fixture that creates an aisle violation must either be rejected with an explanatory UI message or auto-snapped to the nearest valid position.
Per-instance velvet variation: the Seed system must drive per-fixture hue/value jitter on velvet tray color (within the zone-standard palette: navy±5°/±8% value for watch zone; ivory±4°/±6% value for high jewelry). This is enforced at fixture-instantiation time from ?store=N seed, not randomly per render frame.
Caustic approximation scope: full ray-traced caustics are Tier 3. The Phase 3 caustic approximation is a screen-space disc projection (analytic spot-to-velvet) — document this in DEVIATIONS.md with the Tier 3 upgrade path noted.
Product mesh LOD: near-camera products (within 1 m) use full-detail mesh; beyond 2 m, simplified silhouette mesh; slot-grid overview uses billboard quad with category icon. No visible pop — transitions are dithered. Slot-grid overview must still pass the "product category readable at 2 m camera distance" test from PRD §2.
MeshBasicMaterial audit: run a scene-graph walk at boot (debug mode) that throws if any MeshBasicMaterial instance is found in the scene. Wire this into battery.ts as test 0.
Daylight portal time-of-day: the ToD slider shifts shopfront daylight color and angle, simulating APAC market latitude. Default latitude: 31.2° N (Shanghai). ?lat=1.3 (Singapore) and ?lat=35.6 (Tokyo) presets available. Document in EXTENSION.md as a regional config hook.
UPDATE-ORDER CONTRACT (inherited from LAAS, Aurelle application): the camera rig must register before any system that copies camera state (analytics overlay placement, properties panel world-to-screen projection, label billboard positioning). Register CameraRig first in main.ts; sync all screen-space UI systems at render time, not in updateFn registration order.
Reference image analysis (art targets):
ref_showcase_interior.png: island showcase, interior LED fill on cream velvet, three ring stands with shadow graduation on velvet, glass top with fresnel ceiling-spot reflection, champagne gold frame with brushed zones. Value structure: deep-shadow frame edges / lit velvet subject / luminous glass background.
ref_atelier_counter.png: service counter with spot array, hard shadow edges on white marble top, product trays with distinct specular response per material (matte vs gloss), warm 2900 K key against cool ambient fill.
ref_boutique_entrance.png: marble floor with door-sourced daylight, wall panel depth, distant display cases reading as zone anchors from entrance position. Distance test: every zone readable from entrance camera.
ref_ring_tray.png: close-up planogram; individual slot shadows; velvet pile normal detail at macro scale; ring stones with facet-level specular. Macro-meso-micro material test anchor.
ref_flagship_exterior.png: APAC flagship scale reference; entrance proportions; shopfront glazing as daylight portal geometry reference.
Self-Score Rubric Baseline (record after each phase)
Row	Phase 0	Phase 1	Phase 2	Phase 3	Phase 4	Phase 5	Phase 6	Phase 7
Floor & wall material fidelity	—							
Fixture geometry quality	—							
Product silhouette fidelity	—							
Display dressing completeness	—							
Lighting transport	—							
Shadow quality	—							
Glass & metal material response	—							
Analytics overlay clarity	—							
Planogram UX fluency	—							
Color script & composition	—							
Performance	—							
Extension path clarity	—							
Score anchors: 10 = passes one-second glance vs reference at 1080p; 7 = clearly synthetic but same class; 4 = good prototype; 2 = flat retail SaaS grid. After each phase: write "what raises this by 2 points" for each row; implement the two cheapest before proceeding.

Aurelle Boutique Planner STATUS v1.0 — adapted from PROJECT LAAS STATUS (source of truth). All LAAS gotchas inherited and binding. Aurelle-specific additions appended. Update this file after every meaningful step.