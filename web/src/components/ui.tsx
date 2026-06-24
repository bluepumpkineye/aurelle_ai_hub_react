import { ReactNode, useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "./AnimatedNumber";

// ── formatting ─────────────────────────────────────────────
export const fmtUsd = (v: number) => {
  if (Math.abs(v) >= 1e9) return `$${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (Math.abs(v) >= 1e3) return `$${(v / 1e3).toFixed(0)}K`;
  return `$${Math.round(v)}`;
};
export const fmtNum = (v: number) => Math.round(v).toLocaleString("en-US");
export const fmtPct = (v: number) => `${v.toFixed(1)}%`;
export const fmtPct0 = (v: number) => `${v.toFixed(0)}%`;
export const fmtWks = (v: number) => `${v.toFixed(1)} wks`;
export const fmtDays = (v: number) => `${v.toFixed(0)} days`;

export const C = {
  gold: "#B8965A",
  bordeaux: "#8B1A2B",
  forest: "#2D5A3D",
  ink: "#1A1A1A",
  muted: "#8A857B",
};
export const CHART_COLORS = [C.bordeaux, C.gold, C.forest, "#6B4E2D", "#4A4A6A", "#9B8B6E", "#D4C5A9"];

// ── atoms ──────────────────────────────────────────────────
export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`bg-card border border-line/80 rounded-[5px] shadow-soft ${className}`}>{children}</div>
  );
}
export function Eyebrow({ children }: { children: ReactNode }) {
  return <div className="label mb-4">{children}</div>;
}

export function Kpi({
  label,
  value,
  amount,
  format,
  sub,
  tone,
}: {
  label: string;
  value?: ReactNode;
  amount?: number;
  format?: (n: number) => string;
  sub?: string;
  tone?: string;
}) {
  const color = tone === "risk" ? "text-bordeaux" : tone === "good" ? "text-forest" : "text-ink";
  return (
    <Card className="shine group p-6 transition duration-300 hover:shadow-lift hover:-translate-y-[2px]">
      <div className="absolute inset-x-0 top-0 h-[2px] w-0 bg-gold transition-all duration-500 group-hover:w-full" />
      <div className="label">{label}</div>
      <div className={`font-display text-4xl font-light mt-3 tracking-tight ${color}`}>
        {amount !== undefined && format ? <AnimatedNumber value={amount} format={format} /> : value}
      </div>
      {sub && <div className="text-xs text-muted mt-2">{sub}</div>}
    </Card>
  );
}

export function MultiSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: string[];
  value: string[];
  onChange: (v: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, []);
  const toggle = (o: string) =>
    onChange(value.includes(o) ? value.filter((x) => x !== o) : [...value, o]);
  return (
    <div className="relative" ref={ref}>
      <div className="label mb-2">{label}</div>
      <button
        onClick={() => setOpen((v) => !v)}
        className="min-w-[170px] flex items-center justify-between gap-3 bg-card border border-line px-3.5 py-2.5 text-sm text-ink hover:border-gold transition"
      >
        <span className={value.length ? "text-ink" : "text-muted"}>
          {value.length ? `${value.length} selected` : "All"}
        </span>
        <span className="text-muted text-xs">▾</span>
      </button>
      {open && (
        <div className="absolute z-20 mt-1 w-64 max-h-72 overflow-auto bg-card border border-line shadow-soft scroll-thin">
          {value.length > 0 && (
            <button
              onClick={() => onChange([])}
              className="w-full text-left px-3.5 py-2 text-xs text-bordeaux hover:bg-cream"
            >
              Clear selection
            </button>
          )}
          {options.map((o) => (
            <label
              key={o}
              className="flex items-center gap-3 px-3.5 py-2 text-sm text-ink hover:bg-cream cursor-pointer"
            >
              <input
                type="checkbox"
                checked={value.includes(o)}
                onChange={() => toggle(o)}
                className="accent-[#B8965A]"
              />
              {o}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}

// ── streaming AI report card ───────────────────────────────
export function AiReport({
  title,
  buttonLabel,
  action,
  disabled,
  stream,
}: {
  title: string;
  buttonLabel: string;
  action?: string;
  disabled?: boolean;
  stream: (onToken: (c: string) => void, onDone: () => void) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function go() {
    setText("");
    setBusy(true);
    try {
      await stream((c) => setText((t) => t + c), () => setBusy(false));
    } catch {
      setBusy(false);
    }
  }

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between">
        <Eyebrow>{title}</Eyebrow>
        {text && !busy && (
          <span className="text-[10px] uppercase tracking-[0.15em] text-forest">
            ✓ generated · AI · confidential
          </span>
        )}
      </div>
      <button
        onClick={go}
        disabled={disabled || busy}
        className="w-full bg-sidebar text-cream text-xs font-medium uppercase tracking-[0.2em] py-3.5 hover:bg-[#222] transition disabled:opacity-40"
      >
        {busy ? "Generating…" : buttonLabel}
      </button>

      {(text || busy) && (
        <div
          className={`mt-5 whitespace-pre-wrap font-sans text-[14px] leading-relaxed text-ink ${
            busy ? "caret" : ""
          }`}
        >
          {text}
        </div>
      )}

      {action && text && !busy && (
        <div className="mt-5 border-l-2 border-gold pl-4">
          <div className="label mb-1">Recommended action</div>
          <div className="text-sm text-ink">{action}</div>
        </div>
      )}
    </Card>
  );
}
