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
import { InMemoryStoreAdapter } from "./data/InMemoryStoreAdapter";
import type { SlotKey } from "./data/types";
import { parseSlotKey } from "./data/types";
import { CameraRig, type CameraMode } from "./camera/CameraRig";
import { BoutiqueScene } from "./scene/BoutiqueScene";
import { VMStore } from "./store/VMStore";
import { LAYOUTS, buildTemplatePlanograms, generateInitialSlots, layoutById } from "./stores/layouts";

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
