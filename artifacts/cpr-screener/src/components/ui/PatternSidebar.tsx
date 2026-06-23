import {
  TrendingUp,
  TrendingDown,
  ArrowUpCircle,
  ArrowDownCircle,
  Layers,
  LayersIcon,
  Crosshair,
  Maximize2,
  BarChart2,
  BarChart,
  ChevronLeft,
  ChevronRight,
  Activity,
  X,
} from "lucide-react";

export interface Pattern {
  id: string;
  label: string;
  subtitle: string;
  icon: React.ElementType;
}

export const patterns: Pattern[] = [
  { id: "rising",             label: "CPR Rising",          subtitle: "Bullish pivot breakout",    icon: TrendingUp },
  { id: "falling-all",        label: "CPR Falling All",     subtitle: "Bearish pivot breakdown",   icon: TrendingDown },
  { id: "1LB-PL12CL23",       label: "1LB-PL12CL23:2PU4",   subtitle: "Bullish Target:2PU4",       icon: TrendingUp },
  { id: "LBALLD-U2<PU1",      label: "LBALLD-U2<PU1:2U4",   subtitle: "Bullish Target:2U4",        icon: TrendingUp },
  { id: "HB-PU12CU23",        label: "HB-PU12CU23:2PU4",    subtitle: "Bullish Target:2PU4",       icon: TrendingUp },
  { id: "higher-value",       label: "Higher Value CPR",    subtitle: "Price above CPR zone",      icon: ArrowUpCircle },
  { id: "lower-value",        label: "Lower Value CPR",     subtitle: "Price below CPR zone",      icon: ArrowDownCircle },
  { id: "overlapping-higher", label: "Overlapping Higher",  subtitle: "CPR zones stacking up",     icon: Layers },
  { id: "overlapping-lower",  label: "Overlapping Lower",   subtitle: "CPR zones stacking down",   icon: LayersIcon },
  { id: "inside-value",       label: "Inside Value CPR",    subtitle: "Price inside CPR range",    icon: Crosshair },
  { id: "outside-value",      label: "Outside Value CPR",   subtitle: "Price outside CPR range",   icon: Maximize2 },
  { id: "structure-bullish",  label: "U1>PU4 Bullish",   subtitle: "Higher highs forming",      icon: BarChart2 },
  { id: "structure-bullish-all",  label: "U1>PU4 Bullish All",   subtitle: "Higher highs forming",      icon: BarChart2 },
  { id: "lower-bullish",      label: "LowerCPR Bullish",    subtitle: "Higher highs forming",      icon: BarChart2 },
  { id: "structure-bearish",  label: "Structure Bearish",   subtitle: "Wide CPR below PCPR",        icon: BarChart },
];

interface PatternSidebarProps {
  activePattern: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
  onToggle: () => void;
  mobileOpen: boolean;
  onMobileClose: () => void;
}

function PatternList({
  activePattern,
  onSelect,
  collapsed,
}: {
  activePattern: string;
  onSelect: (id: string) => void;
  collapsed: boolean;
}) {
  return (
    <nav className="flex flex-col gap-0.5 px-2">
      {patterns.map((pattern) => {
        const Icon = pattern.icon;
        const isActive = activePattern === pattern.id;
        return (
          <button
            key={pattern.id}
            onClick={() => onSelect(pattern.id)}
            title={collapsed ? pattern.label : undefined}
            className="w-full text-left rounded-lg transition-all duration-150 group"
            style={{
              padding: collapsed ? "10px" : "10px 12px",
              background: isActive
                ? "linear-gradient(90deg, rgba(59,130,246,0.18) 0%, rgba(99,102,241,0.08) 100%)"
                : "transparent",
              borderLeft: isActive ? "2px solid #3b82f6" : "2px solid transparent",
            }}
            onMouseEnter={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.04)";
            }}
            onMouseLeave={(e) => {
              if (!isActive)
                (e.currentTarget as HTMLButtonElement).style.background = "transparent";
            }}
          >
            <div className={`flex items-center ${collapsed ? "justify-center" : "gap-3"}`}>
              <div
                className="flex items-center justify-center rounded-lg shrink-0 transition-colors"
                style={{
                  width: 32,
                  height: 32,
                  background: isActive ? "rgba(59,130,246,0.2)" : "rgba(255,255,255,0.05)",
                }}
              >
                <Icon
                  className="w-4 h-4 transition-colors"
                  style={{ color: isActive ? "#60a5fa" : "#4b6a8a" }}
                />
              </div>
              {!collapsed && (
                <div className="overflow-hidden">
                  <div
                    className="font-semibold text-sm leading-tight truncate"
                    style={{ color: isActive ? "#e2e8f0" : "#8ba3bc" }}
                  >
                    {pattern.label}
                  </div>
                  <div
                    className="text-xs truncate mt-0.5"
                    style={{ color: "#3b5278", fontSize: 11 }}
                  >
                    {pattern.subtitle}
                  </div>
                </div>
              )}
            </div>
          </button>
        );
      })}
    </nav>
  );
}

export default function PatternSidebar({
  activePattern,
  onSelect,
  collapsed,
  onToggle,
  mobileOpen,
  onMobileClose,
}: PatternSidebarProps) {
  return (
    <>
      {/* ── Desktop sidebar (hidden on mobile) ─────────────────────── */}
      <aside
        className={`relative shrink-0 min-h-screen hidden md:flex flex-col transition-all duration-300 ${
          collapsed ? "w-16" : "w-64"
        }`}
        style={{ background: "#0d1117", borderRight: "1px solid #1e2d3d" }}
      >
        {/* Brand Header */}
        <div
          className="flex items-center gap-3 px-4 py-5"
          style={{ borderBottom: "1px solid #1e2d3d" }}
        >
          <div
            className="flex items-center justify-center rounded-xl shrink-0"
            style={{
              width: 38,
              height: 38,
              background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
            }}
          >
            <Activity className="w-5 h-5 text-white" />
          </div>
          {!collapsed && (
            <div className="overflow-hidden">
              <div
                className="font-bold text-white leading-tight truncate"
                style={{ fontSize: 15, letterSpacing: "-0.01em" }}
              >
                CPR Screener
              </div>
              <div className="text-xs" style={{ color: "#4b6a8a" }}>
                by Kriven Gokul
              </div>
            </div>
          )}
        </div>

        {/* Patterns Section */}
        <div className="flex-1 py-4 overflow-y-auto">
          {!collapsed && (
            <div
              className="px-4 pb-3 text-xs font-semibold tracking-widest uppercase"
              style={{ color: "#3b5278" }}
            >
              Patterns
            </div>
          )}
          <PatternList
            activePattern={activePattern}
            onSelect={onSelect}
            collapsed={collapsed}
          />
        </div>

        {/* Collapse Toggle */}
        <div className="px-3 py-3" style={{ borderTop: "1px solid #1e2d3d" }}>
          <button
            onClick={onToggle}
            className="flex items-center justify-center w-full rounded-lg py-2 transition-colors"
            style={{ color: "#3b5278" }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.05)";
              (e.currentTarget as HTMLButtonElement).style.color = "#8ba3bc";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "transparent";
              (e.currentTarget as HTMLButtonElement).style.color = "#3b5278";
            }}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <div className="flex items-center gap-2 text-xs font-medium">
                <ChevronLeft className="w-4 h-4" />
                Collapse
              </div>
            )}
          </button>
        </div>
      </aside>

      {/* ── Mobile drawer (hidden on md+) ───────────────────────────── */}
      {mobileOpen && (
        <>
          {/* Backdrop */}
          <div
            className="md:hidden fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onMobileClose}
          />

          {/* Drawer panel */}
          <aside
            className="md:hidden fixed left-0 top-0 bottom-0 z-50 w-72 flex flex-col"
            style={{
              background: "#0d1117",
              borderRight: "1px solid #1e2d3d",
              animation: "slideInLeft 0.22s ease-out",
            }}
          >
            {/* Header */}
            <div
              className="flex items-center justify-between px-4 py-5"
              style={{ borderBottom: "1px solid #1e2d3d" }}
            >
              <div className="flex items-center gap-3">
                <div
                  className="flex items-center justify-center rounded-xl shrink-0"
                  style={{
                    width: 38,
                    height: 38,
                    background: "linear-gradient(135deg, #3b82f6 0%, #6366f1 100%)",
                  }}
                >
                  <Activity className="w-5 h-5 text-white" />
                </div>
                <div>
                  <div
                    className="font-bold text-white leading-tight"
                    style={{ fontSize: 15, letterSpacing: "-0.01em" }}
                  >
                    CPR Screener
                  </div>
                  <div className="text-xs" style={{ color: "#4b6a8a" }}>
                    by Kriven Gokul
                  </div>
                </div>
              </div>
              <button
                onClick={onMobileClose}
                className="flex items-center justify-center w-8 h-8 rounded-lg transition-colors"
                style={{ color: "#4b6a8a" }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "rgba(255,255,255,0.06)";
                  (e.currentTarget as HTMLButtonElement).style.color = "#8ba3bc";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "transparent";
                  (e.currentTarget as HTMLButtonElement).style.color = "#4b6a8a";
                }}
                aria-label="Close menu"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Patterns */}
            <div className="flex-1 py-4 overflow-y-auto">
              <div
                className="px-4 pb-3 text-xs font-semibold tracking-widest uppercase"
                style={{ color: "#3b5278" }}
              >
                Patterns
              </div>
              {/* Reuse PatternList but close drawer on select */}
              <nav className="flex flex-col gap-0.5 px-2">
                {patterns.map((pattern) => {
                  const Icon = pattern.icon;
                  const isActive = activePattern === pattern.id;
                  return (
                    <button
                      key={pattern.id}
                      onClick={() => {
                        onSelect(pattern.id);
                        onMobileClose();
                      }}
                      className="w-full text-left rounded-lg transition-all duration-150"
                      style={{
                        padding: "10px 12px",
                        background: isActive
                          ? "linear-gradient(90deg, rgba(59,130,246,0.18) 0%, rgba(99,102,241,0.08) 100%)"
                          : "transparent",
                        borderLeft: isActive ? "2px solid #3b82f6" : "2px solid transparent",
                      }}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className="flex items-center justify-center rounded-lg shrink-0"
                          style={{
                            width: 32,
                            height: 32,
                            background: isActive
                              ? "rgba(59,130,246,0.2)"
                              : "rgba(255,255,255,0.05)",
                          }}
                        >
                          <Icon
                            className="w-4 h-4"
                            style={{ color: isActive ? "#60a5fa" : "#4b6a8a" }}
                          />
                        </div>
                        <div className="overflow-hidden">
                          <div
                            className="font-semibold text-sm leading-tight truncate"
                            style={{ color: isActive ? "#e2e8f0" : "#8ba3bc" }}
                          >
                            {pattern.label}
                          </div>
                          <div
                            className="text-xs truncate mt-0.5"
                            style={{ color: "#3b5278", fontSize: 11 }}
                          >
                            {pattern.subtitle}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </nav>
            </div>
          </aside>

          {/* Slide-in keyframe — injected once */}
          <style>{`
            @keyframes slideInLeft {
              from { transform: translateX(-100%); }
              to   { transform: translateX(0); }
            }
          `}</style>
        </>
      )}
    </>
  );
}
