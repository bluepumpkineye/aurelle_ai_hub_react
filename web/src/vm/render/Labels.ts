/**
 * Screen-space billboard labels — canvas-rasterized text sprites with a
 * legibility background, depth-test disabled so overlay labels never
 * z-fight (STATUS gotcha: analytics overlay labels).
 */

import * as THREE from "three";

export interface LabelOptions {
  size?: number;
  color?: string;
  background?: string;
  borderColor?: string;
  bold?: boolean;
  serif?: boolean;
}

export function makeTextSprite(text: string, opts: LabelOptions = {}): THREE.Sprite {
  const {
    size = 30,
    color = "#f5efe2",
    background = "rgba(20,18,14,0.82)",
    borderColor = "rgba(184,150,90,0.85)",
    bold = false,
    serif = false,
  } = opts;

  const font = `${bold ? "600" : "400"} ${size}px ${serif ? "Georgia, serif" : "Inter, system-ui, sans-serif"}`;
  const measure = document.createElement("canvas").getContext("2d");
  if (!measure) throw new Error("2D context unavailable");
  measure.font = font;
  const metrics = measure.measureText(text);
  const padX = size * 0.7;
  const padY = size * 0.45;
  const w = Math.ceil(metrics.width + padX * 2);
  const h = Math.ceil(size * 1.3 + padY * 2);

  const canvas = document.createElement("canvas");
  canvas.width = w * 2;
  canvas.height = h * 2;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  ctx.scale(2, 2);

  const r = 8;
  ctx.beginPath();
  ctx.roundRect(1, 1, w - 2, h - 2, r);
  ctx.fillStyle = background;
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, w / 2, h / 2 + 1);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  const mat = new THREE.SpriteMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    depthWrite: false,
    // Constant screen size: readable from the entrance camera (Pillar D)
    // without ballooning when the director walks up to a case.
    sizeAttenuation: false,
  });
  const sprite = new THREE.Sprite(mat);
  const screenH = 0.055;
  sprite.scale.set((screenH * w) / h, screenH, 1);
  sprite.renderOrder = 40;
  return sprite;
}

export function disposeSprite(sprite: THREE.Sprite): void {
  sprite.material.map?.dispose();
  sprite.material.dispose();
}
