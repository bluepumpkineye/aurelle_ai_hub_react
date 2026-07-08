/**
 * VMApp — the Visual Merchandiser workspace. Hosts the WebGPU canvas and all
 * chrome: toolbar (boutique switcher, camera, time-of-day, overlays, undo),
 * fixture library, properties/planogram panel, bulk-update modal, performance
 * dashboard, command palette, HUD (F3), slot tooltips and toasts.
 */

import { useEffect, useRef, useState } from "react";
import { WebGPUInitError, type EngineStats } from "../core/Engine";
import { SKU_BY_ID } from "../data/catalog";
import { slotKey, type SlotKey, type SKU } from "../data/types";
import { VMController, type HoverInfo } from "../VMController";
import { BulkUpdateModal } from "./BulkUpdateModal";
import { CommandPalette } from "./CommandPalette";
import { Dashboard } from "./Dashboard";
import { EngineFailScreen } from "./GateScreens";
import { FixtureLibraryPanel, PropertiesPanel, getProductImage } from "./panels";
import { useStoreEvents, useToasts } from "./hooks";

const tbBtn =
  "px-2.5 py-1.5 rounded text-[11px] border border-[rgba(184,150,90,0.35)] text-[#d9d2c2] hover:bg-[rgba(184,150,90,0.14)] hover:text-[#f2e9d5] transition disabled:opacity-40";
const tbActive = "bg-[rgba(184,150,90,0.2)] text-[#f2e9d5]";

export function VMApp() {
  const containerRef = useRef<HTMLDivElement>(null);
  const vmRef = useRef<VMController | null>(null);
  const [ready, setReady] = useState(false);
  const [fail, setFail] = useState<{ message: string; diagnostics: string[] } | null>(null);
  const [hover, setHover] = useState<HoverInfo | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [showDash, setShowDash] = useState(false);
  const [showPalette, setShowPalette] = useState(false);
  const [cameraMode, setCameraMode] = useState<"orbit" | "walk">("orbit");
  const [popupProduct, setPopupProduct] = useState<SKU | null>(null);

  useEffect(() => {
    const vm = new VMController();
    vmRef.current = vm;
    let cancelled = false;
    let unsubSelection: (() => void) | null = null;
    (async () => {
      if (!containerRef.current) return;
      try {
        await vm.start(containerRef.current);
        if (cancelled) return;
        vm.onHover = setHover;
        vm.onCameraMode = setCameraMode;

        unsubSelection = vm.store.events.on("selection-changed", (sel) => {
          if (sel.kind === "slot") {
            const state = vm.store.slot(slotKey(sel.slot));
            const sku = state?.sku ? SKU_BY_ID.get(state.sku) : null;
            setPopupProduct(sku || null);
          } else {
            setPopupProduct(null);
          }
        });

        setReady(true);
      } catch (e) {
        if (e instanceof WebGPUInitError) setFail({ message: e.message, diagnostics: e.diagnostics });
        else setFail({ message: e instanceof Error ? e.message : String(e), diagnostics: [] });
      }
    })();
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.code === "KeyK") {
        e.preventDefault();
        setShowPalette((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      cancelled = true;
      window.removeEventListener("keydown", onKey);
      if (unsubSelection) unsubSelection();
      vm.dispose();
      vmRef.current = null;
    };
  }, []);

  if (fail) return <EngineFailScreen message={fail.message} diagnostics={fail.diagnostics} />;

  const vm = vmRef.current;

  return (
    <div className="relative h-full w-full bg-[#0d0c0a] overflow-hidden select-none">
      <div ref={containerRef} className="absolute inset-0" />

      {!ready && (
        <div className="absolute inset-0 flex items-center justify-center bg-[#141311] z-50">
          <div className="text-center">
            <div className="font-display text-2xl text-[#e9cf9c] tracking-wide">AURELLE</div>
            <div className="text-[11px] uppercase tracking-[0.28em] text-[#8a857b] mt-1">
              Initializing WebGPU boutique engine…
            </div>
          </div>
        </div>
      )}

      {ready && vm && (
        <>
          <Toolbar
            vm={vm}
            cameraMode={cameraMode}
            onBulk={() => setShowBulk(true)}
            onDash={() => setShowDash((v) => !v)}
            onPalette={() => setShowPalette(true)}
          />
          <div className="absolute left-3 top-16 bottom-3 z-20 flex flex-col">
            <FixtureLibraryPanel vm={vm} />
          </div>
          <div className="absolute right-3 top-16 bottom-3 z-20 flex flex-col">
            <PropertiesPanel vm={vm} />
          </div>
          <Hud vm={vm} />
          <Toasts vm={vm} />
          {hover && <SlotTooltip vm={vm} hover={hover} />}
          {showBulk && <BulkUpdateModal vm={vm} onClose={() => setShowBulk(false)} />}
          {showDash && <Dashboard vm={vm} onClose={() => setShowDash(false)} />}
          {showPalette && <CommandPalette vm={vm} onClose={() => setShowPalette(false)} />}
          {popupProduct && <ProductPopupModal sku={popupProduct} onClose={() => setPopupProduct(null)} />}
        </>
      )}
    </div>
  );
}

// ───────────────────────────── Toolbar ─────────────────────────────

function Toolbar({
  vm,
  cameraMode,
  onBulk,
  onDash,
  onPalette,
}: {
  vm: VMController;
  cameraMode: "orbit" | "walk";
  onBulk: () => void;
  onDash: () => void;
  onPalette: () => void;
}) {
  useStoreEvents(vm.store, ["layout-loaded", "undo-changed", "overlays-changed"]);
  const [tod, setTod] = useState(14);
  const layout = vm.store.layout;
  const o = vm.store.overlays;
  const undoDepth = vm.store.undoStack.depth;
  const redoDepth = vm.store.undoStack.redoDepth;

  const toggle = (key: keyof typeof o) => vm.store.setOverlays({ [key]: !o[key] });

  return (
    <div className="absolute top-3 left-3 right-3 z-20 flex items-center gap-2 flex-wrap">
      <div className="bg-[#1b1916]/95 backdrop-blur border border-[rgba(184,150,90,0.25)] rounded-lg px-3 py-2 flex items-center gap-2 shadow-xl">
        <span className="font-display text-[#e9cf9c] text-sm tracking-wider">AURELLE VM</span>
        <select
          value={layout.id}
          onChange={(e) => void vm.loadBoutique(e.target.value)}
          className="bg-[#12100e] border border-[rgba(184,150,90,0.3)] rounded px-2 py-1 text-[11px] text-[#e8e2d4]"
        >
          {vm.layouts.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
        <span className="text-[10px] text-[#6f6b63]">
          {Math.round(layout.floor.width * layout.floor.depth)} m² ·{" "}
          {layout.tier === "tier1" ? "Flagship Maison" : "Flagship"}
        </span>
      </div>

      <div className="bg-[#1b1916]/95 backdrop-blur border border-[rgba(184,150,90,0.25)] rounded-lg px-2 py-1.5 flex items-center gap-1 shadow-xl">
        <button
          className={`${tbBtn} ${cameraMode === "orbit" ? tbActive : ""}`}
          onClick={() => vm.rig.setMode("orbit")}
        >
          Orbit
        </button>
        <button
          className={`${tbBtn} ${cameraMode === "walk" ? tbActive : ""}`}
          onClick={() => vm.rig.setMode("walk")}
          title="WASD to move, drag to look (V)"
        >
          Walk
        </button>
        <span className="w-px h-4 bg-[rgba(184,150,90,0.25)] mx-1" />
        {vm.rig.bookmarks.map((b, i) => (
          <button key={i} className={tbBtn} title={b.name} onClick={() => vm.rig.goToBookmark(i)}>
            {i + 1}
          </button>
        ))}
      </div>

      <div className="bg-[#1b1916]/95 backdrop-blur border border-[rgba(184,150,90,0.25)] rounded-lg px-3 py-1.5 flex items-center gap-2 shadow-xl">
        <span className="text-[10px] uppercase tracking-wider text-[#8a857b]">Daylight</span>
        <input
          type="range"
          min={7}
          max={21}
          step={0.5}
          value={tod}
          onChange={(e) => {
            const h = parseFloat(e.target.value);
            setTod(h);
            vm.setTimeOfDay(h);
          }}
          className="w-24 accent-[#c9a45e]"
        />
        <span className="text-[11px] text-[#e9cf9c] w-10">
          {Math.floor(tod)}:{tod % 1 ? "30" : "00"}
        </span>
      </div>

      <div className="bg-[#1b1916]/95 backdrop-blur border border-[rgba(184,150,90,0.25)] rounded-lg px-2 py-1.5 flex items-center gap-1 shadow-xl">
        {(
          [
            ["heatmap", "€/m²"],
            ["traffic", "Traffic"],
            ["dwell", "Dwell"],
            ["stock", "Stock"],
            ["gaps", "Gaps"],
            ["adjacency", "Adjac."],
            ["zones", "Zones"],
          ] as Array<[keyof typeof o & string, string]>
        ).map(([key, label]) => (
          <button
            key={key}
            className={`${tbBtn} ${o[key] ? tbActive : ""}`}
            onClick={() => toggle(key)}
          >
            {label}
          </button>
        ))}
        {o.heatmap && (
          <input
            type="range"
            min={0.1}
            max={0.9}
            step={0.05}
            value={o.heatmapOpacity}
            onChange={(e) => vm.store.setOverlays({ heatmapOpacity: parseFloat(e.target.value) })}
            className="w-16 accent-[#c9a45e]"
            title="Heat map opacity"
          />
        )}
      </div>

      <div className="bg-[#1b1916]/95 backdrop-blur border border-[rgba(184,150,90,0.25)] rounded-lg px-2 py-1.5 flex items-center gap-1 shadow-xl ml-auto">
        <button className={tbBtn} disabled={!undoDepth} onClick={() => vm.store.undo()} title="Ctrl+Z">
          ↶ {undoDepth}
        </button>
        <button className={tbBtn} disabled={!redoDepth} onClick={() => vm.store.redo()} title="Ctrl+Shift+Z">
          ↷
        </button>
        <span className="w-px h-4 bg-[rgba(184,150,90,0.25)] mx-1" />
        <button className={tbBtn} onClick={onBulk}>
          Bulk Update
        </button>
        <button className={tbBtn} onClick={onDash}>
          Dashboard
        </button>
        <button className={tbBtn} onClick={onPalette} title="Ctrl+K">
          ⌘K
        </button>
      </div>
    </div>
  );
}

// ───────────────────────────── HUD ─────────────────────────────

function Hud({ vm }: { vm: VMController }) {
  const [open, setOpen] = useState(vm.params.hud);
  const [stats, setStats] = useState<EngineStats | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.code === "F3") {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    const timer = window.setInterval(() => setStats(vm.engine.stats()), 500);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.clearInterval(timer);
    };
  }, [vm]);

  return (
    <div className="absolute bottom-3 left-3 z-20 font-mono text-[10px]">
      <div className="bg-[#1b1916]/90 border border-[rgba(184,150,90,0.25)] rounded px-2 py-1 text-[#c9a45e] inline-block">
        {stats ? `${stats.fps} fps` : "— fps"} · WebGPU
        <button className="ml-2 text-[#6f6b63] hover:text-[#e9cf9c]" onClick={() => setOpen((v) => !v)}>
          F3
        </button>
      </div>
      {open && stats && (
        <div className="mt-1 bg-[#1b1916]/95 border border-[rgba(184,150,90,0.25)] rounded p-2.5 text-[#b3aea4] space-y-0.5 w-56">
          <div className="flex justify-between"><span>frame avg / p95</span><span className="text-[#e8e2d4]">{stats.frameMs.toFixed(1)} / {stats.frameMsP95.toFixed(1)} ms</span></div>
          <div className="flex justify-between"><span>draw calls</span><span className="text-[#e8e2d4]">{stats.drawCalls.toLocaleString()}</span></div>
          <div className="flex justify-between"><span>triangles</span><span className="text-[#e8e2d4]">{Math.round(stats.triangles).toLocaleString()}</span></div>
          <div className="flex justify-between"><span>active spots</span><span className="text-[#e8e2d4]">{vm.scene.lightingStats.spots} ({vm.scene.lightingStats.shadowCasters} shadowed)</span></div>
          <div className="flex justify-between"><span>case fills</span><span className="text-[#e8e2d4]">{vm.scene.lightingStats.caseFills}</span></div>
          <div className="flex justify-between"><span>geometries / textures</span><span className="text-[#e8e2d4]">{stats.geometries} / {stats.textures}</span></div>
          <div className="flex justify-between"><span>VRAM est.</span><span className="text-[#e8e2d4]">{stats.vramEstimateMB} MB</span></div>
          <div className="flex justify-between"><span>quality preset</span><span className="text-[#e8e2d4]">{vm.quality.name}</span></div>
          <div className="flex justify-between"><span>undo depth</span><span className="text-[#e8e2d4]">{vm.store.undoStack.depth} / 32</span></div>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────── Tooltip & toasts ─────────────────────────────

function SlotTooltip({ vm, hover }: { vm: VMController; hover: { slotKey: SlotKey; screenX: number; screenY: number } }) {
  const state = vm.store.slot(hover.slotKey);
  const sku = state?.sku ? SKU_BY_ID.get(state.sku) : null;
  if (!state || !sku) return null;
  return (
    <div
      className="fixed z-40 pointer-events-none bg-[#1b1916]/95 border border-[rgba(184,150,90,0.4)] rounded-lg px-3 py-2 text-xs text-[#e8e2d4] shadow-xl"
      style={{ left: hover.screenX + 14, top: hover.screenY + 10 }}
    >
      <div className="font-medium text-[#f2e9d5]">{sku.name}</div>
      <div className="text-[10px] text-[#8a857b]">
        {sku.id} · {sku.collection} · {sku.tier}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span
          className={`inline-block w-1.5 h-1.5 rounded-full ${
            state.stockLevel <= 0 ? "bg-[#d13a3a]" : state.stockLevel < 20 ? "bg-[#e2a13c]" : "bg-[#3f9c5c]"
          }`}
        />
        <span>
          stock {state.stockLevel}% · repl. {vm.store.replenishmentOf(sku.id)}
          {state.campaignFlag ? " · campaign" : ""}
        </span>
      </div>
    </div>
  );
}

function Toasts({ vm }: { vm: VMController }) {
  const toasts = useToasts(vm.store);
  return (
    <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-40 space-y-1.5 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-3.5 py-2 rounded-lg text-xs shadow-xl border backdrop-blur bg-[#1b1916]/95 ${
            t.tone === "error"
              ? "border-[rgba(209,58,58,0.6)] text-[#f0b9b9]"
              : t.tone === "warn"
                ? "border-[rgba(226,161,60,0.6)] text-[#f0d9ab]"
                : "border-[rgba(184,150,90,0.4)] text-[#e8e2d4]"
          }`}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}

// ───────────────────────────── Product Details Popup ─────────────────────────────

import { CATEGORY_LABELS } from "../data/catalog";

function getProductDescription(category: string, collection: string): string {
  switch (category) {
    case "rings":
      return `An exquisite solitaire band from the ${collection} collection, showcasing a brilliant-cut center diamond. Meticulously set in hand-polished 18-karat white gold, this piece embodies timeless elegance and unparalleled light dispersion.`;
    case "bracelets":
      return `This majestic piece from the ${collection} collection wraps the wrist in fluid rows of brilliant pavé diamonds. Crafted in solid champagne-gold, its delicate silhouette blends modern structure with classic French jewelry heritage.`;
    case "necklaces":
      return `A magnificent high-jewelry necklace from the ${collection} collection. A teardrop sapphire pendant sits at the heart of delicate gold branches encrusted with fine diamonds, catching the light with every movement.`;
    case "watches-dress":
      return `Part of the coveted ${collection} series, this dress watch features a pristine white guilloché dial, a diamond-set outer bezel, and a hand-stitched brown alligator strap. A mechanical masterpiece of luxury and precision.`;
    case "watches-sport":
      return `Engineered for performance and flagships, this sport chronograph from the ${collection} collection combines a robust champagne-gold case with a brushed link bracelet and a deep black ceramic tachymeter bezel.`;
    case "earrings":
      return `These drop earrings from the ${collection} collection feature delicate cascading pearls suspended from diamond-encrusted gold mounts. Perfect balance, designed to sway gracefully and capture warm ambient glows.`;
    case "brooches":
      return `An organic, floral design from the ${collection} collection, this masterfully sculpted brooch features white-gold petals encrusted with micro-pavé diamonds and a central emerald cluster.`;
    case "leather-goods":
      return `A stunning evening accessory from the ${collection} collection, crafted in fine textured French calfskin. Featuring clean hand-rolled edges, luxurious lining, and a signature double-ring gold clasp.`;
    case "fragrance":
      return `Aurelle's signature olfactory masterpiece from the ${collection} collection. Housed in a hand-polished faceted glass bottle with a heavy brass cap, it opens with soft rose petals transitioning into a deep, warm oud.`;
    default:
      return `A masterpiece of design from the ${collection} collection, reflecting the ultimate brand standards of craftsmanship, detail, and material excellence.`;
  }
}

function ProductPopupModal({ sku, onClose }: { sku: SKU; onClose: () => void }) {
  const imageUrl = getProductImage(sku);
  const desc = getProductDescription(sku.category, sku.collection);

  // Close on Esc keypress
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-[#1b1916]/95 border border-[rgba(184,150,90,0.35)] rounded-xl w-[580px] overflow-hidden shadow-2xl flex flex-col md:flex-row relative transition-transform duration-300 scale-100"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 text-[#8a857b] hover:text-[#e9cf9c] text-xl transition z-10 w-6 h-6 flex items-center justify-center rounded-full hover:bg-[rgba(184,150,90,0.15)]"
        >
          &times;
        </button>

        {/* Product Image Column */}
        <div className="w-full md:w-[260px] aspect-square md:aspect-auto md:h-[320px] bg-[#0d0c0a] border-b md:border-b-0 md:border-r border-[rgba(184,150,90,0.2)] flex items-center justify-center overflow-hidden p-4">
          <div className="border border-[rgba(184,150,90,0.25)] p-1 w-full h-full rounded-lg bg-[#12100e]">
            <img
              src={imageUrl}
              alt={sku.name}
              className="w-full h-full object-cover rounded shadow-lg"
            />
          </div>
        </div>

        {/* Product Details Column */}
        <div className="flex-1 p-6 flex flex-col justify-between text-xs text-[#d9d2c2]">
          <div>
            <div className="text-[10px] uppercase tracking-[0.2em] text-[#c9a45e] font-display mb-1">
              {CATEGORY_LABELS[sku.category]}
            </div>
            <h2 className="text-[#f2e9d5] text-lg font-semibold tracking-wide leading-tight mb-2">
              {sku.name}
            </h2>
            <div className="flex gap-1.5 flex-wrap mb-4">
              <span className="px-2 py-0.5 rounded text-[9px] uppercase tracking-wider border border-[rgba(184,150,90,0.35)] text-[#c9a45e] bg-[rgba(184,150,90,0.1)] font-mono">
                {sku.id}
              </span>
              <span className="px-2 py-0.5 rounded text-[9px] uppercase tracking-wider border border-[rgba(184,150,90,0.35)] text-[#c9a45e] bg-[rgba(184,150,90,0.1)]">
                {sku.tier} tier
              </span>
              <span className="px-2 py-0.5 rounded text-[9px] uppercase tracking-wider border border-[rgba(184,150,90,0.35)] text-[#c9a45e] bg-[rgba(184,150,90,0.1)]">
                €{sku.price.toLocaleString()}
              </span>
            </div>
            <p className="text-[#8a857b] leading-relaxed mb-4 italic">
              &ldquo;{sku.collection} Collection&rdquo;
            </p>
            <p className="text-[#b9b3a7] leading-relaxed mb-4 text-[11px] font-light">
              {desc}
            </p>
          </div>
          <div className="flex justify-end pt-4 border-t border-[rgba(184,150,90,0.15)]">
            <button
              onClick={onClose}
              className="px-4 py-1.5 rounded border border-[rgba(184,150,90,0.4)] text-[#e9cf9c] hover:bg-[rgba(184,150,90,0.15)] transition text-[11px] tracking-wider uppercase font-semibold"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
