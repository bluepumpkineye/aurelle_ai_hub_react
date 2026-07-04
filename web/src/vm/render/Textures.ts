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
