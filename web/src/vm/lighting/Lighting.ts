/**
 * Lighting engine — per-fixture LED spot simulation (cone angle, penumbra,
 * color temperature, intensity), shopfront daylight portal with time-of-day,
 * display-case interior fill, cool ambient against 2900 K warm keys
 * (Aurelle color script, Pillar E). Shadow budget is prioritized: the most
 * consequential spots cast PCF-filtered shadows; the rest are unshadowed.
 */

import * as THREE from "three";
import type { BoutiqueLayout, FixtureInstance, FixtureTemplate } from "../data/types";
import { templateOf } from "../fixtures/FixtureCatalog";

/** Kelvin → linear RGB (Tanner Helland approximation, normalized). */
export function cctToColor(kelvin: number): THREE.Color {
  const t = kelvin / 100;
  let r: number;
  let g: number;
  let b: number;
  if (t <= 66) {
    r = 255;
    g = 99.47 * Math.log(t) - 161.12;
    b = t <= 19 ? 0 : 138.52 * Math.log(t - 10) - 305.04;
  } else {
    r = 329.7 * Math.pow(t - 60, -0.1332);
    g = 288.12 * Math.pow(t - 60, -0.0755);
    b = 255;
  }
  const c = new THREE.Color(
    Math.min(255, Math.max(0, r)) / 255,
    Math.min(255, Math.max(0, g)) / 255,
    Math.min(255, Math.max(0, b)) / 255,
  );
  return c.convertSRGBToLinear();
}

export interface LightingStats {
  spots: number;
  shadowCasters: number;
  caseFills: number;
}

export class LightingEngine {
  readonly group = new THREE.Group();
  private daylight: THREE.DirectionalLight;
  private skyFill: THREE.HemisphereLight;
  private spots: THREE.SpotLight[] = [];
  private caseFills: THREE.PointLight[] = [];
  private hour = 14;

  constructor(
    private readonly maxSpots = 40,
    private readonly maxShadows = 6,
    private readonly enableCaseFills = true,
  ) {
    this.group.name = "lighting";

    // Warm interior fill — the reference boutiques glow warm-champagne; a gentle
    // cool remains in the sky term so daylight from the shopfront reads cooler.
    this.skyFill = new THREE.HemisphereLight(
      new THREE.Color("#f2e6cf"),
      new THREE.Color("#33291c"),
      0.72,
    );
    this.group.add(this.skyFill);

    this.daylight = new THREE.DirectionalLight(new THREE.Color("#eaf2ff"), 1.2);
    this.daylight.castShadow = true;
    this.daylight.shadow.mapSize.set(2048, 2048);
    this.daylight.shadow.bias = -0.0004;
    this.daylight.shadow.normalBias = 0.02;
    this.daylight.shadow.autoUpdate = false;
    this.group.add(this.daylight, this.daylight.target);
  }

  /**
   * Shadow maps are static between edits (fixtures never move per frame —
   * PRD §6). Call after any scene mutation or time-of-day change; each map
   * re-renders exactly once on the next frame.
   */
  requestShadowUpdate(): void {
    this.daylight.shadow.needsUpdate = true;
    for (const s of this.spots) {
      if (s.castShadow) s.shadow.needsUpdate = true;
    }
  }

  buildForLayout(layout: BoutiqueLayout): LightingStats {
    // Clear previous
    for (const s of [...this.spots, ...this.caseFills]) {
      s.parent?.remove(s);
      if (s instanceof THREE.SpotLight) s.target.parent?.remove(s.target);
      s.dispose();
    }
    this.spots = [];
    this.caseFills = [];

    const H = layout.floor.ceilingHeight;
    const candidates: Array<{
      pos: THREE.Vector3;
      target: THREE.Vector3;
      coneDeg: number;
      cct: number;
      intensity: number;
      priority: number;
    }> = [];

    // Per-zone colour temperature (playbook): 2900 K arrival → 3000 K fine
    // jewellery → 4000 K watches (technical) → 2700 K high jewellery (warm).
    const zoneCct = new Map(layout.zones.map((z) => [z.id, z.cct]));

    for (const fixture of layout.fixtures) {
      const template = templateOf(fixture.templateId);
      const rot = new THREE.Matrix4().makeRotationY(fixture.rotationY);
      const isCeilingRig = template.kind.startsWith("light-");
      const baseY = isCeilingRig ? H - 0.06 : 0;
      // The zone drives the spot temperature; the template intensity/cone stay.
      const cct = zoneCct.get(fixture.zoneId) ?? 2900;

      for (const att of template.lighting) {
        const local = new THREE.Vector3(att.offset[0], att.offset[1], att.offset[2]).applyMatrix4(rot);
        const pos = new THREE.Vector3(fixture.x + local.x, baseY + local.y, fixture.z + local.z);
        // Rig lights aim at the floor beneath (slight outward drift); fixture-
        // mounted lights aim into their own deck.
        const target = isCeilingRig
          ? new THREE.Vector3(pos.x + local.x * 0.3, 0, pos.z + local.z * 0.3)
          : new THREE.Vector3(fixture.x + local.x, 0.2, fixture.z + local.z);
        candidates.push({
          pos,
          target,
          coneDeg: att.coneDeg,
          cct,
          intensity: att.intensity,
          priority: isCeilingRig ? att.intensity * 1.4 : att.intensity,
        });
      }

      // Display-case interior fill: warm point inside every showcase volume,
      // tinted toward the zone temperature. (iGPU preset uses emissive baffles.)
      if (this.enableCaseFills && template.kind.startsWith("showcase-")) {
        const fill = new THREE.PointLight(cctToColor(Math.min(cct, 3200)), 0.55, 1.6, 1.8);
        const fillY =
          template.kind === "showcase-wall"
            ? fixture.dims.height * 0.62
            : fixture.dims.height * 0.82;
        fill.position.set(fixture.x, fillY, fixture.z);
        this.group.add(fill);
        this.caseFills.push(fill);
      }
    }

    candidates.sort((a, b) => b.priority - a.priority);
    const chosen = candidates.slice(0, this.maxSpots);
    let shadows = 0;
    for (const c of chosen) {
      const spot = new THREE.SpotLight(
        cctToColor(c.cct),
        c.intensity * 6,
        Math.max(3, c.pos.y * 2.4),
        (c.coneDeg * Math.PI) / 180,
        0.45,
        1.6,
      );
      spot.position.copy(c.pos);
      spot.target.position.copy(c.target);
      if (shadows < this.maxShadows && c.pos.y > 2) {
        spot.castShadow = true;
        spot.shadow.mapSize.set(1024, 1024);
        spot.shadow.bias = -0.0003;
        spot.shadow.normalBias = 0.015;
        spot.shadow.autoUpdate = false;
        spot.shadow.needsUpdate = true;
        shadows++;
      }
      this.group.add(spot, spot.target);
      this.spots.push(spot);
    }

    this.applyTimeOfDay(layout);
    return { spots: this.spots.length, shadowCasters: shadows, caseFills: this.caseFills.length };
  }

  /** Time-of-day slider, 7..21 h. Shifts the shopfront daylight portal. */
  setTimeOfDay(hour: number, layout: BoutiqueLayout): void {
    this.hour = Math.max(7, Math.min(21, hour));
    this.applyTimeOfDay(layout);
  }

  get timeOfDay(): number {
    return this.hour;
  }

  private applyTimeOfDay(layout: BoutiqueLayout): void {
    const t = (this.hour - 7) / 14; // 0..1 across the retail day
    const sunAltitude = Math.sin(t * Math.PI); // 0 at open/close, 1 midday
    // Daylight enters from the shopfront (south, +z) and sweeps east→west.
    const azimuth = (t - 0.5) * Math.PI * 0.7;
    const D = layout.floor.depth;
    const H = layout.floor.ceilingHeight;
    this.daylight.position.set(
      Math.sin(azimuth) * D * 1.2,
      2 + sunAltitude * H * 2.2,
      D * 0.9,
    );
    this.daylight.target.position.set(0, 0, -D * 0.15);

    const warmth = 1 - sunAltitude; // warm at open/close, neutral-cool midday
    const cct = 5900 - warmth * 2400;
    this.daylight.color.copy(cctToColor(cct));
    this.daylight.intensity = 0.5 + sunAltitude * 1.5;
    this.skyFill.intensity = 0.32 + sunAltitude * 0.3;

    const s = this.daylight.shadow.camera;
    const range = Math.max(layout.floor.width, layout.floor.depth) * 0.75;
    s.left = -range;
    s.right = range;
    s.top = range;
    s.bottom = -range;
    s.near = 0.5;
    s.far = range * 5;
    s.updateProjectionMatrix();
  }

  dispose(): void {
    for (const s of [...this.spots, ...this.caseFills]) s.dispose();
    this.daylight.dispose();
    this.skyFill.dispose();
  }
}

/**
 * Procedural interior environment (IBL): equirect gradient with warm ceiling-
 * spot blobs and a cool shopfront band — prefiltered by the renderer for
 * specular response on glass, gold and marble. Zero external assets.
 */
export function makeInteriorEnvironment(): THREE.DataTexture {
  const w = 256;
  const h = 128;
  const data = new Uint8Array(w * h * 4);
  const set = (x: number, y: number, r: number, g: number, b: number) => {
    const i = (y * w + x) * 4;
    data[i] = Math.min(255, r);
    data[i + 1] = Math.min(255, g);
    data[i + 2] = Math.min(255, b);
    data[i + 3] = 255;
  };
  for (let y = 0; y < h; y++) {
    const v = y / h; // 0 = up (ceiling), 1 = down (floor)
    for (let x = 0; x < w; x++) {
      const u = x / w;
      // Base: warm plaster ceiling → neutral walls → dark warm floor.
      let r: number;
      let g: number;
      let b: number;
      if (v < 0.42) {
        const tt = v / 0.42;
        r = 235 - tt * 90;
        g = 225 - tt * 95;
        b = 205 - tt * 90;
      } else if (v < 0.62) {
        r = 145;
        g = 130;
        b = 115;
      } else {
        const tt = (v - 0.62) / 0.38;
        r = 145 - tt * 105;
        g = 130 - tt * 98;
        b = 115 - tt * 88;
      }
      // Cool shopfront band on one side of the horizon.
      const win = Math.exp(-Math.pow((u - 0.25) / 0.09, 2)) * Math.exp(-Math.pow((v - 0.5) / 0.14, 2));
      r += win * 60;
      g += win * 90;
      b += win * 150;
      // Warm ceiling spot blobs.
      for (const bx of [0.08, 0.38, 0.62, 0.85]) {
        const d = Math.exp(-Math.pow((u - bx) / 0.035, 2)) * Math.exp(-Math.pow((v - 0.12) / 0.07, 2));
        r += d * 240;
        g += d * 190;
        b += d * 120;
      }
      set(x, y, r, g, b);
    }
  }
  const tex = new THREE.DataTexture(data, w, h, THREE.RGBAFormat);
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.needsUpdate = true;
  return tex;
}
