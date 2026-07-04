/**
 * Procedural texture synthesis — every map in the boutique is generated here
 * (PRD §1: zero external assets at runtime). Canvas-rasterized, deterministic
 * from the store seed, uploaded once per boutique load.
 */

import * as THREE from "three";
import { Rng } from "../core/Seed";

// ───────────────────────────── value noise / fBm ─────────────────────────────

export class Noise2D {
  private perm: Uint8Array;

  constructor(rng: Rng) {
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    for (let i = 255; i > 0; i--) {
      const j = rng.int(0, i);
      const t = p[i];
      p[i] = p[j];
      p[j] = t;
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];
  }

  private hash(x: number, y: number): number {
    return this.perm[(this.perm[x & 255] + y) & 255] / 255;
  }

  /** Smooth value noise in [0,1]. */
  noise(x: number, y: number): number {
    const xi = Math.floor(x);
    const yi = Math.floor(y);
    const xf = x - xi;
    const yf = y - yi;
    const u = xf * xf * (3 - 2 * xf);
    const v = yf * yf * (3 - 2 * yf);
    const a = this.hash(xi, yi);
    const b = this.hash(xi + 1, yi);
    const c = this.hash(xi, yi + 1);
    const d = this.hash(xi + 1, yi + 1);
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }

  fbm(x: number, y: number, octaves: number, lacunarity = 2, gain = 0.5): number {
    let sum = 0;
    let amp = 0.5;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
      sum += amp * this.noise(x * freq, y * freq);
      freq *= lacunarity;
      amp *= gain;
    }
    return sum;
  }

  /** Ridged multifractal — sharp vein-like creases. */
  ridge(x: number, y: number, octaves: number): number {
    let sum = 0;
    let amp = 0.55;
    let freq = 1;
    for (let i = 0; i < octaves; i++) {
      const n = 1 - Math.abs(this.noise(x * freq, y * freq) * 2 - 1);
      sum += amp * n * n;
      freq *= 2.1;
      amp *= 0.52;
    }
    return sum;
  }
}

// ───────────────────────────── canvas helpers ─────────────────────────────

export interface GeneratedMaps {
  map: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) throw new Error("2D canvas context unavailable");
  return [c, ctx];
}

function toTexture(canvas: HTMLCanvasElement, srgb: boolean, repeat: number): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeat, repeat);
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Height field → tangent-space normal map (Sobel). */
function normalFromHeight(height: Float32Array, size: number, strength: number): HTMLCanvasElement {
  const [canvas, ctx] = makeCanvas(size);
  const img = ctx.createImageData(size, size);
  const h = (x: number, y: number) => height[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (h(x + 1, y) - h(x - 1, y)) * strength;
      const dy = (h(x, y + 1) - h(x, y - 1)) * strength;
      const inv = 1 / Math.sqrt(dx * dx + dy * dy + 1);
      const i = (y * size + x) * 4;
      img.data[i] = (-dx * inv * 0.5 + 0.5) * 255;
      img.data[i + 1] = (-dy * inv * 0.5 + 0.5) * 255;
      img.data[i + 2] = inv * 255;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return canvas;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ───────────────────────────── marble (3-frequency veining) ─────────────────────────────

export interface MarbleTints {
  field: string;
  cloud: string;
  vein: string;
  goldVein: string;
}

/** Aurelle default: cool white field, grey-taupe macro clouds, fine warm veins. */
const DEFAULT_MARBLE: MarbleTints = {
  field: "#ebe9e4",
  cloud: "#cecac2",
  vein: "#968f84",
  goldVein: "#bba680",
};

export function generateMarbleMaps(
  rng: Rng,
  size = 1024,
  repeat = 4,
  tints: MarbleTints = DEFAULT_MARBLE,
): GeneratedMaps {
  const noise = new Noise2D(rng.child("marble"));
  const warp = new Noise2D(rng.child("marble-warp"));
  const [colorCanvas, colorCtx] = makeCanvas(size);
  const [roughCanvas, roughCtx] = makeCanvas(size);
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  const field = hexToRgb(tints.field);
  const cloud = hexToRgb(tints.cloud);
  const vein = hexToRgb(tints.vein);
  const goldVein = hexToRgb(tints.goldVein);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 6;
      const v = (y / size) * 6;
      // Macro: cloudy tonal drift. Meso: domain-warped ridged veins. Micro: grain.
      const macro = noise.fbm(u * 0.5, v * 0.5, 3);
      const wx = warp.fbm(u * 0.8 + 13.7, v * 0.8, 3) * 2.4;
      const wy = warp.fbm(u * 0.8, v * 0.8 + 71.3, 3) * 2.4;
      const veinField = noise.ridge(u * 1.6 + wx, v * 1.6 + wy, 4);
      const veinMask = Math.pow(Math.max(0, veinField - 0.52) * 2.4, 1.6);
      const goldMask = Math.pow(Math.max(0, noise.ridge(u * 0.9 + wy, v * 0.9 + wx, 3) - 0.62) * 3.2, 2.2);
      const micro = noise.fbm(u * 14, v * 14, 2);

      let r = lerp(field[0], cloud[0], macro);
      let g = lerp(field[1], cloud[1], macro);
      let b = lerp(field[2], cloud[2], macro);
      r = lerp(r, vein[0], Math.min(1, veinMask));
      g = lerp(g, vein[1], Math.min(1, veinMask));
      b = lerp(b, vein[2], Math.min(1, veinMask));
      r = lerp(r, goldVein[0], Math.min(0.8, goldMask));
      g = lerp(g, goldVein[1], Math.min(0.8, goldMask));
      b = lerp(b, goldVein[2], Math.min(0.8, goldMask));
      const grain = (micro - 0.5) * 10;
      const i = (y * size + x) * 4;
      colorImg.data[i] = Math.max(0, Math.min(255, r + grain));
      colorImg.data[i + 1] = Math.max(0, Math.min(255, g + grain));
      colorImg.data[i + 2] = Math.max(0, Math.min(255, b + grain));
      colorImg.data[i + 3] = 255;

      // Polished stone: veins read slightly rougher; micro variance breaks uniformity.
      const rough = 0.09 + veinMask * 0.08 + (micro - 0.5) * 0.05;
      const rv = Math.max(0, Math.min(1, rough)) * 255;
      roughImg.data[i] = rv;
      roughImg.data[i + 1] = rv;
      roughImg.data[i + 2] = rv;
      roughImg.data[i + 3] = 255;

      height[y * size + x] = veinMask * 0.6 + macro * 0.15 + micro * 0.05;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  const normalCanvas = normalFromHeight(height, size, 1.4);

  return {
    map: toTexture(colorCanvas, true, repeat),
    roughnessMap: toTexture(roughCanvas, false, repeat),
    normalMap: toTexture(normalCanvas, false, repeat),
  };
}

// ───────────────────────────── velvet pile ─────────────────────────────

export function generateVelvetMaps(rng: Rng, baseColor: string, size = 256): GeneratedMaps {
  const noise = new Noise2D(rng.child("velvet"));
  const [colorCanvas, colorCtx] = makeCanvas(size);
  const [roughCanvas, roughCtx] = makeCanvas(size);
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const [br, bg, bb] = hexToRgb(baseColor);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = (x / size) * 24;
      const v = (y / size) * 24;
      const pile = noise.fbm(u, v, 3); // microfiber pile direction breakup
      const crush = noise.fbm(u * 0.18 + 40, v * 0.18, 3); // crushed-pile sheen patches
      const i = (y * size + x) * 4;
      const tone = 0.82 + pile * 0.24 + (crush - 0.5) * 0.18;
      colorImg.data[i] = Math.max(0, Math.min(255, br * tone));
      colorImg.data[i + 1] = Math.max(0, Math.min(255, bg * tone));
      colorImg.data[i + 2] = Math.max(0, Math.min(255, bb * tone));
      colorImg.data[i + 3] = 255;
      const rough = 0.86 + (pile - 0.5) * 0.14 + (crush - 0.5) * 0.1;
      const rv = Math.max(0, Math.min(1, rough)) * 255;
      roughImg.data[i] = rv;
      roughImg.data[i + 1] = rv;
      roughImg.data[i + 2] = rv;
      roughImg.data[i + 3] = 255;
      height[y * size + x] = pile * 0.8;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  const normalCanvas = normalFromHeight(height, size, 2.2);
  return {
    map: toTexture(colorCanvas, true, 2),
    roughnessMap: toTexture(roughCanvas, false, 2),
    normalMap: toTexture(normalCanvas, false, 2),
  };
}

// ───────────────────────────── brushed metal ─────────────────────────────

export function generateBrushedMaps(rng: Rng, size = 256): GeneratedMaps {
  const noise = new Noise2D(rng.child("brushed"));
  const [colorCanvas, colorCtx] = makeCanvas(size);
  const [roughCanvas, roughCtx] = makeCanvas(size);
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Strongly anisotropic streaks along X — brushed direction.
      const streak = noise.fbm(x * 0.045, y * 1.35, 3);
      const wear = noise.fbm(x * 0.02 + 9, y * 0.02, 3);
      const i = (y * size + x) * 4;
      const tone = 236 + (streak - 0.5) * 26;
      colorImg.data[i] = tone;
      colorImg.data[i + 1] = tone;
      colorImg.data[i + 2] = tone;
      colorImg.data[i + 3] = 255;
      const rough = 0.4 + (streak - 0.5) * 0.22 + (wear - 0.5) * 0.12;
      const rv = Math.max(0, Math.min(1, rough)) * 255;
      roughImg.data[i] = rv;
      roughImg.data[i + 1] = rv;
      roughImg.data[i + 2] = rv;
      roughImg.data[i + 3] = 255;
      height[y * size + x] = streak * 0.35;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  const normalCanvas = normalFromHeight(height, size, 1.1);
  return {
    map: toTexture(colorCanvas, true, 1),
    roughnessMap: toTexture(roughCanvas, false, 1),
    normalMap: toTexture(normalCanvas, false, 1),
  };
}

// ───────────────────────────── carpet ─────────────────────────────

export function generateCarpetMaps(rng: Rng, baseColor: string, size = 256): GeneratedMaps {
  const noise = new Noise2D(rng.child("carpet"));
  const [colorCanvas, colorCtx] = makeCanvas(size);
  const [roughCanvas, roughCtx] = makeCanvas(size);
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const [br, bg, bb] = hexToRgb(baseColor);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const loop = noise.fbm(x * 0.5, y * 0.5, 2); // loop-pile stipple
      const drift = noise.fbm(x * 0.03, y * 0.03, 3);
      const i = (y * size + x) * 4;
      const tone = 0.8 + loop * 0.32 + (drift - 0.5) * 0.14;
      colorImg.data[i] = Math.max(0, Math.min(255, br * tone));
      colorImg.data[i + 1] = Math.max(0, Math.min(255, bg * tone));
      colorImg.data[i + 2] = Math.max(0, Math.min(255, bb * tone));
      colorImg.data[i + 3] = 255;
      roughImg.data[i] = 235;
      roughImg.data[i + 1] = 235;
      roughImg.data[i + 2] = 235;
      roughImg.data[i + 3] = 255;
      height[y * size + x] = loop;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  const normalCanvas = normalFromHeight(height, size, 1.6);
  return {
    map: toTexture(colorCanvas, true, 6),
    roughnessMap: toTexture(roughCanvas, false, 6),
    normalMap: toTexture(normalCanvas, false, 6),
  };
}

// ───────────────────────────── wall panel (lacquer / fabric) ─────────────────────────────

export function generateFabricPanelMaps(rng: Rng, baseColor: string, size = 256): GeneratedMaps {
  const noise = new Noise2D(rng.child("fabric"));
  const [colorCanvas, colorCtx] = makeCanvas(size);
  const [roughCanvas, roughCtx] = makeCanvas(size);
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const [br, bg, bb] = hexToRgb(baseColor);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Fine weave: two crossed high-frequency stripes + tonal drift.
      const weave =
        (Math.sin(x * 0.9) * 0.5 + 0.5) * 0.5 + (Math.sin(y * 0.9 + 1.3) * 0.5 + 0.5) * 0.5;
      const drift = noise.fbm(x * 0.02, y * 0.02, 3);
      const i = (y * size + x) * 4;
      const tone = 0.86 + weave * 0.16 + (drift - 0.5) * 0.16;
      colorImg.data[i] = Math.max(0, Math.min(255, br * tone));
      colorImg.data[i + 1] = Math.max(0, Math.min(255, bg * tone));
      colorImg.data[i + 2] = Math.max(0, Math.min(255, bb * tone));
      colorImg.data[i + 3] = 255;
      const rv = (0.72 + (weave - 0.5) * 0.14) * 255;
      roughImg.data[i] = rv;
      roughImg.data[i + 1] = rv;
      roughImg.data[i + 2] = rv;
      roughImg.data[i + 3] = 255;
      height[y * size + x] = weave * 0.4 + drift * 0.2;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  const normalCanvas = normalFromHeight(height, size, 0.9);
  return {
    map: toTexture(colorCanvas, true, 3),
    roughnessMap: toTexture(roughCanvas, false, 3),
    normalMap: toTexture(normalCanvas, false, 3),
  };
}

// ───────────────────────────── plaster ceiling ─────────────────────────────

export function generatePlasterMaps(rng: Rng, size = 256): GeneratedMaps {
  const noise = new Noise2D(rng.child("plaster"));
  const [colorCanvas, colorCtx] = makeCanvas(size);
  const [roughCanvas, roughCtx] = makeCanvas(size);
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const trowel = noise.fbm(x * 0.04, y * 0.04, 4);
      const fine = noise.fbm(x * 0.3, y * 0.3, 2);
      const i = (y * size + x) * 4;
      const tone = 238 + (trowel - 0.5) * 14 + (fine - 0.5) * 6;
      colorImg.data[i] = tone;
      colorImg.data[i + 1] = tone - 1;
      colorImg.data[i + 2] = tone - 4;
      colorImg.data[i + 3] = 255;
      const rv = (0.85 + (fine - 0.5) * 0.1) * 255;
      roughImg.data[i] = rv;
      roughImg.data[i + 1] = rv;
      roughImg.data[i + 2] = rv;
      roughImg.data[i + 3] = 255;
      height[y * size + x] = trowel * 0.5 + fine * 0.1;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  const normalCanvas = normalFromHeight(height, size, 0.6);
  return {
    map: toTexture(colorCanvas, true, 4),
    roughnessMap: toTexture(roughCanvas, false, 4),
    normalMap: toTexture(normalCanvas, false, 4),
  };
}

// ───────────────────────────── soft radial shadow blob ─────────────────────────────

/**
 * Contact-shadow disc: luminance ramp (white centre → black edge) consumed as
 * an alphaMap on a black decal — grounded feel under fixtures and products.
 */
export function generateShadowBlob(size = 128): THREE.CanvasTexture {
  const [canvas, ctx] = makeCanvas(size);
  ctx.fillStyle = "#000000";
  ctx.fillRect(0, 0, size, size);
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.5, "rgba(120,120,120,1)");
  g.addColorStop(1, "rgba(0,0,0,1)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  return tex;
}

// ───────────────────────────── styled wall panels ─────────────────────────────

export type WallPanelStyle = "quilted" | "fluted" | "woven" | "travertine" | "smooth";

/**
 * Wall-panel treatments seen across the maisons: diamond-tufted (quilted)
 * leather, vertical fluting, basket-weave, honed travertine, or smooth
 * plaster. Detail lives in the normal map (Pillar A macro-meso-micro).
 */
export function generateWallPanelMaps(
  rng: Rng,
  baseColor: string,
  style: WallPanelStyle = "smooth",
  size = 512,
): GeneratedMaps {
  const noise = new Noise2D(rng.child(`wall-${style}`));
  const [colorCanvas, colorCtx] = makeCanvas(size);
  const [roughCanvas, roughCtx] = makeCanvas(size);
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const [br, bg, bb] = hexToRgb(baseColor);
  const TAU = Math.PI * 2;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let h = 0;
      let tone = 1;
      let rough = 0.7;

      if (style === "quilted") {
        // Diamond tuft: rotated grid of puffed cells with button dimples.
        const cells = 5;
        const du = (u * cells + v * cells) % 1;
        const dv = (u * cells - v * cells) % 1;
        const puff = Math.sin(du * Math.PI) * Math.sin(dv * Math.PI);
        const cu = Math.abs(du - 0.5);
        const cv = Math.abs(dv - 0.5);
        const dimple = cu < 0.08 && cv < 0.08 ? -0.6 : 0;
        h = puff * 0.8 + dimple;
        tone = 0.86 + puff * 0.22 + (noise.fbm(u * 20, v * 20, 2) - 0.5) * 0.06;
        rough = 0.55 - puff * 0.12;
      } else if (style === "fluted") {
        // Vertical channels (reeded panel).
        const flutes = 26;
        const f = Math.sin(u * flutes * TAU);
        h = f * 0.7;
        tone = 0.9 + f * 0.16;
        rough = 0.5 - Math.abs(f) * 0.1;
      } else if (style === "woven") {
        // Basket weave: over/under bands on a checker of cells.
        const cells = 14;
        const cx = Math.floor(u * cells);
        const cy = Math.floor(v * cells);
        const horiz = (cx + cy) % 2 === 0;
        const local = horiz ? (v * cells) % 1 : (u * cells) % 1;
        const band = Math.sin(local * Math.PI);
        h = band * 0.7;
        tone = 0.82 + band * 0.26;
        rough = 0.6 - band * 0.12;
      } else if (style === "travertine") {
        // Honed stone: horizontal striae + soft mottle + occasional pores.
        const stria = noise.fbm(u * 3, v * 26, 3);
        const mottle = noise.fbm(u * 4, v * 4, 4);
        const pore = noise.fbm(u * 40, v * 40, 2) > 0.72 ? -0.5 : 0;
        h = stria * 0.3 + mottle * 0.25 + pore;
        tone = 0.9 + (mottle - 0.5) * 0.22 + (stria - 0.5) * 0.1;
        rough = 0.62 + (mottle - 0.5) * 0.12;
      } else {
        // Smooth plaster / fine linen.
        const fine = noise.fbm(u * 30, v * 30, 3);
        h = fine * 0.2;
        tone = 0.94 + (fine - 0.5) * 0.1;
        rough = 0.7 + (fine - 0.5) * 0.08;
      }

      const i = (y * size + x) * 4;
      colorImg.data[i] = Math.max(0, Math.min(255, br * tone));
      colorImg.data[i + 1] = Math.max(0, Math.min(255, bg * tone));
      colorImg.data[i + 2] = Math.max(0, Math.min(255, bb * tone));
      colorImg.data[i + 3] = 255;
      const rv = Math.max(0, Math.min(1, rough)) * 255;
      roughImg.data[i] = rv;
      roughImg.data[i + 1] = rv;
      roughImg.data[i + 2] = rv;
      roughImg.data[i + 3] = 255;
      height[y * size + x] = h;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  const strength = style === "quilted" ? 2.4 : style === "fluted" || style === "woven" ? 2.0 : 1.0;
  const normalCanvas = normalFromHeight(height, size, strength);
  const repeat = style === "travertine" || style === "smooth" ? 2 : 3;
  return {
    map: toTexture(colorCanvas, true, repeat),
    roughnessMap: toTexture(roughCanvas, false, repeat),
    normalMap: toTexture(normalCanvas, false, repeat),
  };
}

// ───────────────────────────── wood floors (herringbone / plank) ─────────────────────────────

export function generateWoodFloorMaps(
  rng: Rng,
  woodColor: string,
  herringbone: boolean,
  size = 512,
): GeneratedMaps {
  const grain = new Noise2D(rng.child("wood-grain"));
  const [colorCanvas, colorCtx] = makeCanvas(size);
  const [roughCanvas, roughCtx] = makeCanvas(size);
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const height = new Float32Array(size * size);
  const [br, bg, bb] = hexToRgb(woodColor);

  const plankW = herringbone ? size / 8 : size / 6;
  const plankL = herringbone ? size / 2.6 : size;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let px = x;
      let py = y;
      let dir = 0;
      if (herringbone) {
        // Two interleaved 45° plank fields form the chevron.
        const a = (x + y) % (plankL * 2);
        const b = (x - y + size * 4) % (plankL * 2);
        dir = a < plankL ? 0 : 1;
        px = dir === 0 ? x + y : x - y;
        py = dir === 0 ? x - y : x + y;
      }
      const plankIndex = Math.floor(px / plankW);
      const along = herringbone ? py : y;
      const plankTone = (Math.sin(plankIndex * 12.9898) * 43758.5453) % 1; // per-plank hue jitter
      const g1 = grain.fbm((plankIndex * 3.1) % 100, (along / size) * 8, 3); // long grain
      const g2 = grain.fbm(px * 0.2, along * 0.02, 2);
      const seam = px % plankW < 1.5 || (herringbone && (py % plankL < 1.5)) ? -0.7 : 0;
      const tone = 0.82 + g1 * 0.22 + plankTone * 0.12 + (g2 - 0.5) * 0.08;
      const i = (y * size + x) * 4;
      colorImg.data[i] = Math.max(0, Math.min(255, br * tone));
      colorImg.data[i + 1] = Math.max(0, Math.min(255, bg * tone));
      colorImg.data[i + 2] = Math.max(0, Math.min(255, bb * tone));
      colorImg.data[i + 3] = 255;
      const rv = (0.34 + (g1 - 0.5) * 0.14) * 255; // satin-lacquered wood
      roughImg.data[i] = rv;
      roughImg.data[i + 1] = rv;
      roughImg.data[i + 2] = rv;
      roughImg.data[i + 3] = 255;
      height[y * size + x] = g1 * 0.2 + seam;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  const normalCanvas = normalFromHeight(height, size, 1.2);
  const repeat = herringbone ? 3 : 4;
  return {
    map: toTexture(colorCanvas, true, repeat),
    roughnessMap: toTexture(roughCanvas, false, repeat),
    normalMap: toTexture(normalCanvas, false, repeat),
  };
}

// ───────────────────────────── gold woven ceiling ─────────────────────────────

/** Bright woven-metal ceiling panel (Beijing/HK) — used with emissive tint. */
export function generateGoldWeaveMaps(rng: Rng, size = 512): GeneratedMaps {
  const noise = new Noise2D(rng.child("goldweave"));
  const [colorCanvas, colorCtx] = makeCanvas(size);
  const [roughCanvas, roughCtx] = makeCanvas(size);
  const colorImg = colorCtx.createImageData(size, size);
  const roughImg = roughCtx.createImageData(size, size);
  const height = new Float32Array(size * size);

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      // Fine diagonal weave of gold reeds.
      const w1 = Math.sin((x + y) * 0.6);
      const w2 = Math.sin((x - y) * 0.6);
      const weave = Math.max(w1, w2);
      const spark = noise.fbm(x * 0.4, y * 0.4, 2);
      const i = (y * size + x) * 4;
      const t = 0.7 + weave * 0.3 + (spark - 0.5) * 0.2;
      colorImg.data[i] = Math.max(0, Math.min(255, 220 * t));
      colorImg.data[i + 1] = Math.max(0, Math.min(255, 176 * t));
      colorImg.data[i + 2] = Math.max(0, Math.min(255, 104 * t));
      colorImg.data[i + 3] = 255;
      const rv = (0.34 + (weave - 0.5) * 0.2) * 255;
      roughImg.data[i] = rv;
      roughImg.data[i + 1] = rv;
      roughImg.data[i + 2] = rv;
      roughImg.data[i + 3] = 255;
      height[y * size + x] = weave * 0.4;
    }
  }
  colorCtx.putImageData(colorImg, 0, 0);
  roughCtx.putImageData(roughImg, 0, 0);
  const normalCanvas = normalFromHeight(height, size, 1.4);
  return {
    map: toTexture(colorCanvas, true, 6),
    roughnessMap: toTexture(roughCanvas, false, 6),
    normalMap: toTexture(normalCanvas, false, 6),
  };
}

// ───────────────────────────── feature-wall murals ─────────────────────────────

export type MuralMotifName =
  | "panther"
  | "cherry-blossom"
  | "chinoiserie"
  | "bamboo"
  | "marquetry-sunburst"
  | "kintsugi";

function artTexture(canvas: HTMLCanvasElement): THREE.CanvasTexture {
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

/** Full-height feature-wall artwork, per maison motif. Color map only. */
export function generateMuralTexture(
  rng: Rng,
  motif: MuralMotifName,
  palette: [string, string, string, string],
  w = 768,
  h = 1024,
): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  const [ground, primary, secondary, accent] = palette;

  ctx.fillStyle = ground;
  ctx.fillRect(0, 0, w, h);

  const stroke = (fn: () => void, color: string, width: number, alpha = 1) => {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    fn();
    ctx.restore();
  };

  if (motif === "panther") {
    // Abstract mountain + reclining panther in soft color fields.
    const bands = [secondary, accent, primary];
    for (let i = 0; i < 3; i++) {
      ctx.fillStyle = bands[i];
      ctx.globalAlpha = 0.9;
      ctx.beginPath();
      const baseY = h * (0.35 + i * 0.14);
      ctx.moveTo(0, baseY + 80);
      for (let x = 0; x <= w; x += 40) {
        ctx.lineTo(x, baseY + Math.sin(x * 0.008 + i) * 60 + rng.range(-20, 20));
      }
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.closePath();
      ctx.fill();
    }
    // Panther silhouette — a crouched organic blob with a tail sweep.
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = primary;
    ctx.beginPath();
    ctx.ellipse(w * 0.52, h * 0.62, w * 0.26, h * 0.14, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(w * 0.3, h * 0.55, w * 0.09, h * 0.08, 0.2, 0, Math.PI * 2); // head
    ctx.fill();
    stroke(() => {
      ctx.beginPath();
      ctx.moveTo(w * 0.75, h * 0.66);
      ctx.quadraticCurveTo(w * 0.95, h * 0.5, w * 0.86, h * 0.34);
      ctx.stroke();
    }, primary, 26); // tail
    ctx.globalAlpha = 1;
  } else if (motif === "cherry-blossom") {
    // Dark plum branch with pink blossoms across a pale silk ground.
    const drawBranch = (x0: number, y0: number, ang: number, len: number, depth: number) => {
      if (depth === 0 || len < 20) return;
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len;
      stroke(() => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 + rng.range(-30, 30), (y0 + y1) / 2, x1, y1);
        ctx.stroke();
      }, secondary, Math.max(2, depth * 2.2));
      if (rng.chance(0.6)) {
        ctx.fillStyle = primary;
        for (let k = 0; k < 3; k++) {
          ctx.globalAlpha = rng.range(0.6, 1);
          ctx.beginPath();
          ctx.arc(x1 + rng.range(-30, 30), y1 + rng.range(-30, 30), rng.range(5, 13), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      drawBranch(x1, y1, ang + rng.range(-0.6, 0.2), len * 0.75, depth - 1);
      if (rng.chance(0.7)) drawBranch(x1, y1, ang + rng.range(-0.2, 0.7), len * 0.62, depth - 1);
    };
    drawBranch(w * 0.15, h * 1.02, -Math.PI / 2.3, h * 0.28, 6);
    drawBranch(w * 0.8, h * 1.02, -Math.PI / 1.8, h * 0.26, 6);
  } else if (motif === "chinoiserie") {
    // Hand-painted silk: gold/white flowering stems + a perched bird.
    const stemColor = accent;
    const drawStem = (x0: number, y0: number, ang: number, len: number, depth: number) => {
      if (depth === 0) return;
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len;
      stroke(() => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.quadraticCurveTo((x0 + x1) / 2 + rng.range(-40, 40), (y0 + y1) / 2, x1, y1);
        ctx.stroke();
      }, stemColor, Math.max(1.5, depth * 1.8), 0.9);
      // leaves
      ctx.fillStyle = secondary;
      ctx.globalAlpha = 0.8;
      ctx.beginPath();
      ctx.ellipse(x1, y1, 16, 7, ang + 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      if (rng.chance(0.5)) {
        ctx.fillStyle = primary;
        for (let k = 0; k < 5; k++) {
          const a = (k / 5) * Math.PI * 2;
          ctx.beginPath();
          ctx.ellipse(x1 + Math.cos(a) * 9, y1 + Math.sin(a) * 9, 7, 4, a, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      drawStem(x1, y1, ang + rng.range(-0.5, 0.5), len * 0.8, depth - 1);
      if (rng.chance(0.6)) drawStem(x1, y1, ang + rng.range(-0.8, 0.8), len * 0.6, depth - 1);
    };
    for (let s = 0; s < 3; s++) drawStem(w * (0.2 + s * 0.3), h * 1.02, -Math.PI / 2 + rng.range(-0.3, 0.3), h * 0.22, 6);
  } else if (motif === "bamboo") {
    // Pale bamboo stalks with node rings + drifting leaves.
    for (let s = 0; s < 7; s++) {
      const x = w * (0.08 + s * 0.13) + rng.range(-20, 20);
      stroke(() => {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + rng.range(-20, 20), h);
        ctx.stroke();
      }, primary, rng.range(10, 20), 0.85);
      for (let ny = 0.1; ny < 1; ny += 0.16) {
        stroke(() => {
          ctx.beginPath();
          ctx.moveTo(x - 12, h * ny);
          ctx.lineTo(x + 12, h * ny);
          ctx.stroke();
        }, secondary, 3, 0.7);
      }
    }
    ctx.fillStyle = secondary;
    for (let l = 0; l < 40; l++) {
      ctx.globalAlpha = rng.range(0.3, 0.8);
      const lx = rng.range(0, w);
      const ly = rng.range(0, h);
      ctx.beginPath();
      ctx.ellipse(lx, ly, rng.range(20, 42), 5, rng.range(0, Math.PI), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (motif === "marquetry-sunburst") {
    // Radiating wood veneer wedges + gold rays (also used on ceiling discs).
    const cx = w / 2;
    const cy = h * 0.5;
    const rays = 44;
    for (let i = 0; i < rays; i++) {
      const a0 = (i / rays) * Math.PI * 2;
      const a1 = ((i + 1) / rays) * Math.PI * 2;
      const t = (Math.sin(i * 2.3) * 0.5 + 0.5) * 0.18;
      ctx.fillStyle = i % 6 === 0 ? accent : i % 2 === 0 ? primary : secondary;
      ctx.globalAlpha = 0.92 - t;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a0) * h, cy + Math.sin(a0) * h);
      ctx.lineTo(cx + Math.cos(a1) * h, cy + Math.sin(a1) * h);
      ctx.closePath();
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else {
    // kintsugi: gold branching veins across a lacquered ground.
    const drawVein = (x0: number, y0: number, ang: number, len: number, depth: number) => {
      if (depth === 0 || len < 24) return;
      const x1 = x0 + Math.cos(ang) * len;
      const y1 = y0 + Math.sin(ang) * len;
      stroke(() => {
        ctx.beginPath();
        ctx.moveTo(x0, y0);
        ctx.lineTo(x1, y1);
        ctx.stroke();
      }, accent, Math.max(1.5, depth * 1.4), 0.95);
      drawVein(x1, y1, ang + rng.range(-0.7, 0.7), len * 0.78, depth - 1);
      if (rng.chance(0.7)) drawVein(x1, y1, ang + rng.range(-1, 1), len * 0.66, depth - 1);
    };
    for (let s = 0; s < 4; s++) drawVein(rng.range(0, w), rng.range(0, h), rng.range(0, Math.PI * 2), h * 0.2, 6);
  }

  return artTexture(canvas);
}
