import { useState, useEffect, useRef, useCallback } from "react";
import {
  TrendingUp,
  RefreshCw,
  Search,
  ChevronUp,
  ChevronDown,
  ArrowUpDown,
  ExternalLink,
} from "lucide-react";
import { runScreener } from "@/lib/binance";
import { runDeltaScreener } from "@/lib/delta";
import type { CPRResult } from "@/lib/cpr";
import {
  shouldAutoScan,
  markScannedToday,
  hasScannedToday,
  getLastScanDate,
  getNextScanIST,
  formatCountdown,
  formatISTTime,
} from "@/lib/scheduler";
import {
  type SortKey,
  type SortDir,
  type ActiveTab,
  type CPRResultWithSource,
  fmt,
  fmtPct,
  fmtVol,
  getVal,
  splitSymbol,
  getChartUrl,
  passesPattern,
  distanceFromCPR,
  getPivotLevel,
  type PivotLevelInfo,
  SRLadder,
} from "./ScreenerUtils";

export default function Screener({ activePattern = "littleabove", scanKey = 0 }: { activePattern?: string; scanKey?: number }) {
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [progress, setProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [allResults, setAllResults] = useState<CPRResult[]>([]);
  const [filtered, setFiltered] = useState<CPRResult[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("compressionRatio");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [showLABothTiny, setShowLABothTiny] = useState(false);
  const [showLAAllUp, setShowLAAllUp] = useState(false);
  const [showLAPL12CL23, setShowLAPL12CL23] = useState(false);
  const [showLAExpando, setShowLAExpando] = useState(false);
  const [showOutsideCPRCompressed, setShowOutsideCPRCompressed] = useState(false);
  const [showInsideCPRExpanded, setShowInsideCPRExpanded] = useState(false);
  const [showBigBelowPMiniPL3, setShowBigBelowPMiniPL3] = useState(false);
  const [showBigAbovePL34CL4, setShowBigAbovePL34CL4] = useState(false);
  // NEW: BigCPR Above — BAComp-l3>pl1/u3>pu1 filter state
  const [showBAComp, setShowBAComp] = useState(false);
  // NEW: LB Compressed filter state
  const [showLBCmprss, setShowLBCmprss] = useState(false);
  const [showLBC34, setShowLBC34] = useState(false);
  // NEW: LB-BothTiny / LB-AllUp filter state (replaces hidden left-nav items)
  const [showLBBothTiny, setShowLBBothTiny] = useState(false);
  const [showLBAllUp, setShowLBAllUp] = useState(false);
  const [pivotLevelFilter, setPivotLevelFilter] = useState<PivotLevelInfo["label"] | null>(null);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");
  const [nextScanUtc, setNextScanUtc] = useState<Date>(getNextScanIST());
  const [alreadyScannedToday] = useState(() => hasScannedToday());
  const [lastScanDate] = useState(() => getLastScanDate());
  const scanRef = useRef(false);

  const [deltaStatus, setDeltaStatus] = useState<"idle" | "scanning" | "done" | "error">("idle");
  const [deltaProgress, setDeltaProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [deltaAllResults, setDeltaAllResults] = useState<CPRResult[]>([]);
  const [deltaFiltered, setDeltaFiltered] = useState<CPRResult[]>([]);
  const [deltaError, setDeltaError] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("binance");
  const deltaScanRef = useRef(false);

  const [expandedSymbols, setExpandedSymbols] = useState<Set<string>>(new Set());

  function toggleExpand(key: string) {
    setExpandedSymbols((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  }

  const allResultsRef = useRef<CPRResult[]>([]);
  const deltaAllResultsRef = useRef<CPRResult[]>([]);
  const activePatternRef = useRef(activePattern);
  useEffect(() => { allResultsRef.current = allResults; }, [allResults]);
  useEffect(() => { deltaAllResultsRef.current = deltaAllResults; }, [deltaAllResults]);
  useEffect(() => { activePatternRef.current = activePattern; }, [activePattern]);

  const doScan = useCallback(async () => {
    if (scanRef.current) return;
    scanRef.current = true;
    setStatus("scanning");
    setActiveTab("binance");
    setAllResults([]);
    setFiltered([]);
    setError("");
    setProgress({ done: 0, total: 0, symbol: "" });
    try {
      const results = await runScreener((done, total, symbol) => {
        setProgress({ done, total, symbol });
      });
      setAllResults(results);
      setFiltered(results.filter((r) => passesPattern(r, activePattern)));
      setStatus("done");
      markScannedToday();
      setNextScanUtc(getNextScanIST());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    } finally {
      scanRef.current = false;
    }
  }, [activePattern]);

  const doDeltaScan = useCallback(async () => {
    if (deltaScanRef.current) return;
    deltaScanRef.current = true;
    setDeltaStatus("scanning");
    setActiveTab("delta");
    setDeltaAllResults([]);
    setDeltaFiltered([]);
    setDeltaError("");
    setDeltaProgress({ done: 0, total: 0, symbol: "" });
    try {
      const results = await runDeltaScreener((done, total, symbol) => {
        setDeltaProgress({ done, total, symbol });
      });
      setDeltaAllResults(results);
      setDeltaFiltered(results.filter((r) => passesPattern(r, activePattern)));
      setDeltaStatus("done");
    } catch (e) {
      setDeltaError(e instanceof Error ? e.message : "Unknown error");
      setDeltaStatus("error");
    } finally {
      deltaScanRef.current = false;
    }
  }, [activePattern]);

  useEffect(() => {
    if (shouldAutoScan()) doScan();
  }, [doScan]);

  useEffect(() => {
  if (scanKey > 0) {
    doScan();
    doDeltaScan();
    }
  }, [scanKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const tick = () => setCountdown(formatCountdown(nextScanUtc));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextScanUtc]);

  // Binance live price refresh every 30s
  useEffect(() => {
    if (status !== "done") return;
    const refresh = async () => {
      const results = allResultsRef.current;
      if (!results.length) return;
      try {
        const symbols = results.map((r) => r.symbol);
        const chunks: string[][] = [];
        for (let i = 0; i < symbols.length; i += 100) chunks.push(symbols.slice(i, i + 100));
        const priceMap = new Map<string, { price: number; change: number }>();
        await Promise.all(
          chunks.map(async (chunk) => {
            const res = await fetch(
              `https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(JSON.stringify(chunk))}&type=MINI`
            );
            if (!res.ok) return;
            const tickers: Array<{ symbol: string; lastPrice: string; openPrice: string }> = await res.json();
            tickers.forEach((t) => {
              const price = parseFloat(t.lastPrice);
              const open  = parseFloat(t.openPrice);
              priceMap.set(t.symbol, { price, change: open > 0 ? ((price - open) / open) * 100 : 0 });
            });
          })
        );
        // AFTER — use r.openPrice (your 5:30 AM IST baseline) for % calc
      const apply = (prev: CPRResult[]): CPRResult[] =>
        prev.map((r) => {
          const live = priceMap.get(r.symbol);
          if (!live) return r;
          const change24h = r.openPrice > 0
            ? ((live.price - r.openPrice) / r.openPrice) * 100
            : live.change; // fallback
          return { ...r, currentPrice: live.price, change24h };
        });
        setAllResults((p) => apply(p));
        setFiltered((p) => apply(p));
      } catch { /* silent */ }
    };
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [status]);

  // Delta live price refresh every 30s
  useEffect(() => {
    if (deltaStatus !== "done") return;
    const refresh = async () => {
      const results = deltaAllResultsRef.current;
      if (!results.length) return;
      try {
        const res = await fetch(
          "https://api.india.delta.exchange/v2/tickers?contract_types=perpetual_futures&page_size=500",
          { cache: "no-store" }
        );
        if (!res.ok) return;
        const data = await res.json();
        const tickers: Array<{ symbol: string; mark_price: string; ltp_change_24h: string }> =
          (data.result ?? []) as Array<{ symbol: string; mark_price: string; ltp_change_24h: string }>;
        const priceMap = new Map(tickers.map((t) => [t.symbol, t]));
                // AFTER for Delta
        const apply = (prev: CPRResult[]): CPRResult[] =>
          prev.map((r) => {
            const t = priceMap.get(r.symbol);
            if (!t) return r;
            const price = parseFloat(t.mark_price);
            if (price <= 0) return r;
            const change24h = r.openPrice > 0
              ? ((price - r.openPrice) / r.openPrice) * 100
              : parseFloat(t.ltp_change_24h); // fallback
            return { ...r, currentPrice: price, change24h };
          });
        setDeltaAllResults((p) => apply(p));
        setDeltaFiltered((p) => apply(p));
      } catch { /* silent */ }
    };
    const id = setInterval(refresh, 30_000);
    return () => clearInterval(id);
  }, [deltaStatus]);

  useEffect(() => {
    if (allResults.length > 0) setFiltered(allResults.filter((r) => passesPattern(r, activePattern)));
    if (deltaAllResults.length > 0) setDeltaFiltered(deltaAllResults.filter((r) => passesPattern(r, activePattern)));
    if (activePattern !== "littleabove") { setShowLABothTiny(false); setShowLAAllUp(false); setShowLAPL12CL23(false); setShowLAExpando(false); }
    if (activePattern !== "outside-cpr") { setShowOutsideCPRCompressed(false); }
    if (activePattern !== "inside-cpr") { setShowInsideCPRExpanded(false); }
    if (activePattern !== "structure-bigbelow") { setShowBigBelowPMiniPL3(false); }
    if (activePattern !== "structure-bigabove") { setShowBigAbovePL34CL4(false); setShowBAComp(false); }
    // Reset LB Compressed / LB-BothTiny / LB-AllUp when leaving littlebelow
    if (activePattern !== "littlebelow") { setShowLBCmprss(false); setShowLBBothTiny(false); setShowLBAllUp(false); }
  }, [activePattern, allResults, deltaAllResults]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortKey(key); setSortDir("asc"); }
  };

  const activeProgress = activeTab === "delta" ? deltaProgress : progress;
  const progressPct = activeProgress.total > 0 ? Math.round((activeProgress.done / activeProgress.total) * 100) : 0;

  const combinedResults: CPRResultWithSource[] = [
    ...filtered.map((r) => ({ ...r, source: "binance" as const })),
    ...deltaFiltered.map((r) => ({ ...r, source: "delta" as const })),
  ];
  const combinedAllResults: CPRResultWithSource[] = [
    ...allResults.map((r) => ({ ...r, source: "binance" as const })),
    ...deltaAllResults.map((r) => ({ ...r, source: "delta" as const })),
  ];

  const getActivePool = (): CPRResultWithSource[] => {
    if (showLABothTiny && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "la-2tiny")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "la-2tiny")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showLAAllUp && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "la-allstepup")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "la-allstepup")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showLAPL12CL23 && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "LA-PL12CL23")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "LA-PL12CL23")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showLAExpando && activePattern === "littleabove") {
      const binanceIntersect = allResults.filter((r) => passesPattern(r, "la-expando")).map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults.filter((r) => passesPattern(r, "la-expando")).map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showOutsideCPRCompressed && activePattern === "outside-cpr") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "outside-cpr-compressed"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "outside-cpr-compressed"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showInsideCPRExpanded && activePattern === "inside-cpr") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "inside-cpr-expanded"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "inside-cpr-expanded"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showBigBelowPMiniPL3 && activePattern === "structure-bigbelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "bigbelow-pmini-pl3"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "bigbelow-pmini-pl3"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (showBigAbovePL34CL4 && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "bigabove-pl34cl4-u3>pu4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "bigabove-pl34cl4-u3>pu4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: BigCPR Above — BAComp-l3>pl1/u3>pu1 pool
    if (showBAComp && activePattern === "structure-bigabove") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "bacomp-l3>pl1/u3>pu1"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "bacomp-l3>pl1/u3>pu1"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: LB Compressed pool
    if (showLBCmprss && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "lb-cmprss-l4>3-u4<2"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "lb-cmprss-l4>3-u4<2"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: LB-C-L34C4/U23C4 pool
    if (showLBC34 && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "lb-c-l34c4/u23c4"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "lb-c-l34c4/u23c4"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: LB-BothTiny pool (formerly "TinyBelow - Both Tiny" left-nav item)
    if (showLBBothTiny && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "lb-2tiny"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "lb-2tiny"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    // NEW: LB-AllUp pool (formerly "LittleBelow - Ladder" left-nav item)
    if (showLBAllUp && activePattern === "littlebelow") {
      const binanceIntersect = allResults
        .filter((r) => passesPattern(r, "lb-allstepdown"))
        .map((r) => ({ ...r, source: "binance" as const }));
      const deltaIntersect = deltaAllResults
        .filter((r) => passesPattern(r, "lb-allstepdown"))
        .map((r) => ({ ...r, source: "delta" as const }));
      if (activeTab === "combined") return [...binanceIntersect, ...deltaIntersect];
      if (activeTab === "delta") return deltaIntersect;
      return binanceIntersect;
    }
    if (activeTab === "combined") return showAll ? combinedAllResults : combinedResults;
    if (activeTab === "delta") return (showAll ? deltaAllResults : deltaFiltered).map((r) => ({ ...r, source: "delta" as const }));
    return (showAll ? allResults : filtered).map((r) => ({ ...r, source: "binance" as const }));
  };

  const displayed = getActivePool()
    .filter((r) => r.symbol.toLowerCase().includes(search.toLowerCase()))
    .filter((r) => !pivotLevelFilter || getPivotLevel(r)?.label === pivotLevelFilter)
    .slice()
    .sort((a, b) => {
      const av = getVal(a, sortKey);
      const bv = getVal(b, sortKey);
      if (typeof av === "string" && typeof bv === "string")
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

  const currentStatus =
    activeTab === "binance" ? status
    : activeTab === "delta" ? deltaStatus
    : status === "done" || deltaStatus === "done" ? "done"
    : status === "scanning" || deltaStatus === "scanning" ? "scanning"
    : "idle";

  const currentFilteredCount =
    activeTab === "combined" ? combinedResults.length
    : activeTab === "delta" ? deltaFiltered.length
    : filtered.length;

  const currentAllCount =
    activeTab === "combined" ? combinedAllResults.length
    : activeTab === "delta" ? deltaAllResults.length
    : allResults.length;

  const currentError = activeTab === "delta" ? deltaError : error;
  const canShowCombined = status === "done" || deltaStatus === "done";

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k
      ? sortDir === "asc"
        ? <ChevronUp className="w-3 h-3 inline ml-1 text-primary" />
        : <ChevronDown className="w-3 h-3 inline ml-1 text-primary" />
      : <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30" />;

  // Helper: is any sub-filter active (to decide the result count label)
  const anySubFilter =
    showLABothTiny || showLAAllUp || showLAPL12CL23 || showLAExpando ||
    showOutsideCPRCompressed || showInsideCPRExpanded ||
    showBigBelowPMiniPL3 || showBigAbovePL34CL4 || showBAComp || showLBCmprss || showLBC34 ||
    showLBBothTiny || showLBAllUp ||
    !!pivotLevelFilter;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight">CPR Screener</h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              by Kriven Gokul
            </span>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
            {activePattern === "falling" ? (
              <>Filters where <span className="text-foreground font-medium">today&apos;s TC is below yesterday&apos;s BC</span> and <span className="text-foreground font-medium">CPR is narrower than 50% of yesterday&apos;s</span>.</>
            ) : activePattern === "inside-value" ? (
              <>Filters where <span className="text-foreground font-medium">today&apos;s CPR is fully inside yesterday&apos;s CPR</span> — compression with breakout potential.</>
            ) : (
              <>Filters where <span className="text-foreground font-medium">today&apos;s BC is above yesterday&apos;s TC</span> and <span className="text-foreground font-medium">CPR width is less than 50% of yesterday&apos;s</span>.</>
            )}
          </p>
        </div>

        {/* Legend */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <div className="rounded-lg border border-border bg-card p-3">
            {activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-primary mb-1">BigCPR Above</div>
                <div className="text-xs text-muted-foreground">Wide CPR Above PCPR — today&apos;s CPR is wider than yesterday&apos;s and present above it</div>
              </>
            ) : activePattern === "structure-bigbelow" ? (
              <>
                <div className="text-xs font-semibold text-primary mb-1">Big Below</div>
                <div className="text-xs text-muted-foreground">Wide CPR Below PCPR — today&apos;s CPR is wider than yesterday&apos;s and present below it</div>
              </>
            ) : activePattern === "littleabove" ? (
              <>
                <div className="text-xs font-semibold text-primary mb-1">LittleCPR Above</div>
                <div className="text-xs text-muted-foreground">Narrow CPR Above PCPR — today&apos;s CPR is narrower than yesterday&apos;s and present above it</div>
              </>
            ) : activePattern === "littlebelow" ? (
              <>
                <div className="text-xs font-semibold text-primary mb-1">LittleCPR Below</div>
                <div className="text-xs text-muted-foreground">Narrow CPR Below PCPR — today&apos;s CPR is narrower than yesterday&apos;s and present below it</div>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold text-primary mb-1">ADK CPR Formula</div>
                <div className="text-xs text-muted-foreground">Pivot=(H+L+C)/3 · BC=(H+L)/2 · TC=2P−BC</div>
              </>
            )}
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            <div className={`text-xs font-semibold mb-1 ${activePattern === "falling" ? "text-destructive" : "text-accent"}`}>
              {activePattern === "falling" ? "CPR Falling" : activePattern === "inside-value" ? "Inside Value CPR" : "CPR Rising"}
            </div>
            <div className="text-xs text-muted-foreground">
              {activePattern === "falling" ? "Bearish directional bias" : activePattern === "inside-value" ? "Breakout potential" : "Bullish directional bias"}
            </div>
          </div>
          <div className="rounded-lg border border-border bg-card p-3">
            {showBAComp && activePattern === "structure-bigabove" ? (
              <>
                <div className="text-xs font-semibold text-emerald-400 mb-1">Target</div>
                <div className="text-xs text-muted-foreground">These coins have the potential to go up to U4</div>
              </>
            ) : (
              <>
                <div className="text-xs font-semibold text-chart-3 mb-1">Candle Selection</div>
                <div className="text-xs text-muted-foreground">Previous completed UTC daily candle · matches TradingView ADK</div>
              </>
            )}
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <button
            onClick={doScan}
            disabled={status === "scanning"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#3b82f6,#6366f1)", color: "#fff" }}
          >
            <RefreshCw className={`w-4 h-4 ${status === "scanning" ? "animate-spin" : ""}`} />
            {status === "scanning" ? "Scanning Binance…" : "Scan Binance"}
          </button>

          <button
            onClick={doDeltaScan}
            disabled={deltaStatus === "scanning"}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
            style={{ background: "linear-gradient(135deg,#f59e0b,#d97706)", color: "#fff" }}
          >
            <RefreshCw className={`w-4 h-4 ${deltaStatus === "scanning" ? "animate-spin" : ""}`} />
            {deltaStatus === "scanning" ? "Scanning Delta…" : "Scan Delta Exchange"}
          </button>

          {canShowCombined && (
            <div className="flex rounded-lg border border-border overflow-hidden text-xs">
              {(["binance", "delta", "combined"] as ActiveTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className="px-3 py-1.5 transition-colors capitalize"
                  style={{
                    background: activeTab === tab ? "#3b82f6" : "transparent",
                    color: activeTab === tab ? "#fff" : "#8ba3bc",
                  }}
                >
                  {tab}
                </button>
              ))}
            </div>
          )}

          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="search"
              placeholder="Search symbol…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 pr-3 py-1.5 text-sm rounded-lg border border-border bg-card text-foreground w-44 focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </div>
        </div>

        {/* Status bar */}
        {(status === "scanning" || deltaStatus === "scanning") && (
          <div className="mb-4 rounded-lg border border-border bg-card p-3">
            <div className="flex justify-between text-xs text-muted-foreground mb-1.5">
              <span>
                {activeTab === "delta"
                  ? `Scanning Delta Exchange… ${deltaProgress.symbol}`
                  : `Scanning Binance… ${progress.symbol}`}
              </span>
              <span>{progressPct}%</span>
            </div>
            <div className="w-full bg-muted rounded-full h-1.5">
              <div
                className="h-1.5 rounded-full bg-primary transition-all"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {alreadyScannedToday && status === "idle" && (
          <div className="mb-4 rounded-lg border border-border bg-card/50 p-3 text-xs text-muted-foreground">
            Last scan: {lastScanDate} · Next auto-scan: {formatISTTime(nextScanUtc)} IST · Countdown: {countdown}
          </div>
        )}

        {currentError && (
          <div className="mb-4 rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive">
            Error: {currentError}
          </div>
        )}

        {/* Show-all toggle + sub-filter buttons */}
        {currentStatus === "done" && (
          <div className="flex flex-col gap-2 mb-3">
          <div className="flex items-center gap-3 flex-wrap">
            <span className="text-xs text-muted-foreground">
              {showAll
                ? currentAllCount
                : anySubFilter
                ? displayed.length
                : currentFilteredCount}{" "}
              results
              {!showAll && !anySubFilter && ` (${currentFilteredCount} matching, ${currentAllCount} total)`}
              {showLABothTiny && activePattern === "littleabove" && (
                <span className="ml-1 text-blue-400">(LA-BothTiny intersection)</span>
              )}
              {showLAAllUp && activePattern === "littleabove" && (
                <span className="ml-1 text-blue-400">(LA-AllUp intersection)</span>
              )}
              {showLAPL12CL23 && activePattern === "littleabove" && (
                <span className="ml-1 text-blue-400">(PL12CL23)</span>
              )}
              {showLAExpando && activePattern === "littleabove" && (
                <span className="ml-1 text-emerald-400">(LA-Expando)</span>
              )}
              {showOutsideCPRCompressed && activePattern === "outside-cpr" && (
                <span className="ml-1 text-purple-400">(Compressed)</span>
              )}
              {showInsideCPRExpanded && activePattern === "inside-cpr" && (
                <span className="ml-1 text-orange-400">(Expanded)</span>
              )}
              {showBigBelowPMiniPL3 && activePattern === "structure-bigbelow" && (
                <span className="ml-1 text-cyan-400">(pMini-PL34C4/PU3&gt;U4)</span>
              )}
              {showBigAbovePL34CL4 && activePattern === "structure-bigabove" && (
                <span className="ml-1 text-emerald-400">(PL34CL4/U3&gt;PU4)</span>
              )}
              {showBAComp && activePattern === "structure-bigabove" && (
                <span className="ml-1 text-sky-400">(BAComp-l3&gt;pl1/u3&gt;pu1)</span>
              )}
              {showLBCmprss && activePattern === "littlebelow" && (
                <span className="ml-1 text-violet-400">(LB-Compressed: L4&gt;PL3/U4&lt;PU2)</span>
              )}
              {showLBC34 && activePattern === "littlebelow" && (
                <span className="ml-1 text-pink-400">(LB-C-L34C4/U23C4)</span>
              )}
              {showLBBothTiny && activePattern === "littlebelow" && (
                <span className="ml-1 text-blue-400">(LB-BothTiny intersection)</span>
              )}
              {showLBAllUp && activePattern === "littlebelow" && (
                <span className="ml-1 text-blue-400">(LB-AllUp intersection)</span>
              )}
              {pivotLevelFilter && (
                <span className="ml-1 text-foreground">(Pivot Level: {pivotLevelFilter})</span>
              )}
            </span>

            {/* Show All button */}
            <button
              onClick={() => {
                setShowAll((v) => !v);
                setShowLABothTiny(false);
                setShowLAAllUp(false);
                setShowLAPL12CL23(false);
                setShowLAExpando(false);
                setShowOutsideCPRCompressed(false);
                setShowInsideCPRExpanded(false);
                setShowBigBelowPMiniPL3(false);
                setShowBigAbovePL34CL4(false);
                setShowBAComp(false);
                setShowLBCmprss(false);
                setShowLBC34(false);
                setShowLBBothTiny(false);
                setShowLBAllUp(false);
                setPivotLevelFilter(null);
              }}
              className="text-xs px-2.5 py-1 rounded border border-border text-muted-foreground hover:text-foreground transition-colors"
            >
              {showAll ? "Show filtered only" : "Show all"}
            </button>

            {/* NEW: LB-BothTiny button — replaces hidden "TinyBelow - Both Tiny" left-nav item */}
            {activePattern === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBBothTiny((v) => !v); setShowLBAllUp(false); setShowLBCmprss(false); setShowLBC34(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBBothTiny
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleBelow AND TinyBelow-Both Tiny"
              >
                {showLBBothTiny ? "✕ LB-BothTiny" : "LB-BothTiny"}
              </button>
            )}

            {/* NEW: LB-AllUp button — replaces hidden "LittleBelow - Ladder" left-nav item */}
            {activePattern === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBAllUp((v) => !v); setShowLBBothTiny(false); setShowLBCmprss(false); setShowLBC34(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBAllUp
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleBelow AND LittleBelow-Ladder (all R/S levels stepped down)"
              >
                {showLBAllUp ? "✕ LB-AllUp" : "LB-AllUp"}
              </button>
            )}

            {/* NEW: lb-Cmprss-L4>3/U4<2 button — only shown on littlebelow, mirrors Show All style */}
            {activePattern === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBCmprss((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBC34(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBCmprss
                    ? "border-violet-400 text-violet-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="LB, Compressed: Todays L4 > PDay L3 / Todays U4 < PDays L2: Target:PU4"
              >
                {showLBCmprss ? "✕ lb-Cmprss-L4>3/U4<2" : "lb-Cmprss-L4>3/U4<2"}
              </button>
            )}

            {/* NEW: lb-c-l34c4/u23c4 button — only shown on littlebelow, mirrors lb-Cmprss style */}
            {activePattern === "littlebelow" && !showAll && (
              <button
                onClick={() => { setShowLBC34((v) => !v); setShowLBBothTiny(false); setShowLBAllUp(false); setShowLBCmprss(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLBC34
                    ? "border-pink-400 text-pink-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="LB, PL34CL4 / Today R4 between Prev R2 and R3"
              >
                {showLBC34 ? "✕ lb-c-l34c4/u23c4" : "lb-c-l34c4/u23c4"}
              </button>
            )}

            {activePattern === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLABothTiny((v) => !v); setShowLAAllUp(false); setShowLAPL12CL23(false); setShowLAExpando(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLABothTiny
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleAbove AND TinyAbove-Both Tiny"
              >
                {showLABothTiny ? "✕ LA-BothTiny" : "LA-BothTiny"}
              </button>
            )}
            {activePattern === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLAAllUp((v) => !v); setShowLABothTiny(false); setShowLAPL12CL23(false); setShowLAExpando(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLAAllUp
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols that match BOTH Structure LittleAbove AND LittleAbove-Ladder (all R/S levels stepped up)"
              >
                {showLAAllUp ? "✕ LA-AllUp" : "LA-AllUp"}
              </button>
            )}
            {activePattern === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLAPL12CL23((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLAPL12CL23
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show symbols matching LA-PL12CL23:2PL4 (Bearish Target: 2PL4)"
              >
                {showLAPL12CL23 ? "✕ PL12CL23" : "PL12CL23"}
              </button>
            )}
            {activePattern === "littleabove" && !showAll && (
              <button
                onClick={() => { setShowLAExpando((v) => !v); setShowLABothTiny(false); setShowLAAllUp(false); setShowLAPL12CL23(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showLAExpando
                    ? "border-emerald-400 text-emerald-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="LA, Expanded: Todays L4 < PDay L4 / Todays U4 > PDays L2: Bullish"
              >
                {showLAExpando ? "✕ la-Expando" : "la-Expando"}
              </button>
            )}
            {activePattern === "outside-cpr" && !showAll && (
              <button
                onClick={() => setShowOutsideCPRCompressed((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showOutsideCPRCompressed
                    ? "border-purple-400 text-purple-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show OutsideCPR symbols where today R4 < prev R4 AND today S4 > prev S4 (compressed range)"
              >
                {showOutsideCPRCompressed ? "✕ Compressed" : "Compressed"}
              </button>
            )}
            {activePattern === "inside-cpr" && !showAll && (
              <button
                onClick={() => setShowInsideCPRExpanded((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showInsideCPRExpanded
                    ? "border-orange-400 text-orange-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Show InsideCPR symbols where today R4 > prev R4 AND today S4 < prev S4 (expanded range)"
              >
                {showInsideCPRExpanded ? "✕ Expanded" : "Expanded"}
              </button>
            )}
            {activePattern === "structure-bigbelow" && !showAll && (
              <button
                onClick={() => setShowBigBelowPMiniPL3((v) => !v)}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigBelowPMiniPL3
                    ? "border-cyan-400 text-cyan-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="Compressed, Mini PCPR, PL34CL4, Prev U3 above U4: Target-APU4"
              >
                {showBigBelowPMiniPL3 ? "✕ pMini-L34C4/U3>4" : "pMini-L34C4/U3>4"}
              </button>
            )}
            {activePattern === "structure-bigabove" && !showAll && (
              <button
                onClick={() => { setShowBigAbovePL34CL4((v) => !v); setShowBAComp(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBigAbovePL34CL4
                    ? "border-foreground text-foreground"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="BigAbove: PL34CL4 AND today R3 above prev R4"
              >
                {showBigAbovePL34CL4 ? "✕ PL34CL4/U3>PU4" : "PL34CL4/U3>PU4"}
              </button>
            )}
            {/* NEW: BAComp-l3>pl1/u3>pu1 button — inside BigCPR Above, next to Show All */}
            {activePattern === "structure-bigabove" && !showAll && (
              <button
                onClick={() => { setShowBAComp((v) => !v); setShowBigAbovePL34CL4(false); }}
                className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                  showBAComp
                    ? "border-sky-400 text-sky-400"
                    : "border-border text-muted-foreground hover:text-foreground"
                }`}
                title="BigAbove: Compressed inside PU2: Target:U4"
              >
                {showBAComp ? "✕ BAComp-l3>pl1/u3>pu1" : "BAComp-l3>pl1/u3>pu1"}
              </button>
            )}
          </div>

          {/* Pivot Level filter buttons — own line, independent of activePattern, mutually exclusive */}
          {!showAll && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider mr-0.5">Pivot Level:</span>
              {(
                [
                  { label: "Expanded", active: "border-purple-400 text-purple-400" },
                  { label: "Compressed", active: "border-cyan-400 text-cyan-400" },
                  { label: "Higher", active: "border-green-400 text-green-400" },
                  { label: "Lower", active: "border-destructive text-destructive" },
                ] as { label: PivotLevelInfo["label"]; active: string }[]
              ).map(({ label, active }) => (
                <button
                  key={label}
                  onClick={() => setPivotLevelFilter((v) => (v === label ? null : label))}
                  className={`text-xs px-2.5 py-1 rounded border transition-colors ${
                    pivotLevelFilter === label
                      ? active
                      : "border-border text-muted-foreground hover:text-foreground"
                  }`}
                  title={`Show only rows where Pivot Level = ${label}`}
                >
                  {pivotLevelFilter === label ? `✕ ${label}` : label}
                </button>
              ))}
            </div>
          )}
          </div>
        )}

        {/* Table */}
        {currentStatus === "done" && displayed.length > 0 && (
          <div className="rounded-xl border border-border bg-card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/30">
                    {canShowCombined && activeTab === "combined" && (
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">Exchange</th>
                    )}
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("symbol")}
                    >
                      Symbol <SortIcon k="symbol" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("change24h")}
                    >
                      Price <SortIcon k="change24h" />
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("priceVsCpr")}
                    >
                      Price vs CPR <SortIcon k="priceVsCpr" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Signals
                    </th>
                    <th
                      className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground"
                      onClick={() => toggleSort("compressionRatio")}
                    >
                      Compression <SortIcon k="compressionRatio" />
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Pivot Level
                    </th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Chart
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {displayed.map((r) => {
                    const sym = splitSymbol(r.symbol, r.source);
                    const rowKey = `${r.source}-${r.symbol}`;
                    const isExpanded = expandedSymbols.has(rowKey);
                    return (
                      <>
                        <tr
                          key={rowKey}
                          className={`hover:bg-muted/20 transition-colors ${r.passes ? "bg-accent/3" : ""}`}
                        >
                          {canShowCombined && activeTab === "combined" && (
                            <td className="px-4 py-3 whitespace-nowrap">
                              <span
                                className={`text-xs px-1.5 py-0.5 rounded border font-medium ${
                                  r.source === "binance"
                                    ? "bg-yellow-500/10 text-yellow-500 border-yellow-500/20"
                                    : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                }`}
                              >
                                {r.source === "binance" ? "Binance" : "Delta"}
                              </span>
                            </td>
                          )}
                          <td
                            className="px-4 py-3 font-mono font-semibold text-foreground whitespace-nowrap cursor-pointer select-none"
                            onClick={() => toggleExpand(rowKey)}
                            title="Click to expand ADK S/R ladder"
                          >
                            <div className="flex items-center gap-2">
                              <span className="text-muted-foreground text-xs">{isExpanded ? "▼" : "▶"}</span>
                              {r.passes && <div className="w-1.5 h-1.5 rounded-full bg-accent" />}
                              {sym.base}
                              <span className="text-muted-foreground text-xs font-normal">/{sym.quote}</span>
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono whitespace-nowrap">
                            <div className="text-xs font-semibold text-foreground">Price: {fmt(r.currentPrice)}</div>
                            <div className={`text-xs font-semibold py-0.5 ${r.change24h >= 0 ? "text-green-400" : "text-destructive"}`}>
                              {fmtPct(r.change24h)}
                              <div className="w-full bg-muted rounded-full h-1 mt-0.5 max-w-[64px]">
                                <div
                                  className={`h-1 rounded-full transition-all ${r.change24h >= 0 ? "bg-green-400" : "bg-destructive"}`}
                                  style={{ width: `${Math.min(Math.abs(r.change24h) * 5, 100)}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground">OPrice: {fmt(r.openPrice)}</div>
                          </td>
                          <td className={`px-4 py-3 whitespace-nowrap text-xs font-medium ${distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).color}`}>
                            {distanceFromCPR(r.currentPrice, r.todayCPR.tc, r.todayCPR.bc).label}
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {/* Signals column intentionally left empty — to be repurposed for a different calculation */}
                            </div>
                          </td>
                          <td className="px-4 py-3 font-mono whitespace-nowrap">
                            <div className="text-xs text-chart-3">
                              <span className="text-muted-foreground">TDay: </span>{r.todayCPR.widthPct.toFixed(4)}%
                            </div>
                            <div className={`text-xs font-semibold py-0.5 ${
                              r.compressionRatio < 25 ? "text-green-400"
                              : r.compressionRatio < 50 ? "text-accent"
                              : r.compressionRatio < 75 ? "text-yellow-500"
                              : "text-destructive"
                            }`}>
                              {r.compressionRatio.toFixed(1)}%
                              <div className="w-full bg-muted rounded-full h-1 mt-0.5 max-w-[64px]">
                                <div
                                  className={`h-1 rounded-full transition-all ${
                                    r.compressionRatio < 25 ? "bg-green-400"
                                    : r.compressionRatio < 50 ? "bg-accent"
                                    : r.compressionRatio < 75 ? "bg-yellow-500"
                                    : "bg-destructive"
                                  }`}
                                  style={{ width: `${Math.min(r.compressionRatio, 100)}%` }}
                                />
                              </div>
                            </div>
                            <div className="text-xs text-chart-3/70">
                              <span className="text-muted-foreground">PDay: </span>{r.prevCPR.widthPct.toFixed(4)}%
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex flex-wrap gap-1">
                              {r.cprRising && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">Above</span>
                              )}
                              {r.cprFalling && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400 border border-orange-500/20 font-medium">Below</span>
                              )}
                              {passesPattern(r, "inside-value") && activePattern === "inside-value" && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20 font-medium">Inside</span>
                              )}
                              {r.cprNarrowing && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-chart-3/10 text-chart-3 border border-chart-3/20 font-medium">Narrow</span>
                              )}
                              {!r.cprRising && !r.cprFalling && !r.cprNarrowing && (
                                <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">Skip</span>
                              )}
                            </div>
                            <div className="flex flex-wrap gap-1 mt-1">
                              {(() => {
                                const pl = getPivotLevel(r);
                                return pl ? (
                                  <span className={`text-xs px-1.5 py-0.5 rounded border font-medium ${pl.classes}`}>
                                    {pl.label}
                                  </span>
                                ) : (
                                  <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">—</span>
                                );
                              })()}
                            </div>
                          </td>
                          <td className="px-4 py-3 whitespace-nowrap">
                            <a
                              href={getChartUrl(r.symbol, r.source)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-muted-foreground hover:text-primary transition-colors"
                              title="Open on TradingView"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          </td>
                        </tr>

                        {/* ADK S/R Ladder + CPR boxes */}
                        {isExpanded && (
                          <tr key={`${rowKey}-sr`} className="bg-muted/20 border-b border-border">
                            <td colSpan={20} className="px-6 py-4">
                              <div className="flex flex-wrap gap-10 items-start">
                                {/* Prev Day CPR box */}
                                <div className="min-w-[140px]">
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Prev Day CPR</p>
                                  <div className="rounded-lg border border-border bg-card/60 px-3 py-2 font-mono space-y-1.5">
                                    <div className="flex justify-between gap-4 text-xs">
                                      <span style={{ color: "#6b7280" }}>TC:</span>
                                      <span style={{ color: "#9ca3af" }}>{fmt(r.prevCPR.tc)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-xs" style={{ color: "#6b7280" }}>Pivot</span>
                                      <span className="font-bold text-sm" style={{ color: "#d1d5db" }}>{fmt(r.prevCPR.pivot)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-xs">
                                      <span style={{ color: "#6b7280" }}>BC:</span>
                                      <span style={{ color: "#9ca3af" }}>{fmt(r.prevCPR.bc)}</span>
                                    </div>
                                  </div>
                                </div>
                                {/* Today CPR box */}
                                <div className="min-w-[140px]">
                                  <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">Today CPR</p>
                                  <div className="rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 font-mono space-y-1.5">
                                    <div className="flex justify-between gap-4 text-xs">
                                      <span style={{ color: "#6b7280" }}>TC:</span>
                                      <span style={{ color: "#9ca3af" }}>{fmt(r.todayCPR.tc)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4">
                                      <span className="text-xs" style={{ color: "#6b7280" }}>Pivot</span>
                                      <span className="font-bold text-sm" style={{ color: "#ffffff" }}>{fmt(r.todayCPR.pivot)}</span>
                                    </div>
                                    <div className="flex justify-between gap-4 text-xs">
                                      <span style={{ color: "#6b7280" }}>BC:</span>
                                      <span style={{ color: "#9ca3af" }}>{fmt(r.todayCPR.bc)}</span>
                                    </div>
                                  </div>
                                </div>
                                {/* Divider */}
                                <div className="hidden sm:block w-px self-stretch bg-border/50 mx-2" />
                                {/* S/R Ladders */}
                                <SRLadder cpr={r.prevCPR} currentPrice={r.currentPrice} label="Prev Day S/R" />
                                <SRLadder cpr={r.todayCPR} currentPrice={r.currentPrice} label="Today S/R" />
                              </div>
                            </td>
                          </tr>
                        )}
                      </>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {currentStatus === "done" && displayed.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
            <div className="text-muted-foreground text-sm">No coins match the CPR filter criteria today.</div>
          </div>
        )}

        <div className="mt-8 text-xs text-muted-foreground text-center">
          Binance: top 500 USDT pairs · Delta Exchange: 195 perpetual futures · CPR from completed UTC daily candles (ADK logic)
          <br />
          Auto-scans once daily at 5:31 AM IST · PH/PL = Previous Day High/Low · Not financial advice · by Kriven Gokul
        </div>
      </div>
    </div>
  );
}
