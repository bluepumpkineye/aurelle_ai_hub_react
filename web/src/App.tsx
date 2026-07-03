import { Suspense, lazy, useState } from "react";
import { getToken, clearToken } from "./lib/api";
import { Login } from "./components/Login";
import { Shell } from "./components/Shell";
import { Clienteling } from "./pages/Clienteling";
import { ExecutiveDashboard } from "./pages/ExecutiveDashboard";
import { ProductPerformance } from "./pages/ProductPerformance";
import { BoutiqueAnalytics } from "./pages/BoutiqueAnalytics";
import { DemandSupply } from "./pages/DemandSupply";
import { MarketingIntelligence } from "./pages/MarketingIntelligence";
import { LlmOps } from "./pages/LlmOps";

// The 3D Visual Merchandiser ships the WebGPU engine (~1.3 MB) — lazy-loaded
// so the rest of the hub stays light.
const VisualMerchandiserLazy = lazy(() =>
  import("./pages/VisualMerchandiser").then((m) => ({ default: m.VisualMerchandiser })),
);

const VisualMerchandiser = () => (
  <Suspense
    fallback={
      <div className="-mx-10 -my-8 flex items-center justify-center bg-[#141311]" style={{ height: "calc(100vh - 64px)" }}>
        <div className="text-[11px] uppercase tracking-[0.28em] text-[#8a857b]">
          Loading boutique engine…
        </div>
      </div>
    }
  >
    <VisualMerchandiserLazy />
  </Suspense>
);

const PAGES: Record<string, () => JSX.Element> = {
  executive: ExecutiveDashboard,
  clienteling: Clienteling,
  product: ProductPerformance,
  boutique: BoutiqueAnalytics,
  demand: DemandSupply,
  vm: VisualMerchandiser,
  marketing: MarketingIntelligence,
  llmops: LlmOps,
};

export function App() {
  const [authed, setAuthed] = useState<boolean>(!!getToken());
  const [active, setActive] = useState<string>("executive");

  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;

  const Page = PAGES[active] || Clienteling;

  return (
    <Shell
      active={active}
      onNavigate={setActive}
      onLogout={() => {
        clearToken();
        setAuthed(false);
      }}
    >
      <Page />
    </Shell>
  );
}
