import { useState } from "react";
import type { VMController } from "../VMController";
import { SCENARIO_PRESETS, type ScenarioPreset } from "../data/ScenarioPresets";
import { useStoreEvents } from "./hooks";

const panelCls =
  "bg-[#1b1916]/95 backdrop-blur border border-[rgba(184,150,90,0.25)] rounded-lg text-[#d9d2c2] shadow-xl";

interface ScenarioPlanningPanelProps {
  vm: VMController;
}

export function ScenarioPlanningPanel({ vm }: ScenarioPlanningPanelProps) {
  // Trigger re-render on VMStore layout events
  useStoreEvents(vm.store, ["layout-loaded"]);

  const [activePresetId, setActivePresetId] = useState<string | null>(vm.activePresetId);

  const handleApplyPreset = (preset: ScenarioPreset) => {
    vm.applyScenarioPreset(preset);
    setActivePresetId(preset.id);
  };

  const handleReset = () => {
    vm.resetToDefaultLayout();
    setActivePresetId(null);
  };

  return (
    <div className={`${panelCls} w-[268px] max-h-full flex flex-col`}>
      <div className="px-4 pt-3.5 pb-2.5 border-b border-[rgba(184,150,90,0.2)]">
        <div className="text-[11px] uppercase tracking-[0.18em] text-[#c9a45e] font-semibold">
          Scenario Planning
        </div>
        <p className="text-[10px] text-[#8a857b] mt-1">
          Apply preset visual merchandising configurations to preview store transformations.
        </p>
      </div>

      <div className="overflow-y-auto scroll-thin px-3 py-3 space-y-3 flex-1 text-xs">
        {/* Active Scenario Card */}
        <div className="p-2.5 rounded bg-[rgba(184,150,90,0.06)] border border-[rgba(184,150,90,0.25)] flex items-center justify-between">
          <div>
            <div className="text-[9px] uppercase tracking-wider text-[#8a857b]">Current Ambience</div>
            <div className="text-xs font-semibold text-[#f2e9d5] mt-0.5">
              {activePresetId 
                ? SCENARIO_PRESETS.find((p) => p.id === activePresetId)?.name 
                : "Default Boutique Layout"}
            </div>
          </div>
          {activePresetId && (
            <button
              onClick={handleReset}
              className="text-[10px] text-[#c9a45e] hover:underline"
            >
              Reset
            </button>
          )}
        </div>

        {/* Preset Cards */}
        <div className="space-y-2">
          {SCENARIO_PRESETS.map((p) => {
            const isActive = activePresetId === p.id;
            return (
              <div
                key={p.id}
                onClick={() => handleApplyPreset(p)}
                className={`group p-3 rounded-lg bg-[#151311] border transition cursor-pointer flex flex-col relative overflow-hidden ${
                  isActive
                    ? "border-[#c9a45e] bg-[rgba(184,150,90,0.08)] shadow-[0_0_12px_rgba(184,150,90,0.15)]"
                    : "border-[rgba(184,150,90,0.12)] hover:border-[rgba(184,150,90,0.3)] hover:bg-[#181614]"
                }`}
              >
                {/* Mood Color Bar */}
                <div
                  className="absolute left-0 top-0 bottom-0 w-1"
                  style={{ backgroundColor: p.colorBar }}
                />

                <div className="pl-2.5">
                  <div className="flex items-center gap-2">
                    <span className="text-sm">{p.icon}</span>
                    <span className={`font-semibold text-xs transition ${
                      isActive ? "text-[#e9cf9c]" : "text-[#d9d2c2] group-hover:text-[#f2e9d5]"
                    }`}>
                      {p.name}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#8a857b] mt-1.5 leading-relaxed">
                    {p.description}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="p-3 border-t border-[rgba(184,150,90,0.15)] bg-[#12100e] flex gap-2">
        <button
          onClick={handleReset}
          disabled={!activePresetId}
          className="flex-1 py-1.5 rounded text-[11px] border border-[rgba(184,150,90,0.3)] text-[#8a857b] hover:text-[#d9d2c2] disabled:opacity-30 disabled:pointer-events-none transition"
        >
          Reset to Default
        </button>
      </div>
    </div>
  );
}
