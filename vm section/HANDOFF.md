# Aurelle 3D Visual Merchandiser — Implementation Handoff

A self-contained map of **what** was built and **how**, for continuing work in a
fresh session. Scope: the 3D VM tool and boutique scenes only. Companion docs in
this folder: `STATUS.md` (running log + gotchas), `DEVIATIONS.md` (spec items that
shipped differently), `EXTENSION.md` (StoreAdapter integration seams),
`Aurelle Boutique Planner - PRD v1.0.md` (the binding spec).

---

## 1. What it is

A browser-based, **WebGPU-only** 3D Visual Merchandiser living inside the existing
Aurelle React hub. It renders four luxury boutiques you can walk through, select
fixtures, edit planograms, read inventory signals, and toggle analytics overlays —
all in the same 3D view. Four boutiques ship:

| Boutique | id | Tier | Floor | Identity |
|---|---|---|---|---|
| Prince's Building, Hong Kong | `hk-princes` | 1 (Flagship Maison, 8 zones) | 20×16 | warm champagne, organic-oval ceiling + gold-flock chandelier, panther mural, quilted walls, swirl marble |
| Tokyo Ginza Mansion | `tokyo-ginza` | 1 (Flagship Maison, 8 zones) | 13×19 narrow-deep | pale, fluted walls, amorphous ceiling cove, bamboo mural, pale marble |
| Beijing Flagship | `bj-flagship` | 2 (Flagship, 6 zones) | 18×16.5 | opulent gold dome ceiling + gold-petal chandelier, cherry-blossom mural, herringbone |
| Seoul Flagship | `seoul-flagship` | 2 (Flagship, 6 zones) | 22×14 wide-shallow | warm classic, travertine walls, crystal chandelier, marquetry-sunburst mural, herringbone |

---

## 2. Where it lives / how to run + verify

- **Code:** `web/src/vm/**`. Page: `web/src/pages/VisualMerchandiser.tsx`. Nav entry
  key `vm` in `web/src/components/Shell.tsx` + `web/src/App.tsx` (lazy-loaded chunk).
- **Deps:** `three@0.184.0` + `@types/three@0.184.1` (pinned; verify TSL/APIs against
  `node_modules/three` before use — see `THREE-NOTES.md`).
- **Dev server:** `cd web && npm run dev` (port 5173). The hub gates on a login token;
  in the preview set `localStorage.aurelle_token` to anything to bypass.
- **Strict type-check (zero `any`):** `cd web && ./node_modules/.bin/tsc.cmd --noEmit -p tsconfig.vm.json`.
  Whole app: `-p tsconfig.json`. Build: `npm run build` (note: `vite build` does NOT
  type-check — run tsc separately).
- **Verification hook:** the running controller is exposed as `window.__aurelleVM`
  (a `VMController`). The console "battery" drives everything through it. Canonical checks:
  ```js
  const vm = window.__aurelleVM;
  // aisle/bounds validation for the loaded boutique (must be 0):
  let n=0; for (const f of vm.store.layout.fixtures) if (vm.store.validatePlacement(f, f.id)) n++;
  // no MeshBasicMaterial in the scene (throws if found):
  vm.scene.auditMaterials();
  // switch boutique / navigate:
  await vm.loadBoutique("bj-flagship"); vm.rig.goToBookmark(4);
  vm.engine.stats(); // fps, drawCalls, triangles
  ```
  There is **no** Playwright harness yet (DEVIATIONS D-2); the console evals are the gate.
- **Deploy:** push to GitHub `origin/main` → GitHub Action force-pushes to the HF Space →
  HF rebuilds the Docker image (`Dockerfile` builds `web/dist`, FastAPI `api.main:app`
  serves UI + `/api` on :7860). `web/dist` is gitignored (built in Docker). `api/main.py`
  now serves `index.html` `no-cache` and hashed `/assets/*` immutable.

---

## 3. Architecture map (file → responsibility)

```
web/src/vm/
  VMController.ts        Session orchestrator. Owns Engine + BoutiqueScene + CameraRig +
                        VMStore. Pointer/keyboard → store actions. loadBoutique(). Exposes
                        window.__aurelleVM. Detects quality preset, wires shadow-on-demand.
  core/
    Engine.ts           WebGPURenderer init (fail-loud, no WebGL fallback), RenderPipeline
                        post stack (bloom + ACES + warm/cool split-tone + vignette), frame
                        loop, stats(). toneMappingExposure 1.32.
    BrowserGate.ts      Chrome 113+ desktop + WebGPU probe; else fail-loud verdict.
    QualityPresets.ts   high / balanced / igpu (auto-detected from GPU adapter). Scales
                        spots, shadow casters, transmission, pixelRatio, bloom.
    Params.ts, Seed.ts (mulberry32 PRNG), Events.ts (typed emitter).
  data/
    types.ts            ALL shared interfaces (StoreAdapter, BoutiqueLayout, ZoneConfig,
                        FixtureInstance, FixtureTemplate, Planogram, SlotState, etc.).
                        Zero `any`. ZoneKind, ZoneFloor, WallStyle, CeilingStyle,
                        ChandelierStyle, FloorStyle, MuralMotif, BoutiqueTheme live here.
    catalog.ts          126 generated SKUs across 9 ProductCategory.
    InMemoryStoreAdapter.ts  ships; the extension seam for a real API.
    AnalyticsEngine.ts  Mock, reactive zone analytics (revenue/m², traffic, dwell, coverage,
                        gaps, adjacency). Records keyed by ZoneKind — UPDATE when adding kinds.
  store/
    VMStore.ts          THE reactive spine. Live layout + slot states + planograms + inventory
                        + selection + overlays. Undo stack (depth 32). Bulk-update pipeline.
                        validatePlacement() = the 1.2 m aisle guard. Emits events → scene + UI.
  fixtures/
    FixtureCatalog.ts   21 parametric fixture templates (FixtureTemplate[]). Template ids are
                        the source of truth (e.g. "showcase-wall-160", "seating-sofa-curved").
    FixtureBuilder.ts   Builds each fixture's geometry from template+instance (switch on
                        template.kind). Full dressing (velvet trays, stands, price cards,
                        mirror backs, LED baffles). Curved sofa, chairs, counters, etc.
                        Merges geometry per material via GeometryBucket (draw-call budget).
  products/
    ProductBuilder.ts   9 category mesh generators (rings…fragrance). Merged, cached per SKU,
                        cloned per slot.
  boutique/
    FloorPlate.ts       Parametric room: marble/wood floor, walls with apertures + shopfront
                        glazing, wainscot (styled) + reveals, cove, columns, feature MURAL on
                        north wall, per-zone FLOOR PATCHES (carpet/parquet) + threshold strip.
    Ambience.ts         Statement ceiling feature (per theme.ceilingStyle) + chandelier
                        (per theme.chandelier) over the FINE-JEWELRY hero zone; zone rugs.
    PrivateSalon.ts     Semi-enclosed rooms for consultation + vip zones: partition walls
                        (2.8 m, doorway on approach edge), green-celadon walls, gold kintsugi
                        feature panel, gold cove, brass shelves, bronze coffee table, rug.
                        Returns partition colliders → walk-mode collision.
  render/
    Materials.ts        MaterialKit — every PBR material. Themed marble, styled wall panels
                        (quilted/fluted/woven/travertine/smooth), themed floors, gold-weave
                        ceiling, murals, velvet (per-instance jitter), glass (transmission or
                        fresnel per preset), metals. Cached; zero MeshBasicMaterial.
    Textures.ts         Procedural canvas textures (Noise2D fBm/ridged): marble 3-freq veining,
                        velvet, brushed metal, carpet, styled wall panels, wood floors, gold
                        weave, murals (panther/cherry-blossom/chinoiserie/bamboo/marquetry/
                        kintsugi), shadow blob.
    GeometryBucket.ts   Accumulates geometry per (material, castShadow) → one merged mesh each.
    Labels.ts           Screen-space (sizeAttenuation:false) sprite labels, depth-test off.
  lighting/
    Lighting.ts         Per-fixture LED spot sim (priority-sorted, budgeted), per-ZONE colour
                        temperature (zone.cct), daylight portal + time-of-day, case interior
                        fill, hemisphere fill, on-demand shadow maps (requestShadowUpdate()),
                        procedural IBL environment.
  scene/
    BoutiqueScene.ts    Assembles floor + fixtures + products + ambience + private salons +
                        lighting + overlays from the layout. Subscribes to store events →
                        rebuilds only affected fixture subtrees. Raycast picking. Selection
                        highlight. partitionColliders. auditMaterials().
  analytics/
    Overlays3D.ts       Heat map, traffic Bézier arcs, dwell rings, adjacency arcs, gap cards,
                        zone labels, low-stock pulses, diff markers. Toggleable, no z-fight.
  camera/
    CameraRig.ts        Orbit + first-person walk (V, WASD, fixture+partition collision).
                        6 authored bookmarks (keys 1–6). makeBookmarks(). flyTo(), addBlockers().
  stores/
    layouts.ts          The 4 boutique definitions (zones + fixtures), THEMES, ZONE_DEFAULTS,
                        ZONE_PREFS, generateInitialSlots(), buildTemplatePlanograms(),
                        LAYOUTS[]. This is where you edit boutique spatial layout.
  ui/
    VMApp.tsx           Workspace: canvas host + toolbar (boutique switch, camera, time-of-day,
                        overlay toggles, undo, bulk/dashboard/palette buttons), HUD (F3), tooltips,
                        toasts, gate/init states.
    panels.tsx          FixtureLibraryPanel (left) + PropertiesPanel (right: slot editor,
                        planogram grid, save/apply).
    BulkUpdateModal.tsx, Dashboard.tsx, CommandPalette.tsx (Ctrl+K), GateScreens.tsx, hooks.ts.
```

---

## 4. Data flow (the reactive spine)

`VMStore` is the single source of truth. A mutation (slot edit, bulk update, fixture
move, stock change) updates in-memory state, then emits a typed event on `store.events`.
Both `BoutiqueScene` (3D) and the React panels subscribe to the same events, so every
edit reflects immediately (PRD Pillar F). Key events: `slots-changed`, `fixtures-changed`,
`inventory-changed`, `analytics-changed`, `overlays-changed`, `selection-changed`,
`diff-preview`, `undo-changed`, `toast`. Scene rebuilds only the affected fixture subtree,
never the frame loop (no CPU per-frame instance updates). Persistence goes through
`StoreAdapter` (in-memory now; API later — see EXTENSION.md).

---

## 5. Conventions you MUST know

- **Coordinates:** floor centred at origin. **x → east = client's RIGHT on entry.**
  **z → south = the shopfront/entry wall (+z).** So the back wall is z = −depth/2 (north).
  The watch wall is always on the RIGHT = **east (+x)** wall.
- **Fixture rotation:** default fixture faces +z. Wall fixtures: **west wall → rotY 90°**
  (faces +x into room), **east wall → −90°**, **north/rear wall → 0°** (faces +z), **south → 180°**.
- **Template ids are exact** — using a wrong id makes `templateOf()` throw and blanks the
  whole page (no error boundary). Real ids include `showcase-island-120/180`,
  `showcase-wall-160` (NOT "wall-vitrine-160"), `showcase-wall-watch`, `showcase-tower`,
  `showcase-low-90`, `display-table-round/rect`, `pedestal-solo/duo`, `counter-service`,
  `counter-cashwrap`, `seating-chair`, `seating-ottoman`, `seating-sofa-curved`,
  `wall-paneling`, `wall-shelving`, `wall-bracket`, `light-track/recessed/accent`.
- **Zone kinds** (`ZoneKind`): `entrance`, `fine-jewelry` (islands, front), `watches`,
  `accessories` (leather), `consultation` (VIC lounge), `high-jewelry` (pedestals only,
  back gallery), `vip` (HJ private salon), `service` (cash-wrap). Fine ≠ High jewellery.
  **Adding a kind requires updating every `Record<ZoneKind>` map:** `ZONE_DEFAULTS`,
  `ZONE_PREFS` (layouts.ts) and `TRAFFIC_WEIGHT`, `DWELL_BASE` (AnalyticsEngine.ts), or tsc breaks.
- **Aisle guard** (`VMStore.validatePlacement`): 1.2 m minimum is a **circulation-aisle**
  rule between DISPLAY fixtures. Furniture-cluster clearances: seating↔seating 0.1,
  seating↔surface(display-table/low-case/counter) 0.35, counter↔counter 0.3, wall runs 0.3.
  Wall fixtures must sit at wall ∓ (rotated-depth-half + margin) or they overhang ("beyond
  floor plate"). Private salons (consultation/vip) are partition-enclosed, so cross-zone
  pairs are SKIPPED when either zone is consultation/vip.
- **Determinism:** everything seeds from a mulberry32 `Rng(hashString(...))`. Same layout id
  reproduces the same boutique + merchandising. Do NOT use Date.now/Math.random for anything
  visual.

---

## 6. How to extend (common tasks)

- **Add / edit a boutique's spatial layout:** edit `stores/layouts.ts`. Use the `zone(...)`
  helper (fills colour/floorMaterial/cct/preset from `ZONE_DEFAULTS` by kind) and the
  `fx(rng, templateId, x, z, rotDeg, zoneId)` helper. After ANY change, run the console
  aisle-validation battery (§2) — authored layouts are NOT validated at build.
- **Add a fixture:** template in `FixtureCatalog.ts` + a `case` in `FixtureBuilder.ts`
  (switch on `template.kind`). If it's a new geometry family, add a `FixtureKind` in
  `types.ts` (no exhaustive Record exists for FixtureKind — safe). Seating kinds must start
  with `seating-` for the guard.
- **Change a maison's look:** edit its entry in `THEMES` (layouts.ts): marble palette, wall
  style, floor style, ceiling style, chandelier, mural motif + palette, accent upholstery.
- **Per-zone floor/light:** set `floorMaterial` / `cct` on the zone (overrides in `zone(...)`).
  FloorPlate lays carpet/parquet patches; Lighting drives per-zone spot CCT.
- **Tune the private salons:** `boutique/PrivateSalon.ts` (green palette constants at top,
  partition height/thickness/door width, feature panel, shelves, coffee table). Green wall
  linings on exterior building walls must be inset ≥0.17 m to sit in FRONT of the wainscot.

---

## 7. Gotchas that cost time (condensed; full list in STATUS.md)

- WebGPU shadow maps are **per-light** (`light.shadow.autoUpdate/needsUpdate`), NOT
  `renderer.shadowMap.*`. Rendered on demand (`LightingEngine.requestShadowUpdate()`).
- React StrictMode double-mounts → guard every `await` in `VMController.start()` with a
  `disposed` flag or you get a zombie engine + second canvas at half fps.
- `MeshPhysicalMaterial.transmission` = a full extra scene pass; preset-gated (high only).
  A bare `new THREE.Mesh(geo)` defaults to MeshBasicMaterial and fails the audit.
- Vite static-replaces `import.meta.env.DEV` — don't hide it behind a cast.
- Forward per-pixel lighting dominates iGPU; keep the spot budget low and MERGE static
  geometry (GeometryBucket). Baseline: ~29 fps on Intel Gen12, ~300 draws in view.
- Sprite labels: `sizeAttenuation:false` (constant screen size) or they balloon up close.

---

## 8. Current state

- Phases 0–6 of the PRD functionally shipped; visual art-direction pass done; VM spatial
  playbook implemented; private salons + curved sofa done. All 4 boutiques validate at
  **0 aisle/bounds violations**, material audit passes, strict tsc + build clean.
- Interactions working: walk/orbit, 6 bookmarks, pick fixture→planogram grid editor,
  place/rotate/remove fixtures (aisle-guarded), bulk update (preview diff→confirm→undo),
  stock signals + pulses, all analytics overlays, Ctrl+K palette, F3 HUD, boutique switcher.
- **Not yet done / candidates for next session:** Playwright battery (D-2), reference-image
  delta loop (D-1, images never provided), TAA/GTAO/GI-probes/caustics behind the `high`
  preset (D-3), specimen gallery route `?scene=gallery` (D-8), photo-mode DoF (D-9), raising
  triangle density toward PRD floors under `high` (D-5), product LOD (D-7). See DEVIATIONS.md.

---

## 9. Deploy pipeline (quick reference)

`push origin/main` → GH Action `.github/workflows/deploy-hf.yml` force-pushes to the HF
Space → HF rebuilds Docker (`Dockerfile`: stage 1 `npm run build` → `web/dist`; stage 2
FastAPI serves it on :7860). `web/dist` gitignored. `api/main.py` `SPAStaticFiles`:
index.html `no-cache`, `/assets/*` immutable. If the Space shows stale after a deploy:
hard-refresh, then check the GH Action run + HF build logs (needs the `HF_TOKEN` repo secret).
