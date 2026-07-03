/**
 * Command palette (Ctrl/Cmd+K) — fuzzy search across fixtures, zones,
 * planograms, SKUs and actions. Keyboard-first: arrows + Enter.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { SKU_CATALOG } from "../data/catalog";
import { polygonCentroid } from "../data/types";
import { templateOf } from "../fixtures/FixtureCatalog";
import type { VMController } from "../VMController";

interface Cmd {
  id: string;
  label: string;
  hint: string;
  run: () => void;
}

function fuzzy(query: string, text: string): boolean {
  const q = query.toLowerCase();
  const t = text.toLowerCase();
  let i = 0;
  for (const ch of t) {
    if (ch === q[i]) i++;
    if (i >= q.length) return true;
  }
  return q.length === 0;
}

export function CommandPalette({ vm, onClose }: { vm: VMController; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => inputRef.current?.focus(), []);

  const commands = useMemo<Cmd[]>(() => {
    const out: Cmd[] = [];
    const store = vm.store;

    // Actions
    const overlayActions: Array<[string, () => void]> = [
      ["Toggle heat map overlay", () => store.setOverlays({ heatmap: !store.overlays.heatmap })],
      ["Toggle traffic flow overlay", () => store.setOverlays({ traffic: !store.overlays.traffic })],
      ["Toggle dwell rings", () => store.setOverlays({ dwell: !store.overlays.dwell })],
      ["Toggle stock signals", () => store.setOverlays({ stock: !store.overlays.stock })],
      ["Toggle gap flags", () => store.setOverlays({ gaps: !store.overlays.gaps })],
      ["Toggle adjacency warnings", () => store.setOverlays({ adjacency: !store.overlays.adjacency })],
      ["Toggle zone boundaries", () => store.setOverlays({ zones: !store.overlays.zones })],
      ["Camera: walk mode", () => vm.rig.setMode("walk")],
      ["Camera: orbit mode", () => vm.rig.setMode("orbit")],
      ["Undo", () => store.undo()],
      ["Redo", () => store.redo()],
    ];
    for (const [label, run] of overlayActions) {
      out.push({ id: `act-${label}`, label, hint: "action", run });
    }
    for (const layout of vm.layouts) {
      out.push({
        id: `boutique-${layout.id}`,
        label: `Open boutique: ${layout.name}`,
        hint: layout.market,
        run: () => void vm.loadBoutique(layout.id),
      });
    }
    vm.rig.bookmarks.forEach((b, i) => {
      out.push({
        id: `view-${i}`,
        label: `View: ${b.name}`,
        hint: `key ${i + 1}`,
        run: () => vm.rig.goToBookmark(i),
      });
    });
    for (const zone of store.layout.zones) {
      out.push({
        id: `zone-${zone.id}`,
        label: `Zone: ${zone.name}`,
        hint: "fly to",
        run: () => {
          const [cx, cz] = polygonCentroid(zone.polygon);
          vm.rig.flyTo(new THREE.Vector3(cx + 2.2, 2.4, cz + 2.8), new THREE.Vector3(cx, 0.8, cz));
        },
      });
    }
    for (const f of store.layout.fixtures) {
      const t = templateOf(f.templateId);
      out.push({
        id: `fx-${f.id}`,
        label: `Fixture: ${t.name}`,
        hint: store.layout.zones.find((z) => z.id === f.zoneId)?.name ?? "",
        run: () => {
          store.select({ kind: "fixture", fixtureId: f.id });
          vm.rig.flyTo(
            new THREE.Vector3(f.x + 1.6, 1.9, f.z + 2.2),
            new THREE.Vector3(f.x, f.dims.height * 0.7, f.z),
          );
        },
      });
    }
    for (const p of store.listPlanogramsSync()) {
      out.push({
        id: `pg-${p.id}`,
        label: `Planogram: ${p.name}`,
        hint: p.fixtureKind ?? "any fixture",
        run: () => store.toast(`Planogram “${p.name}” — apply it from a fixture panel or Bulk Update`, "info"),
      });
    }
    for (const sku of SKU_CATALOG) {
      out.push({
        id: `sku-${sku.id}`,
        label: `SKU: ${sku.id} ${sku.name}`,
        hint: `${sku.collection} · stock ${store.stockOf(sku.id)}%`,
        run: () => {
          for (const key of store.allSlotKeys()) {
            if (store.slot(key)?.sku === sku.id) {
              const [fixtureId, addr] = key.split("#");
              const [row, col, layer] = addr.split(",").map((n) => parseInt(n, 10));
              store.select({ kind: "slot", slot: { fixtureId, row, col, layer } });
              const f = store.fixture(fixtureId);
              if (f) {
                vm.rig.flyTo(
                  new THREE.Vector3(f.x + 1.2, 1.7, f.z + 1.6),
                  new THREE.Vector3(f.x, f.dims.height * 0.8, f.z),
                );
              }
              return;
            }
          }
          store.toast(`${sku.id} is not placed in this boutique`, "warn");
        },
      });
    }
    return out;
  }, [vm]);

  const results = useMemo(
    () => commands.filter((c) => fuzzy(query, `${c.label} ${c.hint}`)).slice(0, 12),
    [commands, query],
  );

  const run = (cmd: Cmd | undefined) => {
    if (!cmd) return;
    cmd.run();
    onClose();
  };

  return (
    <div className="absolute inset-0 z-50 flex items-start justify-center pt-24 bg-black/45" onClick={onClose}>
      <div
        className="w-[480px] bg-[#1b1916] border border-[rgba(184,150,90,0.35)] rounded-xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setIndex((i) => Math.min(results.length - 1, i + 1));
            else if (e.key === "ArrowUp") setIndex((i) => Math.max(0, i - 1));
            else if (e.key === "Enter") run(results[index]);
            else if (e.key === "Escape") onClose();
          }}
          placeholder="Search fixtures, zones, planograms, SKUs, actions…"
          className="w-full bg-transparent px-4 py-3 text-sm text-[#f2e9d5] placeholder:text-[#6f6b63] focus:outline-none border-b border-[rgba(184,150,90,0.2)]"
        />
        <div className="max-h-80 overflow-y-auto scroll-thin py-1">
          {results.map((c, i) => (
            <button
              key={c.id}
              onClick={() => run(c)}
              onMouseEnter={() => setIndex(i)}
              className={`w-full text-left px-4 py-2 text-xs flex justify-between items-center ${
                i === index ? "bg-[rgba(184,150,90,0.15)] text-[#f2e9d5]" : "text-[#d9d2c2]"
              }`}
            >
              <span>{c.label}</span>
              <span className="text-[10px] text-[#8a857b] ml-3 shrink-0">{c.hint}</span>
            </button>
          ))}
          {!results.length && <div className="px-4 py-3 text-xs text-[#6f6b63]">No matches.</div>}
        </div>
      </div>
    </div>
  );
}
