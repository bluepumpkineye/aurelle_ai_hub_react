/**
 * Camera rig — orbit (overview) + first-person walk (boutique exploration),
 * V toggles, six authored bookmarks (keys 1–6) with smooth 0.8 s ease
 * transitions (PRD §5). Walk mode collides with walls, columns and fixtures
 * so the VM director walks the floor like a client would.
 */

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import type { BoutiqueLayout } from "../data/types";
import { polygonCentroid } from "../data/types";
import { templateOf } from "../fixtures/FixtureCatalog";

export type CameraMode = "orbit" | "walk";

export interface CameraBookmark {
  name: string;
  position: THREE.Vector3;
  target: THREE.Vector3;
}

export function makeBookmarks(layout: BoutiqueLayout): CameraBookmark[] {
  const { width: W, depth: D, ceilingHeight: H } = layout.floor;
  const door = layout.floor.apertures.find((a) => a.kind === "door" && a.wall === "south");
  const doorX = door ? door.offset + door.width / 2 - W / 2 : 0;
  const out: CameraBookmark[] = [];

  // Bookmarks follow the playbook's six authored viewpoints (keys 1–6).

  // 1 — Entry view: standing at the door, looking into the boutique. The
  //     eyeline lands on the Fine Jewellery hero island (Rule 1).
  out.push({
    name: "Entry",
    position: new THREE.Vector3(doorX, 1.62, D / 2 - 0.5),
    target: new THREE.Vector3(doorX * 0.3, 1.1, -D * 0.25),
  });

  const zoneShot = (
    kind: string,
    name: string,
    dist: number,
    height: number,
    lookH: number,
    fallbackKind?: string,
  ) => {
    const zone =
      layout.zones.find((z) => z.kind === kind) ??
      (fallbackKind ? layout.zones.find((z) => z.kind === fallbackKind) : undefined);
    if (!zone) return;
    const [cx, cz] = polygonCentroid(zone.polygon);
    // Approach from the entrance (south) side so we look the way a client walks.
    const dir = new THREE.Vector3(cx, 0, cz).sub(new THREE.Vector3(doorX, 0, D / 2)).normalize();
    out.push({
      name,
      position: new THREE.Vector3(cx - dir.x * dist, height, cz - dir.z * dist),
      target: new THREE.Vector3(cx, lookH, cz),
    });
  };

  // 2 — Fine Jewellery: facing the hero island.
  zoneShot("fine-jewelry", "Fine Jewellery", 3.2, 1.55, 1.0);

  // 3 — Watch wall: close-up facing the right (east) wall.
  const watches = layout.zones.find((z) => z.kind === "watches");
  if (watches) {
    const [wcx, wcz] = polygonCentroid(watches.polygon);
    out.push({
      name: "Watch Wall",
      position: new THREE.Vector3(wcx - 1.6, 1.5, wcz),
      target: new THREE.Vector3(W / 2, 1.3, wcz),
    });
  }

  // 4 — High Jewellery Gallery: standing at the gallery entry, looking in.
  zoneShot("high-jewelry", "HJ Gallery", 3.4, 1.55, 1.0);

  // 5 — Private Salon / consultation interior.
  zoneShot("vip", "Private Salon", 2.6, 1.5, 0.8, "consultation");

  // 6 — Overview orbit, ~45° from a ceiling corner.
  out.push({
    name: "Overview",
    position: new THREE.Vector3(W * 0.32, H - 0.25, D * 0.44),
    target: new THREE.Vector3(0, 0.2, -D * 0.05),
  });

  return out;
}

export class CameraRig {
  mode: CameraMode = "orbit";
  bookmarks: CameraBookmark[] = [];
  onModeChange: ((mode: CameraMode) => void) | null = null;

  private orbit: OrbitControls;
  private keys = new Set<string>();
  private walkYaw = 0;
  private walkPitch = -0.05;
  private dragging = false;
  private lastPointer = { x: 0, y: 0 };
  private transition: {
    fromPos: THREE.Vector3;
    toPos: THREE.Vector3;
    fromTarget: THREE.Vector3;
    toTarget: THREE.Vector3;
    t: number;
  } | null = null;
  private blockers: Array<{ x: number; z: number; hw: number; hd: number }> = [];
  private bounds = { hw: 10, hd: 8 };
  private detachFns: Array<() => void> = [];

  constructor(
    private readonly camera: THREE.PerspectiveCamera,
    private readonly dom: HTMLElement,
  ) {
    this.orbit = new OrbitControls(camera, dom);
    this.orbit.enableDamping = true;
    this.orbit.dampingFactor = 0.08;
    this.orbit.maxPolarAngle = Math.PI * 0.495;
    this.orbit.minDistance = 0.8;
    this.orbit.maxDistance = 40;

    const onKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
      if (e.code === "KeyV") {
        this.setMode(this.mode === "orbit" ? "walk" : "orbit");
        return;
      }
      const idx = ["Digit1", "Digit2", "Digit3", "Digit4", "Digit5", "Digit6"].indexOf(e.code);
      if (idx >= 0 && this.bookmarks[idx]) {
        this.goToBookmark(idx);
        return;
      }
      this.keys.add(e.code);
    };
    const onKeyUp = (e: KeyboardEvent) => this.keys.delete(e.code);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    this.detachFns.push(() => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    });

    // Walk-mode look: drag to look around (no pointer-lock traps).
    const onPointerDown = (e: PointerEvent) => {
      if (this.mode !== "walk") return;
      this.dragging = true;
      this.lastPointer = { x: e.clientX, y: e.clientY };
    };
    const onPointerMove = (e: PointerEvent) => {
      if (this.mode !== "walk" || !this.dragging) return;
      const dx = e.clientX - this.lastPointer.x;
      const dy = e.clientY - this.lastPointer.y;
      this.lastPointer = { x: e.clientX, y: e.clientY };
      this.walkYaw -= dx * 0.0032;
      this.walkPitch = Math.max(-1.2, Math.min(0.9, this.walkPitch - dy * 0.0028));
    };
    const onPointerUp = () => {
      this.dragging = false;
    };
    dom.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    this.detachFns.push(() => {
      dom.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
    });
  }

  configureForLayout(layout: BoutiqueLayout): void {
    this.bookmarks = makeBookmarks(layout);
    this.bounds = { hw: layout.floor.width / 2 - 0.35, hd: layout.floor.depth / 2 - 0.35 };
    this.blockers = layout.fixtures
      .filter((f) => !templateOf(f.templateId).kind.startsWith("light-"))
      .map((f) => {
        const turns = Math.round(f.rotationY / (Math.PI / 2)) % 2 !== 0;
        return {
          x: f.x,
          z: f.z,
          hw: (turns ? f.dims.depth : f.dims.width) / 2 + 0.22,
          hd: (turns ? f.dims.width : f.dims.depth) / 2 + 0.22,
        };
      });
    for (const col of layout.floor.columns) {
      this.blockers.push({ x: col.x, z: col.z, hw: col.size / 2 + 0.22, hd: col.size / 2 + 0.22 });
    }
    // Boot inside the boutique: elevated three-quarter view from the entrance
    // corner, whole floor readable (Pillar D).
    this.camera.position.set(
      layout.floor.width * 0.18,
      layout.floor.ceilingHeight * 0.72,
      layout.floor.depth / 2 - 1.2,
    );
    this.orbit.target.set(0, 0.7, -layout.floor.depth * 0.12);
    this.orbit.update();
  }

  /** Add partition-wall colliders (private salons) to the walk blockers. */
  addBlockers(boxes: THREE.Box3[]): void {
    for (const box of boxes) {
      this.blockers.push({
        x: (box.min.x + box.max.x) / 2,
        z: (box.min.z + box.max.z) / 2,
        hw: (box.max.x - box.min.x) / 2 + 0.22,
        hd: (box.max.z - box.min.z) / 2 + 0.22,
      });
    }
  }

  setMode(mode: CameraMode): void {
    if (mode === this.mode) return;
    this.mode = mode;
    this.orbit.enabled = mode === "orbit";
    if (mode === "walk") {
      // Enter walk at eye height facing the current view direction.
      const dir = new THREE.Vector3();
      this.camera.getWorldDirection(dir);
      this.walkYaw = Math.atan2(-dir.x, -dir.z);
      this.walkPitch = -0.05;
      this.camera.position.y = 1.62;
      this.clampWalk(this.camera.position);
    }
    this.onModeChange?.(mode);
  }

  goToBookmark(index: number): void {
    const b = this.bookmarks[index];
    if (!b) return;
    this.flyTo(b.position, b.target);
  }

  /** Smooth 0.8 s transition to an arbitrary pose (dashboard click-to-navigate). */
  flyTo(position: THREE.Vector3, target: THREE.Vector3): void {
    this.transition = {
      fromPos: this.camera.position.clone(),
      toPos: position.clone(),
      fromTarget: this.mode === "orbit" ? this.orbit.target.clone() : this.currentLookTarget(),
      toTarget: target.clone(),
      t: 0,
    };
  }

  private currentLookTarget(): THREE.Vector3 {
    const dir = new THREE.Vector3();
    this.camera.getWorldDirection(dir);
    return this.camera.position.clone().add(dir.multiplyScalar(4));
  }

  private clampWalk(p: THREE.Vector3): void {
    p.x = Math.max(-this.bounds.hw, Math.min(this.bounds.hw, p.x));
    p.z = Math.max(-this.bounds.hd, Math.min(this.bounds.hd, p.z));
    for (const b of this.blockers) {
      const dx = p.x - b.x;
      const dz = p.z - b.z;
      if (Math.abs(dx) < b.hw && Math.abs(dz) < b.hd) {
        // Push out along the axis of least penetration.
        const px = b.hw - Math.abs(dx);
        const pz = b.hd - Math.abs(dz);
        if (px < pz) p.x = b.x + Math.sign(dx || 1) * b.hw;
        else p.z = b.z + Math.sign(dz || 1) * b.hd;
      }
    }
  }

  update(dt: number): void {
    if (this.transition) {
      this.transition.t += dt / 0.8;
      const t = Math.min(1, this.transition.t);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; // easeInOutQuad
      this.camera.position.lerpVectors(this.transition.fromPos, this.transition.toPos, e);
      const target = new THREE.Vector3().lerpVectors(
        this.transition.fromTarget,
        this.transition.toTarget,
        e,
      );
      this.camera.lookAt(target);
      if (t >= 1) {
        if (this.mode === "orbit") {
          this.orbit.target.copy(this.transition.toTarget);
          this.orbit.update();
        } else {
          const dir = target.clone().sub(this.camera.position).normalize();
          this.walkYaw = Math.atan2(-dir.x, -dir.z);
          this.walkPitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
        }
        this.transition = null;
      }
      return;
    }

    if (this.mode === "orbit") {
      this.orbit.update();
      return;
    }

    // Walk integration
    const speed = this.keys.has("ShiftLeft") || this.keys.has("ShiftRight") ? 3.4 : 1.8;
    const forward = new THREE.Vector3(-Math.sin(this.walkYaw), 0, -Math.cos(this.walkYaw));
    const right = new THREE.Vector3(-forward.z, 0, forward.x);
    const move = new THREE.Vector3();
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) move.add(forward);
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) move.sub(forward);
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) move.add(right);
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) move.sub(right);
    if (move.lengthSq() > 0) {
      move.normalize().multiplyScalar(speed * dt);
      this.camera.position.add(move);
    }
    this.camera.position.y = 1.62;
    this.clampWalk(this.camera.position);

    const look = new THREE.Vector3(
      this.camera.position.x - Math.sin(this.walkYaw) * Math.cos(this.walkPitch),
      this.camera.position.y + Math.sin(this.walkPitch),
      this.camera.position.z - Math.cos(this.walkYaw) * Math.cos(this.walkPitch),
    );
    this.camera.lookAt(look);
  }

  dispose(): void {
    this.orbit.dispose();
    for (const fn of this.detachFns) fn();
    this.detachFns = [];
  }
}
