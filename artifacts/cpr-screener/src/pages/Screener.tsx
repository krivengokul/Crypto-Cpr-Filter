import { useState, useCallback, useEffect, useRef } from "react";
import { runScreener } from "@/lib/binance";
import { CPRResult } from "@/lib/cpr";
import {
  shouldAutoScan,
  markScannedToday,
  hasScannedToday,
  getNextScanIST,
  formatISTTime,
  formatCountdown,
  getLastScanDate,
} from "@/lib/scheduler";
import {
  ArrowUpDown,
  TrendingUp,
  Zap,
  RefreshCw,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Search,
  Clock,
  CalendarCheck,
} from "lucide-react";

type SortKey =
  | "symbol"
  | "compressionRatio"
  | "change24h"
  | "quoteVolume"
  | "todayCPR.pivot"
  | "todayCPR.widthPct";

type SortDir = "asc" | "desc";

function fmt(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (n >= 1) return n.toFixed(4);
  return n.toFixed(6);
}

function fmtPct(n: number): string {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function fmtVol(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)}B`;
  if (n >= 1e6) return `$${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `$${(n / 1e3).toFixed(2)}K`;
  return `$${n.toFixed(2)}`;
}

function getVal(r: CPRResult, key: SortKey): number | string {
  if (key === "symbol") return r.symbol;
  if (key === "compressionRatio") return r.compressionRatio;
  if (key === "change24h") return r.change24h;
  if (key === "quoteVolume") return r.quoteVolume;
  if (key === "todayCPR.pivot") return r.todayCPR.pivot;
  if (key === "todayCPR.widthPct") return r.todayCPR.widthPct;
  return 0;
}

export default function Screener() {
  const [status, setStatus] = useState<"idle" | "scanning" | "done" | "error">(
    "idle"
  );
  const [progress, setProgress] = useState({ done: 0, total: 0, symbol: "" });
  const [allResults, setAllResults] = useState<CPRResult[]>([]);
  const [filtered, setFiltered] = useState<CPRResult[]>([]);
  const [sortKey, setSortKey] = useState<SortKey>("compressionRatio");
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [search, setSearch] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState("");
  const [countdown, setCountdown] = useState("");
  const [nextScanUtc, setNextScanUtc] = useState<Date>(getNextScanIST());
  const [alreadyScannedToday] = useState(() => hasScannedToday());
  const [lastScanDate] = useState(() => getLastScanDate());
  const scanRef = useRef(false);

  const doScan = useCallback(async () => {
    if (scanRef.current) return;
    scanRef.current = true;
    setStatus("scanning");
    setAllResults([]);
    setFiltered([]);
    setError("");
    setProgress({ done: 0, total: 0, symbol: "" });

    try {
      const results = await runScreener((done, total, symbol) => {
        setProgress({ done, total, symbol });
      });
      setAllResults(results);
      setFiltered(results.filter((r) => r.passes));
      setStatus("done");
      markScannedToday();
      setNextScanUtc(getNextScanIST());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setStatus("error");
    } finally {
      scanRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (shouldAutoScan()) {
      doScan();
    }
  }, [doScan]);

  useEffect(() => {
    const tick = () => setCountdown(formatCountdown(nextScanUtc));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [nextScanUtc]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const displayed = (showAll ? allResults : filtered)
    .filter((r) => r.symbol.toLowerCase().includes(search.toLowerCase()))
    .slice()
    .sort((a, b) => {
      const av = getVal(a, sortKey);
      const bv = getVal(b, sortKey);
      if (typeof av === "string" && typeof bv === "string") {
        return sortDir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
      }
      return sortDir === "asc" ? (av as number) - (bv as number) : (bv as number) - (av as number);
    });

  const progressPct =
    progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0;

  const SortIcon = ({ k }: { k: SortKey }) =>
    sortKey === k ? (
      sortDir === "asc" ? (
        <ChevronUp className="w-3 h-3 inline ml-1 text-primary" />
      ) : (
        <ChevronDown className="w-3 h-3 inline ml-1 text-primary" />
      )
    ) : (
      <ArrowUpDown className="w-3 h-3 inline ml-1 opacity-30" />
    );

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-7xl mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10 border border-primary/20">
              <TrendingUp className="w-6 h-6 text-primary" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              CPR Screener
            </h1>
            <span className="text-xs font-mono px-2 py-0.5 rounded bg-primary/10 text-primary border border-primary/20">
              by Ask Dines Kumar
            </span>
          </div>
          <p className="text-muted-foreground text-sm leading-relaxed max-w-2xl">
            Filters crypto coins where{" "}
            <span className="text-foreground font-medium">
              today&apos;s CPR is above yesterday&apos;s CPR
            </span>{" "}
            and{" "}
            <span className="text-foreground font-medium">
              today&apos;s CPR width is less than 50% of yesterday&apos;s
            </span>
            . Signals a compressed pivot zone — a potential breakout setup.
          </p>
        </div>

        {/* CPR Legend */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          {[
            {
              label: "CPR = Central Pivot Range",
              desc: "Pivot = (H+L+C)/3, BC = (H+L)/2, TC = 2×Pivot − BC",
              color: "text-primary",
            },
            {
              label: "CPR Rising",
              desc: "Today's Pivot > Yesterday's Pivot — bullish directional bias",
              color: "text-accent",
            },
            {
              label: "CPR Narrowing <50%",
              desc: "Today's width < 50% of yesterday — compressed zone, energy building",
              color: "text-chart-3",
            },
          ].map((item) => (
            <div
              key={item.label}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className={`text-xs font-semibold mb-1 ${item.color}`}>
                {item.label}
              </div>
              <div className="text-xs text-muted-foreground">{item.desc}</div>
            </div>
          ))}
        </div>

        {/* Scheduler Status Bar */}
        <div className="flex flex-wrap items-center gap-3 mb-6 p-3 rounded-lg border border-border bg-card">
          {alreadyScannedToday && status !== "scanning" ? (
            <div className="flex items-center gap-2 text-sm text-accent">
              <CalendarCheck className="w-4 h-4" />
              <span>
                Scanned today ({lastScanDate}) — CPR data is fresh
              </span>
            </div>
          ) : status === "scanning" ? (
            <div className="flex items-center gap-2 text-sm text-primary">
              <RefreshCw className="w-4 h-4 animate-spin" />
              <span>Auto-scan running…</span>
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="w-4 h-4" />
              <span>
                Daily scan scheduled at{" "}
                <span className="text-foreground font-medium">
                  5:31 AM IST
                </span>
              </span>
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="w-3.5 h-3.5" />
            <span>
              Next scan:{" "}
              <span className="text-foreground font-mono">
                {formatISTTime(nextScanUtc)}
              </span>
              {" · "}
              <span className="text-primary font-mono">{countdown}</span>
            </span>
          </div>
        </div>

        {/* Manual Scan Controls */}
        <div className="flex flex-wrap items-center gap-4 mb-6">
          <button
            onClick={doScan}
            disabled={status === "scanning"}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-primary text-primary-foreground font-semibold text-sm hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === "scanning" ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            {status === "scanning"
              ? "Scanning…"
              : status === "done"
              ? "Re-scan Now"
              : "Scan Now"}
          </button>
          <span className="text-xs text-muted-foreground">
            Manual scan overrides the daily schedule
          </span>

          {status === "done" && (
            <div className="flex items-center gap-3 ml-auto">
              <span className="text-sm text-muted-foreground">
                <span className="text-accent font-bold">{filtered.length}</span>{" "}
                matches out of{" "}
                <span className="text-foreground font-medium">
                  {allResults.length}
                </span>{" "}
                scanned
              </span>
              <button
                onClick={() => setShowAll((v) => !v)}
                className="text-xs px-3 py-1 rounded border border-border bg-secondary text-secondary-foreground hover:bg-muted transition-colors"
              >
                {showAll ? "Matches Only" : "Show All"}
              </button>
            </div>
          )}
        </div>

        {/* Progress Bar */}
        {status === "scanning" && (
          <div className="mb-6 rounded-lg border border-border bg-card p-4">
            <div className="flex justify-between text-xs text-muted-foreground mb-2">
              <span>
                Scanning{" "}
                <span className="font-mono text-foreground">
                  {progress.symbol}
                </span>
              </span>
              <span>
                {progress.done}/{progress.total} ({progressPct}%)
              </span>
            </div>
            <div className="h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        )}

        {/* Error */}
        {status === "error" && (
          <div className="mb-6 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive text-sm">
            Error: {error}. Please try again.
          </div>
        )}

        {/* Results Table */}
        {status === "done" && displayed.length > 0 && (
          <div>
            <div className="flex flex-wrap items-center gap-3 mb-4">
              <div className="relative flex-1 min-w-[200px] max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <input
                  type="text"
                  placeholder="Filter by symbol…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-border bg-card text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                />
              </div>
              <span className="text-xs text-muted-foreground">
                {displayed.length} rows
              </span>
            </div>

            <div className="rounded-xl border border-border overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border bg-muted/40">
                      {[
                        { key: "symbol" as SortKey, label: "Symbol" },
                        { key: "todayCPR.pivot" as SortKey, label: "Today Pivot" },
                        { key: "todayCPR.widthPct" as SortKey, label: "Today Width%" },
                        { key: "compressionRatio" as SortKey, label: "Compression%" },
                        { key: "change24h" as SortKey, label: "Change (5:30 AM IST)" },
                        { key: "quoteVolume" as SortKey, label: "Volume" },
                      ].map((col) => (
                        <th
                          key={col.key}
                          onClick={() => toggleSort(col.key)}
                          className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground cursor-pointer hover:text-foreground transition-colors whitespace-nowrap select-none"
                        >
                          {col.label}
                          <SortIcon k={col.key} />
                        </th>
                      ))}
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Prev Pivot
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Status
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-semibold text-muted-foreground whitespace-nowrap">
                        Chart
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {displayed.map((r) => (
                      <tr
                        key={r.symbol}
                        className={`hover:bg-muted/30 transition-colors ${
                          r.passes ? "" : "opacity-50"
                        }`}
                      >
                        <td className="px-4 py-3 font-mono font-semibold text-foreground whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            {r.passes && (
                              <div className="w-1.5 h-1.5 rounded-full bg-accent" />
                            )}
                            {r.symbol.replace("USDT", "")}
                            <span className="text-muted-foreground text-xs font-normal">
                              /USDT
                            </span>
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono text-foreground whitespace-nowrap">
                          <div className="text-xs text-muted-foreground">
                            TC: {fmt(r.todayCPR.tc)}
                          </div>
                          <div className="font-medium">{fmt(r.todayCPR.pivot)}</div>
                          <div className="text-xs text-muted-foreground">
                            BC: {fmt(r.todayCPR.bc)}
                          </div>
                        </td>
                        <td className="px-4 py-3 font-mono whitespace-nowrap">
                          <span className="text-chart-3">
                            {r.todayCPR.widthPct.toFixed(4)}%
                          </span>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div
                            className={`font-mono font-semibold ${
                              r.compressionRatio < 50
                                ? "text-accent"
                                : "text-muted-foreground"
                            }`}
                          >
                            {r.compressionRatio.toFixed(1)}%
                          </div>
                          <div className="w-full bg-muted rounded-full h-1 mt-1 max-w-[80px]">
                            <div
                              className={`h-1 rounded-full transition-all ${
                                r.compressionRatio < 50
                                  ? "bg-accent"
                                  : "bg-muted-foreground"
                              }`}
                              style={{
                                width: `${Math.min(r.compressionRatio, 100)}%`,
                              }}
                            />
                          </div>
                        </td>
                        <td
                          className={`px-4 py-3 font-mono font-medium whitespace-nowrap ${
                            r.change24h >= 0 ? "text-accent" : "text-destructive"
                          }`}
                        >
                          {fmtPct(r.change24h)}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap text-xs">
                          {fmtVol(r.quoteVolume)}
                        </td>
                        <td className="px-4 py-3 font-mono text-muted-foreground whitespace-nowrap text-xs">
                          <div className="text-xs text-muted-foreground">
                            TC: {fmt(r.prevCPR.tc)}
                          </div>
                          <div>{fmt(r.prevCPR.pivot)}</div>
                          <div className="text-xs text-muted-foreground">
                            BC: {fmt(r.prevCPR.bc)}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex gap-1">
                            {r.cprRising && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-accent/10 text-accent border border-accent/20 font-medium">
                                Rising
                              </span>
                            )}
                            {r.cprNarrowing && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-chart-3/10 text-chart-3 border border-chart-3/20 font-medium">
                                Narrow
                              </span>
                            )}
                            {!r.cprRising && !r.cprNarrowing && (
                              <span className="text-xs px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                                Skip
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          <a
                            href={`https://www.tradingview.com/chart/?symbol=BINANCE:${r.symbol}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-muted-foreground hover:text-primary transition-colors"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {status === "done" && displayed.length === 0 && (
          <div className="rounded-xl border border-border bg-card p-12 text-center">
            <TrendingUp className="w-10 h-10 text-muted-foreground mx-auto mb-3 opacity-30" />
            <div className="text-muted-foreground text-sm">
              No coins match the CPR filter criteria today.
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="mt-8 text-xs text-muted-foreground text-center">
          Data from Binance Public API · Scans top 200 USDT pairs by volume · CPR from completed daily candles
          <br />
          Auto-scans once daily at 5:31 AM IST · Not financial advice
        </div>
      </div>
    </div>
  );
}
