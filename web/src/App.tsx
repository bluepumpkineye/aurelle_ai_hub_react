import { useState } from "react";
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

const PAGES: Record<string, () => JSX.Element> = {
  executive: ExecutiveDashboard,
  clienteling: Clienteling,
  product: ProductPerformance,
  boutique: BoutiqueAnalytics,
  demand: DemandSupply,
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
