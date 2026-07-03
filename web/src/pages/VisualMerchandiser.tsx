/**
 * Visual Merchandiser — 3D boutique planning for Aurelle flagships.
 * Runs the browser gate first: Chrome 113+ on desktop with working WebGPU,
 * detected before the engine loads. No WebGL fallback by design.
 */

import { useEffect, useState } from "react";
import { runBrowserGate, type GateVerdict } from "../vm/core/BrowserGate";
import { parseParams } from "../vm/core/Params";
import { GateScreen } from "../vm/ui/GateScreens";
import { VMApp } from "../vm/ui/VMApp";

export function VisualMerchandiser() {
  const [verdict, setVerdict] = useState<GateVerdict | null>(null);

  useEffect(() => {
    let cancelled = false;
    void runBrowserGate(parseParams().nogate).then((v) => {
      if (!cancelled) setVerdict(v);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="-mx-10 -my-8" style={{ height: "calc(100vh - 64px)" }}>
      {verdict === null ? (
        <div className="h-full flex items-center justify-center bg-[#141311]">
          <div className="text-[11px] uppercase tracking-[0.28em] text-[#8a857b]">
            Checking WebGPU capability…
          </div>
        </div>
      ) : verdict.kind === "ok" ? (
        <VMApp />
      ) : (
        <GateScreen verdict={verdict} />
      )}
    </div>
  );
}
