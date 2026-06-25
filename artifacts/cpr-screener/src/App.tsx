import { useState, useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Screener from "@/pages/Screener";
import PatternSidebar, { patterns } from "@/components/ui/PatternSidebar";
import { Menu } from "lucide-react";

const queryClient = new QueryClient();
const SIDEBAR_KEY = "cpr-sidebar-collapsed";

function getSavedCollapsed(): boolean {
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "true";
  } catch {
    return false;
  }
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="flex-1 flex items-center justify-center h-full min-h-screen">
      <div className="text-center">
        <div className="text-lg font-semibold text-foreground mb-2">{label}</div>
        <div className="text-muted-foreground text-sm">Pattern coming soon</div>
      </div>
    </div>
  );
}

function App() {
  const [activePattern, setActivePattern] = useState("littleabove");
  const [scanKey, setScanKey] = useState(0);                          // ← new
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(getSavedCollapsed);
  const [mobileOpen, setMobileOpen] = useState(false);

  // Auto-scan on first page load
  useEffect(() => {
    setScanKey((k) => k + 1);
  }, []);

  const handleToggle = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch { /* ignore */ }
      return next;
    });
  };

  // Nav click: switch pattern + trigger scan
  const handlePatternSelect = (id: string) => {
    setActivePattern(id);
  };

  const activeLabel =
    patterns.find((p) => p.id === activePattern)?.label ?? activePattern;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex min-h-screen bg-background">
          <PatternSidebar
            activePattern={activePattern}
            onSelect={handlePatternSelect}                             // ← was setActivePattern
            collapsed={sidebarCollapsed}
            onToggle={handleToggle}
            mobileOpen={mobileOpen}
            onMobileClose={() => setMobileOpen(false)}
          />
          <main className="flex-1 overflow-auto min-w-0">
            <button
              className="md:hidden fixed top-3 left-3 z-30 flex items-center justify-center w-9 h-9 rounded-lg transition-colors"
              style={{ background: "#161b22", border: "1px solid #1e2d3d", color: "#8ba3bc" }}
              onClick={() => setMobileOpen(true)}
              aria-label="Open menu"
            >
              <Menu className="w-5 h-5" />
            </button>
            {
              ["littleabove", "la-2tiny", "LA-PL12CL23", "la-allstepup", "littlebelow", "lb-2tiny", "lb-allstepdown", "LB-PU12CU23", "1LB-PL12CL23",
                "LBALLD-U2<PU1", "inside-cpr", "outside-cpr", "overlapping-higher", "overlapping-lower", "LBT-PU1>U1PL1>L1", "lower-bullish",
                "structure-bigabove", "HA-U1>PU4", "HAThin-U1>PU4", "structure-bigbelow", "L1<PL1-PU12CU23", "HB-L1<PL4-U1>TCPR", "HB-L1<PL2-U12CPU12", "HB-L1>PL1-PU1CU234"]
                .includes(activePattern) ? (
                  <>
                    {/* pass scanKey */}
                    <Screener activePattern={activePattern} scanKey={scanKey} />
                  </>
                ) : (
                  <ComingSoon label={activeLabel} />
                )
            }
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;