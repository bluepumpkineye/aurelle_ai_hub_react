import { ReactNode } from "react";

const NAV = [
  { key: "executive", label: "Executive Dashboard", soon: false },
  { key: "clienteling", label: "Clienteling & CRM", soon: false },
  { key: "product", label: "Product Performance", soon: false },
  { key: "boutique", label: "Boutique Analytics", soon: false },
  { key: "demand", label: "Demand & Supply", soon: false },
  { key: "marketing", label: "Marketing Intelligence", soon: false },
  { key: "llmops", label: "LLMOps & Prompt Lab", soon: false },
];

export function Shell({
  children,
  active,
  onNavigate,
  onLogout,
}: {
  children: ReactNode;
  active: string;
  onNavigate: (k: string) => void;
  onLogout: () => void;
}) {
  const current = NAV.find((n) => n.key === active);

  return (
    <div className="min-h-screen flex bg-cream">
      {/* Sidebar */}
      <aside className="w-[244px] shrink-0 bg-sidebar text-cream flex flex-col sticky top-0 h-screen">
        <div className="px-7 pt-8 pb-6">
          <div className="font-sans text-[13px] font-medium tracking-[0.3em] text-white">AURELLE</div>
          <div className="label text-gold mt-1">APAC Intelligence Hub</div>
        </div>
        <div className="mx-7 h-px bg-[rgba(184,150,90,0.35)]" />
        <nav className="flex-1 px-3 py-5 space-y-1">
          {NAV.map((n) => {
            const isActive = n.key === active;
            return (
              <button
                key={n.key}
                disabled={n.soon}
                onClick={() => !n.soon && onNavigate(n.key)}
                className={[
                  "w-full text-left flex items-center justify-between px-4 py-2.5 text-[13px] font-light rounded-sm transition",
                  isActive
                    ? "text-white border-l-[3px] border-gold pl-[13px] bg-[rgba(255,255,255,0.04)]"
                    : n.soon
                      ? "text-[#6f6b63] border-l-[3px] border-transparent cursor-default"
                      : "text-[#b3aea4] border-l-[3px] border-transparent hover:text-white hover:bg-[rgba(255,255,255,0.02)]",
                ].join(" ")}
              >
                <span>{n.label}</span>
                {n.soon && (
                  <span className="text-[8px] uppercase tracking-[0.15em] text-[#5a574f]">soon</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="px-7 py-5 border-t border-[rgba(255,255,255,0.06)]">
          <button onClick={onLogout} className="label text-[#8A857B] hover:text-gold transition">
            Sign out
          </button>
        </div>
      </aside>

      {/* Main */}
      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-10 bg-cream/85 backdrop-blur-md border-b border-line px-10 h-16 flex items-center justify-between">
          <div className="text-sm text-muted">
            <span className="text-ink">{current?.label || "Aurelle"}</span>
            <span className="mx-2 text-line">/</span> APAC
          </div>
          <div className="flex items-center gap-2">
            <span className="w-1.5 h-1.5 rounded-full bg-forest" />
            <span className="label">Governed session</span>
          </div>
        </header>
        <main className="px-10 py-8 w-full">{children}</main>
      </div>
    </div>
  );
}
