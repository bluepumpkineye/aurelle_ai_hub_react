/**
 * Material kit — every surface class in the boutique (PRD §2 material
 * fidelity). All PBR, all textured at macro/meso/micro frequencies, zero
 * MeshBasicMaterial. Built once per boutique load from the store seed;
 * per-fixture velvet/metal variation derives from each fixture's own seed.
 */

import * as THREE from "three";
import { Rng } from "../core/Seed";
import {
  generateBrushedMaps,
  generateCarpetMaps,
  generateFabricPanelMaps,
  generateMarbleMaps,
  generatePlasterMaps,
  generateShadowBlob,
  generateVelvetMaps,
} from "./Textures";

export function jitterColor(hex: string, rng: Rng, hueDeg: number, valueJitter: number): THREE.Color {
  const c = new THREE.Color(hex);
  const hsl = { h: 0, s: 0, l: 0 };
  c.getHSL(hsl);
  hsl.h = (hsl.h + rng.range(-hueDeg, hueDeg) / 360 + 1) % 1;
  hsl.l = Math.max(0.02, Math.min(0.96, hsl.l * (1 + rng.range(-valueJitter, valueJitter))));
  c.setHSL(hsl.h, hsl.s, hsl.l);
  return c;
}

export class MaterialKit {
  readonly marbleFloor: THREE.MeshPhysicalMaterial;
  readonly plasterCeiling: THREE.MeshStandardMaterial;
  readonly champagneGold: THREE.MeshStandardMaterial;
  readonly champagneGoldBrushed: THREE.MeshStandardMaterial;
  readonly brushedPlatinum: THREE.MeshStandardMaterial;
  readonly glass: THREE.MeshPhysicalMaterial;
  readonly glassShopfront: THREE.MeshPhysicalMaterial;
  readonly lacquerDark: THREE.MeshPhysicalMaterial;
  readonly lacquerNavy: THREE.MeshPhysicalMaterial;
  readonly mirror: THREE.MeshStandardMaterial;
  readonly shadowBlobTexture: THREE.CanvasTexture;

  private velvetCache = new Map<string, THREE.MeshPhysicalMaterial>();
  private fabricWall = new Map<string, THREE.MeshStandardMaterial>();
  private carpetCache = new Map<string, THREE.MeshStandardMaterial>();
  private marbleCache = new Map<string, THREE.MeshPhysicalMaterial>();
  private readonly rng: Rng;
  private disposables: Array<{ dispose(): void }> = [];
  readonly transmissionEnabled: boolean;

  constructor(seed: Rng, transmissionEnabled = true) {
    this.rng = seed;
    this.transmissionEnabled = transmissionEnabled;

    const marble = generateMarbleMaps(seed.child("floor"), 1024, 4);
    this.marbleFloor = new THREE.MeshPhysicalMaterial({
      map: marble.map,
      roughnessMap: marble.roughnessMap,
      normalMap: marble.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 1,
      metalness: 0.0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.9,
    });

    const plaster = generatePlasterMaps(seed.child("ceiling"));
    this.plasterCeiling = new THREE.MeshStandardMaterial({
      map: plaster.map,
      roughnessMap: plaster.roughnessMap,
      normalMap: plaster.normalMap,
      normalScale: new THREE.Vector2(0.4, 0.4),
      roughness: 1,
      metalness: 0,
    });

    const brushed = generateBrushedMaps(seed.child("metal"));
    this.champagneGold = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#d8b878"),
      metalness: 0.95,
      // roughnessMap multiplies: 0.35 × map(≈0.4) ≈ brand-standard 0.15 with micro variance
      roughness: 0.35,
      roughnessMap: brushed.roughnessMap,
      envMapIntensity: 1.15,
    });
    this.champagneGoldBrushed = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#cfae74"),
      metalness: 0.95,
      roughness: 0.8,
      roughnessMap: brushed.roughnessMap,
      normalMap: brushed.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      envMapIntensity: 1.0,
    });
    this.brushedPlatinum = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#d9dade"),
      metalness: 0.9,
      roughness: 0.85,
      roughnessMap: brushed.roughnessMap,
      normalMap: brushed.normalMap,
      normalScale: new THREE.Vector2(0.45, 0.45),
      envMapIntensity: 1.0,
    });

    // Museum-grade low-iron case glass: IOR 1.52, green cast suppressed.
    // On iGPU presets the transmission pass (a full extra scene render) is
    // replaced by fresnel-transparent glass — documented in DEVIATIONS.md.
    this.glass = transmissionEnabled
      ? new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#fbfdff"),
          metalness: 0,
          roughness: 0.035,
          transmission: 1,
          ior: 1.52,
          thickness: 0.012,
          transparent: true,
          envMapIntensity: 1.3,
          side: THREE.DoubleSide,
          depthWrite: false,
        })
      : new THREE.MeshPhysicalMaterial({
          color: new THREE.Color("#f4f9fc"),
          metalness: 0,
          roughness: 0.04,
          ior: 1.52,
          transparent: true,
          opacity: 0.14,
          envMapIntensity: 1.5,
          side: THREE.DoubleSide,
          depthWrite: false,
        });

    // Shopfront glazing: large area — cheaper transparent reflection, no transmission pass.
    this.glassShopfront = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#eef4f8"),
      metalness: 0,
      roughness: 0.05,
      transparent: true,
      opacity: 0.16,
      envMapIntensity: 1.4,
      side: THREE.DoubleSide,
      depthWrite: false,
    });

    this.lacquerDark = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#211f1e"),
      metalness: 0.1,
      roughness: 0.32,
      roughnessMap: brushed.roughnessMap,
      clearcoat: 0.85,
      clearcoatRoughness: 0.12,
      envMapIntensity: 0.9,
    });
    this.lacquerNavy = new THREE.MeshPhysicalMaterial({
      color: new THREE.Color("#182036"),
      metalness: 0.08,
      roughness: 0.34,
      roughnessMap: brushed.roughnessMap,
      clearcoat: 0.8,
      clearcoatRoughness: 0.14,
      envMapIntensity: 0.9,
    });

    this.mirror = new THREE.MeshStandardMaterial({
      color: new THREE.Color("#cfd4d8"),
      metalness: 1,
      roughness: 0.04,
      envMapIntensity: 1.6,
    });

    this.shadowBlobTexture = generateShadowBlob();

    this.disposables.push(
      marble.map,
      marble.roughnessMap,
      marble.normalMap,
      plaster.map,
      plaster.roughnessMap,
      plaster.normalMap,
      brushed.map,
      brushed.roughnessMap,
      brushed.normalMap,
      this.shadowBlobTexture,
      this.marbleFloor,
      this.plasterCeiling,
      this.champagneGold,
      this.champagneGoldBrushed,
      this.brushedPlatinum,
      this.glass,
      this.glassShopfront,
      this.lacquerDark,
      this.lacquerNavy,
      this.mirror,
    );
  }

  /**
   * Boutique-local floor stone: same veining algorithm, per-boutique tint set
   * (BoutiqueTheme.marble). Cached by theme key across boutique switches.
   * Counter tops keep the default `marbleFloor` — brand-standard stone.
   */
  marbleThemed(
    tints: { field: string; cloud: string; vein: string; goldVein: string },
    key: string,
  ): THREE.MeshPhysicalMaterial {
    const cached = this.marbleCache.get(key);
    if (cached) return cached;
    const maps = generateMarbleMaps(this.rng.child(`floor-${key}`), 1024, 4, tints);
    const m = new THREE.MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.roughnessMap,
      normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(0.35, 0.35),
      roughness: 1,
      metalness: 0,
      clearcoat: 0.55,
      clearcoatRoughness: 0.22,
      envMapIntensity: 0.9,
    });
    this.marbleCache.set(key, m);
    this.disposables.push(maps.map, maps.roughnessMap, maps.normalMap, m);
    return m;
  }

  /**
   * Velvet with per-instance variation (PRD §4 per-instance law): the same
   * zone palette, jittered per fixture seed. Cached per resolved color.
   */
  velvet(baseColor: string, instanceRng: Rng, hueDeg: number, valueJitter: number): THREE.MeshPhysicalMaterial {
    const color = jitterColor(baseColor, instanceRng, hueDeg, valueJitter);
    const key = color.getHexString();
    const cached = this.velvetCache.get(key);
    if (cached) return cached;
    const maps = generateVelvetMaps(this.rng.child(`velvet-${key}`), `#${key}`);
    const m = new THREE.MeshPhysicalMaterial({
      map: maps.map,
      roughnessMap: maps.roughnessMap,
      normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(0.7, 0.7),
      roughness: 1,
      metalness: 0,
      sheen: 1,
      sheenRoughness: 0.55,
      sheenColor: color.clone().multiplyScalar(1.5),
      envMapIntensity: 0.35,
    });
    this.velvetCache.set(key, m);
    this.disposables.push(maps.map, maps.roughnessMap, maps.normalMap, m);
    return m;
  }

  fabricWallPanel(baseColor: string): THREE.MeshStandardMaterial {
    const cached = this.fabricWall.get(baseColor);
    if (cached) return cached;
    const maps = generateFabricPanelMaps(this.rng.child(`fabric-${baseColor}`), baseColor);
    const m = new THREE.MeshStandardMaterial({
      map: maps.map,
      roughnessMap: maps.roughnessMap,
      normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(0.5, 0.5),
      roughness: 1,
      metalness: 0,
    });
    this.fabricWall.set(baseColor, m);
    this.disposables.push(maps.map, maps.roughnessMap, maps.normalMap, m);
    return m;
  }

  carpet(baseColor: string): THREE.MeshStandardMaterial {
    const cached = this.carpetCache.get(baseColor);
    if (cached) return cached;
    const maps = generateCarpetMaps(this.rng.child(`carpet-${baseColor}`), baseColor);
    const m = new THREE.MeshStandardMaterial({
      map: maps.map,
      roughnessMap: maps.roughnessMap,
      normalMap: maps.normalMap,
      normalScale: new THREE.Vector2(0.8, 0.8),
      roughness: 1,
      metalness: 0,
    });
    this.carpetCache.set(baseColor, m);
    this.disposables.push(maps.map, maps.roughnessMap, maps.normalMap, m);
    return m;
  }

  metalFor(finish: "champagne-gold" | "brushed-platinum", polished: boolean): THREE.MeshStandardMaterial {
    if (finish === "champagne-gold") return polished ? this.champagneGold : this.champagneGoldBrushed;
    return this.brushedPlatinum;
  }

  dispose(): void {
    for (const d of this.disposables) d.dispose();
    this.disposables = [];
    this.velvetCache.clear();
    this.fabricWall.clear();
    this.carpetCache.clear();
    this.marbleCache.clear();
  }
}
