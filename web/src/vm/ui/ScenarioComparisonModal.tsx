import { useState, useEffect } from "react";
import type { VMController } from "../VMController";
import type { Scenario, FixtureInstance } from "../data/types";
import { api, streamReport } from "../../lib/api";

const modalCls =
  "fixed inset-4 z-50 bg-[#1b1916]/98 backdrop-blur border border-[rgba(184,150,90,0.35)] rounded-xl shadow-2xl flex flex-col text-[#d9d2c2] overflow-hidden";
const thCls = "px-3 py-2 text-left text-xs uppercase tracking-wider text-[#8a857b] border-b border-[rgba(184,150,90,0.15)]";
const tdCls = "px-3 py-2.5 text-xs text-[#f2e9d5] border-b border-[rgba(255,255,255,0.03)]";
const btnCls =
  "px-3 py-2 rounded text-xs border border-[rgba(184,150,90,0.4)] text-[#e9cf9c] hover:bg-[rgba(184,150,90,0.15)] transition disabled:opacity-40";

function diffPayloads(base: any, target: any) {
  if (!base || !target) return { added: [], removed: [], moved: [], replaced: [] };
  const baseFixtures = new Map(base.fixtures.map((f: any) => [f.id, f]));
  const targetFixtures = new Map(target.fixtures.map((f: any) => [f.id, f]));

  const added: string[] = [];
  const removed: any[] = [];
  const moved: string[] = [];
  const replaced: string[] = [];

  for (const [id, f] of targetFixtures.entries()) {
    if (!baseFixtures.has(id)) {
      added.push(id);
    } else {
      const bf = baseFixtures.get(id)!;
      const movedFlag =
        Math.abs(f.x - bf.x) > 0.05 ||
        Math.abs(f.z - bf.z) > 0.05 ||
        Math.abs(f.rotationY - bf.rotationY) > 0.05;
      const replacedFlag = f.templateId !== bf.templateId;

      if (replacedFlag) {
        replaced.push(id);
      } else if (movedFlag) {
        moved.push(id);
      }
    }
  }

  for (const [id, f] of baseFixtures.entries()) {
    if (!targetFixtures.has(id)) {
      removed.push(f);
    }
  }

  return { added, removed, moved, replaced };
}

interface ScenarioComparisonModalProps {
  vm: VMController;
  allScenarios: Scenario[];
  initialScenarioA: Scenario;
  initialScenarioB: Scenario;
  onClose: () => void;
}

export function ScenarioComparisonModal({
  vm,
  allScenarios,
  initialScenarioA,
  initialScenarioB,
  onClose
}: ScenarioComparisonModalProps) {
  const [scenA, setScenA] = useState<Scenario | null>(null);
  const [scenB, setScenB] = useState<Scenario | null>(null);

  const [aiText, setAiText] = useState("");
  const [generating, setGenerating] = useState(false);

  // Fetch full details (payloads) on select
  const fetchScenarioA = async (id: string) => {
    const details = await api.getScenario(id);
    setScenA(details);
  };

  const fetchScenarioB = async (id: string) => {
    const details = await api.getScenario(id);
    setScenB(details);
  };

  useEffect(() => {
    fetchScenarioA(initialScenarioA.id);
    fetchScenarioB(initialScenarioB.id);
  }, [initialScenarioA.id, initialScenarioB.id]);

  // Sync 3D highlights when selected scenarios change
  useEffect(() => {
    if (scenA && scenB && scenA.scenario_payload && scenB.scenario_payload) {
      const diffs = diffPayloads(scenA.scenario_payload, scenB.scenario_payload);
      vm.store.setDiffHighlights(diffs);
    }
    return () => {
      vm.store.setDiffHighlights(null);
    };
  }, [scenA, scenB, vm]);

  const handlePreview = (scen: Scenario) => {
    if (scen && scen.scenario_payload) {
      const base = vm.store.layouts.find((l) => l.id === scen.store_id) || vm.store.layouts[0];
      const layout = {
        ...base,
        fixtures: scen.scenario_payload.fixtures,
        zones: scen.scenario_payload.zones || base.zones,
        floor: scen.scenario_payload.floor || base.floor
      };
      const slotsMap = new Map();
      for (const [k, v] of Object.entries(scen.scenario_payload.slots)) {
        slotsMap.set(k, v);
      }
      vm.store.loadLayout(layout, slotsMap);
      vm.store.setActiveScenarioId(scen.id);
      vm.store.toast(`Loaded "${scen.name}" in 3D preview`, "info");
    }
  };

  const handleGenerateAIReview = async () => {
    if (!scenA || !scenB || !scenA.metric_payload || !scenB.metric_payload) return;
    setGenerating(true);
    setAiText("");
    const diffs = diffPayloads(scenA.scenario_payload, scenB.scenario_payload);
    
    // We stream LLM explainability report from backend
    try {
      await streamReport(
        "/api/scenarios/explain",
        {
          baseline_metrics: scenA.metric_payload,
          target_metrics: scenB.metric_payload,
          diffs: {
            added: diffs.added.length,
            removed: diffs.removed.length,
            moved: diffs.moved.length,
            replaced: diffs.replaced.length
          }
        },
        (chunk) => {
          setAiText((prev) => prev + chunk);
        },
        () => {
          setGenerating(false);
        }
      );
    } catch (e) {
      setGenerating(false);
      setAiText("Failed to generate AI Scenario Review. Please verify that the API server is running on port 8000.");
    }
  };

  const delta = (valA: number, valB: number, isPercent = false, suffix = "") => {
    const diff = valB - valA;
    if (diff === 0) return <span className="text-[#6f6b63] font-mono">0</span>;
    const sign = diff > 0 ? "+" : "";
    const color = diff > 0 ? "text-[#3f9c5c]" : "text-[#d13a3a]";
    return (
      <span className={`font-mono font-medium ${color}`}>
        {sign}
        {isPercent ? `${Math.round(diff)}%` : diff.toFixed(1)}
        {suffix}
      </span>
    );
  };

  const diffs = scenA && scenB ? diffPayloads(scenA.scenario_payload, scenB.scenario_payload) : null;

  return (
    <div className={modalCls}>
      {/* Header */}
      <div className="px-5 py-4 border-b border-[rgba(184,150,90,0.25)] flex justify-between items-center bg-[#14120f]">
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#c9a45e]">
            Side-by-Side Scenario Comparison
          </h2>
          <p className="text-[11px] text-[#8a857b] mt-0.5">
            Compare layout scenarios visually and commercially · Diff highlights active in 3D scene (Green=Added, Blue=Moved, Orange=Replaced, Red=Ghost)
          </p>
        </div>
        <button className={btnCls} onClick={onClose}>Close Comparison</button>
      </div>

      <div className="flex-1 flex overflow-hidden">
        {/* Left Side: KPIs and Scorecards */}
        <div className="w-2/3 border-r border-[rgba(184,150,90,0.2)] p-5 overflow-y-auto scroll-thin space-y-5">
          
          {/* Top selection drop downs */}
          <div className="grid grid-cols-2 gap-4">
            <div className="p-3 bg-[rgba(255,255,255,0.02)] rounded border border-[rgba(184,150,90,0.15)]">
              <label className="text-[10px] text-[#8a857b] uppercase tracking-wider block mb-1">Scenario A (Baseline)</label>
              <select
                value={scenA?.id || ""}
                onChange={(e) => fetchScenarioA(e.target.value)}
                className="w-full bg-[#12100e] border border-[rgba(184,150,90,0.25)] rounded px-2.5 py-1.5 text-xs text-[#e8e2d4]"
              >
                {allScenarios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                ))}
              </select>
              {scenA && (
                <button
                  className="mt-2 text-[10px] text-[#e9cf9c] hover:underline"
                  onClick={() => handlePreview(scenA)}
                >
                  Preview Scenario A in 3D
                </button>
              )}
            </div>

            <div className="p-3 bg-[rgba(255,255,255,0.02)] rounded border border-[rgba(184,150,90,0.15)]">
              <label className="text-[10px] text-[#8a857b] uppercase tracking-wider block mb-1">Scenario B (Proposed)</label>
              <select
                value={scenB?.id || ""}
                onChange={(e) => fetchScenarioB(e.target.value)}
                className="w-full bg-[#12100e] border border-[rgba(184,150,90,0.25)] rounded px-2.5 py-1.5 text-xs text-[#e8e2d4]"
              >
                {allScenarios.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.status})</option>
                ))}
              </select>
              {scenB && (
                <button
                  className="mt-2 text-[10px] text-[#e9cf9c] hover:underline"
                  onClick={() => handlePreview(scenB)}
                >
                  Preview Scenario B in 3D
                </button>
              )}
            </div>
          </div>

          {/* Metric Comparison Table */}
          {scenA?.metric_payload && scenB?.metric_payload && (
            <div className="border border-[rgba(184,150,90,0.18)] rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="bg-[rgba(184,150,90,0.04)]">
                    <th className={thCls}>Evaluation Criteria</th>
                    <th className={`${thCls} text-right w-28`}>{scenA.name}</th>
                    <th className={`${thCls} text-right w-28`}>{scenB.name}</th>
                    <th className={`${thCls} text-right w-20`}>Delta</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td className={`${tdCls} font-bold text-[#e9cf9c]`}>Composite Score</td>
                    <td className={`${tdCls} text-right font-bold text-[#e9cf9c]`}>{Math.round(scenA.metric_payload.score)}/100</td>
                    <td className={`${tdCls} text-right font-bold text-[#e9cf9c]`}>{Math.round(scenB.metric_payload.score)}/100</td>
                    <td className={`${tdCls} text-right font-bold`}>{delta(scenA.metric_payload.score, scenB.metric_payload.score, true)}</td>
                  </tr>
                  {[
                    ["space_efficiency", "Space Efficiency", false],
                    ["zone_balance", "Zone Balance", false],
                    ["adjacency_conflicts", "Adjacency Rules (No Conflicts)", false],
                    ["traffic_exposure", "Traffic Exposure Share", true, "%"],
                    ["dwell_potential", "Dwell Time Potential", false],
                    ["stock_coverage_risk", "Stock Coverage Health", true, "%"],
                    ["category_visibility", "Category Visibility Index", false]
                  ].map(([key, label, isPct, suff]) => {
                    const valA = (scenA.metric_payload!.breakdown as any)[key] ?? 100;
                    const valB = (scenB.metric_payload!.breakdown as any)[key] ?? 100;
                    return (
                      <tr key={key}>
                        <td className={tdCls}>{label}</td>
                        <td className={`${tdCls} text-right`}>{Math.round(valA)}{suff}</td>
                        <td className={`${tdCls} text-right`}>{Math.round(valB)}{suff}</td>
                        <td className={`${tdCls} text-right`}>{delta(valA, valB, isPct, suff)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}

          {/* Diffs & Changes Summary */}
          {diffs && (
            <div className="p-4 rounded-lg bg-[rgba(255,255,255,0.01)] border border-[rgba(184,150,90,0.12)] space-y-3">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#c9a45e]">Layout Changes Breakdown</h3>
              <div className="grid grid-cols-4 gap-4 text-center">
                <div className="p-2.5 rounded bg-[rgba(63,156,92,0.06)] border border-[rgba(63,156,92,0.2)]">
                  <div className="text-lg font-bold text-[#3f9c5c]">{diffs.added.length}</div>
                  <div className="text-[10px] text-[#8a857b]">Added</div>
                </div>
                <div className="p-2.5 rounded bg-[rgba(209,58,58,0.06)] border border-[rgba(209,58,58,0.2)]">
                  <div className="text-lg font-bold text-[#d13a3a]">{diffs.removed.length}</div>
                  <div className="text-[10px] text-[#8a857b]">Removed</div>
                </div>
                <div className="p-2.5 rounded bg-[rgba(30,144,255,0.06)] border border-[rgba(30,144,255,0.2)]">
                  <div className="text-lg font-bold text-[#1e90ff]">{diffs.moved.length}</div>
                  <div className="text-[10px] text-[#8a857b]">Moved</div>
                </div>
                <div className="p-2.5 rounded bg-[rgba(226,161,60,0.06)] border border-[rgba(226,161,60,0.2)]">
                  <div className="text-lg font-bold text-[#e2a13c]">{diffs.replaced.length}</div>
                  <div className="text-[10px] text-[#8a857b]">Replaced Type</div>
                </div>
              </div>
            </div>
          )}

          {/* Conflict warnings */}
          {scenB?.metric_payload?.conflicts && scenB.metric_payload.conflicts.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-xs font-semibold uppercase tracking-wider text-[#d13a3a]">Guideline Conflicts & Warnings</h3>
              <div className="space-y-1.5">
                {scenB.metric_payload.conflicts.map((c: any, i: number) => (
                  <div
                    key={i}
                    className={`p-2.5 rounded border text-[11px] flex gap-2 items-start ${
                      c.severity === "flag"
                        ? "bg-[rgba(209,58,58,0.08)] border-[rgba(209,58,58,0.3)] text-[#f2dede]"
                        : "bg-[rgba(226,161,60,0.06)] border-[rgba(226,161,60,0.25)] text-[#fcf8e3]"
                    }`}
                  >
                    <span className="font-bold">{c.severity === "flag" ? "⚠️ FLAG:" : "⚠ WARN:"}</span>
                    <div>
                      <div>{c.rule}</div>
                      <div className="text-[9px] text-[#8a857b] mt-0.5">Affects: {c.zoneA} & {c.zoneB}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Side: AI Review Streamer */}
        <div className="w-1/3 p-5 flex flex-col h-full bg-[#14120f]">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold uppercase tracking-wider text-[#c9a45e]">AI Merchandiser Review</span>
            <button
              className={btnCls}
              onClick={handleGenerateAIReview}
              disabled={generating || !scenA || !scenB}
            >
              {generating ? "Reviewing..." : "Generate AI Review"}
            </button>
          </div>

          <div className="flex-1 bg-[#12100e] border border-[rgba(184,150,90,0.2)] rounded-lg p-3 overflow-y-auto scroll-thin text-xs leading-relaxed text-[#cbbba0] select-text">
            {aiText ? (
              <div className="whitespace-pre-wrap">{aiText}</div>
            ) : generating ? (
              <div className="flex flex-col items-center justify-center h-full text-[#8a857b] space-y-2">
                <div className="w-5 h-5 border-2 border-[#c9a45e] border-t-transparent rounded-full animate-spin" />
                <div className="text-[10px] uppercase tracking-wider">Analyzing layouts and comparing commercial metrics...</div>
              </div>
            ) : (
              <div className="text-[#6f6b63] text-center mt-20">
                Click **Generate AI Review** to stream an automated visual merchandising analysis comparing layout scores and guideline alignment.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
