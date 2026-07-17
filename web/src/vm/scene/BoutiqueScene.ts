/**
 * BoutiqueScene — assembles the full 3D boutique from the live VMStore:
 * floor plate, parametric fixtures with dressing, merchandised products at
 * slot anchors, lighting, environment and overlays. Subscribes to store
 * events so every VM decision reflects in 3D immediately (Pillar F);
 * mutations only rebuild the affected fixture subtrees, never the frame loop
 * (no CPU per-frame instance updates).
 */

import * as THREE from "three";
import { Rng, hashString } from "../core/Seed";
import { SKU_BY_ID, SKU_CATALOG } from "../data/catalog";
import type { BoutiqueLayout, BoutiqueTheme, SlotKey } from "../data/types";
import { parseSlotKey, slotKey } from "../data/types";
import { templateOf } from "../fixtures/FixtureCatalog";
import { FixtureFactory, type BuiltFixture } from "../fixtures/FixtureBuilder";
import { buildFloorPlate } from "../boutique/FloorPlate";
import { buildCeilingFeature, buildZoneRugs } from "../boutique/Ambience";
import { buildPrivateSalons } from "../boutique/PrivateSalon";
import { LightingEngine, type LightingStats, makeInteriorEnvironment } from "../lighting/Lighting";
import { MaterialKit } from "../render/Materials";
import { ProductFactory } from "../products/ProductBuilder";
import { Overlays3D } from "../analytics/Overlays3D";
import type { QualityConfig } from "../core/QualityPresets";
import type { VMStore } from "../store/VMStore";

interface FixtureNode {
  built: BuiltFixture;
  productsGroup: THREE.Group;
  pickTargets: THREE.Mesh[];
}

export interface PickResult {
  fixtureId: string | null;
  slotKey: SlotKey | null;
  point: THREE.Vector3 | null;
}

const pickSphereGeo = new THREE.SphereGeometry(0.075, 8, 6);
// Never rendered (visible=false) — explicit material keeps the
// no-MeshBasicMaterial audit clean (a bare Mesh defaults to basic).
const pickSphereMat = new THREE.MeshStandardMaterial({ colorWrite: false, depthWrite: false });

export class BoutiqueScene {
  readonly root = new THREE.Group();
  readonly overlays: Overlays3D;
  readonly lighting: LightingEngine;
  lightingStats: LightingStats = { spots: 0, shadowCasters: 0, caseFills: 0 };
  /** Partition-wall colliders (private salons) for walk-mode collision. */
  partitionColliders: THREE.Box3[] = [];

  private kit: MaterialKit;
  private products: ProductFactory;
  private fixtureFactory: FixtureFactory;
  private fixturesGroup = new THREE.Group();
  private floorGroup: THREE.Group | null = null;
  private ambienceGroup: THREE.Group | null = null;
  private nodes = new Map<string, FixtureNode>();
  private productTemplates = new Map<string, THREE.Group>();
  private raycaster = new THREE.Raycaster();
  private selectionHelper: THREE.LineSegments | null = null;
  private slotHighlight: THREE.Mesh | null = null;
  private envTexture: THREE.DataTexture;
  private unsubscribers: Array<() => void> = [];

  constructor(
    private readonly scene: THREE.Scene,
    private readonly store: VMStore,
    quality: QualityConfig,
  ) {
    const seed = new Rng(hashString(store.hasLayout ? store.layout.id : "aurelle"));
    this.kit = new MaterialKit(seed.child("materials"), quality.transmission);
    this.products = new ProductFactory(this.kit);
    this.fixtureFactory = new FixtureFactory(this.kit);
    this.lighting = new LightingEngine(quality.maxSpots, quality.maxShadowCasters, quality.caseFillLights);
    this.overlays = new Overlays3D(store);

    this.root.name = "boutique";
    this.root.add(this.fixturesGroup, this.lighting.group, this.overlays.group);
    scene.add(this.root);

    this.envTexture = makeInteriorEnvironment();
    scene.environment = this.envTexture;
    scene.environmentIntensity = 0.85;
    scene.background = new THREE.Color("#17130d");

    // ── Reactive wiring: store → 3D in one pass ──
    this.unsubscribers.push(
      store.events.on("slots-changed", (keys) => {
        const fixtures = new Set(keys.map((k) => k.split("#")[0]));
        for (const id of fixtures) this.rebuildProducts(id);
        this.overlays.rebuildStockSignals((k) => this.slotAnchorWorld(k));
      }),
      store.events.on("fixtures-changed", (ids) => {
        for (const id of ids) this.syncFixture(id);
        this.lightingStats = this.lighting.buildForLayout(store.layout);
        this.overlays.rebuildAnalytics(store.analytics);
        this.overlays.rebuildStockSignals((k) => this.slotAnchorWorld(k));
      }),
      store.events.on("fixtures-moved", (ids) => {
        for (const id of ids) this.syncFixture(id);
        this.lighting.requestShadowUpdate();
      }),
      store.events.on("analytics-changed", (analytics) => {
        this.overlays.rebuildAnalytics(analytics);
      }),
      store.events.on("overlays-changed", (state) => {
        this.overlays.applyVisibility(state);
        this.overlays.rebuildAnalytics(store.analytics);
        this.overlays.rebuildStockSignals((k) => this.slotAnchorWorld(k));
      }),
      store.events.on("diff-preview", (diffs) => {
        this.overlays.showDiff(diffs, (k) => this.slotAnchorWorld(k));
      }),
      store.events.on("diff-highlights-changed", (diffs) => {
        this.rebuildDiffHighlights(diffs);
      }),
      store.events.on("selection-changed", (sel) => {
        this.highlightFixture(sel.kind === "fixture" ? sel.fixtureId : null);
        this.highlightSlot(sel.kind === "slot" ? slotKey(sel.slot) : null);
      }),
    );
  }

  /** Full (re)build for a layout. */
  build(layout: BoutiqueLayout): void {
    // Clear previous fixture nodes + floor + ambience.
    for (const id of [...this.nodes.keys()]) this.removeFixtureNode(id);
    if (this.floorGroup) {
      this.root.remove(this.floorGroup);
      this.disposeSubtree(this.floorGroup);
      this.floorGroup = null;
    }
    if (this.ambienceGroup) {
      this.root.remove(this.ambienceGroup);
      this.disposeSubtree(this.ambienceGroup);
      this.ambienceGroup = null;
    }

    const rng = new Rng(hashString(`${layout.id}-plate`));
    const plate = buildFloorPlate(layout, this.kit, rng);
    this.floorGroup = plate.group;
    this.root.add(plate.group);

    // Statement ceiling + chandelier + zone rugs (the maison's luxury signature).
    const ambience = new THREE.Group();
    ambience.name = "ambience";
    ambience.add(buildCeilingFeature(layout, this.kit, layout.theme, rng.child("ceiling")));
    ambience.add(buildZoneRugs(layout, this.kit, layout.theme));
    // Semi-enclosed private salons (partitions + green-gold interior).
    const salons = buildPrivateSalons(layout, this.kit, rng.child("salons"));
    ambience.add(salons.group);
    this.partitionColliders = salons.colliders;
    this.ambienceGroup = ambience;
    this.root.add(ambience);

    for (const f of layout.fixtures) this.addFixtureNode(f.id);

    this.lightingStats = this.lighting.buildForLayout(layout);
    this.overlays.rebuildAnalytics(this.store.analytics);
    this.overlays.rebuildStockSignals((k) => this.slotAnchorWorld(k));
    this.overlays.applyVisibility(this.store.overlays);
  }

  // ── Fixture subtree management ──

  private addFixtureNode(fixtureId: string): void {
    const instance = this.store.fixture(fixtureId);
    if (!instance) return;
    const template = templateOf(instance.templateId);
    const zone = this.store.layout.zones.find((z) => z.id === instance.zoneId);
    const built = this.fixtureFactory.build(instance, template, zone, this.store.layout.theme.accentUpholstery);

    const isCeiling = template.kind.startsWith("light-");
    built.group.position.set(
      instance.x,
      isCeiling ? this.store.layout.floor.ceilingHeight - 0.06 : 0,
      instance.z,
    );
    built.group.rotation.y = instance.rotationY;

    const productsGroup = new THREE.Group();
    productsGroup.name = `products-${fixtureId}`;
    built.group.add(productsGroup);

    // Invisible slot pick targets (render-skipped, raycast-visible).
    const pickTargets: THREE.Mesh[] = [];
    for (const [local, anchor] of built.slotAnchors) {
      const pick = new THREE.Mesh(pickSphereGeo, pickSphereMat);
      pick.visible = false;
      pick.position.copy(anchor);
      pick.userData.slotKey = `${fixtureId}#${local}`;
      pick.userData.fixtureId = fixtureId;
      built.group.add(pick);
      pickTargets.push(pick);
    }

    this.fixturesGroup.add(built.group);
    this.nodes.set(fixtureId, { built, productsGroup, pickTargets });
    this.rebuildProducts(fixtureId);
  }

  private removeFixtureNode(fixtureId: string): void {
    const node = this.nodes.get(fixtureId);
    if (!node) return;
    this.fixturesGroup.remove(node.built.group);
    this.disposeSubtree(node.built.group);
    this.nodes.delete(fixtureId);
  }

  /** Sync one fixture after a store change: move, add, or remove. */
  private syncFixture(fixtureId: string): void {
    const instance = this.store.fixture(fixtureId);
    const node = this.nodes.get(fixtureId);
    if (!instance) {
      this.removeFixtureNode(fixtureId);
      return;
    }
    if (!node) {
      this.addFixtureNode(fixtureId);
      return;
    }
    const template = templateOf(instance.templateId);
    const isCeiling = template.kind.startsWith("light-");
    node.built.group.position.set(
      instance.x,
      isCeiling ? this.store.layout.floor.ceilingHeight - 0.06 : 0,
      instance.z,
    );
    node.built.group.rotation.y = instance.rotationY;
  }

  /** Rebuild the merchandise on one fixture from live slot states. */
  private rebuildProducts(fixtureId: string): void {
    const node = this.nodes.get(fixtureId);
    if (!node) return;
    for (const child of [...node.productsGroup.children]) {
      node.productsGroup.remove(child);
      // Product clones share cached geometry/materials — do not dispose them.
    }
    for (const key of this.store.slotKeysForFixture(fixtureId)) {
      const state = this.store.slot(key);
      if (!state?.sku) continue;
      const anchor = node.built.slotAnchors.get(key.split("#")[1]);
      if (!anchor) continue;
      const product = this.productClone(state.sku);
      product.position.copy(anchor);
      // Stable presentation rotation per slot.
      const addr = parseSlotKey(key);
      const fixture = this.store.fixture(fixtureId);
      if (fixture?.templateId === "showcase-island-circular") {
        const theta = ((addr.col + 0.5) / 18) * 2 * Math.PI;
        product.rotation.y = -theta - Math.PI / 2 + new Rng(hashString(key)).range(-0.1, 0.1);
      } else {
        product.rotation.y = new Rng(hashString(key)).range(-0.35, 0.35) + (addr.col % 2) * 0.15;
      }
      product.userData.slotKey = key;
      product.userData.fixtureId = fixtureId;
      product.traverse((o) => {
        o.userData.slotKey = key;
        o.userData.fixtureId = fixtureId;
      });
      node.productsGroup.add(product);
    }
  }

  private productClone(skuId: string): THREE.Group {
    let template = this.productTemplates.get(skuId);
    if (!template) {
      const sku = SKU_BY_ID.get(skuId);
      if (!sku) return new THREE.Group();
      template = this.products.build(sku);
      this.productTemplates.set(skuId, template);
    }
    return template.clone();
  }

  // ── World-space slot anchors (overlays, tooltips) ──

  slotAnchorWorld(key: SlotKey): THREE.Vector3 | null {
    const fixtureId = key.split("#")[0];
    const node = this.nodes.get(fixtureId);
    if (!node) return null;
    const local = node.built.slotAnchors.get(key.split("#")[1]);
    if (!local) return null;
    node.built.group.updateMatrixWorld();
    return local.clone().applyMatrix4(node.built.group.matrixWorld);
  }

  // ── Picking ──

  pick(ndcX: number, ndcY: number, camera: THREE.Camera): PickResult {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const hits = this.raycaster.intersectObjects(this.fixturesGroup.children, true);
    for (const hit of hits) {
      const slot = (hit.object.userData.slotKey as SlotKey | undefined) ?? null;
      const fixture = (hit.object.userData.fixtureId as string | undefined) ?? null;
      if (slot || fixture) {
        return { fixtureId: fixture, slotKey: slot, point: hit.point.clone() };
      }
    }
    return { fixtureId: null, slotKey: null, point: null };
  }

  /** Where a floor drag lands, for fixture placement. */
  pickFloor(ndcX: number, ndcY: number, camera: THREE.Camera): THREE.Vector3 | null {
    this.raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const out = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(plane, out) ? out : null;
  }

  // ── Selection visuals ──

  private highlightFixture(fixtureId: string | null): void {
    if (this.selectionHelper) {
      this.selectionHelper.parent?.remove(this.selectionHelper);
      this.selectionHelper.geometry.dispose();
      (this.selectionHelper.material as THREE.Material).dispose();
      this.selectionHelper = null;
    }
    if (!fixtureId) return;
    const node = this.nodes.get(fixtureId);
    if (!node) return;
    const s = node.built.size;
    const box = new THREE.BoxGeometry(s.x + 0.12, s.y + 0.12, s.z + 0.12);
    const edges = new THREE.EdgesGeometry(box);
    box.dispose();
    this.selectionHelper = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: new THREE.Color("#e9cf9c"), transparent: true, opacity: 0.95 }),
    );
    this.selectionHelper.position.y = s.y / 2;
    this.selectionHelper.renderOrder = 20;
    node.built.group.add(this.selectionHelper);
  }

  private highlightSlot(key: SlotKey | null): void {
    if (this.slotHighlight) {
      this.slotHighlight.parent?.remove(this.slotHighlight);
      this.slotHighlight.geometry.dispose();
      (this.slotHighlight.material as THREE.Material).dispose();
      this.slotHighlight = null;
    }
    if (!key) return;
    const pos = this.slotAnchorWorld(key);
    if (!pos) return;
    this.slotHighlight = new THREE.Mesh(
      new THREE.TorusGeometry(0.085, 0.01, 8, 32),
      new THREE.MeshStandardMaterial({
        color: new THREE.Color("#e9cf9c"),
        emissive: new THREE.Color("#e9cf9c"),
        emissiveIntensity: 2,
        transparent: true,
        opacity: 0.95,
        depthWrite: false,
      }),
    );
    this.slotHighlight.rotation.x = -Math.PI / 2;
    this.slotHighlight.position.copy(pos).y += 0.02;
    this.slotHighlight.renderOrder = 16;
    this.root.add(this.slotHighlight);
  }

  updateFrame(elapsed: number): void {
    this.overlays.updateFrame(elapsed);
  }

  /** Debug audit wired into the battery: throws on any MeshBasicMaterial. */
  auditMaterials(): void {
    this.scene.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        const mats = Array.isArray(o.material) ? o.material : [o.material];
        for (const m of mats) {
          if ((m as THREE.Material).type === "MeshBasicMaterial") {
            throw new Error(`MeshBasicMaterial found on ${o.name || o.uuid} — banned (PRD §10)`);
          }
        }
      }
    });
  }

  private diffHighlightMeshes: THREE.Object3D[] = [];

  rebuildDiffHighlights(diffs: { added: string[]; removed: any[]; moved: string[]; replaced: string[] } | null): void {
    // 1. Clear existing highlights
    for (const h of this.diffHighlightMeshes) {
      h.parent?.remove(h);
      if (h instanceof THREE.Mesh || h instanceof THREE.LineSegments) {
        h.geometry.dispose();
        if (Array.isArray(h.material)) {
          h.material.forEach((m) => m.dispose());
        } else {
          h.material.dispose();
        }
      }
    }
    this.diffHighlightMeshes = [];

    if (!diffs) return;

    const createOutline = (size: THREE.Vector3, color: string) => {
      const geo = new THREE.BoxGeometry(size.x, size.y, size.z);
      const edges = new THREE.EdgesGeometry(geo);
      const mat = new THREE.LineBasicMaterial({ color, linewidth: 3, depthTest: false });
      const line = new THREE.LineSegments(edges, mat);
      line.renderOrder = 30;
      return line;
    };

    // Added = Green (#3f9c5c)
    for (const id of diffs.added) {
      const node = this.nodes.get(id);
      if (node) {
        const box = new THREE.Box3().setFromObject(node.built.group);
        const size = new THREE.Vector3();
        box.getSize(size);
        const outline = createOutline(size, "#3f9c5c");
        outline.position.y = 0.05; // slightly above base
        node.built.group.add(outline);
        this.diffHighlightMeshes.push(outline);
      }
    }

    // Moved = Blue (#1e90ff)
    for (const id of diffs.moved) {
      const node = this.nodes.get(id);
      if (node) {
        const box = new THREE.Box3().setFromObject(node.built.group);
        const size = new THREE.Vector3();
        box.getSize(size);
        const outline = createOutline(size, "#1e90ff");
        outline.position.y = 0.05;
        node.built.group.add(outline);
        this.diffHighlightMeshes.push(outline);
      }
    }

    // Replaced = Orange (#e2a13c)
    for (const id of diffs.replaced) {
      const node = this.nodes.get(id);
      if (node) {
        const box = new THREE.Box3().setFromObject(node.built.group);
        const size = new THREE.Vector3();
        box.getSize(size);
        const outline = createOutline(size, "#e2a13c");
        outline.position.y = 0.05;
        node.built.group.add(outline);
        this.diffHighlightMeshes.push(outline);
      }
    }

    // Removed = Ghost Red (#d13a3a)
    for (const f of diffs.removed) {
      const temp = templateOf(f.templateId);
      const w = f.dims?.width ?? temp.dims.default.width;
      const h = f.dims?.height ?? temp.dims.default.height;
      const d = f.dims?.depth ?? temp.dims.default.depth;
      const geo = new THREE.BoxGeometry(w, h, d);
      const mat = new THREE.MeshStandardMaterial({
        color: "#d13a3a",
        transparent: true,
        opacity: 0.35,
        wireframe: false,
        depthWrite: false,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(f.x, h / 2, f.z);
      mesh.rotation.y = f.rotationY;
      
      const edges = new THREE.EdgesGeometry(geo);
      const edgeMat = new THREE.LineBasicMaterial({ color: "#d13a3a", linewidth: 2 });
      const outline = new THREE.LineSegments(edges, edgeMat);
      mesh.add(outline);

      this.fixturesGroup.add(mesh);
      this.diffHighlightMeshes.push(mesh);
    }
  }

  // ── Background pre-warming ───────────────────────────────────────────────
  // The first time a scenario is applied its floor/wall/mural textures and all
  // product meshes are generated procedurally (~2–3 s); every later apply of the
  // same look is instant (~80 ms) because those results are cached. To keep the
  // demo snappy we generate them ahead of time during idle frames right after
  // the boutique loads — building each asset off-screen and discarding the
  // geometry, which leaves the shared (cached) materials warm.
  private productsPrewarmed = false;
  private prewarmHandle: number | null = null;
  private disposed = false;

  prewarm(themes: BoutiqueTheme[]): void {
    if (this.disposed) return;
    const tasks: Array<() => void> = [];
    // Scenario floor/wall/mural textures first — they're the recurring per-apply
    // cost the presenter hits when switching looks.
    for (const theme of themes) tasks.push(() => this.prewarmTheme(theme));
    // Product meshes are scenario-independent, so warm them once, after.
    if (!this.productsPrewarmed) {
      this.productsPrewarmed = true;
      for (const sku of SKU_CATALOG) tasks.push(() => void this.productClone(sku.id));
    }
    this.runIdleTasks(tasks);
  }

  /** Generate one scenario's floor/wall/mural textures, then drop the geometry. */
  private prewarmTheme(theme: BoutiqueTheme): void {
    if (this.disposed) return;
    const layout = { ...this.store.layout, theme };
    const plate = buildFloorPlate(layout, this.kit, new Rng(hashString(`${layout.id}-prewarm`)));
    this.disposeSubtree(plate.group); // frees geometry; cached materials stay warm
  }

  private runIdleTasks(tasks: Array<() => void>): void {
    if (this.prewarmHandle != null) {
      cancelAnimationFrame(this.prewarmHandle);
      this.prewarmHandle = null;
    }
    // Drive the queue off requestAnimationFrame: background setTimeout is throttled
    // (≥1 s) in a non-foreground pane and would never drain the heavy texture tasks,
    // whereas rAF keeps firing as long as the scene renders. Batch cheap tasks under
    // a 6 ms budget; a heavy texture task takes a frame to itself, spaced by the
    // render loop so warm-up degrades to brief stutters rather than a hard freeze.
    let i = 0;
    const step = () => {
      this.prewarmHandle = null;
      if (this.disposed || i >= tasks.length) return;
      const start = performance.now();
      do {
        try {
          tasks[i]();
        } catch {
          /* pre-warming is best-effort — a failure just means that asset builds on demand */
        }
        i++;
      } while (i < tasks.length && performance.now() - start < 6);
      this.prewarmHandle = requestAnimationFrame(step);
    };
    this.prewarmHandle = requestAnimationFrame(step);
  }

  private disposeSubtree(root: THREE.Object3D): void {
    root.traverse((o) => {
      // Product clones share cached template geometry; pick spheres share one
      // geometry — neither may be disposed here. Fixture meshes are unique.
      if (o instanceof THREE.Mesh && o.geometry !== pickSphereGeo && !o.userData.slotKey) {
        o.geometry.dispose();
      }
      // Materials belong to the MaterialKit / ProductFactory caches.
    });
  }

  dispose(): void {
    this.disposed = true;
    if (this.prewarmHandle != null) {
      cancelAnimationFrame(this.prewarmHandle);
      this.prewarmHandle = null;
    }
    for (const u of this.unsubscribers) u();
    this.scene.remove(this.root);
    this.overlays.dispose();
    this.lighting.dispose();
    
    // Clear diff highlights
    for (const h of this.diffHighlightMeshes) {
      h.parent?.remove(h);
    }

    for (const id of [...this.nodes.keys()]) this.removeFixtureNode(id);
    for (const g of this.productTemplates.values()) {
      g.traverse((o) => {
        if (o instanceof THREE.Mesh) o.geometry.dispose();
      });
    }
    this.productTemplates.clear();
    this.products.dispose();
    this.kit.dispose();
    this.envTexture.dispose();
  }
}
