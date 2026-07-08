/**
 * Private salons — the semi-enclosed VIC Consultation lounge and HJ Private
 * Salon get partition walls (with a doorway), a green-and-gold "jewel box"
 * interior, a warm gold cove, a kintsugi feature panel, brass floating shelves
 * and a bronze coffee table — rendered to the reference private-salon setups.
 *
 * The playbook calls these zones "semi-enclosed — a partial wall or reveal that
 * creates privacy without full enclosure": the partitions rise to 2.8 m (below
 * the ceiling) and leave a 1.5 m doorway on the approach side. Merged geometry.
 */

import * as THREE from "three";
import { Rng } from "../core/Seed";
import type { BoutiqueLayout, ZoneConfig } from "../data/types";
import { GeometryBucket } from "../render/GeometryBucket";
import { MaterialKit } from "../render/Materials";

const PARTITION_H = 2.8;
const PARTITION_T = 0.12;
const DOOR_W = 1.5;
const EPS = 0.15;

// Salon "jewel box" palette (reference: celadon-green lacquer + gold kintsugi).
const SALON_GREEN = "#3f7a5c";
const SALON_GREEN_DEEP = "#2f6349";
const KINTSUGI_PALETTE: [string, string, string, string] = ["#356b50", "#4f8a6a", "#7fae92", "#d3af6a"];

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function bounds(poly: Array<[number, number]>): Bounds {
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
  return { minX, maxX, minZ, maxZ };
}

type EdgeName = "north" | "south" | "east" | "west";

interface Edge {
  name: EdgeName;
  /** Fixed coordinate of the edge line. */
  at: number;
  /** Span of the edge along the other axis. */
  from: number;
  to: number;
  /** True when the edge lies on the building perimeter. */
  exterior: boolean;
  /** Inward direction sign for the free axis of the wall. */
  inward: number;
}

export interface PrivateSalonResult {
  group: THREE.Group;
  colliders: THREE.Box3[];
}

export function buildPrivateSalons(
  layout: BoutiqueLayout,
  kit: MaterialKit,
  rng: Rng,
): PrivateSalonResult {
  const group = new THREE.Group();
  group.name = "private-salons";
  const colliders: THREE.Box3[] = [];
  const bucket = new GeometryBucket();

  const hw = layout.floor.width / 2;
  const hd = layout.floor.depth / 2;

  const greenWall = kit.wallPanel(SALON_GREEN, "smooth");
  const greenLining = kit.wallPanel(SALON_GREEN_DEEP, "smooth");
  const gold = kit.metalFor("champagne-gold", true);
  const goldBrushed = kit.metalFor("champagne-gold", false);
  const coveMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#ffcf8a"),
    emissive: new THREE.Color("#ffbf6e"),
    emissiveIntensity: 2.6,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const bronze = new THREE.MeshStandardMaterial({
    color: new THREE.Color("#6e5a34"),
    metalness: 0.95,
    roughness: 0.28,
    envMapIntensity: 1.2,
  });

  const salonZones = layout.zones.filter((z) => z.kind === "consultation" || z.kind === "vip");

  for (const zone of salonZones) {
    const b = bounds(zone.polygon);
    const cx = (b.minX + b.maxX) / 2;
    const cz = (b.minZ + b.maxZ) / 2;

    const edges: Edge[] = [
      { name: "north", at: b.minZ, from: b.minX, to: b.maxX, exterior: b.minZ <= -hd + EPS, inward: +1 },
      { name: "south", at: b.maxZ, from: b.minX, to: b.maxX, exterior: b.maxZ >= hd - EPS, inward: -1 },
      { name: "west", at: b.minX, from: b.minZ, to: b.maxZ, exterior: b.minX <= -hw + EPS, inward: +1 },
      { name: "east", at: b.maxX, from: b.minZ, to: b.maxZ, exterior: b.maxX >= hw - EPS, inward: -1 },
    ];

    // Approach doorway: the interior edge whose midpoint is closest to the
    // boutique front-centre (0, +hd) — that is where a client walks in from.
    const interiorEdges = edges.filter((e) => !e.exterior);
    let approach: Edge | null = null;
    let bestDist = Infinity;
    for (const e of interiorEdges) {
      const mid = e.name === "north" || e.name === "south"
        ? new THREE.Vector2((e.from + e.to) / 2, e.at)
        : new THREE.Vector2(e.at, (e.from + e.to) / 2);
      const d = mid.distanceTo(new THREE.Vector2(0, hd));
      if (d < bestDist) {
        bestDist = d;
        approach = e;
      }
    }

    const isHorizontal = (e: Edge) => e.name === "north" || e.name === "south";

    const addWallSegment = (e: Edge, segFrom: number, segTo: number, thick: number, inset?: number) => {
      const len = segTo - segFrom;
      if (len <= 0.05) return;
      const mid = (segFrom + segTo) / 2;
      const offset = e.inward * (inset ?? thick / 2);
      if (isHorizontal(e)) {
        bucket.add(new THREE.BoxGeometry(len, PARTITION_H, thick), greenWall, mid, PARTITION_H / 2, e.at + offset);
        colliders.push(
          new THREE.Box3(
            new THREE.Vector3(segFrom, 0, e.at + offset - thick / 2),
            new THREE.Vector3(segTo, PARTITION_H, e.at + offset + thick / 2),
          ),
        );
      } else {
        bucket.add(new THREE.BoxGeometry(thick, PARTITION_H, len), greenWall, e.at + offset, PARTITION_H / 2, mid);
        colliders.push(
          new THREE.Box3(
            new THREE.Vector3(e.at + offset - thick / 2, 0, segFrom),
            new THREE.Vector3(e.at + offset + thick / 2, PARTITION_H, segTo),
          ),
        );
      }
    };

    for (const e of edges) {
      if (e.exterior) {
        // Line the building wall with a green panel set IN FRONT of the
        // existing champagne wainscot (inset ~0.17 m) so the salon reads green.
        addWallSegment(e, e.from + 0.02, e.to - 0.02, 0.05, 0.17);
        continue;
      }
      // Interior partition: every interior edge gets a centred doorway.
      // The approach edge uses the zone's partitionGap (or DOOR_W default);
      // secondary interior edges use the standard DOOR_W opening so the
      // salon remains semi-enclosed but accessible from adjacent zones.
      const gap = (approach && e === approach)
        ? (zone.partitionGap ?? DOOR_W)
        : DOOR_W;
      const edgeLen = e.to - e.from;
      // If the gap would consume the entire edge, skip the partition entirely.
      if (gap >= edgeLen - 0.2) continue;
      const c = (e.from + e.to) / 2;
      addWallSegment(e, e.from, c - gap / 2, PARTITION_T);
      addWallSegment(e, c + gap / 2, e.to, PARTITION_T);
      // Champagne door reveal on the jambs.
      for (const s of [-1, 1]) {
        const jx = c + s * gap / 2;
        if (isHorizontal(e)) bucket.add(new THREE.BoxGeometry(0.08, PARTITION_H, PARTITION_T + 0.06), gold, jx, PARTITION_H / 2, e.at + e.inward * PARTITION_T / 2);
        else bucket.add(new THREE.BoxGeometry(PARTITION_T + 0.06, PARTITION_H, 0.08), gold, e.at + e.inward * PARTITION_T / 2, PARTITION_H / 2, jx);
      }
    }

    // Warm gold cove along the top perimeter of the room (all edges).
    for (const e of edges) {
      const yTop = PARTITION_H - 0.12;
      const off = e.inward * 0.12;
      if (isHorizontal(e)) bucket.add(new THREE.BoxGeometry(e.to - e.from - 0.1, 0.1, 0.06), coveMat, (e.from + e.to) / 2, yTop, e.at + off, undefined, false);
      else bucket.add(new THREE.BoxGeometry(0.06, 0.1, e.to - e.from - 0.1), coveMat, e.at + off, yTop, (e.from + e.to) / 2, undefined, false);
    }

    // Feature wall: kintsugi panel on the back wall (edge furthest from approach).
    const back = edges
      .filter((e) => e !== approach)
      .sort((a2, b2) => {
        const ma = isHorizontal(a2) ? a2.at : a2.at;
        const mb = isHorizontal(b2) ? b2.at : b2.at;
        return Math.abs(mb) - Math.abs(ma); // prefer the outer-most wall
      })[0];
    if (back) {
      const panelW = Math.min((back.to - back.from) * 0.5, 1.8);
      const panelH = 1.9;
      const py = 1.15;
      const inwardFace = back.inward * (back.exterior ? 0.2 : PARTITION_T / 2 + 0.02);
      const mid = (back.from + back.to) / 2;
      const muralMat = kit.mural("kintsugi", KINTSUGI_PALETTE);
      if (isHorizontal(back)) {
        bucket.add(new THREE.BoxGeometry(panelW + 0.14, panelH + 0.14, 0.05), goldBrushed, mid, py, back.at + inwardFace);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), muralMat);
        panel.position.set(mid, py, back.at + inwardFace + back.inward * 0.03);
        panel.rotation.y = back.inward > 0 ? 0 : Math.PI;
        group.add(panel);
      } else {
        bucket.add(new THREE.BoxGeometry(0.05, panelH + 0.14, panelW + 0.14), goldBrushed, back.at + inwardFace, py, mid);
        const panel = new THREE.Mesh(new THREE.PlaneGeometry(panelW, panelH), muralMat);
        panel.position.set(back.at + inwardFace + back.inward * 0.03, py, mid);
        panel.rotation.y = back.inward > 0 ? Math.PI / 2 : -Math.PI / 2;
        group.add(panel);
      }
    }



    // Bronze round coffee table at the room centre (nesting pair).
    const tableGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.03, 28);
    bucket.add(tableGeo, bronze, cx, 0.42, cz);
    bucket.add(new THREE.CylinderGeometry(0.03, 0.03, 0.42, 10), bronze, cx, 0.21, cz);
    bucket.add(new THREE.CylinderGeometry(0.24, 0.24, 0.03, 24), bronze, cx + 0.42, 0.5, cz + 0.1);
    bucket.add(new THREE.CylinderGeometry(0.025, 0.025, 0.5, 10), bronze, cx + 0.42, 0.25, cz + 0.1);
    // A soft accent rug beneath the table.
    const rug = new THREE.Mesh(new THREE.CircleGeometry(1.35, 40), kit.carpet(SALON_GREEN_DEEP));
    rug.rotation.x = -Math.PI / 2;
    rug.position.set(cx, 0.02, cz);
    rug.receiveShadow = true;
    group.add(rug);
    void rng;
  }

  bucket.emit(group);
  return { group, colliders };
}
