/**
 * Floor plate generator — parametric room from the layout dimension spec:
 * marble floor, segmented walls with door/window/shopfront apertures,
 * paneled wainscoting with joint reveals, baseboards, ceiling with cove
 * reveal, columns, VIP rug with edge geometry, procedural artwork and
 * signage. Nothing is bare (Pillar C). Static architecture is merged into a
 * handful of meshes (GeometryBucket) — the whole plate costs ~15 draw calls.
 */

import * as THREE from "three";
import { Rng } from "../core/Seed";
import type { Aperture, BoutiqueLayout } from "../data/types";
import { GeometryBucket } from "../render/GeometryBucket";
import { MaterialKit } from "../render/Materials";

const WALL_T = 0.2;

interface WallSpec {
  name: Aperture["wall"];
  length: number;
  origin: THREE.Vector3;
  along: THREE.Vector3;
  inward: THREE.Vector3;
}

function wallSpecs(width: number, depth: number): WallSpec[] {
  const hw = width / 2;
  const hd = depth / 2;
  return [
    { name: "north", length: width, origin: new THREE.Vector3(0, 0, -hd), along: new THREE.Vector3(1, 0, 0), inward: new THREE.Vector3(0, 0, 1) },
    { name: "south", length: width, origin: new THREE.Vector3(0, 0, hd), along: new THREE.Vector3(1, 0, 0), inward: new THREE.Vector3(0, 0, -1) },
    { name: "west", length: depth, origin: new THREE.Vector3(-hw, 0, 0), along: new THREE.Vector3(0, 0, 1), inward: new THREE.Vector3(1, 0, 0) },
    { name: "east", length: depth, origin: new THREE.Vector3(hw, 0, 0), along: new THREE.Vector3(0, 0, 1), inward: new THREE.Vector3(-1, 0, 0) },
  ];
}

function placeAlong(spec: WallSpec, centerAlong: number, y: number, thicknessOffset = 0): THREE.Vector3 {
  const p = spec.origin.clone();
  p.add(spec.along.clone().multiplyScalar(centerAlong - spec.length / 2));
  p.add(spec.inward.clone().multiplyScalar(thicknessOffset));
  p.y = y;
  return p;
}

function wallYRotation(spec: WallSpec): number {
  return spec.along.x !== 0 ? 0 : Math.PI / 2;
}

function makeArtworkTexture(rng: Rng, w = 256, h = 320): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, "#efe7d8");
  g.addColorStop(1, "#ddd2bc");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  const palette = ["#b8965a", "#8b1a2b", "#1c2740", "#2d5a3d"];
  for (let i = 0; i < 7; i++) {
    ctx.strokeStyle = palette[rng.int(0, palette.length - 1)];
    ctx.lineWidth = rng.range(2, 10);
    ctx.globalAlpha = rng.range(0.25, 0.8);
    ctx.beginPath();
    const cx = rng.range(0, w);
    const cy = rng.range(0, h);
    ctx.arc(cx, cy, rng.range(20, 130), rng.range(0, Math.PI), rng.range(Math.PI, Math.PI * 2));
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function makeSignageTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 1024;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("2D context unavailable");
  ctx.fillStyle = "#171512";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#e9cf9c";
  ctx.font = "500 104px Georgia, 'Times New Roman', serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = "42px";
  ctx.fillText(text, canvas.width / 2 + 21, canvas.height / 2 + 6);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export interface FloorPlateResult {
  group: THREE.Group;
  /** Boxes that block the walk-mode camera. */
  colliders: THREE.Box3[];
}

export function buildFloorPlate(
  layout: BoutiqueLayout,
  kit: MaterialKit,
  rng: Rng,
): FloorPlateResult {
  const group = new THREE.Group();
  group.name = "floor-plate";
  const colliders: THREE.Box3[] = [];
  const { width, depth, ceilingHeight: H, apertures, columns } = layout.floor;
  const theme = layout.theme;
  const bucket = new GeometryBucket();

  /** Axis-aligned collider from a wall-space box. */
  const colliderAt = (center: THREE.Vector3, lenAlong: number, h: number, rotY: number) => {
    const hx = rotY === 0 ? lenAlong / 2 : WALL_T / 2;
    const hz = rotY === 0 ? WALL_T / 2 : lenAlong / 2;
    colliders.push(
      new THREE.Box3(
        new THREE.Vector3(center.x - hx, center.y - h / 2, center.z - hz),
        new THREE.Vector3(center.x + hx, center.y + h / 2, center.z + hz),
      ),
    );
  };

  // ── Floor slab (boutique-local stone from the architecture theme) ──
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(width, depth),
    kit.marbleThemed(theme.marble, theme.id),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  floor.name = "floor";
  group.add(floor);

  // ── Ceiling with cove reveal ──
  const ceiling = new THREE.Mesh(new THREE.PlaneGeometry(width, depth), kit.plasterCeiling);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = H;
  group.add(ceiling);

  const coveMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#3a342c"),
    roughness: 0.6,
    metalness: 0.1,
    emissive: new THREE.Color("#ffbf80"),
    emissiveIntensity: 1.6,
  });
  const coveInset = 0.55;
  const coveDrop = 0.16;
  const coveRuns: Array<[number, number, number, number]> = [
    [0, -depth / 2 + coveInset, width - coveInset * 2, 0.08],
    [0, depth / 2 - coveInset, width - coveInset * 2, 0.08],
    [-width / 2 + coveInset, 0, 0.08, depth - coveInset * 2],
    [width / 2 - coveInset, 0, 0.08, depth - coveInset * 2],
  ];
  for (const [cx, cz, lx, lz] of coveRuns) {
    bucket.add(new THREE.BoxGeometry(lx, coveDrop, lz), coveMat, cx, H - coveDrop / 2, cz, undefined, false);
  }

  // ── Walls with apertures ──
  const wallMat = kit.fabricWallPanel(theme.wallField);
  const wainscotColors = [theme.wainscotA, theme.wainscotB];
  const specs = wallSpecs(width, depth);
  const goldBrushed = kit.metalFor("champagne-gold", false);
  const goldPolished = kit.metalFor("champagne-gold", true);

  for (const spec of specs) {
    const wallApertures = apertures
      .filter((a) => a.wall === spec.name)
      .sort((a, b) => a.offset - b.offset);
    const rotY = wallYRotation(spec);

    const solid = (fromAlong: number, toAlong: number, y0: number, y1: number) => {
      const len = toAlong - fromAlong;
      if (len <= 0.01 || y1 - y0 <= 0.01) return;
      const center = placeAlong(spec, fromAlong + len / 2, (y0 + y1) / 2);
      bucket.add(new THREE.BoxGeometry(len, y1 - y0, WALL_T), wallMat, center.x, center.y, center.z, { ry: rotY });
      colliderAt(center, len, y1 - y0, rotY);
    };

    let cursor = 0;
    for (const ap of wallApertures) {
      solid(cursor, ap.offset, 0, H);
      solid(ap.offset, ap.offset + ap.width, ap.sill + ap.height, H);
      if (ap.sill > 0) solid(ap.offset, ap.offset + ap.width, 0, ap.sill);

      const centerAlong = ap.offset + ap.width / 2;
      if (ap.kind === "shopfront" || ap.kind === "window") {
        const paneC = placeAlong(spec, centerAlong, ap.sill + ap.height / 2);
        bucket.add(
          new THREE.BoxGeometry(ap.width - 0.08, ap.height - 0.06, 0.02),
          kit.glassShopfront,
          paneC.x,
          paneC.y,
          paneC.z,
          { ry: rotY },
          false,
        );
        const mullions = Math.max(1, Math.round(ap.width / 1.4) - 1);
        for (let m = 0; m <= mullions + 1; m++) {
          const t = m / (mullions + 1);
          const c = placeAlong(spec, ap.offset + 0.04 + t * (ap.width - 0.08), ap.sill + ap.height / 2);
          bucket.add(new THREE.BoxGeometry(0.06, ap.height, 0.09), goldBrushed, c.x, c.y, c.z, { ry: rotY });
        }
        colliderAt(paneC, ap.width, ap.height + ap.sill, rotY);
      } else {
        for (const side of [-1, 1]) {
          const c = placeAlong(spec, centerAlong + (side * (ap.width - 0.12)) / 2, ap.height / 2);
          bucket.add(new THREE.BoxGeometry(0.12, ap.height, WALL_T + 0.08), goldPolished, c.x, c.y, c.z, { ry: rotY });
        }
        const lintel = placeAlong(spec, centerAlong, ap.height + 0.07);
        bucket.add(new THREE.BoxGeometry(ap.width, 0.14, WALL_T + 0.08), goldPolished, lintel.x, lintel.y, lintel.z, { ry: rotY });
        const thr = placeAlong(spec, centerAlong, 0.01);
        bucket.add(new THREE.BoxGeometry(ap.width, 0.02, 0.24), goldBrushed, thr.x, thr.y, thr.z, { ry: rotY });
      }
      cursor = ap.offset + ap.width;
    }
    solid(cursor, spec.length, 0, H);

    // ── Baseboard + wainscot panels with joint reveals + crown rail ──
    const baseC = placeAlong(spec, spec.length / 2, 0.06, WALL_T / 2 + 0.0225);
    bucket.add(new THREE.BoxGeometry(spec.length, 0.12, 0.045), kit.lacquerDark, baseC.x, baseC.y, baseC.z, { ry: rotY });

    const panelH = 2.1;
    const panelW = 1.18;
    const panelGap = 0.03;
    const wainscotMat = kit.fabricWallPanel(
      wainscotColors[spec.name === "east" || spec.name === "west" ? 1 : 0],
    );
    let along = 0.25;
    while (along + panelW < spec.length - 0.25) {
      const panelCenter = along + panelW / 2;
      const overlapsAperture = wallApertures.some(
        (a) => panelCenter > a.offset - 0.2 && panelCenter < a.offset + a.width + 0.2 && a.sill < panelH,
      );
      if (!overlapsAperture) {
        const pc = placeAlong(spec, panelCenter, 0.14 + (panelH - 0.16) / 2, WALL_T / 2 + 0.0175);
        bucket.add(new THREE.BoxGeometry(panelW, panelH - 0.16, 0.035), wainscotMat, pc.x, pc.y, pc.z, { ry: rotY });
        const rc = placeAlong(spec, along + panelW + panelGap / 2, 0.14 + (panelH - 0.16) / 2, WALL_T / 2 + 0.018);
        bucket.add(new THREE.BoxGeometry(0.015, panelH - 0.16, 0.04), goldBrushed, rc.x, rc.y, rc.z, { ry: rotY });
      }
      along += panelW + panelGap;
    }

    const railC = placeAlong(spec, spec.length / 2, panelH + 0.02, WALL_T / 2 + 0.025);
    bucket.add(new THREE.BoxGeometry(spec.length, 0.05, 0.05), goldBrushed, railC.x, railC.y, railC.z, { ry: rotY });
  }

  // ── Artwork frames (north + west walls) ──
  const artSpots: Array<{ wall: Aperture["wall"]; along: number; y: number }> = [
    { wall: "north", along: width * 0.28, y: 2.6 },
    { wall: "north", along: width * 0.72, y: 2.6 },
    { wall: "west", along: depth * 0.5, y: 2.7 },
  ];
  for (const spot of artSpots) {
    const spec = specs.find((s) => s.name === spot.wall);
    if (!spec) continue;
    const blocked = apertures.some(
      (a) => a.wall === spot.wall && spot.along > a.offset - 0.8 && spot.along < a.offset + a.width + 0.8,
    );
    if (blocked) continue;
    const artW = 1.1;
    const artH = 1.4;
    const fc = placeAlong(spec, spot.along, spot.y, WALL_T / 2 + 0.03);
    bucket.add(new THREE.BoxGeometry(artW + 0.12, artH + 0.12, 0.06), goldPolished, fc.x, fc.y, fc.z, {
      ry: wallYRotation(spec),
    });
    const art = new THREE.Mesh(
      new THREE.PlaneGeometry(artW, artH),
      new THREE.MeshStandardMaterial({
        map: makeArtworkTexture(rng.child(`art-${spot.wall}-${spot.along}`)),
        roughness: 0.85,
      }),
    );
    art.position.copy(placeAlong(spec, spot.along, spot.y, WALL_T / 2 + 0.062));
    art.lookAt(art.position.clone().add(spec.inward));
    group.add(art);
  }

  // ── Interior signage above the entrance (south wall, inside) ──
  const signSpec = specs.find((s) => s.name === "south");
  const door = apertures.find((a) => a.wall === "south" && a.kind === "door");
  if (signSpec && door) {
    const signTex = makeSignageTexture("AURELLE");
    const plaque = new THREE.Mesh(
      new THREE.BoxGeometry(3.4, 0.62, 0.05),
      new THREE.MeshStandardMaterial({
        map: signTex,
        roughness: 0.4,
        metalness: 0.2,
        emissive: new THREE.Color("#8a6f3e"),
        emissiveMap: signTex,
        emissiveIntensity: 0.55,
      }),
    );
    plaque.position.copy(
      placeAlong(signSpec, door.offset + door.width / 2, door.height + 0.55, WALL_T / 2 + 0.026),
    );
    plaque.rotation.y = wallYRotation(signSpec);
    group.add(plaque);
  }

  // ── Columns with base & capital ──
  const columnMat = kit.fabricWallPanel(theme.columnColor);
  for (const col of columns) {
    bucket.add(new THREE.BoxGeometry(col.size, H - 0.5, col.size), columnMat, col.x, (H - 0.5) / 2 + 0.25, col.z);
    bucket.add(new THREE.BoxGeometry(col.size + 0.12, 0.25, col.size + 0.12), goldBrushed, col.x, 0.125, col.z);
    bucket.add(new THREE.BoxGeometry(col.size + 0.12, 0.25, col.size + 0.12), goldBrushed, col.x, H - 0.125, col.z);
    colliders.push(
      new THREE.Box3(
        new THREE.Vector3(col.x - col.size / 2, 0, col.z - col.size / 2),
        new THREE.Vector3(col.x + col.size / 2, H, col.z + col.size / 2),
      ),
    );
  }

  // ── VIP rug with border edge geometry ──
  const vip = layout.zones.find((z) => z.kind === "vip");
  if (vip) {
    let minX = Infinity,
      maxX = -Infinity,
      minZ = Infinity,
      maxZ = -Infinity;
    for (const [x, z] of vip.polygon) {
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minZ = Math.min(minZ, z);
      maxZ = Math.max(maxZ, z);
    }
    const rugW = Math.max(2, maxX - minX - 2.4);
    const rugD = Math.max(2, maxZ - minZ - 2.4);
    const cx = (minX + maxX) / 2;
    const cz = (minZ + maxZ) / 2;
    const rug = new THREE.Mesh(new THREE.PlaneGeometry(rugW, rugD), kit.carpet(theme.rugColor));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(cx, 0.012, cz);
    rug.receiveShadow = true;
    group.add(rug);
    const bw = 0.05;
    const edges: Array<[number, number, number, number]> = [
      [cx, cz - rugD / 2, rugW, bw],
      [cx, cz + rugD / 2, rugW, bw],
      [cx - rugW / 2, cz, bw, rugD],
      [cx + rugW / 2, cz, bw, rugD],
    ];
    for (const [ex, ez, lx, lz] of edges) {
      bucket.add(new THREE.BoxGeometry(lx, 0.014, lz), goldBrushed, ex, 0.014, ez);
    }
  }

  bucket.emit(group);
  return { group, colliders };
}
