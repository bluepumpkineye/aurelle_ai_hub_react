/**
 * Analytics & signal overlays in 3D — revenue/m² heat map (floor-projected),
 * traffic-flow Bézier arcs, dwell rings, adjacency warning arcs, assortment-
 * gap alert cards, zone boundaries + labels, low-stock/critical/campaign slot
 * signals, planogram diff markers. All layerable without z-fighting: floor
 * projections get small y offsets + no depth write; labels are depth-test-
 * free billboards (STATUS gotcha honored).
 */

import * as THREE from "three";
import { CATEGORY_LABELS } from "../data/catalog";
import type { AnalyticsResult, PlanogramDiff, SlotKey, ZoneConfig } from "../data/types";
import { polygonCentroid, slotKey } from "../data/types";
import type { OverlayState, VMStore } from "../store/VMStore";
import { disposeSprite, makeTextSprite } from "../render/Labels";

type AnchorLookup = (key: SlotKey) => THREE.Vector3 | null;

function heatColor(t: number): THREE.Color {
  // Brand ramp: deep navy → champagne gold → bordeaux.
  const navy = new THREE.Color("#1c2740");
  const gold = new THREE.Color("#c9a45e");
  const bordeaux = new THREE.Color("#8b1a2b");
  return t < 0.5 ? navy.clone().lerp(gold, t * 2) : gold.clone().lerp(bordeaux, (t - 0.5) * 2);
}

function shapeFromPolygon(poly: Array<[number, number]>): THREE.ShapeGeometry {
  const shape = new THREE.Shape();
  poly.forEach(([x, z], i) => {
    if (i === 0) shape.moveTo(x, -z);
    else shape.lineTo(x, -z);
  });
  shape.closePath();
  return new THREE.ShapeGeometry(shape);
}

interface PulseEntry {
  mesh: THREE.Mesh;
  material: THREE.MeshStandardMaterial;
  kind: "low" | "critical" | "campaign";
}

export class Overlays3D {
  readonly group = new THREE.Group();

  private heatmapGroup = new THREE.Group();
  private trafficGroup = new THREE.Group();
  private dwellGroup = new THREE.Group();
  private adjacencyGroup = new THREE.Group();
  private zonesGroup = new THREE.Group();
  private gapsGroup = new THREE.Group();
  private stockGroup = new THREE.Group();
  private diffGroup = new THREE.Group();
  private pulses: PulseEntry[] = [];
  private heatmapMaterials: THREE.MeshStandardMaterial[] = [];
  private disposables: Array<{ dispose(): void }> = [];

  constructor(private readonly store: VMStore) {
    this.group.name = "overlays";
    for (const g of [
      this.heatmapGroup,
      this.trafficGroup,
      this.dwellGroup,
      this.adjacencyGroup,
      this.zonesGroup,
      this.gapsGroup,
      this.stockGroup,
      this.diffGroup,
    ]) {
      this.group.add(g);
    }
  }

  private clearGroup(g: THREE.Group): void {
    for (const child of [...g.children]) {
      child.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose());
          else o.material.dispose();
        }
        if (o instanceof THREE.Sprite) disposeSprite(o);
        if (o instanceof THREE.Line) {
          o.geometry.dispose();
          (o.material as THREE.Material).dispose();
        }
      });
      g.remove(child);
    }
  }

  /** Rebuild all analytics-driven layers (cheap — a few dozen meshes). */
  rebuildAnalytics(analytics: AnalyticsResult): void {
    const layout = this.store.layout;
    const zoneById = new Map(layout.zones.map((z) => [z.id, z] as [string, ZoneConfig]));

    // ── Heat map ──
    this.clearGroup(this.heatmapGroup);
    this.heatmapMaterials = [];
    const maxRev = Math.max(1, ...analytics.zones.map((z) => z.revenuePerSqm));
    for (const za of analytics.zones) {
      const zone = zoneById.get(za.zoneId);
      if (!zone) continue;
      const geo = shapeFromPolygon(zone.polygon);
      const mat = new THREE.MeshStandardMaterial({
        color: heatColor(za.revenuePerSqm / maxRev),
        emissive: heatColor(za.revenuePerSqm / maxRev),
        emissiveIntensity: 0.55,
        roughness: 1,
        transparent: true,
        opacity: this.store.overlays.heatmapOpacity,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.position.y = 0.02;
      mesh.renderOrder = 10;
      this.heatmapGroup.add(mesh);
      this.heatmapMaterials.push(mat);
      const [cx, cz] = polygonCentroid(zone.polygon);
      const label = makeTextSprite(`€${za.revenuePerSqm.toLocaleString()}/m²`, { size: 26 });
      label.position.set(cx, 0.55, cz);
      this.heatmapGroup.add(label);
    }

    // ── Traffic flow arcs ──
    this.clearGroup(this.trafficGroup);
    for (const path of analytics.paths) {
      const [a, m, b] = path.points;
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(a[0], 0.12, a[1]),
        new THREE.Vector3(m[0], 0.9 + path.intensity * 0.7, m[1]),
        new THREE.Vector3(b[0], 0.12, b[1]),
      );
      const geo = new THREE.TubeGeometry(curve, 32, 0.02 + path.intensity * 0.05, 8, false);
      const mat = new THREE.MeshStandardMaterial({
        color: new THREE.Color("#d99c3c"),
        emissive: new THREE.Color("#e8a83e"),
        emissiveIntensity: 1.3,
        roughness: 0.6,
        transparent: true,
        opacity: 0.35 + path.intensity * 0.55,
        depthWrite: false,
      });
      const tube = new THREE.Mesh(geo, mat);
      tube.renderOrder = 12;
      this.trafficGroup.add(tube);
      // Entry/exit node markers
      for (const [px, pz] of [a, b]) {
        const node = new THREE.Mesh(
          new THREE.CylinderGeometry(0.09, 0.09, 0.02, 20),
          new THREE.MeshStandardMaterial({
            color: new THREE.Color("#e8a83e"),
            emissive: new THREE.Color("#e8a83e"),
            emissiveIntensity: 1.2,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
          }),
        );
        node.position.set(px, 0.03, pz);
        node.renderOrder = 12;
        this.trafficGroup.add(node);
      }
    }

    // ── Dwell rings ──
    this.clearGroup(this.dwellGroup);
    const maxDwell = Math.max(1, ...analytics.zones.map((z) => z.dwellSeconds));
    for (const za of analytics.zones) {
      const zone = zoneById.get(za.zoneId);
      if (!zone) continue;
      const [cx, cz] = polygonCentroid(zone.polygon);
      const r = 0.5 + (za.dwellSeconds / maxDwell) * 1.3;
      const ring = new THREE.Mesh(
        new THREE.TorusGeometry(r, 0.025, 8, 48),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(zone.color),
          emissive: new THREE.Color(zone.color),
          emissiveIntensity: 0.9,
          transparent: true,
          opacity: 0.75,
          depthWrite: false,
        }),
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.set(cx, 0.05, cz);
      ring.renderOrder = 11;
      this.dwellGroup.add(ring);
      const label = makeTextSprite(`${Math.round(za.dwellSeconds)}s dwell`, { size: 22 });
      label.position.set(cx, 0.32, cz + r * 0.4);
      this.dwellGroup.add(label);
    }

    // ── Adjacency violations ──
    this.clearGroup(this.adjacencyGroup);
    for (const v of analytics.adjacency) {
      const za = zoneById.get(v.zoneA);
      const zb = zoneById.get(v.zoneB);
      if (!za || !zb) continue;
      const [ax, az] = polygonCentroid(za.polygon);
      const [bx, bz] = polygonCentroid(zb.polygon);
      const color = v.severity === "flag" ? "#c23a3a" : "#d9873c";
      const curve = new THREE.QuadraticBezierCurve3(
        new THREE.Vector3(ax, 1.4, az),
        new THREE.Vector3((ax + bx) / 2, 2.6, (az + bz) / 2),
        new THREE.Vector3(bx, 1.4, bz),
      );
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 24, 0.022, 8, false),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          emissive: new THREE.Color(color),
          emissiveIntensity: 1.4,
          transparent: true,
          opacity: 0.9,
          depthWrite: false,
        }),
      );
      tube.renderOrder = 13;
      this.adjacencyGroup.add(tube);
      const warn = makeTextSprite(`⚠ ${v.severity === "flag" ? "Adjacency conflict" : "Adjacency advisory"}`, {
        size: 22,
        borderColor: color,
      });
      warn.position.set((ax + bx) / 2, 2.85, (az + bz) / 2);
      this.adjacencyGroup.add(warn);
    }

    // ── Zone boundaries + labels ──
    this.clearGroup(this.zonesGroup);
    for (const zone of layout.zones) {
      const pts = zone.polygon.map(([x, z]) => new THREE.Vector3(x, 0.035, z));
      pts.push(pts[0].clone());
      const lineGeo = new THREE.BufferGeometry().setFromPoints(pts);
      const line = new THREE.Line(
        lineGeo,
        new THREE.LineBasicMaterial({ color: new THREE.Color(zone.color), transparent: true, opacity: 0.9 }),
      );
      line.renderOrder = 11;
      this.zonesGroup.add(line);
      const [cx, cz] = polygonCentroid(zone.polygon);
      const label = makeTextSprite(zone.name, { size: 28, bold: true, serif: true });
      label.position.set(cx, 2.2, cz);
      this.zonesGroup.add(label);
    }

    // ── Assortment gap alert cards ──
    this.clearGroup(this.gapsGroup);
    const byZone = new Map<string, typeof analytics.gaps>();
    for (const gap of analytics.gaps) {
      const list = byZone.get(gap.zoneId) ?? [];
      list.push(gap);
      byZone.set(gap.zoneId, list);
    }
    for (const [zoneId, gaps] of byZone) {
      const zone = zoneById.get(zoneId);
      if (!zone) continue;
      const [cx, cz] = polygonCentroid(zone.polygon);
      // Connector stem
      const stem = new THREE.Mesh(
        new THREE.CylinderGeometry(0.008, 0.008, 1.5, 6),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color("#d9873c"),
          emissive: new THREE.Color("#d9873c"),
          emissiveIntensity: 0.8,
          transparent: true,
          opacity: 0.6,
        }),
      );
      stem.position.set(cx + 0.9, 0.75, cz + 0.6);
      this.gapsGroup.add(stem);
      gaps.slice(0, 4).forEach((gap, i) => {
        const card = makeTextSprite(
          `▲ ${CATEGORY_LABELS[gap.category]} ${gap.actual}/${gap.expected}`,
          { size: 22, borderColor: "#d9873c", background: "rgba(48,30,10,0.88)" },
        );
        card.position.set(cx + 0.9, 1.6 + i * 0.34, cz + 0.6);
        this.gapsGroup.add(card);
      });
    }
  }

  /** Rebuild slot-level signals (low-stock pulse, critical, campaign). */
  rebuildStockSignals(anchor: AnchorLookup): void {
    this.clearGroup(this.stockGroup);
    this.pulses = [];
    for (const f of this.store.layout.fixtures) {
      for (const key of this.store.slotKeysForFixture(f.id)) {
        const s = this.store.slot(key);
        if (!s?.sku) continue;
        const pos = anchor(key);
        if (!pos) continue;
        const isCritical = s.stockLevel <= 0;
        const isLow = s.stockLevel < 20;
        if (isCritical || isLow) {
          const color = isCritical ? "#d13a3a" : "#e2a13c";
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color(color),
            emissive: new THREE.Color(color),
            emissiveIntensity: 1.6,
            transparent: true,
            opacity: 0.9,
            depthWrite: false,
          });
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.055, 0.008, 6, 28), mat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(pos).y += 0.01;
          ring.renderOrder = 14;
          this.stockGroup.add(ring);
          this.pulses.push({ mesh: ring, material: mat, kind: isCritical ? "critical" : "low" });
        } else if (s.campaignFlag) {
          const mat = new THREE.MeshStandardMaterial({
            color: new THREE.Color("#c9a45e"),
            emissive: new THREE.Color("#e9cf9c"),
            emissiveIntensity: 0.9,
            transparent: true,
            opacity: 0.85,
            depthWrite: false,
          });
          const ring = new THREE.Mesh(new THREE.TorusGeometry(0.05, 0.006, 6, 28), mat);
          ring.rotation.x = -Math.PI / 2;
          ring.position.copy(pos).y += 0.008;
          ring.renderOrder = 14;
          this.stockGroup.add(ring);
          this.pulses.push({ mesh: ring, material: mat, kind: "campaign" });
        }
      }
    }
  }

  /** Planogram diff markers: green added / red removed / amber changed / blue moved. */
  showDiff(diffs: PlanogramDiff[] | null, anchor: AnchorLookup): void {
    this.clearGroup(this.diffGroup);
    if (!diffs) return;
    const colors: Record<PlanogramDiff["kind"], string> = {
      added: "#3f9c5c",
      removed: "#c23a3a",
      changed: "#d9873c",
      moved: "#3c7bd9",
    };
    for (const d of diffs) {
      const pos = anchor(slotKey(d.slot));
      if (!pos) continue;
      const color = colors[d.kind];
      const marker = new THREE.Mesh(
        new THREE.OctahedronGeometry(0.045, 0),
        new THREE.MeshStandardMaterial({
          color: new THREE.Color(color),
          emissive: new THREE.Color(color),
          emissiveIntensity: 1.6,
          transparent: true,
          opacity: 0.95,
          depthWrite: false,
        }),
      );
      marker.position.copy(pos).y += 0.14;
      marker.renderOrder = 15;
      this.diffGroup.add(marker);
    }
  }

  applyVisibility(o: OverlayState): void {
    this.heatmapGroup.visible = o.heatmap;
    this.trafficGroup.visible = o.traffic;
    this.dwellGroup.visible = o.dwell;
    this.adjacencyGroup.visible = o.adjacency;
    this.zonesGroup.visible = o.zones;
    this.gapsGroup.visible = o.gaps;
    this.stockGroup.visible = o.stock;
    for (const m of this.heatmapMaterials) m.opacity = o.heatmapOpacity;
  }

  /** Breathe: pulses animate every frame (Pillar F — the plan is live). */
  updateFrame(elapsed: number): void {
    if (!this.stockGroup.visible) return;
    for (const p of this.pulses) {
      if (p.kind === "campaign") continue;
      const speed = p.kind === "critical" ? 5.2 : 3.0;
      const s = 1 + Math.sin(elapsed * speed) * 0.22;
      p.mesh.scale.set(s, s, 1);
      p.material.emissiveIntensity = 1.2 + (Math.sin(elapsed * speed) * 0.5 + 0.5) * 1.4;
    }
    // Diff markers slowly rotate for visibility.
    for (const m of this.diffGroup.children) m.rotation.y = elapsed * 1.4;
  }

  dispose(): void {
    for (const g of [
      this.heatmapGroup,
      this.trafficGroup,
      this.dwellGroup,
      this.adjacencyGroup,
      this.zonesGroup,
      this.gapsGroup,
      this.stockGroup,
      this.diffGroup,
    ]) {
      this.clearGroup(g);
    }
    for (const d of this.disposables) d.dispose();
  }
}
