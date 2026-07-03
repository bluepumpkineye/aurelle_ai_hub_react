/**
 * Browser gate for the WebGPU engine. There is no WebGL fallback by design:
 * the engine is built and tested against Chrome's WebGPU implementation
 * (Chrome 113+ on desktop). Everything else fails loudly with diagnostics.
 */

export type GateVerdict =
  | { kind: "ok"; adapterInfo: string; chromeVersion: number | null }
  | { kind: "mobile" }
  | { kind: "not-chrome"; browserName: string }
  | { kind: "chrome-too-old"; chromeVersion: number }
  | {
      kind: "no-webgpu";
      chromeVersion: number | null;
      /** Why the probe failed, in order of what we learned. */
      diagnostics: string[];
    };

interface GPUAdapterLike {
  info?: { vendor?: string; architecture?: string; device?: string; description?: string };
  requestAdapterInfo?: () => Promise<{ vendor?: string; description?: string }>;
}

interface NavigatorGPULike {
  requestAdapter: (options?: {
    powerPreference?: "low-power" | "high-performance";
  }) => Promise<GPUAdapterLike | null>;
}

export function detectMobile(): boolean {
  const ua = navigator.userAgent;
  const uaMobile =
    /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini|Mobile/i.test(ua) ||
    // iPadOS 13+ masquerades as macOS but reports touch points
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const coarse = window.matchMedia?.("(pointer: coarse) and (max-width: 1024px)").matches ?? false;
  return uaMobile || coarse;
}

export function detectChromeVersion(): number | null {
  // Chromium browsers expose userAgentData brands; fall back to UA sniffing.
  const nav = navigator as Navigator & {
    userAgentData?: { brands: Array<{ brand: string; version: string }> };
  };
  const brands = nav.userAgentData?.brands;
  if (brands) {
    const chrome = brands.find((b) => /Google Chrome|Chromium/i.test(b.brand));
    if (chrome) return parseInt(chrome.version, 10);
  }
  const m = navigator.userAgent.match(/Chrom(?:e|ium)\/(\d+)/);
  if (m) return parseInt(m[1], 10);
  return null;
}

export function detectBrowserName(): string {
  const ua = navigator.userAgent;
  if (/Edg\//.test(ua)) return "Microsoft Edge";
  if (/OPR\//.test(ua)) return "Opera";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Chrom(e|ium)\//.test(ua)) return "Chromium";
  if (/Safari\//.test(ua) && /Apple/.test(navigator.vendor ?? "")) return "Safari";
  return "your browser";
}

export async function runBrowserGate(nogate: boolean): Promise<GateVerdict> {
  const chromeVersion = detectChromeVersion();

  if (!nogate) {
    if (detectMobile()) return { kind: "mobile" };

    const isChromium = /Chrom(e|ium)\//.test(navigator.userAgent);
    if (!isChromium) return { kind: "not-chrome", browserName: detectBrowserName() };

    if (chromeVersion !== null && chromeVersion < 113) {
      return { kind: "chrome-too-old", chromeVersion };
    }
  }

  // WebGPU probe — must run on a secure context (localhost counts).
  const diagnostics: string[] = [];
  if (!window.isSecureContext) {
    diagnostics.push(
      "This page is not a secure context. WebGPU only exists on https:// or localhost.",
    );
  }

  const gpu = (navigator as Navigator & { gpu?: NavigatorGPULike }).gpu;
  if (!gpu) {
    diagnostics.push("navigator.gpu is undefined — the browser does not expose WebGPU.");
    return { kind: "no-webgpu", chromeVersion, diagnostics };
  }

  try {
    let adapter = await gpu.requestAdapter({ powerPreference: "high-performance" });
    if (!adapter) {
      diagnostics.push("High-performance adapter request returned null; retrying default.");
      adapter = await gpu.requestAdapter();
    }
    if (!adapter) {
      diagnostics.push(
        "navigator.gpu.requestAdapter() returned null — no usable GPU adapter. " +
          "This usually means hardware acceleration is disabled or the GPU is blocklisted.",
      );
      return { kind: "no-webgpu", chromeVersion, diagnostics };
    }
    let info = "GPU adapter acquired";
    const ai = adapter.info;
    if (ai && (ai.vendor || ai.description || ai.architecture)) {
      info = [ai.vendor, ai.architecture, ai.description].filter(Boolean).join(" · ");
    } else if (adapter.requestAdapterInfo) {
      try {
        const r = await adapter.requestAdapterInfo();
        info = [r.vendor, r.description].filter(Boolean).join(" · ") || info;
      } catch {
        /* adapter info is optional */
      }
    }
    return { kind: "ok", adapterInfo: info, chromeVersion };
  } catch (e) {
    diagnostics.push(`requestAdapter() threw: ${e instanceof Error ? e.message : String(e)}`);
    return { kind: "no-webgpu", chromeVersion, diagnostics };
  }
}

/** The exact things to check, surfaced on the fail-loud diagnostics panel. */
export const WEBGPU_CHECKLIST: string[] = [
  "Update Google Chrome to version 113 or newer (Menu → Help → About Google Chrome).",
  "Enable hardware acceleration: Settings → System → “Use graphics acceleration when available”, then relaunch.",
  "Open chrome://gpu and confirm “WebGPU: Hardware accelerated”. If it reads “Disabled”, your GPU or driver may be blocklisted — update the GPU driver.",
  "If you are on a laptop with two GPUs, force Chrome onto the discrete GPU in your OS graphics settings.",
  "Corporate policies or extensions can disable WebGPU — try a clean Chrome profile.",
];
