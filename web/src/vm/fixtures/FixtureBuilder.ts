/**
 * Parametric fixture constructors — every fixture is built from its typed
 * template config + instance dims (PRD §3.2, no hardcoded geometry, no .glb).
 * The dressing system auto-populates every fixture class: velvet tray inserts,
 * product stands, price-card holders, mirror backs, LED baffles, service
 * trays, collateral holders (Pillar C — nothing is bare). Per-instance
 * variation (velvet jitter, polished/brushed zoning, tray arrangement) is
 * driven by the instance seed (PRD §4 per-instance law).
 *
 * All static parts of a fixture are merged into one mesh per material
 * (draw-call budget, PRD §6) — a dressed showcase costs ~6 draws, not ~40.
 */

import * as THREE from "three";
import { Rng } from "../core/Seed";
import type { FixtureInstance, FixtureTemplate, ZoneConfig } from "../data/types";
import { GeometryBucket, type Euler3 } from "../render/GeometryBucket";
import { MaterialKit } from "../render/Materials";

export interface BuiltFixture {
  group: THREE.Group;
  /** Local-space product anchor per "row,col,layer". */
  slotAnchors: Map<string, THREE.Vector3>;
  /** Approximate local-space bounds used for selection highlight. */
  size: THREE.Vector3;
}

const GLASS_T = 0.012;

export class FixtureFactory {
  constructor(private readonly kit: MaterialKit) {}

  build(
    instance: FixtureInstance,
    template: FixtureTemplate,
    zone: ZoneConfig | undefined,
    accentUpholstery?: string[],
  ): BuiltFixture {
    const rng = new Rng(instance.variationSeed);
    const group = new THREE.Group();
    group.name = `fixture-${instance.id}`;
    const anchors = new Map<string, THREE.Vector3>();
    const { width: W, depth: D, height: H } = instance.dims;

    const velvetBase = zone?.velvet.baseColor ?? "#e8dcc8";
    const velvet = this.kit.velvet(
      velvetBase,
      rng.child("velvet"),
      zone?.velvet.hueJitterDeg ?? 4,
      zone?.velvet.valueJitter ?? 0.06,
    );
    // Lounge/salon seating is jewel-toned per maison (mustard/coral/olive…);
    // tray velvet stays the brand zone color. Chosen deterministically.
    const seatColor =
      accentUpholstery && accentUpholstery.length
        ? accentUpholstery[rng.int(0, accentUpholstery.length - 1)]
        : velvetBase;
    const seatVelvet = this.kit.velvet(seatColor, rng.child("seat"), 3, 0.05);
    const framePolished = this.kit.metalFor(instance.finish, true);
    const frameBrushed = this.kit.metalFor(instance.finish, false);
    const body = rng.chance(0.5) ? this.kit.lacquerDark : this.kit.lacquerNavy;
    const cardIvory = this.kit.fabricWallPanel("#f2ecdd");

    // One emissive LED material per fixture (shared by baffles/strips/lenses).
    const led = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#2e2a24"),
      roughness: 0.6,
      emissive: new THREE.Color("#ffd9a3"),
      emissiveIntensity: 2.2,
    });

    const bucket = new GeometryBucket();
    const box = (
      w: number,
      h: number,
      d: number,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      rot?: Euler3,
      cast = true,
    ) => bucket.add(new THREE.BoxGeometry(w, h, d), mat, x, y, z, rot, cast);
    const cyl = (
      rTop: number,
      rBot: number,
      h: number,
      mat: THREE.Material,
      x: number,
      y: number,
      z: number,
      seg = 20,
      rot?: Euler3,
    ) => bucket.add(new THREE.CylinderGeometry(rTop, rBot, h, seg), mat, x, y, z, rot);

    /** Glass box (5 panes, open bottom) from y0 to y1, with metal frame. */
    const glassCase = (w: number, d: number, y0: number, y1: number) => {
      const h = y1 - y0;
      const glass = this.kit.glass;
      const mid = (y0 + y1) / 2;
      box(w, h, GLASS_T, glass, 0, mid, -d / 2 + GLASS_T / 2, undefined, false);
      box(w, h, GLASS_T, glass, 0, mid, d / 2 - GLASS_T / 2, undefined, false);
      box(GLASS_T, h, d - GLASS_T * 2, glass, -w / 2 + GLASS_T / 2, mid, 0, undefined, false);
      box(GLASS_T, h, d - GLASS_T * 2, glass, w / 2 - GLASS_T / 2, mid, 0, undefined, false);
      box(w, GLASS_T, d, glass, 0, y1 - GLASS_T / 2, 0, undefined, false);
      const e = 0.018;
      for (const sx of [-1, 1])
        for (const sz of [-1, 1]) box(e, h, e, framePolished, (sx * (w - e)) / 2, mid, (sz * (d - e)) / 2);
      for (const sz of [-1, 1]) {
        box(w, e, e, framePolished, 0, y1 - e / 2, (sz * (d - e)) / 2);
        box(w, e, e, frameBrushed, 0, y0 + e / 2, (sz * (d - e)) / 2);
      }
      for (const sx of [-1, 1]) {
        box(e, e, d, framePolished, (sx * (w - e)) / 2, y1 - e / 2, 0);
        box(e, e, d, frameBrushed, (sx * (w - e)) / 2, y0 + e / 2, 0);
      }
    };

    /** LED baffle: recessed emissive strips under the case top. */
    const ledBaffle = (w: number, d: number, y: number) => {
      box(w * 0.86, 0.014, 0.03, led, 0, y, -d * 0.28, undefined, false);
      box(w * 0.86, 0.014, 0.03, led, 0, y, d * 0.28, undefined, false);
    };

    /** Velvet tray inserts + stands + price cards for a slot grid on a deck. */
    const dressDeck = (
      rows: number,
      cols: number,
      w: number,
      d: number,
      deckY: number,
      layer = 0,
      trayInsets = true,
    ) => {
      const cellW = (w * 0.86) / cols;
      const cellD = (d * 0.8) / rows;
      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x = -((cols - 1) / 2) * cellW + col * cellW;
          const z = -((rows - 1) / 2) * cellD + row * cellD;
          const jitter = { ry: rng.range(-0.05, 0.05) };
          if (trayInsets) {
            box(cellW * 0.86, 0.016, cellD * 0.82, velvet, x, deckY + 0.008, z, jitter);
            box(cellW * 0.4, 0.014, cellD * 0.4, velvet, x, deckY + 0.023, z, jitter);
            const cardX = x + cellW * 0.28;
            const cardZ = z + cellD * 0.3;
            box(0.018, 0.002, 0.012, frameBrushed, cardX, deckY + 0.018, cardZ);
            box(0.02, 0.014, 0.0016, cardIvory, cardX, deckY + 0.028, cardZ + 0.003, { rx: -0.35 });
          }
          anchors.set(`${row},${col},${layer}`, new THREE.Vector3(x, deckY + (trayInsets ? 0.03 : 0.004), z));
        }
      }
    };

    switch (template.kind) {
      // ───────── showcases ─────────
      case "showcase-island": {
        const plinthH = H * 0.56;
        box(W, plinthH, D, body, 0, plinthH / 2, 0);
        box(W + 0.05, 0.045, D + 0.05, frameBrushed, 0, 0.0225, 0);
        const deckY = plinthH + 0.02;
        box(W - 0.06, 0.04, D - 0.06, velvet, 0, deckY, 0);
        glassCase(W, D, plinthH, H);
        ledBaffle(W, D, H - 0.035);
        const grid = template.slotGrid;
        if (grid) dressDeck(grid.rows, grid.cols, W, D, deckY + 0.02);
        break;
      }
      case "showcase-wall": {
        const plinthH = 0.55;
        box(W, plinthH, D, body, 0, plinthH / 2, 0);
        box(W - 0.05, H - plinthH - 0.05, 0.02, this.kit.mirror, 0, plinthH + (H - plinthH) / 2, -D / 2 + 0.03);
        glassCase(W, D, plinthH, H);
        const grid = template.slotGrid;
        if (grid) {
          const innerH = H - plinthH - 0.08;
          const shelfGap = innerH / grid.rows;
          for (let row = 0; row < grid.rows; row++) {
            // row 0 = top shelf (matches the planogram panel reading order)
            const shelfY = H - 0.06 - (row + 1) * shelfGap + 0.02;
            box(W - 0.08, 0.018, D - 0.12, body, 0, shelfY, 0.02);
            box(W - 0.08, 0.012, 0.02, frameBrushed, 0, shelfY + 0.002, D / 2 - 0.08);
            box(W * 0.8, 0.012, 0.024, led, 0, shelfY + shelfGap - 0.05, 0.05, undefined, false);
            const cellW = (W * 0.82) / grid.cols;
            for (let col = 0; col < grid.cols; col++) {
              const x = -((grid.cols - 1) / 2) * cellW + col * cellW;
              box(cellW * 0.8, 0.014, D * 0.5, velvet, x, shelfY + 0.016, 0.03, { ry: rng.range(-0.04, 0.04) });
              anchors.set(`${row},${col},0`, new THREE.Vector3(x, shelfY + 0.026, 0.03));
            }
          }
        }
        break;
      }
      case "showcase-tower": {
        const plinthH = H * 0.42;
        box(W, plinthH, D, body, 0, plinthH / 2, 0);
        box(W + 0.04, 0.04, D + 0.04, frameBrushed, 0, 0.02, 0);
        glassCase(W, D, plinthH, H);
        ledBaffle(W, D, H - 0.03);
        const grid = template.slotGrid;
        if (grid) {
          const innerH = H - plinthH - 0.06;
          const levelGap = innerH / grid.rows;
          for (let row = 0; row < grid.rows; row++) {
            const y = plinthH + 0.015 + (grid.rows - 1 - row) * levelGap;
            if (row < grid.rows - 1) {
              box(W - 0.07, 0.012, D - 0.07, this.kit.glass, 0, y + levelGap - 0.02, 0, undefined, false);
            }
            box(W * 0.55, 0.014, D * 0.55, velvet, 0, y + 0.01, 0, { ry: rng.range(-0.06, 0.06) });
            anchors.set(`${row},0,0`, new THREE.Vector3(0, y + 0.02, 0));
          }
        }
        break;
      }
      case "showcase-low": {
        const plinthH = H * 0.5;
        box(W, plinthH, D, body, 0, plinthH / 2, 0);
        box(W + 0.04, 0.04, D + 0.04, frameBrushed, 0, 0.02, 0);
        const deckY = plinthH + 0.015;
        box(W - 0.05, 0.03, D - 0.05, velvet, 0, deckY, 0);
        glassCase(W, D, plinthH, H);
        ledBaffle(W, D, H - 0.028);
        const grid = template.slotGrid;
        if (grid) dressDeck(grid.rows, grid.cols, W, D, deckY + 0.015);
        break;
      }

      // ───────── tables & pedestals ─────────
      case "display-table": {
        const isRound = template.id.includes("round");
        const topY = H - 0.03;
        if (isRound) {
          cyl(W / 2, W / 2, 0.05, body, 0, topY, 0, 36);
          cyl(0.06, 0.09, H - 0.05, frameBrushed, 0, (H - 0.05) / 2, 0, 16);
          cyl(W * 0.3, W * 0.32, 0.03, body, 0, 0.015, 0, 28);
        } else {
          box(W, 0.05, D, body, 0, topY, 0);
          for (const sx of [-1, 1])
            for (const sz of [-1, 1])
              box(0.045, H - 0.05, 0.045, frameBrushed, sx * (W / 2 - 0.06), (H - 0.05) / 2, sz * (D / 2 - 0.06));
        }
        box(W * 0.5, 0.008, (isRound ? W : D) * 0.66, velvet, 0, topY + 0.03, 0, { ry: rng.range(-0.08, 0.08) });
        box(0.14, 0.05, 0.14, frameBrushed, -W * 0.28, topY + 0.05, (isRound ? W : D) * 0.2);
        const grid = template.slotGrid;
        if (grid) dressDeck(grid.rows, grid.cols, W * 0.9, (isRound ? W : D) * 0.8, topY + 0.034, 0, false);
        break;
      }
      case "pedestal": {
        const grid = template.slotGrid;
        const cols = grid?.cols ?? 1;
        const colW = W / cols;
        for (let col = 0; col < cols; col++) {
          const x = -((cols - 1) / 2) * colW + col * colW;
          const h = H * (cols > 1 ? rng.range(0.86, 1) : 1);
          box(colW * 0.8, h - 0.02, D * 0.9, body, x, (h - 0.02) / 2, 0);
          box(colW * 0.86, 0.03, D * 0.96, frameBrushed, x, 0.015, 0);
          box(colW * 0.76, 0.025, D * 0.85, velvet, x, h, 0);
          const bw = colW * 0.72;
          const bh = 0.32;
          box(bw, bh, D * 0.8, this.kit.glass, x, h + bh / 2 + 0.01, 0, undefined, false);
          box(bw, 0.015, D * 0.8, framePolished, x, h + bh + 0.02, 0);
          anchors.set(`0,${col},0`, new THREE.Vector3(x, h + 0.028, 0));
        }
        break;
      }

      // ───────── counters ─────────
      case "counter-service":
      case "counter-cashwrap": {
        const topY = H - 0.04;
        box(W, H - 0.12, D, body, 0, (H - 0.12) / 2 + 0.08, 0);
        box(W + 0.03, 0.08, D + 0.03, frameBrushed, 0, 0.04, 0);
        box(W + 0.06, 0.045, D + 0.06, this.kit.marbleFloor, 0, topY + 0.02, 0);
        const trayX = -W * 0.22;
        box(0.32, 0.014, 0.22, velvet, trayX, topY + 0.05, 0);
        box(0.34, 0.006, 0.24, framePolished, trayX, topY + 0.043, 0);
        cyl(0.02, 0.024, 0.07, body, W * 0.18, topY + 0.075, -D * 0.18, 14);
        box(0.09, 0.05, 0.03, frameBrushed, W * 0.3, topY + 0.065, -D * 0.15);
        if (template.kind === "counter-cashwrap") {
          box(0.4, 0.006, 0.28, this.kit.lacquerDark, W * 0.05, topY + 0.045, D * 0.08);
          box(0.09, 0.07, 0.07, this.kit.lacquerNavy, W * 0.28, topY + 0.075, D * 0.12);
        }
        const grid = template.slotGrid;
        if (grid) {
          const cellW = (W * 0.7) / grid.cols;
          for (let col = 0; col < grid.cols; col++) {
            const x = -((grid.cols - 1) / 2) * cellW + col * cellW;
            anchors.set(`0,${col},0`, new THREE.Vector3(x, topY + 0.045, D * 0.22));
          }
        }
        break;
      }

      // ───────── seating (jewel-tone accent upholstery per maison) ─────────
      case "seating-chair": {
        const seatH = 0.44;
        // Rounded tub-chair read: seat pad + wrapping back shell.
        box(W * 0.92, 0.14, D * 0.92, seatVelvet, 0, seatH, 0);
        box(W * 0.9, 0.42, 0.12, seatVelvet, 0, seatH + 0.24, -D / 2 + 0.08);
        for (const sx of [-1, 1])
          box(0.1, 0.34, D * 0.7, seatVelvet, sx * (W / 2 - 0.06), seatH + 0.18, 0.02); // arms
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            cyl(0.02, 0.026, seatH - 0.08, frameBrushed, sx * (W / 2 - 0.08), (seatH - 0.08) / 2, sz * (D / 2 - 0.08), 10, { rx: 0.06 * sz });
        break;
      }
      case "seating-ottoman": {
        box(W, H * 0.55, D, seatVelvet, 0, H * 0.45, 0);
        box(W * 0.96, 0.05, D * 0.96, frameBrushed, 0, H * 0.14, 0);
        for (const sx of [-1, 1])
          for (const sz of [-1, 1])
            cyl(0.024, 0.03, H * 0.12, frameBrushed, sx * (W / 2 - 0.08), H * 0.06, sz * (D / 2 - 0.08), 12);
        break;
      }
      case "seating-sofa": {
        // Kidney-curved salon sofa (reference VIP lounges): cream velvet body
        // wrapping a coffee-table setting, jewel-tone accent pillows, gold feet.
        // The concave seating side opens toward +z (into the room).
        const seatH = 0.42;
        const N = 7;
        const halfArc = 1.15;
        const Rb = W * 0.56; // backrest arc radius
        const Rs = Rb - 0.42; // seat arc radius
        const cz = Rb - D / 2; // centre of curvature (in front of the sofa)
        for (let i = 0; i < N; i++) {
          const t = i / (N - 1);
          const a = (t - 0.5) * 2 * halfArc;
          const sinA = Math.sin(a);
          const cosA = Math.cos(a);
          // seat cushion
          box(0.44, 0.16, 0.52, velvet, sinA * Rs, seatH, cz - cosA * Rs, { ry: a });
          // backrest (taller, along the outer arc)
          box(0.46, 0.52, 0.18, velvet, sinA * Rb, seatH + 0.26, cz - cosA * Rb, { ry: a });
          // jewel accent pillows on alternating seats
          if (i % 2 === 1) {
            box(0.34, 0.26, 0.16, seatVelvet, sinA * (Rs - 0.06), seatH + 0.2, cz - cosA * (Rs - 0.06), {
              ry: a,
              rz: 0.12,
            });
          }
        }
        // Base rail + gold feet at the two ends and centre.
        for (const a of [-halfArc, 0, halfArc]) {
          cyl(0.03, 0.04, seatH - 0.14, frameBrushed, Math.sin(a) * Rs, (seatH - 0.14) / 2, cz - Math.cos(a) * Rs, 10);
        }
        break;
      }

      // ───────── wall systems ─────────
      case "wall-paneling": {
        box(W, H, D, this.kit.fabricWallPanel("#1d2434"), 0, H / 2, 0);
        const panels = Math.max(2, Math.round(W / 0.8));
        for (let i = 1; i < panels; i++) {
          box(0.015, H, D + 0.01, frameBrushed, -W / 2 + (i * W) / panels, H / 2, 0);
        }
        box(W * 0.4, H * 0.34, 0.05, framePolished, 0, H * 0.6, D / 2 + 0.02);
        box(W * 0.36, H * 0.3, 0.02, this.kit.fabricWallPanel("#8b1a2b"), 0, H * 0.6, D / 2 + 0.045);
        break;
      }
      case "wall-shelving": {
        box(W, H, 0.05, body, 0, H / 2, -D / 2 + 0.025);
        const grid = template.slotGrid;
        const rows = grid?.rows ?? 4;
        const gap = (H - 0.3) / rows;
        for (let row = 0; row < rows; row++) {
          const y = H - 0.15 - (row + 1) * gap + gap * 0.15;
          box(W, 0.025, D - 0.05, body, 0, y, 0.01);
          box(W * 0.9, 0.01, 0.018, led, 0, y - 0.018, D / 2 - 0.06, undefined, false);
          const cols = grid?.cols ?? 3;
          const cellW = (W * 0.86) / cols;
          for (let col = 0; col < cols; col++) {
            const x = -((cols - 1) / 2) * cellW + col * cellW;
            anchors.set(`${row},${col},0`, new THREE.Vector3(x, y + 0.014, 0.02));
          }
        }
        box(W, 0.06, D, frameBrushed, 0, 0.03, 0);
        break;
      }
      case "wall-bracket": {
        box(W, H, 0.04, body, 0, H / 2, -D / 2 + 0.02);
        const grid = template.slotGrid;
        const rows = grid?.rows ?? 3;
        const cols = grid?.cols ?? 2;
        const gap = (H - 0.25) / rows;
        for (let row = 0; row < rows; row++) {
          const y = H - 0.12 - row * gap - gap * 0.5;
          const cellW = (W * 0.8) / cols;
          for (let col = 0; col < cols; col++) {
            const x = -((cols - 1) / 2) * cellW + col * cellW;
            box(0.02, 0.02, D * 0.7, frameBrushed, x, y - 0.02, 0);
            box(cellW * 0.8, 0.015, D * 0.75, body, x, y, 0.02);
            box(cellW * 0.7, 0.01, D * 0.6, velvet, x, y + 0.012, 0.02, { ry: rng.range(-0.03, 0.03) });
            anchors.set(`${row},${col},0`, new THREE.Vector3(x, y + 0.02, 0.02));
          }
        }
        break;
      }

      // ───────── lighting rigs (geometry only — lights come from the engine) ─────────
      case "light-track": {
        box(W, 0.05, 0.07, this.kit.lacquerDark, 0, 0, 0);
        const heads = template.lighting.length;
        for (let i = 0; i < heads; i++) {
          const x = template.lighting[i]?.offset[0] ?? (i - (heads - 1) / 2) * (W / heads);
          const tilt = rng.range(0.15, 0.4) * (rng.chance(0.5) ? 1 : -1);
          cyl(0.035, 0.045, 0.11, frameBrushed, x, -0.08, 0, 16, { rx: tilt });
          bucket.add(new THREE.CylinderGeometry(0.028, 0.028, 0.006, 16), led, x, -0.135, 0, undefined, false);
        }
        break;
      }
      case "light-recessed": {
        cyl(W / 2 + 0.02, W / 2 + 0.02, 0.02, frameBrushed, 0, 0, 0, 20);
        bucket.add(new THREE.CylinderGeometry(W / 2 - 0.01, W / 2 - 0.01, 0.008, 20), led, 0, -0.008, 0, undefined, false);
        break;
      }
      case "light-accent": {
        cyl(0.012, 0.012, H, this.kit.lacquerDark, 0, -H / 2, 0, 10);
        cyl(0.03, 0.04, 0.1, framePolished, 0, -H - 0.04, 0, 16, { rx: 0.3 });
        bucket.add(new THREE.CylinderGeometry(0.024, 0.024, 0.005, 16), led, 0, -H - 0.095, 0.028, { rx: 0.3 }, false);
        break;
      }
    }

    // Contact shadow blob under floor-standing fixtures (grounding, Pillar B).
    // Unlit-looking decal without MeshBasicMaterial (banned): black standard
    // material at roughness 1 with the radial alpha — reads as occlusion.
    const isCeilingRig = template.kind.startsWith("light-");
    if (!isCeilingRig) {
      const blob = new THREE.Mesh(
        new THREE.PlaneGeometry(W * 1.5, D * 1.5),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#000000"),
          roughness: 1,
          metalness: 0,
          alphaMap: this.kit.shadowBlobTexture,
          transparent: true,
          depthWrite: false,
          opacity: 0.8,
        }),
      );
      blob.rotation.x = -Math.PI / 2;
      blob.position.y = 0.004;
      blob.renderOrder = 1;
      blob.name = "contact-shadow";
      group.add(blob);
    }

    bucket.emit(group);

    // Tag the whole subtree for picking.
    group.traverse((o) => {
      o.userData.fixtureId = instance.id;
    });

    return { group, slotAnchors: anchors, size: new THREE.Vector3(W, H, D) };
  }
}
