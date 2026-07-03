/**
 * Performance dashboard — zone-by-zone table (revenue/m², traffic, dwell,
 * stock coverage, gaps, adjacency flags), sortable, click-to-navigate in 3D.
 * All figures come from the live in-memory analytics pass and are mock data
 * (labelled) until a BI adapter replaces the provider (EXTENSION.md).
 */

import { useState } from "react";
import * as THREE from "three";
import { polygonCentroid } from "../data/types";
import type { VMController } from "../VMController";
import { useStoreEvents } from "./hooks";

type SortKey = "revenuePerSqm" | "trafficShare" | "dwellSeconds" | "stockCoverage" | "gapCount";

export function Dashboard({ vm, onClose }: { vm: VMController; onClose: () => void }) {
  useStoreEvents(vm.store, ["analytics-changed", "layout-loaded"]);
  const [sortKey, setSortKey] = useState<SortKey>("revenuePerSqm");
  const analytics = vm.store.analytics;
  const zones = [...analytics.zones].sort((a, b) => b[sortKey] - a[sortKey]);
  const zoneById = new Map(vm.store.layout.zones.map((z) => [z.id, z]));

  const flyToZone = (zoneId: string) => {
    const zone = zoneById.get(zoneId);
    if (!zone) return;
    const [cx, cz] = polygonCentroid(zone.polygon);
    vm.rig.flyTo(new THREE.Vector3(cx + 2.2, 2.4, cz + 2.8), new THREE.Vector3(cx, 0.8, cz));
  };

  const th = (key: SortKey, label: string) => (
    <th
      className={`px-2 py-1.5 text-right cursor-pointer select-none whitespace-nowrap ${
        sortKey === key ? "text-[#e9cf9c]" : "text-[#8a857b] hover:text-[#d9d2c2]"
      }`}
      onClick={() => setSortKey(key)}
    >
      {label} {sortKey === key ? "↓" : ""}
    </th>
  );

  return (
    <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 w-[min(860px,92%)] bg-[#1b1916]/95 backdrop-blur border border-[rgba(184,150,90,0.3)] rounded-xl shadow-2xl text-[#d9d2c2]">
      <div className="flex items-center justify-between px-4 pt-3 pb-1">
        <div>
          <span className="text-[11px] uppercase tracking-[0.18em] text-[#c9a45e]">
            Zone Performance
          </span>
          <span className="ml-2 text-[10px] text-[#6f6b63]">
            mock analytics · live-reactive to planogram state
          </span>
        </div>
        <button onClick={onClose} className="text-[#8a857b] hover:text-[#e9cf9c]">✕</button>
      </div>
      <div className="px-2 pb-3 overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-[rgba(184,150,90,0.2)]">
              <th className="px-2 py-1.5 text-left text-[#8a857b]">Zone</th>
              {th("revenuePerSqm", "€/m²")}
              {th("trafficShare", "Traffic")}
              {th("dwellSeconds", "Dwell")}
              {th("stockCoverage", "Coverage")}
              {th("gapCount", "Gaps")}
              <th className="px-2 py-1.5 text-right text-[#8a857b]">Flags</th>
            </tr>
          </thead>
          <tbody>
            {zones.map((za) => {
              const zone = zoneById.get(za.zoneId);
              return (
                <tr
                  key={za.zoneId}
                  onClick={() => flyToZone(za.zoneId)}
                  className="cursor-pointer hover:bg-[rgba(184,150,90,0.08)] border-b border-[rgba(255,255,255,0.03)]"
                  title="Click to navigate in 3D"
                >
                  <td className="px-2 py-1.5">
                    <span
                      className="inline-block w-2 h-2 rounded-full mr-2"
                      style={{ background: zone?.color ?? "#888" }}
                    />
                    {zone?.name ?? za.zoneId}
                  </td>
                  <td className="px-2 py-1.5 text-right text-[#f2e9d5]">
                    €{za.revenuePerSqm.toLocaleString()}
                  </td>
                  <td className="px-2 py-1.5 text-right">{Math.round(za.trafficShare * 100)}%</td>
                  <td className="px-2 py-1.5 text-right">{za.dwellSeconds}s</td>
                  <td
                    className={`px-2 py-1.5 text-right ${
                      za.stockCoverage < 0.6
                        ? "text-[#d13a3a]"
                        : za.stockCoverage < 0.8
                          ? "text-[#e2a13c]"
                          : "text-[#3f9c5c]"
                    }`}
                  >
                    {Math.round(za.stockCoverage * 100)}%
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {za.gapCount > 0 ? (
                      <span className="text-[#e2a13c]">▲ {za.gapCount}</span>
                    ) : (
                      <span className="text-[#6f6b63]">—</span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right">
                    {za.adjacencyFlags > 0 ? (
                      <span className="text-[#d13a3a]">⚠ {za.adjacencyFlags}</span>
                    ) : (
                      <span className="text-[#6f6b63]">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
