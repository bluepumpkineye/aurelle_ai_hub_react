/**
 * Workspace panels: fixture library (left) and the context-sensitive
 * properties panel (right) with the planogram slot editor — slot edits feel
 * direct: click a slot in 3D or in the grid, drop a SKU, watch the case
 * update immediately.
 */

import { useState } from "react";
import { CATEGORY_LABELS, CATEGORY_ORDER, SKU_BY_ID, skusForCategory } from "../data/catalog";
import type { ProductCategory, SlotAddress, SlotState } from "../data/types";
import { slotKey } from "../data/types";
import { FIXTURE_TEMPLATES, TEMPLATE_CATEGORIES, templateOf } from "../fixtures/FixtureCatalog";
import type { VMController } from "../VMController";
import { useStoreEvents } from "./hooks";

const panelCls =
  "bg-[#1b1916]/95 backdrop-blur border border-[rgba(184,150,90,0.25)] rounded-lg text-[#d9d2c2] shadow-xl";
const chipCls =
  "px-2 py-0.5 rounded text-[10px] uppercase tracking-wider border border-[rgba(184,150,90,0.35)] text-[#c9a45e]";
const btnCls =
  "px-2.5 py-1.5 rounded text-xs border border-[rgba(184,150,90,0.4)] text-[#e9cf9c] hover:bg-[rgba(184,150,90,0.15)] transition disabled:opacity-40 disabled:cursor-not-allowed";

// ───────────────────────────── Fixture library ─────────────────────────────

export function FixtureLibraryPanel({ vm }: { vm: VMController }) {
  const [query, setQuery] = useState("");
  const [placing, setPlacing] = useState<string | null>(vm.placingTemplateId);
  vm.onPlacingChange = setPlacing;

  const filtered = FIXTURE_TEMPLATES.filter(
    (t) =>
      !query ||
      t.name.toLowerCase().includes(query.toLowerCase()) ||
      t.categoryLabel.toLowerCase().includes(query.toLowerCase()),
  );

  return (
    <div className={`${panelCls} w-60 max-h-full flex flex-col`}>
      <div className="px-3 pt-3 pb-2 border-b border-[rgba(184,150,90,0.2)]">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#c9a45e] mb-2">
          Equipment Templates
        </div>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search 20 templates…"
          className="w-full bg-[#12100e] border border-[rgba(184,150,90,0.25)] rounded px-2 py-1.5 text-xs placeholder:text-[#6f6b63] focus:outline-none"
        />
        {placing && (
          <div className="mt-2 text-[11px] text-[#e9cf9c] bg-[rgba(184,150,90,0.12)] rounded px-2 py-1.5">
            Click the floor to place · Shift-click for multiples · Esc to cancel
          </div>
        )}
      </div>
      <div className="overflow-y-auto scroll-thin px-2 py-2 space-y-3">
        {TEMPLATE_CATEGORIES.map((cat) => {
          const items = filtered.filter((t) => t.categoryLabel === cat);
          if (!items.length) return null;
          return (
            <div key={cat}>
              <div className="text-[10px] uppercase tracking-[0.16em] text-[#8a857b] px-1 mb-1">{cat}</div>
              <div className="space-y-1">
                {items.map((t) => (
                  <button
                    key={t.id}
                    onClick={() => vm.setPlacingTemplate(placing === t.id ? null : t.id)}
                    className={`w-full text-left px-2 py-1.5 rounded border transition text-xs ${
                      placing === t.id
                        ? "border-[#c9a45e] bg-[rgba(184,150,90,0.18)] text-[#f2e9d5]"
                        : "border-transparent hover:border-[rgba(184,150,90,0.3)] hover:bg-[rgba(255,255,255,0.03)]"
                    }`}
                    title={t.description}
                  >
                    <div className="font-medium">{t.name}</div>
                    <div className="text-[10px] text-[#8a857b]">
                      {t.dims.default.width.toFixed(1)}×{t.dims.default.depth.toFixed(1)}×
                      {t.dims.default.height.toFixed(1)} m
                      {t.slotGrid ? ` · ${t.slotGrid.rows * t.slotGrid.cols * t.slotGrid.layers} slots` : ""}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ───────────────────────────── Slot cell ─────────────────────────────

function stockTone(s: SlotState | undefined): string {
  if (!s?.sku) return "bg-[#12100e] border-dashed border-[rgba(138,133,123,0.4)]";
  if (s.stockLevel <= 0) return "bg-[rgba(209,58,58,0.22)] border-[rgba(209,58,58,0.8)]";
  if (s.stockLevel < 20) return "bg-[rgba(226,161,60,0.2)] border-[rgba(226,161,60,0.8)]";
  return "bg-[rgba(63,156,92,0.14)] border-[rgba(63,156,92,0.55)]";
}

// ───────────────────────────── Properties panel ─────────────────────────────

export function PropertiesPanel({ vm }: { vm: VMController }) {
  useStoreEvents(vm.store, [
    "selection-changed",
    "slots-changed",
    "planograms-changed",
    "inventory-changed",
    "fixtures-changed",
  ]);
  const sel = vm.store.selection;

  if (sel.kind === "none") {
    return (
      <div className={`${panelCls} w-72 p-4 text-xs text-[#8a857b] leading-relaxed`}>
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#c9a45e] mb-2">Properties</div>
        Select a fixture or slot in the 3D boutique.
        <div className="mt-3 space-y-1 text-[11px]">
          <div>· Click a showcase to open its planogram</div>
          <div>· Click a product/slot for SKU & stock detail</div>
          <div>· V toggles walk mode · keys 1–6 fly to views</div>
          <div>· R rotates · Del removes · Ctrl+Z undo</div>
        </div>
      </div>
    );
  }

  if (sel.kind === "slot") return <SlotPanel vm={vm} slot={sel.slot} />;
  if (sel.kind === "fixture") return <FixturePanel vm={vm} fixtureId={sel.fixtureId} />;
  return null;
}

function SlotPanel({ vm, slot }: { vm: VMController; slot: SlotAddress }) {
  const key = slotKey(slot);
  const state = vm.store.slot(key);
  const sku = state?.sku ? SKU_BY_ID.get(state.sku) : null;
  const fixture = vm.store.fixture(slot.fixtureId);
  const template = fixture ? templateOf(fixture.templateId) : null;
  const [category, setCategory] = useState<ProductCategory | null>(sku?.category ?? null);

  const accepted = template?.slotGrid?.accepts ?? CATEGORY_ORDER;
  const catList = CATEGORY_ORDER.filter((c) => accepted.includes(c));
  const skus = category ? skusForCategory(category) : [];

  return (
    <div className={`${panelCls} w-72 max-h-full flex flex-col`}>
      <div className="px-4 pt-3 pb-2 border-b border-[rgba(184,150,90,0.2)]">
        <div className="flex items-center justify-between">
          <div className="text-[11px] uppercase tracking-[0.18em] text-[#c9a45e]">Slot</div>
          <button
            className="text-[11px] text-[#8a857b] hover:text-[#e9cf9c]"
            onClick={() => fixture && vm.store.select({ kind: "fixture", fixtureId: fixture.id })}
          >
            ↰ fixture
          </button>
        </div>
        <div className="text-sm mt-1">
          {template?.name} · R{slot.row + 1} C{slot.col + 1}
        </div>
      </div>
      <div className="p-4 space-y-3 overflow-y-auto scroll-thin text-xs">
        {sku && state ? (
          <>
            <div>
              <div className="text-[#f2e9d5] text-sm font-medium">{sku.name}</div>
              <div className="text-[#8a857b]">
                {sku.id} · {CATEGORY_LABELS[sku.category]} · {sku.collection}
              </div>
              <div className="mt-1 flex gap-1.5 flex-wrap">
                <span className={chipCls}>{sku.tier}</span>
                <span className={chipCls}>€{sku.price.toLocaleString()}</span>
                {state.campaignFlag && <span className={chipCls}>campaign</span>}
              </div>
            </div>
            <div>
              <div className="flex justify-between text-[11px] mb-1">
                <span className="text-[#8a857b]">Stock level</span>
                <span
                  className={
                    state.stockLevel <= 0
                      ? "text-[#d13a3a]"
                      : state.stockLevel < 20
                        ? "text-[#e2a13c]"
                        : "text-[#3f9c5c]"
                  }
                >
                  {state.stockLevel}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                value={state.stockLevel}
                onChange={(e) => vm.store.setStockLevel(sku.id, parseInt(e.target.value, 10))}
                className="w-full accent-[#c9a45e]"
              />
              <div className="text-[10px] text-[#6f6b63] mt-0.5">
                Last replenishment {vm.store.replenishmentOf(sku.id)} · signal propagates to every
                slot holding {sku.id}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                className={btnCls}
                onClick={() =>
                  vm.store.setSlot(slot, { ...state, campaignFlag: !state.campaignFlag }, "Campaign flag")
                }
              >
                {state.campaignFlag ? "Unset campaign" : "Set campaign"}
              </button>
              <button className={btnCls} onClick={() => vm.store.clearSlot(slot)}>
                Clear slot
              </button>
            </div>
          </>
        ) : (
          <div className="text-[#8a857b]">Empty slot — assign a SKU below.</div>
        )}

        <div className="pt-2 border-t border-[rgba(184,150,90,0.15)]">
          <div className="text-[11px] uppercase tracking-[0.14em] text-[#c9a45e] mb-1.5">
            {sku ? "Replace with" : "Assign SKU"}
          </div>
          <div className="flex gap-1 flex-wrap mb-2">
            {catList.map((c) => (
              <button
                key={c}
                onClick={() => setCategory(c)}
                className={`px-1.5 py-0.5 rounded text-[10px] border ${
                  category === c
                    ? "border-[#c9a45e] text-[#e9cf9c] bg-[rgba(184,150,90,0.15)]"
                    : "border-[rgba(138,133,123,0.35)] text-[#8a857b] hover:text-[#d9d2c2]"
                }`}
              >
                {CATEGORY_LABELS[c]}
              </button>
            ))}
          </div>
          <div className="max-h-44 overflow-y-auto scroll-thin space-y-0.5">
            {skus.map((s) => (
              <button
                key={s.id}
                onClick={() => vm.store.placeSku(slot, s.id)}
                className="w-full text-left px-2 py-1 rounded hover:bg-[rgba(184,150,90,0.12)] flex justify-between items-center"
              >
                <span>
                  <span className="text-[#e8e2d4]">{s.name}</span>
                  <span className="text-[#6f6b63] ml-1.5">{s.id}</span>
                </span>
                <span className="text-[10px] text-[#8a857b]">
                  {vm.store.stockOf(s.id)}% · {s.tier === "exceptional" ? "★" : s.tier === "high" ? "◆" : "·"}
                </span>
              </button>
            ))}
            {!category && <div className="text-[#6f6b63] px-2 py-1">Pick a category…</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function FixturePanel({ vm, fixtureId }: { vm: VMController; fixtureId: string }) {
  const fixture = vm.store.fixture(fixtureId);
  const [saveName, setSaveName] = useState("");
  const [applyId, setApplyId] = useState("");
  const [previewing, setPreviewing] = useState(false);
  if (!fixture) return null;
  const template = templateOf(fixture.templateId);
  const zone = vm.store.layout.zones.find((z) => z.id === fixture.zoneId);
  const grid = template.slotGrid;
  const planograms = vm.store.listPlanogramsSync().filter((p) => !p.fixtureKind || p.fixtureKind === template.kind);

  const preview = () => {
    if (!applyId) return;
    const pv = vm.store.previewBulkUpdate({
      target: { scope: "fixture", fixtureId },
      operation: { op: "apply-template", planogramId: applyId },
    });
    vm.store.showDiffPreview(pv.diffs);
    setPreviewing(true);
  };
  const apply = () => {
    if (!applyId) return;
    vm.store.applyBulkUpdate({
      target: { scope: "fixture", fixtureId },
      operation: { op: "apply-template", planogramId: applyId },
    });
    vm.store.showDiffPreview(null);
    setPreviewing(false);
  };

  return (
    <div className={`${panelCls} w-72 max-h-full flex flex-col`}>
      <div className="px-4 pt-3 pb-2 border-b border-[rgba(184,150,90,0.2)]">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#c9a45e]">Fixture</div>
        <div className="text-sm mt-1 text-[#f2e9d5]">{template.name}</div>
        <div className="text-[11px] text-[#8a857b]">
          {zone?.name ?? "—"} · {fixture.dims.width.toFixed(2)}×{fixture.dims.depth.toFixed(2)}×
          {fixture.dims.height.toFixed(2)} m · {fixture.finish}
        </div>
        <div className="flex gap-2 mt-2">
          <button
            className={btnCls}
            onClick={() => vm.store.moveFixture(fixtureId, fixture.x, fixture.z, fixture.rotationY + Math.PI / 2)}
          >
            Rotate 90° (R)
          </button>
          <button className={btnCls} onClick={() => vm.store.removeFixture(fixtureId)}>
            Remove (Del)
          </button>
        </div>
      </div>

      {grid ? (
        <div className="p-4 space-y-3 overflow-y-auto scroll-thin">
          <div>
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#c9a45e] mb-1.5">
              Planogram — {grid.rows}×{grid.cols}
            </div>
            <div
              className="grid gap-1"
              style={{ gridTemplateColumns: `repeat(${grid.cols}, minmax(0,1fr))` }}
            >
              {Array.from({ length: grid.rows * grid.cols }, (_, i) => {
                const row = Math.floor(i / grid.cols);
                const col = i % grid.cols;
                const addr: SlotAddress = { fixtureId, row, col, layer: 0 };
                const s = vm.store.slot(slotKey(addr));
                const sku = s?.sku ? SKU_BY_ID.get(s.sku) : null;
                return (
                  <button
                    key={i}
                    onClick={() => vm.store.select({ kind: "slot", slot: addr })}
                    className={`relative border rounded p-1 min-h-[42px] text-left transition hover:brightness-125 ${stockTone(s)}`}
                    title={sku ? `${sku.name} · ${s?.stockLevel}%` : "Empty slot"}
                  >
                    {sku ? (
                      <>
                        <div className="text-[9px] font-mono text-[#e8e2d4] leading-tight">{sku.id}</div>
                        <div className="text-[8px] text-[#8a857b] truncate">{CATEGORY_LABELS[sku.category]}</div>
                        {s?.campaignFlag && (
                          <span className="absolute top-0.5 right-0.5 w-1.5 h-1.5 rounded-full bg-[#e9cf9c]" />
                        )}
                      </>
                    ) : (
                      <div className="text-[9px] text-[#6f6b63]">—</div>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="text-[10px] text-[#6f6b63] mt-1">
              Green healthy · amber &lt;20% · red out of stock · gold dot = campaign
            </div>
          </div>

          <div className="pt-2 border-t border-[rgba(184,150,90,0.15)]">
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#c9a45e] mb-1.5">
              Apply saved planogram
            </div>
            <select
              value={applyId}
              onChange={(e) => {
                setApplyId(e.target.value);
                setPreviewing(false);
                vm.store.showDiffPreview(null);
              }}
              className="w-full bg-[#12100e] border border-[rgba(184,150,90,0.25)] rounded px-2 py-1.5 text-xs mb-2"
            >
              <option value="">Select template…</option>
              {planograms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <button className={btnCls} disabled={!applyId} onClick={preview}>
                Preview diff
              </button>
              <button className={btnCls} disabled={!applyId || !previewing} onClick={apply}>
                Confirm apply
              </button>
              {previewing && (
                <button
                  className={btnCls}
                  onClick={() => {
                    vm.store.showDiffPreview(null);
                    setPreviewing(false);
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-[rgba(184,150,90,0.15)]">
            <div className="text-[11px] uppercase tracking-[0.14em] text-[#c9a45e] mb-1.5">
              Save as named planogram
            </div>
            <div className="flex gap-2">
              <input
                value={saveName}
                onChange={(e) => setSaveName(e.target.value)}
                placeholder="e.g. HJ Icons — SS27"
                className="flex-1 bg-[#12100e] border border-[rgba(184,150,90,0.25)] rounded px-2 py-1.5 text-xs"
              />
              <button
                className={btnCls}
                disabled={!saveName.trim()}
                onClick={() => {
                  vm.store.savePlanogramFromFixture(fixtureId, saveName.trim());
                  setSaveName("");
                }}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="p-4 text-xs text-[#8a857b]">
          This fixture class has no product slots ({template.categoryLabel.toLowerCase()}).
        </div>
      )}
    </div>
  );
}
