import { useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import Screener from "@/pages/Screener";
import PatternSidebar, { patterns } from "@/components/ui/PatternSidebar";

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
  const [activePattern, setActivePattern] = useState("rising");
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean>(getSavedCollapsed);

  const handleToggle = () => {
    setSidebarCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(SIDEBAR_KEY, String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  const activeLabel =
    patterns.find((p) => p.id === activePattern)?.label ?? activePattern;

  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <div className="flex min-h-screen bg-background">
          <PatternSidebar
            activePattern={activePattern}
            onSelect={setActivePattern}
            collapsed={sidebarCollapsed}
            onToggle={handleToggle}
          />
          <main className="flex-1 overflow-auto">
            {activePattern === "rising" || activePattern === "falling" ? (
              <Screener activePattern={activePattern} />
            ) : (
              <ComingSoon label={activeLabel} />
            )}
          </main>
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
