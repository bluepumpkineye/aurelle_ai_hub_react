/**
 * Bulk update modal — target selection → operation → diff preview →
 * confirm/cancel (PRD §3.4). Preview also renders the diff overlay in 3D,
 * so the director sees exactly which slots change before committing.
 * Every apply lands on the undo stack.
 */

import { useState } from "react";
import type { BulkOperation, BulkTarget, BulkUpdatePreview } from "../data/types";
import type { VMController } from "../VMController";
import { useStoreEvents } from "./hooks";

const btnCls =
  "px-3 py-1.5 rounded text-xs border border-[rgba(184,150,90,0.4)] text-[#e9cf9c] hover:bg-[rgba(184,150,90,0.15)] transition disabled:opacity-40 disabled:cursor-not-allowed";
const fieldCls =
  "w-full bg-[#12100e] border border-[rgba(184,150,90,0.25)] rounded px-2 py-1.5 text-xs text-[#e8e2d4]";

export function BulkUpdateModal({ vm, onClose }: { vm: VMController; onClose: () => void }) {
  useStoreEvents(vm.store, ["planograms-changed"]);
  const [scope, setScope] = useState<"zone" | "floor" | "fixture">("zone");
  const [zoneId, setZoneId] = useState(vm.store.layout.zones[0]?.id ?? "");
  const [opKind, setOpKind] = useState<"apply-template" | "set-campaign" | "clear" | "restock">(
    "apply-template",
  );
  const [planogramId, setPlanogramId] = useState("");
  const [campaignOn, setCampaignOn] = useState(true);
  const [restockLevel, setRestockLevel] = useState(90);
  const [preview, setPreview] = useState<BulkUpdatePreview | null>(null);

  const selection = vm.store.selection;
  const selectedFixtureId = selection.kind === "fixture" ? selection.fixtureId : null;

  const buildTarget = (): BulkTarget | null => {
    if (scope === "floor") return { scope: "floor" };
    if (scope === "zone") return zoneId ? { scope: "zone", zoneId } : null;
    return selectedFixtureId ? { scope: "fixture", fixtureId: selectedFixtureId } : null;
  };

  const buildOperation = (): BulkOperation | null => {
    switch (opKind) {
      case "apply-template":
        return planogramId ? { op: "apply-template", planogramId } : null;
      case "set-campaign":
        return { op: "set-campaign", active: campaignOn };
      case "clear":
        return { op: "clear" };
      case "restock":
        return { op: "restock", stockLevel: restockLevel };
    }
  };

  const doPreview = () => {
    const target = buildTarget();
    const operation = buildOperation();
    if (!target || !operation) return;
    const pv = vm.store.previewBulkUpdate({ target, operation });
    setPreview(pv);
    vm.store.showDiffPreview(pv.diffs);
  };

  const doApply = () => {
    if (!preview) return;
    vm.store.applyBulkUpdate(preview.job);
    vm.store.showDiffPreview(null);
    onClose();
  };

  const cancel = () => {
    vm.store.showDiffPreview(null);
    onClose();
  };

  const diffCounts = preview
    ? preview.diffs.reduce(
        (acc, d) => {
          acc[d.kind]++;
          return acc;
        },
        { added: 0, removed: 0, changed: 0, moved: 0 },
      )
    : null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/55" onClick={cancel}>
      <div
        className="w-[430px] bg-[#1b1916] border border-[rgba(184,150,90,0.35)] rounded-xl shadow-2xl p-5 text-[#d9d2c2]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-[#c9a45e]">Bulk Update</div>
            <div className="text-sm text-[#f2e9d5]">Target → operation → preview → confirm</div>
          </div>
          <button onClick={cancel} className="text-[#8a857b] hover:text-[#e9cf9c]">✕</button>
        </div>

        <div className="space-y-3 text-xs">
          <div>
            <div className="text-[11px] text-[#8a857b] mb-1">Target</div>
            <div className="flex gap-2">
              {(
                [
                  ["zone", "Zone"],
                  ["floor", "Entire floor"],
                  ["fixture", "Selected fixture"],
                ] as Array<["zone" | "floor" | "fixture", string]>
              ).map(([k, label]) => (
                <button
                  key={k}
                  onClick={() => {
                    setScope(k);
                    setPreview(null);
                    vm.store.showDiffPreview(null);
                  }}
                  disabled={k === "fixture" && !selectedFixtureId}
                  className={`${btnCls} ${scope === k ? "bg-[rgba(184,150,90,0.2)]" : ""}`}
                >
                  {label}
                </button>
              ))}
            </div>
            {scope === "zone" && (
              <select value={zoneId} onChange={(e) => setZoneId(e.target.value)} className={`${fieldCls} mt-2`}>
                {vm.store.layout.zones.map((z) => (
                  <option key={z.id} value={z.id}>
                    {z.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div>
            <div className="text-[11px] text-[#8a857b] mb-1">Operation</div>
            <select
              value={opKind}
              onChange={(e) => {
                setOpKind(e.target.value as typeof opKind);
                setPreview(null);
                vm.store.showDiffPreview(null);
              }}
              className={fieldCls}
            >
              <option value="apply-template">Apply planogram template</option>
              <option value="set-campaign">Set campaign flags</option>
              <option value="restock">Restock signal</option>
              <option value="clear">Clear slots</option>
            </select>
            {opKind === "apply-template" && (
              <select
                value={planogramId}
                onChange={(e) => setPlanogramId(e.target.value)}
                className={`${fieldCls} mt-2`}
              >
                <option value="">Select planogram…</option>
                {vm.store.listPlanogramsSync().map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} {p.fixtureKind ? `(${p.fixtureKind})` : ""}
                  </option>
                ))}
              </select>
            )}
            {opKind === "set-campaign" && (
              <label className="flex items-center gap-2 mt-2 text-[#e8e2d4]">
                <input
                  type="checkbox"
                  checked={campaignOn}
                  onChange={(e) => setCampaignOn(e.target.checked)}
                  className="accent-[#c9a45e]"
                />
                Campaign active
              </label>
            )}
            {opKind === "restock" && (
              <div className="mt-2">
                <div className="flex justify-between text-[11px] mb-1">
                  <span className="text-[#8a857b]">Stock level</span>
                  <span className="text-[#e9cf9c]">{restockLevel}%</span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={restockLevel}
                  onChange={(e) => setRestockLevel(parseInt(e.target.value, 10))}
                  className="w-full accent-[#c9a45e]"
                />
              </div>
            )}
          </div>

          {preview && diffCounts && (
            <div className="bg-[#12100e] border border-[rgba(184,150,90,0.25)] rounded-lg p-3">
              <div className="text-[11px] text-[#8a857b] mb-1.5">
                Preview — {preview.affectedSlots} slots across {preview.affectedFixtures} fixtures
                (diff shown in 3D)
              </div>
              <div className="flex gap-3 text-[11px]">
                <span className="text-[#3f9c5c]">+{diffCounts.added} added</span>
                <span className="text-[#d13a3a]">−{diffCounts.removed} removed</span>
                <span className="text-[#e2a13c]">~{diffCounts.changed} changed</span>
                <span className="text-[#3c7bd9]">↔{diffCounts.moved} moved</span>
              </div>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            <button className={btnCls} onClick={doPreview}>
              Preview diff
            </button>
            <button className={`${btnCls} bg-[rgba(184,150,90,0.18)]`} disabled={!preview} onClick={doApply}>
              Confirm & apply
            </button>
            <button className={btnCls} onClick={cancel}>
              Cancel
            </button>
          </div>
          <div className="text-[10px] text-[#6f6b63]">
            Applies in &lt;100 ms floor-wide · lands on the undo stack (Ctrl+Z)
          </div>
        </div>
      </div>
    </div>
  );
}
