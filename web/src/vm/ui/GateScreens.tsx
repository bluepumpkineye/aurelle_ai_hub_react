/**
 * Browser gate screens. The engine is built and tested against Chrome's
 * WebGPU implementation (Chrome 113+, desktop). Mobile gets a polite notice;
 * non-Chrome gets a clear requirement; Chrome-without-WebGPU fails loudly
 * with diagnostics and the exact things to check. No WebGL fallback by design.
 */

import type { ReactNode } from "react";
import type { GateVerdict } from "../core/BrowserGate";
import { WEBGPU_CHECKLIST } from "../core/BrowserGate";

function GateFrame({
  icon,
  title,
  children,
}: {
  icon: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="h-full flex items-center justify-center bg-[#141311] text-[#e8e2d4] p-8">
      <div className="max-w-xl w-full border border-[rgba(184,150,90,0.35)] rounded-xl bg-[#1b1916] p-10 shadow-2xl">
        <div className="text-4xl mb-4" aria-hidden>
          {icon}
        </div>
        <div className="font-display text-2xl text-[#e9cf9c] mb-1">Aurelle Visual Merchandiser</div>
        <div className="text-lg font-medium mb-4">{title}</div>
        <div className="text-sm text-[#b3aea4] leading-relaxed space-y-3">{children}</div>
      </div>
    </div>
  );
}

export function GateScreen({ verdict }: { verdict: Exclude<GateVerdict, { kind: "ok" }> }) {
  switch (verdict.kind) {
    case "mobile":
      return (
        <GateFrame icon="🖥️" title="A computer is required for the 3D planner">
          <p>
            The Aurelle 3D Visual Merchandiser is a real-time WebGPU application designed for
            desktop and laptop workstations. Mobile and tablet browsers cannot run the boutique
            engine.
          </p>
          <p>
            Please open this section on a desktop or laptop in{" "}
            <strong className="text-[#e8e2d4]">Google Chrome 113 or newer</strong>.
          </p>
        </GateFrame>
      );
    case "not-chrome":
      return (
        <GateFrame icon="🌐" title="Google Chrome is required">
          <p>
            You appear to be using <strong className="text-[#e8e2d4]">{verdict.browserName}</strong>.
            The boutique engine is built and tested against Chrome&apos;s WebGPU implementation and
            has no WebGL fallback by design.
          </p>
          <p>
            Please open this page in <strong className="text-[#e8e2d4]">Google Chrome 113+</strong>{" "}
            on a desktop or laptop.
          </p>
        </GateFrame>
      );
    case "chrome-too-old":
      return (
        <GateFrame icon="⬆️" title={`Chrome ${verdict.chromeVersion} is too old`}>
          <p>
            WebGPU ships in <strong className="text-[#e8e2d4]">Chrome 113 and newer</strong>. You are
            on Chrome {verdict.chromeVersion}.
          </p>
          <p>
            Update via <span className="font-mono text-xs bg-[#2a2620] px-1.5 py-0.5 rounded">Menu → Help → About Google Chrome</span>{" "}
            and relaunch.
          </p>
        </GateFrame>
      );
    case "no-webgpu":
      return (
        <GateFrame icon="⚠️" title="WebGPU is unavailable in this Chrome">
          <p>
            Chrome{verdict.chromeVersion ? ` ${verdict.chromeVersion}` : ""} is present but the
            WebGPU adapter probe failed. The engine will not fall back to WebGL — fix WebGPU and
            reload.
          </p>
          <div className="bg-[#241f18] border border-[rgba(194,90,58,0.4)] rounded-lg p-4 font-mono text-xs space-y-1">
            {verdict.diagnostics.map((d, i) => (
              <div key={i}>· {d}</div>
            ))}
          </div>
          <div>
            <div className="text-[#e9cf9c] font-medium mb-2">Things to check, in order:</div>
            <ol className="list-decimal ml-5 space-y-1.5">
              {WEBGPU_CHECKLIST.map((c, i) => (
                <li key={i}>{c}</li>
              ))}
            </ol>
          </div>
        </GateFrame>
      );
  }
}

export function EngineFailScreen({ message, diagnostics }: { message: string; diagnostics: string[] }) {
  return (
    <GateFrame icon="🛑" title="Engine initialization failed">
      <p>{message}</p>
      <div className="bg-[#241f18] border border-[rgba(194,90,58,0.4)] rounded-lg p-4 font-mono text-xs space-y-1">
        {diagnostics.map((d, i) => (
          <div key={i}>· {d}</div>
        ))}
      </div>
      <div>
        <div className="text-[#e9cf9c] font-medium mb-2">Checklist:</div>
        <ol className="list-decimal ml-5 space-y-1.5">
          {WEBGPU_CHECKLIST.map((c, i) => (
            <li key={i}>{c}</li>
          ))}
        </ol>
      </div>
    </GateFrame>
  );
}
