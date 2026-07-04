/**
 * Engine — WebGPU renderer initialization (fail-loud, no WebGL fallback by
 * design), render pipeline with the Aurelle post stack, frame loop and HUD
 * statistics. The browser gate has already validated the adapter before this
 * module is instantiated; anything unexpected here still throws with
 * actionable diagnostics.
 */

import * as THREE from "three";
import { RenderPipeline, WebGPURenderer } from "three/webgpu";
import { bloom } from "three/addons/tsl/display/BloomNode.js";
import { dot, float, mix, pass, screenUV, smoothstep, vec2, vec3, vec4 } from "three/tsl";
import type { QualityConfig } from "./QualityPresets";

export class WebGPUInitError extends Error {
  constructor(
    message: string,
    readonly diagnostics: string[],
  ) {
    super(message);
    this.name = "WebGPUInitError";
  }
}

export interface EngineStats {
  fps: number;
  frameMs: number;
  frameMsP95: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  vramEstimateMB: number;
  backend: string;
}

export class Engine {
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  renderer!: WebGPURenderer;
  private pipeline: RenderPipeline | null = null;
  private frameCallbacks = new Set<(dt: number, elapsed: number) => void>();
  private clock = new THREE.Clock();
  private frameTimes: number[] = [];
  private fpsWindow: number[] = [];
  private disposed = false;
  private resizeObserver: ResizeObserver | null = null;

  constructor(
    private readonly container: HTMLElement,
    private readonly quality: QualityConfig,
  ) {
    this.camera = new THREE.PerspectiveCamera(52, 1, 0.05, 200);
    this.camera.position.set(0, 1.6, 6);
  }

  async init(): Promise<void> {
    const renderer = new WebGPURenderer({
      antialias: true,
      // No WebGL path by design — if WebGPU is unavailable the gate has
      // already failed loudly; this flag keeps three from silently degrading.
      forceWebGL: false,
    });
    try {
      await renderer.init();
    } catch (e) {
      throw new WebGPUInitError("WebGPU renderer initialization failed.", [
        e instanceof Error ? e.message : String(e),
        "The GPU adapter was acquired but device creation failed — check chrome://gpu for driver blocklist entries.",
      ]);
    }

    const backend = (renderer.backend as { isWebGPUBackend?: boolean }).isWebGPUBackend
      ? "WebGPU"
      : "WebGL2";
    if (backend !== "WebGPU") {
      renderer.dispose();
      throw new WebGPUInitError(
        "three.js selected the WebGL backend — the Aurelle engine is WebGPU-only by design.",
        [
          "navigator.gpu was present but the WebGPU device was refused.",
          "Verify chrome://gpu reports “WebGPU: Hardware accelerated”.",
          "Update your GPU driver and relaunch Chrome.",
        ],
      );
    }

    this.renderer = renderer;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.quality.pixelRatio));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.32;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    // Shadow maps render on demand per light (LightingEngine.requestShadowUpdate)
    // — the WebGPU ShadowNode honors light.shadow.autoUpdate/needsUpdate.
    renderer.domElement.style.display = "block";
    renderer.domElement.style.width = "100%";
    renderer.domElement.style.height = "100%";
    this.container.appendChild(renderer.domElement);

    this.buildPostStack();

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(this.container);
    this.resize();

    renderer.setAnimationLoop(() => this.frame());
  }

  /**
   * Aurelle post stack: HDR bloom on the 2900 K spot highlights, warm-key /
   * cool-shadow split toning, restrained vignette, ACES at output.
   */
  private buildPostStack(): void {
    const scenePass = pass(this.scene, this.camera);
    const color = scenePass.getTextureNode();

    const bloomPass = bloom(color, this.quality.bloomStrength, 0.4, 0.82);
    const rgb = color.add(bloomPass).rgb;

    // Split toning: warm highlights (champagne), cool-neutral shadows.
    const lum = dot(rgb, vec3(0.2126, 0.7152, 0.0722));
    const t = smoothstep(0.15, 0.85, lum);
    const shadowTint = vec3(0.965, 0.985, 1.05);
    const highlightTint = vec3(1.05, 1.0, 0.93);
    const tint = mix(shadowTint, highlightTint, t);

    // Restrained vignette.
    const d = screenUV.sub(vec2(0.5, 0.5));
    const vig = float(1.0).sub(dot(d, d).mul(0.42));
    const finalColor = vec4(rgb.mul(tint).mul(vig), float(1.0));

    this.pipeline = new RenderPipeline(this.renderer, finalColor);
  }

  onFrame(fn: (dt: number, elapsed: number) => void): () => void {
    this.frameCallbacks.add(fn);
    return () => this.frameCallbacks.delete(fn);
  }

  private frame(): void {
    if (this.disposed) return;
    const dt = Math.min(this.clock.getDelta(), 0.1);
    const elapsed = this.clock.elapsedTime;
    const t0 = performance.now();
    for (const fn of this.frameCallbacks) fn(dt, elapsed);
    if (this.pipeline) this.pipeline.render();
    else this.renderer.render(this.scene, this.camera);
    const ms = performance.now() - t0;
    this.frameTimes.push(ms);
    if (this.frameTimes.length > 120) this.frameTimes.shift();
    this.fpsWindow.push(t0);
    while (this.fpsWindow.length && t0 - this.fpsWindow[0] > 1000) this.fpsWindow.shift();
  }

  private resize(): void {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h, false);
  }

  stats(): EngineStats {
    const info = this.renderer.info;
    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const avg = sorted.length ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
    const p95 = sorted.length ? sorted[Math.floor(sorted.length * 0.95)] : 0;
    // Rough VRAM estimate: textures at ~1.4 MB avg (mip'd 512²) + geometry buffers.
    const vram = info.memory.textures * 1.4 + info.memory.geometries * 0.15;
    return {
      fps: this.fpsWindow.length,
      frameMs: avg,
      frameMsP95: p95,
      drawCalls: info.render.drawCalls,
      triangles: info.render.triangles,
      geometries: info.memory.geometries,
      textures: info.memory.textures,
      vramEstimateMB: Math.round(vram),
      backend: "WebGPU",
    };
  }

  dispose(): void {
    this.disposed = true;
    this.resizeObserver?.disconnect();
    this.renderer?.setAnimationLoop(null);
    this.frameCallbacks.clear();
    if (this.renderer) {
      this.renderer.domElement.remove();
      this.renderer.dispose();
    }
  }
}
