/**
 * Parametric product mesh generators — all 9 Aurelle categories, display-
 * quality silhouettes with PBR response (PRD §3.2). No external assets:
 * every stone facet, chain link, dial and stopper is generated. Geometry is
 * merged per material so a product costs 2–4 draw calls.
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";
import { Rng } from "../core/Seed";
import type { SKU } from "../data/types";
import { MaterialKit } from "../render/Materials";

// ───────────────────────────── material palette ─────────────────────────────

type MetalName = "yellow" | "white" | "rose";
type StoneName = "diamond" | "ruby" | "sapphire" | "emerald";

const METAL_COLORS: Record<MetalName, string> = {
  yellow: "#dcbc72",
  white: "#dcdcda",
  rose: "#dda88a",
};

const STONE_COLORS: Record<StoneName, string> = {
  diamond: "#f2f5ff",
  ruby: "#8e1430",
  sapphire: "#172a66",
  emerald: "#0e5440",
};

const LEATHER_COLORS = ["#7a4a28", "#221f1e", "#6d1622", "#2a3040", "#c8b9a2"];

// Presentation scale per category — products are modelled at near-life size
// (a ring band ~1.3 cm), which reads as a dot from browsing distance. These
// multipliers enlarge each piece so it's clearly legible on the fixture while
// staying inside the glass. The tiniest, hardest-to-see items (rings, earrings,
// watches) get the biggest boost; the necklace's tall velvet bust is kept
// gentler so it never clips the low-profile case (~27 cm interior).
const PRODUCT_SCALE: Record<SKU["category"], number> = {
  rings: 2.6,
  earrings: 2.4,
  bracelets: 2.3,
  brooches: 2.3,
  necklaces: 1.6,
  "watches-dress": 2.4,
  "watches-sport": 2.4,
  "leather-goods": 2.1,
  fragrance: 2.0,
};

class Bucket {
  private parts = new Map<THREE.Material, THREE.BufferGeometry[]>();

  add(geo: THREE.BufferGeometry, material: THREE.Material, matrix?: THREE.Matrix4): void {
    if (matrix) geo.applyMatrix4(matrix);
    const list = this.parts.get(material) ?? [];
    list.push(geo);
    this.parts.set(material, list);
  }

  build(name: string): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [material, geos] of this.parts) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = true;
      group.add(mesh);
    }
    return group;
  }
}

function mat4(x: number, y: number, z: number, rx = 0, ry = 0, rz = 0, s = 1): THREE.Matrix4 {
  const m = new THREE.Matrix4();
  m.compose(
    new THREE.Vector3(x, y, z),
    new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz)),
    new THREE.Vector3(s, s, s),
  );
  return m;
}

// ───────────────────────────── dial texture ─────────────────────────────

function makeDialTexture(rng: Rng, sport: boolean): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  const c = size / 2;
  const dark = rng.chance(0.5);
  ctx.fillStyle = dark ? "#141a2c" : "#efe9dc";
  ctx.beginPath();
  ctx.arc(c, c, c, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dark ? "#cfae74" : "#4a4436";
  ctx.lineWidth = 2;
  // Indices
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    ctx.beginPath();
    ctx.moveTo(c + Math.cos(a) * (c - 14), c + Math.sin(a) * (c - 14));
    ctx.lineTo(c + Math.cos(a) * (c - 6), c + Math.sin(a) * (c - 6));
    ctx.stroke();
  }
  if (sport) {
    // Subdials + tachymeter ring
    ctx.lineWidth = 1;
    for (const [sx, sy] of [
      [c - 22, c],
      [c + 22, c],
      [c, c + 24],
    ]) {
      ctx.beginPath();
      ctx.arc(sx, sy, 11, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.beginPath();
    ctx.arc(c, c, c - 3, 0, Math.PI * 2);
    ctx.stroke();
  }
  // Hands
  ctx.lineWidth = 3;
  const hourA = rng.range(0, Math.PI * 2);
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.lineTo(c + Math.cos(hourA) * (c - 40), c + Math.sin(hourA) * (c - 40));
  ctx.stroke();
  ctx.lineWidth = 2;
  const minA = rng.range(0, Math.PI * 2);
  ctx.beginPath();
  ctx.moveTo(c, c);
  ctx.lineTo(c + Math.cos(minA) * (c - 16), c + Math.sin(minA) * (c - 16));
  ctx.stroke();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

// ───────────────────────────── factory ─────────────────────────────

export class ProductFactory {
  private metals = new Map<MetalName, THREE.MeshStandardMaterial>();
  private stones = new Map<StoneName, THREE.MeshPhysicalMaterial>();
  private leathers = new Map<string, THREE.MeshPhysicalMaterial>();
  private dials: THREE.MeshStandardMaterial[] = [];
  private bottleGlass: THREE.MeshPhysicalMaterial;
  private perfumes: THREE.MeshPhysicalMaterial[] = [];
  private disposables: Array<{ dispose(): void }> = [];

  constructor(private readonly kit: MaterialKit) {
    const tx = kit.transmissionEnabled;
    this.bottleGlass = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#f6fbff"),
      roughness: 0.03,
      metalness: 0,
      transmission: tx ? 0.92 : 0,
      ior: 1.5,
      thickness: 0.01,
      transparent: true,
      opacity: tx ? 1 : 0.35,
      envMapIntensity: 1.4,
    });
    this.disposables.push(this.bottleGlass);
    for (const hex of ["#b8965a", "#8b1a2b", "#c9903a"]) {
      const p = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(hex),
        roughness: 0.1,
        metalness: 0,
        transmission: tx ? 0.55 : 0,
        ior: 1.35,
        thickness: 0.02,
        transparent: true,
        opacity: tx ? 1 : 0.85,
      });
      this.perfumes.push(p);
      this.disposables.push(p);
    }
  }

  private metal(name: MetalName): THREE.MeshStandardMaterial {
    let m = this.metals.get(name);
    if (!m) {
      m = new THREE.MeshStandardMaterial({
        color: new THREE.Color(METAL_COLORS[name]),
        metalness: 1,
        roughness: 0.12,
        envMapIntensity: 1.5,
      });
      this.metals.set(name, m);
      this.disposables.push(m);
    }
    return m;
  }

  private stone(name: StoneName): THREE.MeshPhysicalMaterial {
    let m = this.stones.get(name);
    if (!m) {
      const isDiamond = name === "diamond";
      const tx = this.kit.transmissionEnabled;
      m = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(STONE_COLORS[name]),
        metalness: 0,
        roughness: 0.02,
        clearcoat: 1,
        clearcoatRoughness: 0.02,
        envMapIntensity: tx ? 2.2 : 2.8,
        flatShading: true,
        transmission: tx ? (isDiamond ? 0.5 : 0.25) : 0,
        ior: isDiamond ? 2.4 : 1.7,
        thickness: 0.004,
        transparent: tx,
      });
      this.stones.set(name, m);
      this.disposables.push(m);
    }
    return m;
  }

  private leather(hex: string): THREE.MeshPhysicalMaterial {
    let m = this.leathers.get(hex);
    if (!m) {
      m = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(hex),
        roughness: 0.55,
        metalness: 0,
        clearcoat: 0.25,
        clearcoatRoughness: 0.5,
        envMapIntensity: 0.7,
      });
      this.leathers.set(hex, m);
      this.disposables.push(m);
    }
    return m;
  }

  private dial(rng: Rng, sport: boolean): THREE.MeshStandardMaterial {
    if (this.dials.length < 6) {
      const tex = makeDialTexture(rng, sport);
      const m = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.25, metalness: 0.1 });
      this.dials.push(m);
      this.disposables.push(tex, m);
      return m;
    }
    return this.dials[rng.int(0, this.dials.length - 1)];
  }

  private pickMetal(rng: Rng): MetalName {
    return (["yellow", "white", "rose"] as MetalName[])[rng.int(0, 2)];
  }

  private pickStone(rng: Rng): StoneName {
    const r = rng.next();
    if (r < 0.5) return "diamond";
    if (r < 0.68) return "ruby";
    if (r < 0.86) return "sapphire";
    return "emerald";
  }

  /** Build a product mesh for a SKU. Origin at base centre, +y up. */
  build(sku: SKU): THREE.Group {
    const group = this.buildMesh(sku);
    // Enlarge for on-fixture legibility (grows upward from the base anchor).
    group.scale.setScalar(PRODUCT_SCALE[sku.category]);
    return group;
  }

  private buildMesh(sku: SKU): THREE.Group {
    const rng = new Rng(sku.meshSeed);
    switch (sku.category) {
      case "rings":
        return this.ring(rng, sku.id);
      case "bracelets":
        return this.bracelet(rng, sku.id);
      case "necklaces":
        return this.necklace(rng, sku.id);
      case "watches-dress":
        return this.watch(rng, sku.id, false);
      case "watches-sport":
        return this.watch(rng, sku.id, true);
      case "earrings":
        return this.earrings(rng, sku.id);
      case "brooches":
        return this.brooch(rng, sku.id);
      case "leather-goods":
        return this.leatherGoods(rng, sku.id);
      case "fragrance":
        return this.fragrance(rng, sku.id);
    }
  }

  // ── generators ──

  private ring(rng: Rng, name: string): THREE.Group {
    const b = new Bucket();
    const metal = this.metal(this.pickMetal(rng));
    const stone = this.stone(this.pickStone(rng));
    const R = rng.range(0.011, 0.014);
    const tube = rng.range(0.0018, 0.0032);
    // Band standing upright (in XY plane) as presented on a ring stand.
    b.add(new THREE.TorusGeometry(R, tube, 12, 36), metal, mat4(0, R + tube, 0));
    // Prong head + faceted stone
    const stoneR = rng.range(0.004, 0.0062);
    b.add(new THREE.CylinderGeometry(stoneR * 0.55, stoneR * 0.35, 0.003, 6), metal, mat4(0, R * 2 + tube + 0.001, 0));
    const cut = rng.chance(0.4) ? new THREE.OctahedronGeometry(stoneR, 0) : new THREE.IcosahedronGeometry(stoneR, 0);
    b.add(cut, stone, mat4(0, R * 2 + tube + stoneR * 0.85, 0, rng.range(0, 1), rng.range(0, 1), 0));
    if (rng.chance(0.35)) {
      // Pavé accents along the shoulders
      for (const side of [-1, 1]) {
        b.add(
          new THREE.IcosahedronGeometry(stoneR * 0.3, 0),
          this.stone("diamond"),
          mat4(side * R * 0.55, R * 1.8 + tube, 0),
        );
      }
    }
    return b.build(name);
  }

  private bracelet(rng: Rng, name: string): THREE.Group {
    const b = new Bucket();
    const metal = this.metal(this.pickMetal(rng));
    const R = rng.range(0.028, 0.034);
    const tilt = rng.range(-0.25, 0.25);
    if (rng.chance(0.5)) {
      // Bangle: solid torus lying nearly flat
      b.add(new THREE.TorusGeometry(R, rng.range(0.003, 0.005), 12, 48), metal, mat4(0, 0.006, 0, Math.PI / 2 + tilt));
    } else {
      // Link bracelet: ring of small capsules
      const links = 14;
      for (let i = 0; i < links; i++) {
        const a = (i / links) * Math.PI * 2;
        b.add(
          new THREE.CapsuleGeometry(0.0022, 0.008, 3, 8),
          metal,
          mat4(Math.cos(a) * R, 0.005, Math.sin(a) * R, Math.PI / 2 + tilt * 0.4, 0, -a),
        );
      }
    }
    if (rng.chance(0.6)) {
      const stone = this.stone(this.pickStone(rng));
      b.add(new THREE.OctahedronGeometry(0.005, 0), stone, mat4(R, 0.012, 0));
    }
    return b.build(name);
  }

  private necklace(rng: Rng, name: string): THREE.Group {
    const b = new Bucket();
    const metal = this.metal(this.pickMetal(rng));
    const stone = this.stone(this.pickStone(rng));
    // Velvet display bust the necklace drapes over — presentation form.
    const bustH = 0.14;
    const bust = new THREE.CylinderGeometry(0.028, 0.052, bustH, 20);
    const velvetBust = this.kit.velvet("#efe6d4", rng.child("bust"), 3, 0.05);
    b.add(bust, velvetBust, mat4(0, bustH / 2, 0));
    b.add(new THREE.SphereGeometry(0.03, 20, 14, 0, Math.PI * 2, 0, Math.PI / 2), velvetBust, mat4(0, bustH, 0));
    // Chain: beads along a V-drape on the bust front
    const beads = 22;
    for (let i = 0; i <= beads; i++) {
      const t = i / beads;
      const a = (t - 0.5) * Math.PI * 1.15;
      const x = Math.sin(a) * 0.036;
      const drop = Math.cos(a);
      const y = bustH - 0.012 - (1 - Math.abs(t - 0.5) * 2) * 0.052;
      const z = 0.032 + drop * 0.008;
      b.add(new THREE.SphereGeometry(0.0016, 6, 5), metal, mat4(x, y + 0.01, z));
    }
    // Pendant
    b.add(new THREE.OctahedronGeometry(0.007, 0), stone, mat4(0, bustH - 0.062, 0.042, rng.range(0, 1), 0, 0));
    b.add(new THREE.TorusGeometry(0.0025, 0.0008, 6, 12), metal, mat4(0, bustH - 0.052, 0.042));
    return b.build(name);
  }

  private watch(rng: Rng, name: string, sport: boolean): THREE.Group {
    const b = new Bucket();
    const metal = this.metal(sport ? (rng.chance(0.7) ? "white" : "yellow") : this.pickMetal(rng));
    const caseR = sport ? rng.range(0.02, 0.023) : rng.range(0.016, 0.019);
    // Velvet presentation cuff
    const cuff = this.kit.velvet(sport ? "#1c2740" : "#efe6d4", rng.child("cuff"), 4, 0.06);
    b.add(new THREE.CylinderGeometry(0.026, 0.026, 0.05, 18), cuff, mat4(0, 0.026, 0, 0, 0, Math.PI / 2));
    // Case on top of the cuff, dial facing up/out
    const caseY = 0.052 + 0.004;
    b.add(new THREE.CylinderGeometry(caseR, caseR * 0.94, 0.009, 28), metal, mat4(0, caseY, 0));
    // Beveled outer watch bezel
    b.add(new THREE.CylinderGeometry(caseR * 0.92, caseR, 0.003, 28), metal, mat4(0, caseY + 0.003, 0));
    // Dial face with canvas details
    b.add(new THREE.CylinderGeometry(caseR * 0.86, caseR * 0.86, 0.0092, 28), this.dial(rng, sport), mat4(0, caseY + 0.0004, 0));
    // Realistic transparent glass crystal cover
    b.add(new THREE.CylinderGeometry(caseR * 0.88, caseR * 0.88, 0.0016, 28), this.bottleGlass, mat4(0, caseY + 0.005, 0));
    // Crown + lugs
    b.add(new THREE.CylinderGeometry(0.0022, 0.0022, 0.003, 10), metal, mat4(caseR + 0.0015, caseY, 0, 0, 0, Math.PI / 2));
    for (const sz of [-1, 1]) {
      for (const sx of [-1, 1]) {
        b.add(new THREE.BoxGeometry(0.004, 0.003, 0.006), metal, mat4(sx * caseR * 0.72, caseY, sz * (caseR + 0.002)));
      }
    }
    // Strap wrapping the cuff: leather for dress, link segments for sport
    if (sport) {
      const links = 10;
      for (let i = 1; i <= links; i++) {
        const a = (i / (links + 1)) * Math.PI;
        for (const side of [-1, 1]) {
          b.add(
            new THREE.BoxGeometry(0.014, 0.0035, 0.008),
            metal,
            mat4(0, 0.026 + Math.cos(a) * 0.028, side * Math.sin(a) * 0.028, side * a, 0, 0),
          );
        }
      }
    } else {
      const strap = this.leather(LEATHER_COLORS[rng.int(0, LEATHER_COLORS.length - 1)]);
      b.add(new THREE.TorusGeometry(0.0285, 0.0035, 8, 28), strap, mat4(0, 0.026, 0, 0, 0, 0));
    }
    return b.build(name);
  }

  private earrings(rng: Rng, name: string): THREE.Group {
    const b = new Bucket();
    const metal = this.metal(this.pickMetal(rng));
    const stone = this.stone(this.pickStone(rng));
    // Presentation card on a small easel
    const card = this.kit.velvet("#efe6d4", rng.child("card"), 3, 0.04);
    b.add(new THREE.BoxGeometry(0.055, 0.075, 0.004), card, mat4(0, 0.043, 0, -0.22));
    b.add(new THREE.BoxGeometry(0.04, 0.004, 0.03), this.metal("yellow"), mat4(0, 0.002, 0.008));
    for (const side of [-1, 1]) {
      const x = side * 0.014;
      // Stud + drop
      b.add(new THREE.SphereGeometry(0.0028, 10, 8), metal, mat4(x, 0.062, 0.004, -0.22));
      b.add(new THREE.CylinderGeometry(0.0006, 0.0006, 0.012, 6), metal, mat4(x, 0.055, 0.0055, -0.22));
      b.add(new THREE.OctahedronGeometry(0.0045, 0), stone, mat4(x, 0.046, 0.007, rng.range(0, 1), rng.range(0, 1), 0));
    }
    return b.build(name);
  }

  private brooch(rng: Rng, name: string): THREE.Group {
    const b = new Bucket();
    const metal = this.metal(this.pickMetal(rng));
    const stone = this.stone(this.pickStone(rng));
    const card = this.kit.velvet("#efe6d4", rng.child("card"), 3, 0.04);
    b.add(new THREE.BoxGeometry(0.06, 0.08, 0.004), card, mat4(0, 0.045, 0, -0.24));
    b.add(new THREE.BoxGeometry(0.045, 0.004, 0.032), this.metal("yellow"), mat4(0, 0.002, 0.009));
    // Petal burst around a centre stone
    const petals = rng.int(5, 8);
    for (let i = 0; i < petals; i++) {
      const a = (i / petals) * Math.PI * 2;
      b.add(
        new THREE.SphereGeometry(0.006, 8, 6),
        metal,
        mat4(Math.cos(a) * 0.011, 0.05 + Math.sin(a) * 0.011, 0.006, -0.24, 0, a, 1.4),
      );
    }
    b.add(new THREE.OctahedronGeometry(0.0065, 0), stone, mat4(0, 0.05, 0.009, rng.range(0, 1), rng.range(0, 1), 0));
    return b.build(name);
  }

  private leatherGoods(rng: Rng, name: string): THREE.Group {
    const b = new Bucket();
    const leather = this.leather(LEATHER_COLORS[rng.int(0, LEATHER_COLORS.length - 1)]);
    const gold = this.metal("yellow");
    
    if (rng.chance(0.5)) {
      // Structured mini handbag (tapered, chamfered corners, custom strap)
      const w = rng.range(0.11, 0.15);
      const h = rng.range(0.08, 0.11);
      const d = rng.range(0.045, 0.06);

      // Tapered bag body geometry
      const scaleX = w / Math.sqrt(2);
      const scaleZ = d / Math.sqrt(2);
      const geom = new THREE.CylinderGeometry(0.84, 1.0, h, 4);
      geom.rotateY(Math.PI / 4);
      geom.scale(scaleX, 1.0, scaleZ);
      b.add(geom, leather, mat4(0, h / 2, 0));

      // Overlapping top/front flap
      b.add(new THREE.BoxGeometry(w * 0.88, 0.006, d * 0.86), leather, mat4(0, h - 0.003, 0.002));
      b.add(new THREE.BoxGeometry(w * 0.88, h * 0.45, 0.005), leather, mat4(0, h * 0.75, d * 0.46));

      // Curved leather handle with gold end connectors
      const handleR = w * 0.28;
      b.add(new THREE.TorusGeometry(handleR, 0.0045, 8, 24, Math.PI), leather, mat4(0, h, 0));
      b.add(new THREE.BoxGeometry(0.007, 0.007, 0.007), gold, mat4(-handleR, h - 0.001, 0));
      b.add(new THREE.BoxGeometry(0.007, 0.007, 0.007), gold, mat4(handleR, h - 0.001, 0));

      // Classy gold double-ring lock buckle
      b.add(new THREE.TorusGeometry(0.007, 0.0016, 6, 16), gold, mat4(-0.005, h * 0.52, d / 2 + 0.003));
      b.add(new THREE.TorusGeometry(0.007, 0.0016, 6, 16), gold, mat4(0.005, h * 0.52, d / 2 + 0.003));
    } else {
      // Folded designer wallet / envelope clutch
      const w = rng.range(0.095, 0.115);
      const h = 0.024;
      const d = rng.range(0.065, 0.080);
      
      const ry = rng.range(-0.15, 0.15);
      const rot = { ry };

      // Base fold
      b.add(new THREE.BoxGeometry(w, 0.008, d), leather, mat4(0, 0.004, 0, 0, ry, 0));
      // Overlapping fold flap
      b.add(new THREE.BoxGeometry(w * 0.98, 0.006, d * 0.92), leather, mat4(0, 0.011, 0.002, 0.04, ry, 0));
      b.add(new THREE.BoxGeometry(w * 0.98, 0.006, d * 0.45), leather, mat4(0, 0.008, d * 0.22, -0.15, ry, 0));

      // Gold logo medallion clasp
      const claspM = mat4(w * 0.28, 0.015, d * 0.22, 0, ry, 0);
      b.add(new THREE.CylinderGeometry(0.0045, 0.0045, 0.002, 12), gold, claspM);
    }
    return b.build(name);
  }

  private fragrance(rng: Rng, name: string): THREE.Group {
    const b = new Bucket();
    const gold = this.metal("yellow");
    const juice = this.perfumes[rng.int(0, this.perfumes.length - 1)];
    const w = rng.range(0.05, 0.065);
    const h = rng.range(0.075, 0.1);
    const d = w * rng.range(0.45, 0.6);
    // Glass shell + juice inside
    b.add(new THREE.BoxGeometry(w, h, d), this.bottleGlass, mat4(0, h / 2, 0));
    b.add(new THREE.BoxGeometry(w * 0.86, h * 0.8, d * 0.8), juice, mat4(0, (h * 0.8) / 2 + 0.004, 0));
    // Collar + stopper
    b.add(new THREE.CylinderGeometry(0.008, 0.009, 0.01, 14), gold, mat4(0, h + 0.005, 0));
    if (rng.chance(0.5)) {
      b.add(new THREE.SphereGeometry(0.011, 14, 10), this.bottleGlass, mat4(0, h + 0.022, 0));
    } else {
      b.add(new THREE.BoxGeometry(0.018, 0.02, 0.01), gold, mat4(0, h + 0.02, 0));
    }
    return b.build(name);
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.metals.clear();
    this.stones.clear();
    this.leathers.clear();
    this.dials = [];
  }
}
