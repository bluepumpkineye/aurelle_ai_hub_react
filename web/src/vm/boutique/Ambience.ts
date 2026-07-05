/**
 * Ambience — the statement ceiling features, chandeliers and area rugs that
 * carry each maison's luxury signature (studied from the reference boutiques):
 *
 *   · HK       organic oval cove + suspended gold flock + gold-petal chandelier
 *   · Beijing  gold woven dome + gold-petal cascade chandelier
 *   · Seoul    warm oval cove + traditional crystal-droplet chandelier
 *   · Ginza    amorphous illuminated cove, minimal (no chandelier)
 *
 * All feature geometry is merged (draw-call budget) and the glow comes from
 * emissive materials, not extra lights — the frame budget is unchanged.
 */

import * as THREE from "three";
import { Rng } from "../core/Seed";
import type { BoutiqueLayout, BoutiqueTheme } from "../data/types";
import { polygonCentroid } from "../data/types";
import { GeometryBucket } from "../render/GeometryBucket";
import { MaterialKit } from "../render/Materials";

interface ZoneBox {
  cx: number;
  cz: number;
  halfX: number;
  halfZ: number;
}

function zoneBox(poly: Array<[number, number]>): ZoneBox {
  let minX = Infinity,
    maxX = -Infinity,
    minZ = Infinity,
    maxZ = -Infinity;
  for (const [x, z] of poly) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minZ = Math.min(minZ, z);
    maxZ = Math.max(maxZ, z);
  }
  return { cx: (minX + maxX) / 2, cz: (minZ + maxZ) / 2, halfX: (maxX - minX) / 2, halfZ: (maxZ - minZ) / 2 };
}

/**
 * The zone the statement ceiling hangs over: the Fine Jewellery hero island
 * (central destination visible from the entry, per Rule 1). Falls back to HJ,
 * then entrance.
 */
function heroZone(layout: BoutiqueLayout) {
  return (
    layout.zones.find((z) => z.kind === "fine-jewelry") ??
    layout.zones.find((z) => z.kind === "high-jewelry") ??
    layout.zones.find((z) => z.kind === "entrance") ??
    layout.zones[0]
  );
}

// ───────────────────────────── statement ceiling ─────────────────────────────

export function buildCeilingFeature(
  layout: BoutiqueLayout,
  kit: MaterialKit,
  theme: BoutiqueTheme,
  rng: Rng,
): THREE.Group {
  const group = new THREE.Group();
  group.name = "ceiling-feature";
  const H = layout.floor.ceilingHeight;
  const zone = heroZone(layout);
  if (!zone) return group;
  const box = zoneBox(zone.polygon);
  const [cx, cz] = polygonCentroid(zone.polygon);

  // Ellipse extents fit inside the zone footprint.
  const rx = Math.min(box.halfX * 0.92, 4.6);
  const rz = Math.min(box.halfZ * 0.92, 4.6);

  const glow = new THREE.Color(theme.ceilingGlow);
  const coveMat = new THREE.MeshStandardMaterial({
    color: glow,
    emissive: glow,
    emissiveIntensity: theme.ceilingStyle === "gold-dome" ? 3.4 : 2.4,
    roughness: 0.5,
    metalness: theme.ceilingStyle === "gold-dome" ? 0.6 : 0,
    side: THREE.DoubleSide,
  });

  // Recessed disc interior (sits just above the ceiling plane) — the "opening".
  const discMat =
    theme.ceilingStyle === "gold-dome"
      ? kit.goldWeaveCeiling()
      : new THREE.MeshStandardMaterial({ color: new THREE.Color("#efe9dd"), roughness: 0.85, metalness: 0 });

  const disc = new THREE.Mesh(new THREE.CircleGeometry(1, 64), discMat);
  disc.scale.set(rx, rz, 1);
  disc.rotation.x = Math.PI / 2; // face down
  disc.position.set(cx, H + 0.28, cz);
  group.add(disc);

  // Glowing cove ring around the opening (the halo of warm light).
  const ring = new THREE.Mesh(new THREE.RingGeometry(0.86, 1.0, 72), coveMat);
  ring.scale.set(rx + 0.35, rz + 0.35, 1);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(cx, H - 0.06, cz);
  group.add(ring);

  // A second, softer outer halo for the amorphous (Ginza) and oval styles.
  if (theme.ceilingStyle !== "gold-dome") {
    const outer = new THREE.Mesh(
      new THREE.RingGeometry(0.97, 1.0, 72),
      new THREE.MeshStandardMaterial({
        color: glow,
        emissive: glow,
        emissiveIntensity: 1.4,
        roughness: 0.6,
        side: THREE.DoubleSide,
      }),
    );
    outer.scale.set(rx + 1.1, rz + 1.1, 1);
    outer.rotation.x = Math.PI / 2;
    outer.position.set(cx, H - 0.12, cz);
    group.add(outer);
  }

  // Inner rim wall of the recess (gives the opening depth).
  const rimMat = new THREE.MeshStandardMaterial({
    color: glow.clone().multiplyScalar(0.8),
    emissive: glow,
    emissiveIntensity: 1.1,
    roughness: 0.6,
    side: THREE.DoubleSide,
  });
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(1, 1, 0.3, 64, 1, true), rimMat);
  rim.scale.set(rx + 0.18, 1, rz + 0.18);
  rim.position.set(cx, H + 0.13, cz);
  group.add(rim);

  // HK: a suspended gold flock (birds/leaves) drifting under the oval.
  if (theme.ceilingStyle === "organic-oval" && theme.chandelier === "gold-petal") {
    const flockBucket = new GeometryBucket();
    const goldMat = kit.metalFor("champagne-gold", true);
    const count = 70;
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next());
      const px = Math.cos(a) * r * rx * 0.8;
      const pz = Math.sin(a) * r * rz * 0.8;
      const py = H - 0.15 - r * 0.9 - rng.range(0, 0.5);
      // A tiny 3-facet leaf/bird.
      flockBucket.add(
        new THREE.TetrahedronGeometry(rng.range(0.03, 0.06)),
        goldMat,
        cx + px,
        py,
        cz + pz,
        { rx: rng.range(0, Math.PI), ry: rng.range(0, Math.PI) },
        false,
      );
    }
    flockBucket.emit(group);
  }

  // Chandelier suspended at the centre of the opening.
  const chand = buildChandelier(theme, kit, cx, cz, H, rng);
  if (chand) group.add(chand);

  return group;
}

// ───────────────────────────── chandeliers ─────────────────────────────

function buildChandelier(
  theme: BoutiqueTheme,
  kit: MaterialKit,
  cx: number,
  cz: number,
  H: number,
  rng: Rng,
): THREE.Group | null {
  if (theme.chandelier === "none") return null;
  const group = new THREE.Group();
  group.name = "chandelier";
  const rods = new GeometryBucket();
  const rodMat = new THREE.MeshStandardMaterial({ color: new THREE.Color("#8a7a52"), metalness: 0.9, roughness: 0.4 });

  if (theme.chandelier === "gold-petal") {
    // Cascade of gold petals with warm bulbs — HK / Beijing.
    const petalMat = kit.metalFor("champagne-gold", true);
    const bulbMat = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#fff2d6"),
      emissive: new THREE.Color("#ffcf8a"),
      emissiveIntensity: 4.5,
      roughness: 0.3,
    });
    const petals = new GeometryBucket();
    const bulbs = new GeometryBucket();
    const count = 42;
    const spread = 1.15;
    const topY = H - 0.14;
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * spread;
      const drop = 0.25 + r * 0.55 + rng.range(0, 0.5);
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;
      const py = topY - drop;
      // suspension rod
      rods.add(new THREE.CylinderGeometry(0.004, 0.004, drop, 5), rodMat, px, topY - drop / 2, pz, undefined, false);
      // petal: a flattened elongated octahedron
      const petal = new THREE.OctahedronGeometry(rng.range(0.05, 0.09));
      petals.add(petal, petalMat, px, py, pz, { rx: rng.range(0, Math.PI), ry: rng.range(0, Math.PI), rz: 0.4 }, false);
      if (rng.chance(0.5)) {
        bulbs.add(new THREE.SphereGeometry(rng.range(0.02, 0.035), 8, 6), bulbMat, px, py - 0.05, pz, undefined, false);
      }
    }
    rods.emit(group);
    petals.emit(group);
    bulbs.emit(group);
  } else {
    // Crystal droplet cascade — Seoul (traditional).
    const crystalMat = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#f4f8ff"),
      metalness: 0,
      roughness: 0.04,
      clearcoat: 1,
      clearcoatRoughness: 0.03,
      emissive: new THREE.Color("#cfe0ff"),
      emissiveIntensity: 0.8,
      envMapIntensity: 2.2,
      flatShading: true,
    });
    const frameMat = kit.metalFor("champagne-gold", true);
    // Central tiered frame
    for (const [ry, rr] of [
      [H - 0.5, 0.5],
      [H - 0.8, 0.34],
      [H - 1.05, 0.18],
    ] as Array<[number, number]>) {
      rods.add(new THREE.TorusGeometry(rr, 0.012, 6, 32), frameMat, cx, ry, cz, { rx: Math.PI / 2 }, false);
    }
    const crystals = new GeometryBucket();
    const count = 60;
    const topY = H - 0.16;
    for (let i = 0; i < count; i++) {
      const a = rng.range(0, Math.PI * 2);
      const r = Math.sqrt(rng.next()) * 0.55;
      const drop = 0.35 + (0.6 - r) * 1.2 + rng.range(0, 0.4);
      const px = cx + Math.cos(a) * r;
      const pz = cz + Math.sin(a) * r;
      const py = topY - drop;
      rods.add(new THREE.CylinderGeometry(0.003, 0.003, drop, 4), rodMat, px, topY - drop / 2, pz, undefined, false);
      const crys = new THREE.OctahedronGeometry(rng.range(0.03, 0.05));
      crystals.add(crys, crystalMat, px, py, pz, { rx: rng.range(0, 1), ry: rng.range(0, 1) }, false);
    }
    rods.emit(group);
    crystals.emit(group);
  }

  return group;
}

// ───────────────────────────── zone area rugs ─────────────────────────────

/**
 * Soft area rugs grounding the island clusters in the merchandising zones —
 * every reference boutique floats its central cases on a rug.
 */
export function buildZoneRugs(layout: BoutiqueLayout, kit: MaterialKit, theme: BoutiqueTheme): THREE.Group {
  const group = new THREE.Group();
  group.name = "zone-rugs";
  const rugMat = kit.carpet(theme.rugColor);
  const roundedRug = (cx: number, cz: number, w: number, d: number) => {
    // A rounded-rectangle rug via a scaled high-segment shape approximated with a plane.
    const mesh = new THREE.Mesh(new THREE.CircleGeometry(1, 48), rugMat);
    mesh.scale.set(w / 2, d / 2, 1);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(cx, 0.011, cz);
    mesh.receiveShadow = true;
    group.add(mesh);
  };

  for (const zone of layout.zones) {
    // Only the Fine Jewellery hero zone floats its islands on a rug; carpet
    // zones (HJ, consultation, salon) get full carpet from the floor-patch pass.
    if (zone.kind !== "fine-jewelry") continue;
    const box = zoneBox(zone.polygon);
    const w = Math.min(box.halfX * 2 - 1.0, 6.5);
    const d = Math.min(box.halfZ * 2 - 1.0, 6.5);
    if (w < 1.5 || d < 1.5) continue;
    roundedRug(box.cx, box.cz, w, d);
  }
  return group;
}
