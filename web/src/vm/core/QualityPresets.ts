/**
 * Quality presets (PRD §6): 60 fps on discrete-GPU workstations, 30 fps on
 * iGPU laptops for field use. The dominant iGPU costs in a forward renderer
 * are per-pixel light evaluation and the physical-glass transmission pass —
 * both scale with the preset. Override with ?quality=high|balanced|igpu.
 */

export interface QualityConfig {
  name: "high" | "balanced" | "igpu";
  pixelRatio: number;
  /** Active LED spots across the floor (candidates are priority-sorted). */
  maxSpots: number;
  maxShadowCasters: number;
  /** Per-showcase interior point fills (emissive baffles remain regardless). */
  caseFillLights: boolean;
  /** Physical glass transmission (extra full-scene pass) vs. fresnel-transparent. */
  transmission: boolean;
  bloomStrength: number;
}

const PRESETS: Record<QualityConfig["name"], QualityConfig> = {
  high: {
    name: "high",
    pixelRatio: 2,
    maxSpots: 32,
    maxShadowCasters: 6,
    caseFillLights: true,
    transmission: true,
    bloomStrength: 0.35,
  },
  balanced: {
    name: "balanced",
    pixelRatio: 1.5,
    maxSpots: 18,
    maxShadowCasters: 4,
    caseFillLights: true,
    transmission: false,
    bloomStrength: 0.3,
  },
  igpu: {
    name: "igpu",
    pixelRatio: 1,
    maxSpots: 8,
    maxShadowCasters: 2,
    caseFillLights: false,
    transmission: false,
    bloomStrength: 0.25,
  },
};

interface AdapterInfoLike {
  vendor?: string;
  architecture?: string;
  description?: string;
}

export async function detectQuality(): Promise<QualityConfig> {
  const override = new URLSearchParams(window.location.search).get("quality");
  if (override && override in PRESETS) return PRESETS[override as QualityConfig["name"]];

  try {
    const gpu = (navigator as Navigator & {
      gpu?: { requestAdapter: () => Promise<{ info?: AdapterInfoLike } | null> };
    }).gpu;
    const adapter = await gpu?.requestAdapter();
    const info = adapter?.info;
    const sig = `${info?.vendor ?? ""} ${info?.architecture ?? ""} ${info?.description ?? ""}`.toLowerCase();
    // Integrated / mobile-class adapters → field preset.
    if (/intel|gen-|qualcomm|adreno|mali|arm|swiftshader|llvmpipe/.test(sig)) return PRESETS.igpu;
    // Apple silicon is closer to a discrete tier but benefits from fewer pixels.
    if (/apple/.test(sig)) return PRESETS.balanced;
    return PRESETS.high;
  } catch {
    return PRESETS.balanced;
  }
}

export function presetByName(name: QualityConfig["name"]): QualityConfig {
  return PRESETS[name];
}
