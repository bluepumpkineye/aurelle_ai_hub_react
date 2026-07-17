/**
 * VMController — session orchestrator. Owns the Engine, BoutiqueScene,
 * CameraRig and VMStore; translates pointer/keyboard input into store
 * actions; exposes everything the React panels need. The VM director can
 * walk the boutique, select any fixture, edit its planogram, bulk-update a
 * zone and read every signal without leaving the 3D view (PRD §14).
 */

import { Engine } from "./core/Engine";
import { parseParams, type VMParams } from "./core/Params";
import { detectQuality, type QualityConfig } from "./core/QualityPresets";
import { hashString } from "./core/Seed";
import { InMemoryStoreAdapter } from "./data/InMemoryStoreAdapter";
import type { BoutiqueTheme, SlotKey } from "./data/types";
import { parseSlotKey } from "./data/types";
import { templateOf } from "./fixtures/FixtureCatalog";
import { CameraRig, type CameraMode } from "./camera/CameraRig";
import { BoutiqueScene } from "./scene/BoutiqueScene";
import { VMStore } from "./store/VMStore";
import {
  LAYOUTS,
  buildTemplatePlanograms,
  generateInitialSlots,
  layoutById,
  sanitizeScenarioLayout,
} from "./stores/layouts";
import { SCENARIO_PRESETS, type ScenarioPreset } from "./data/ScenarioPresets";

/** Merge a scenario preset's theme overrides onto a base boutique theme. */
function mergedScenarioTheme(base: BoutiqueTheme, preset: ScenarioPreset): BoutiqueTheme {
  const theme: BoutiqueTheme = { ...base, ...preset.themeOverrides, id: `${base.id}-${preset.id}` };
  if (preset.themeOverrides.marble) theme.marble = { ...base.marble, ...preset.themeOverrides.marble };
  if (preset.themeOverrides.muralPalette) theme.muralPalette = preset.themeOverrides.muralPalette;
  if (preset.themeOverrides.accentUpholstery) theme.accentUpholstery = preset.themeOverrides.accentUpholstery;
  return theme;
}

export interface HoverInfo {
  slotKey: SlotKey;
  screenX: number;
  screenY: number;
}

export class VMController {
  readonly params: VMParams;
  readonly adapter = new InMemoryStoreAdapter();
  readonly store: VMStore;
  engine!: Engine;
  scene!: BoutiqueScene;
  rig!: CameraRig;

  /** Fixture template armed for click-to-place from the library panel. */
  placingTemplateId: string | null = null;
  /** Tracks which boutique is loaded so we can reset after scenario presets. */
  baseBoutiqueId: string | null = null;
  /** Currently active preset (null = default layout). */
  activePresetId: string | null = null;
  onPlacingChange: ((templateId: string | null) => void) | null = null;
  onHover: ((info: HoverInfo | null) => void) | null = null;
  onCameraMode: ((mode: CameraMode) => void) | null = null;

  private detachFns: Array<() => void> = [];
  private pointerDownAt: { x: number; y: number } | null = null;
  private disposed = false;

  constructor() {
    this.params = parseParams();
    this.store = new VMStore(this.adapter);
    this.adapter.setAnalyticsProvider(() => this.store.analytics);
  }

  get layouts(): typeof LAYOUTS {
    return LAYOUTS;
  }

  quality!: QualityConfig;

  async start(container: HTMLElement): Promise<void> {
    this.quality = await detectQuality();
    // React StrictMode mounts, disposes, and remounts in dev — if this
    // controller was disposed while awaiting, abort before creating GPU state.
    if (this.disposed) return;
    this.engine = new Engine(container, this.quality);
    await this.engine.init();
    if (this.disposed) {
      this.engine.dispose();
      return;
    }

    // Seed the adapter with the authored layouts + template planograms.
    for (const layout of LAYOUTS) await this.adapter.saveLayout(layout);
    for (const p of buildTemplatePlanograms()) this.store.registerPlanogram(p);

    this.scene = new BoutiqueScene(this.engine.scene, this.store, this.quality);
    this.rig = new CameraRig(this.engine.camera, this.engine.renderer.domElement);
    this.rig.onModeChange = (m) => this.onCameraMode?.(m);

    await this.loadBoutique(this.params.store ?? LAYOUTS[0].id);

    this.engine.onFrame((dt, elapsed) => {
      this.rig.update(dt);
      this.scene.updateFrame(elapsed);
    });

    // Shadow maps are on-demand: refresh whenever the physical scene changes.
    this.store.events.on("fixtures-changed", () => this.scene.lighting.requestShadowUpdate());
    this.store.events.on("slots-changed", () => this.scene.lighting.requestShadowUpdate());

    this.bindPointer(this.engine.renderer.domElement);
    this.bindKeyboard();

    if (this.disposed) return;
    // Verification hook for the scripted battery (tools/battery, console).
    (window as unknown as Record<string, unknown>).__aurelleVM = this;

    // Live inventory signals: slow ambient pulse so the plan breathes.
    this.store.startSignalPulse(4000);
  }

  async loadBoutique(id: string): Promise<void> {
    const layout = structuredClone(layoutById(id));
    const slots = generateInitialSlots(layout);
    this.store.loadLayout(layout, slots);
    this.scene.build(this.store.layout);
    this.rig.configureForLayout(this.store.layout);
    // Partition walls of the private salons block walk-mode movement too.
    this.rig.addBlockers(this.scene.partitionColliders);
    this.scene.lighting.requestShadowUpdate();
    this.baseBoutiqueId = id;
    this.activePresetId = null;

    // Warm the caches for every scenario of this boutique during idle time, so
    // that applying a scenario in a demo is instant rather than a 2–3 s cold build.
    this.scene.prewarm(SCENARIO_PRESETS.map((p) => mergedScenarioTheme(this.store.layout.theme, p)));
  }

  /**
   * Applies a scenario preset on top of the current boutique's base layout.
   * Deep-clones the original layout, merges theme overrides, adds/removes
   * fixtures, adjusts lighting, then fully rebuilds the 3D scene.
   */
  async applyScenarioPreset(preset: ScenarioPreset): Promise<void> {
    const baseId = this.baseBoutiqueId ?? LAYOUTS[0].id;
    const layout = structuredClone(layoutById(baseId));

    // 1. Merge theme overrides
    layout.theme = mergedScenarioTheme(layout.theme, preset);

    // 2. Replace fixtures completely (look up by boutique ID)
    const fixtureSpecs = preset.fixtures[baseId] ?? Object.values(preset.fixtures)[0] ?? [];
    layout.fixtures = fixtureSpecs.map((f) => {
      const t = templateOf(f.templateId);
      return {
        id: f.id,
        templateId: f.templateId,
        zoneId: f.zoneId,
        x: f.x,
        z: f.z,
        rotationY: f.rotationY,
        dims: f.dims ?? { ...t.dims.default },
        finish: f.finish ?? t.finish,
        variationSeed: hashString(f.id),
      };
    });

    // 3. Sanitise: scenario fixtures are placed straight from preset data, so
    // (unlike the base layouts) they must be nudged off structural columns and
    // separated from one another before the scene is built.
    sanitizeScenarioLayout(layout);

    // Show immediate feedback, then yield one paint so the toast/cursor render
    // before the (mostly cached, occasionally cold) synchronous scene build.
    this.store.toast(`Applying “${preset.name}”…`, "info");
    await new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));

    // 4. Rebuild scene with the modified layout
    const slots = generateInitialSlots(layout);
    this.store.loadLayout(layout, slots);
    this.scene.build(this.store.layout);
    this.rig.configureForLayout(this.store.layout, false);
    this.rig.addBlockers(this.scene.partitionColliders);

    // 5. Apply lighting mood
    this.engine.scene.environmentIntensity = preset.lighting.environmentIntensity;
    if (preset.lighting.backgroundTint) {
      const { Color } = await import("three");
      this.engine.scene.background = new Color(preset.lighting.backgroundTint);
    }
    if (preset.lighting.timeOfDay !== undefined) {
      this.setTimeOfDay(preset.lighting.timeOfDay);
    } else {
      this.scene.lighting.requestShadowUpdate();
    }

    this.activePresetId = preset.id;
    this.store.toast(`Scenario "${preset.name}" applied`, "info");
  }

  /** Resets the 3D scene back to the original default boutique layout. */
  async resetToDefaultLayout(): Promise<void> {
    const baseId = this.baseBoutiqueId ?? LAYOUTS[0].id;
    const layout = structuredClone(layoutById(baseId));
    const slots = generateInitialSlots(layout);
    this.store.loadLayout(layout, slots);
    this.scene.build(this.store.layout);
    this.rig.configureForLayout(this.store.layout, false);
    this.rig.addBlockers(this.scene.partitionColliders);
    this.engine.scene.environmentIntensity = 0.85;
    const { Color } = await import("three");
    this.engine.scene.background = new Color("#17130d");
    this.scene.lighting.requestShadowUpdate();
    this.activePresetId = null;
    this.store.toast("Restored default boutique layout", "info");
  }

  setTimeOfDay(hour: number): void {
    this.scene.lighting.setTimeOfDay(hour, this.store.layout);
    this.scene.lighting.requestShadowUpdate();
  }

  setPlacingTemplate(templateId: string | null): void {
    this.placingTemplateId = templateId;
    this.onPlacingChange?.(templateId);
  }

  private bindPointer(dom: HTMLElement): void {
    const ndc = (e: PointerEvent): [number, number] => {
      const r = dom.getBoundingClientRect();
      return [((e.clientX - r.left) / r.width) * 2 - 1, -(((e.clientY - r.top) / r.height) * 2 - 1)];
    };

    const onDown = (e: PointerEvent) => {
      this.pointerDownAt = { x: e.clientX, y: e.clientY };
    };

    const onUp = (e: PointerEvent) => {
      if (!this.pointerDownAt) return;
      const moved =
        Math.abs(e.clientX - this.pointerDownAt.x) + Math.abs(e.clientY - this.pointerDownAt.y);
      this.pointerDownAt = null;
      if (moved > 6) return; // drag — camera gesture, not a click

      const [nx, ny] = ndc(e);
      if (this.store.movingFixtureId) {
        const p = this.scene.pickFloor(nx, ny, this.engine.camera);
        if (p) {
          const success = this.store.moveFixture(
            this.store.movingFixtureId,
            Math.round(p.x * 10) / 10,
            Math.round(p.z * 10) / 10,
          );
          if (success) this.store.setMovingFixtureId(null);
        }
        return;
      }

      if (this.placingTemplateId) {
        const p = this.scene.pickFloor(nx, ny, this.engine.camera);
        if (p) {
          // Grid-snapped placement (0.1 m) — collision/aisle guard in the store.
          const placed = this.store.addFixture(
            this.placingTemplateId,
            Math.round(p.x * 10) / 10,
            Math.round(p.z * 10) / 10,
          );
          if (placed && !e.shiftKey) this.setPlacingTemplate(null);
        }
        return;
      }

      const hit = this.scene.pick(nx, ny, this.engine.camera);
      if (hit.slotKey) {
        this.store.select({ kind: "slot", slot: parseSlotKey(hit.slotKey) });
      } else if (hit.fixtureId) {
        this.store.select({ kind: "fixture", fixtureId: hit.fixtureId });
      } else {
        this.store.select({ kind: "none" });
      }
    };

    let hoverPending = false;
    const onMove = (e: PointerEvent) => {
      if (hoverPending) return;
      hoverPending = true;
      requestAnimationFrame(() => {
        hoverPending = false;
        const [nx, ny] = ndc(e);
        const hit = this.scene.pick(nx, ny, this.engine.camera);
        if (hit.slotKey && this.store.slot(hit.slotKey)?.sku) {
          this.onHover?.({ slotKey: hit.slotKey, screenX: e.clientX, screenY: e.clientY });
        } else {
          this.onHover?.(null);
        }
      });
    };

    dom.addEventListener("pointerdown", onDown);
    dom.addEventListener("pointerup", onUp);
    dom.addEventListener("pointermove", onMove);
    this.detachFns.push(() => {
      dom.removeEventListener("pointerdown", onDown);
      dom.removeEventListener("pointerup", onUp);
      dom.removeEventListener("pointermove", onMove);
    });
  }

  private bindKeyboard(): void {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) {
        e.preventDefault();
        this.store.undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey))) {
        e.preventDefault();
        this.store.redo();
      } else if (e.code === "Escape") {
        this.setPlacingTemplate(null);
        this.store.setMovingFixtureId(null);
        this.store.select({ kind: "none" });
      } else if (e.code === "Delete" || e.code === "Backspace") {
        const sel = this.store.selection;
        if (sel.kind === "fixture") this.store.removeFixture(sel.fixtureId);
      } else if (e.code === "KeyR") {
        const sel = this.store.selection;
        if (sel.kind === "fixture") {
          const f = this.store.fixture(sel.fixtureId);
          if (f) {
            const rot = e.shiftKey ? f.rotationY - Math.PI / 2 : f.rotationY + Math.PI / 2;
            this.store.moveFixture(f.id, f.x, f.z, rot);
          }
        }
      } else if (e.code === "ArrowUp" || e.code === "KeyW") {
        const sel = this.store.selection;
        if (sel.kind === "fixture" && this.rig.mode === "orbit") {
          e.preventDefault();
          const f = this.store.fixture(sel.fixtureId);
          const step = e.shiftKey ? 0.02 : 0.1;
          if (f) this.store.moveFixture(f.id, f.x, f.z - step, f.rotationY);
        }
      } else if (e.code === "ArrowDown" || e.code === "KeyS") {
        const sel = this.store.selection;
        if (sel.kind === "fixture" && this.rig.mode === "orbit") {
          e.preventDefault();
          const f = this.store.fixture(sel.fixtureId);
          const step = e.shiftKey ? 0.02 : 0.1;
          if (f) this.store.moveFixture(f.id, f.x, f.z + step, f.rotationY);
        }
      } else if (e.code === "ArrowLeft" || e.code === "KeyA") {
        const sel = this.store.selection;
        if (sel.kind === "fixture" && this.rig.mode === "orbit") {
          e.preventDefault();
          const f = this.store.fixture(sel.fixtureId);
          const step = e.shiftKey ? 0.02 : 0.1;
          if (f) this.store.moveFixture(f.id, f.x - step, f.z, f.rotationY);
        }
      } else if (e.code === "ArrowRight" || e.code === "KeyD") {
        const sel = this.store.selection;
        if (sel.kind === "fixture" && this.rig.mode === "orbit") {
          e.preventDefault();
          const f = this.store.fixture(sel.fixtureId);
          const step = e.shiftKey ? 0.02 : 0.1;
          if (f) this.store.moveFixture(f.id, f.x + step, f.z, f.rotationY);
        }
      } else if (e.code === "KeyQ") {
        const sel = this.store.selection;
        if (sel.kind === "fixture" && this.rig.mode === "orbit") {
          e.preventDefault();
          const f = this.store.fixture(sel.fixtureId);
          const rotStep = e.shiftKey ? (1 * Math.PI) / 180 : (5 * Math.PI) / 180;
          if (f) this.store.moveFixture(f.id, f.x, f.z, f.rotationY - rotStep);
        }
      } else if (e.code === "KeyE") {
        const sel = this.store.selection;
        if (sel.kind === "fixture" && this.rig.mode === "orbit") {
          e.preventDefault();
          const f = this.store.fixture(sel.fixtureId);
          const rotStep = e.shiftKey ? (1 * Math.PI) / 180 : (5 * Math.PI) / 180;
          if (f) this.store.moveFixture(f.id, f.x, f.z, f.rotationY + rotStep);
        }
      }
    };
    window.addEventListener("keydown", onKey);
    this.detachFns.push(() => window.removeEventListener("keydown", onKey));
  }

  dispose(): void {
    this.disposed = true;
    for (const fn of this.detachFns) fn();
    this.detachFns = [];
    this.store.dispose();
    this.rig?.dispose();
    this.scene?.dispose();
    this.engine?.dispose();
  }
}
