/**
 * GeometryBucket — accumulates transformed geometry per (material, castShadow)
 * and emits one merged mesh per bucket. Static architecture and fixtures are
 * merged aggressively: draw calls, not triangles, bound the iGPU frame
 * (PRD §6 performance).
 */

import * as THREE from "three";
import { mergeGeometries } from "three/addons/utils/BufferGeometryUtils.js";

export interface Euler3 {
  rx?: number;
  ry?: number;
  rz?: number;
}

export class GeometryBucket {
  private parts = new Map<
    string,
    { material: THREE.Material; cast: boolean; geos: THREE.BufferGeometry[] }
  >();
  private matIds = new Map<THREE.Material, number>();

  add(
    geo: THREE.BufferGeometry,
    material: THREE.Material,
    x: number,
    y: number,
    z: number,
    rot?: Euler3,
    cast = true,
  ): void {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(x, y, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(rot?.rx ?? 0, rot?.ry ?? 0, rot?.rz ?? 0)),
      new THREE.Vector3(1, 1, 1),
    );
    geo.applyMatrix4(m);
    let id = this.matIds.get(material);
    if (id === undefined) {
      id = this.matIds.size;
      this.matIds.set(material, id);
    }
    const key = `${id}:${cast ? 1 : 0}`;
    let entry = this.parts.get(key);
    if (!entry) {
      entry = { material, cast, geos: [] };
      this.parts.set(key, entry);
    }
    entry.geos.push(geo);
  }

  emit(group: THREE.Group): void {
    for (const { material, cast, geos } of this.parts.values()) {
      const merged = geos.length === 1 ? geos[0] : mergeGeometries(geos, false);
      if (!merged) continue;
      if (geos.length > 1) for (const g of geos) g.dispose();
      const mesh = new THREE.Mesh(merged, material);
      mesh.castShadow = cast;
      mesh.receiveShadow = true;
      group.add(mesh);
    }
    this.parts.clear();
    this.matIds.clear();
  }
}
