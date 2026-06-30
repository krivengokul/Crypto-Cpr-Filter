import type { CPRLevels, CPRResult } from "@/lib/cpr";

export type SortKey = "symbol" | "compressionRatio" | "currentPrice" | "change24h" | "quoteVolume" | "priceVsCpr";
export type SortDir = "asc" | "desc";
export type ActiveTab = "binance" | "delta" | "combined";

export interface CPRResultWithSource extends CPRResult {
  source: "binance" | "delta";
}

export function fmt(v: number): string {
  if (v === 0) return "0";
  if (Math.abs(v) >= 1000) return v.toLocaleString("en-US", { maximumFractionDigits: 2 });
  if (Math.abs(v) >= 1) return v.toFixed(4);
  if (Math.abs(v) >= 0.001) return v.toFixed(5);
  return v.toFixed(8);
}

export function fmtPct(v: number): string {
  return `${v >= 0 ? "+" : ""}${v.toFixed(2)}%`;
}

export function fmtVol(v: number): string {
  if (v >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
  if (v >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
  if (v >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
  return `$${v.toFixed(0)}`;
}

export function priceVsCprValue(r: CPRResultWithSource): number {
  const { currentPrice: price, todayCPR } = r;
  const { tc, bc } = todayCPR;
  if (price > tc) return ((price - tc) / tc) * 100;
  if (price < bc) return -((bc - price) / bc) * 100;
  return 0;
}

export function getVal(r: CPRResultWithSource, key: SortKey): number | string {
  switch (key) {
    case "symbol":          return r.symbol;
    case "compressionRatio": return r.compressionRatio;
    case "currentPrice":    return r.currentPrice;
    case "change24h":       return r.change24h;
    case "quoteVolume":     return r.quoteVolume;
    case "priceVsCpr":      return priceVsCprValue(r);
  }
}

export function splitSymbol(symbol: string, source: "binance" | "delta") {
  if (source === "binance") {
    if (symbol.endsWith("USDT")) return { base: symbol.slice(0, -4), quote: "USDT" };
    return { base: symbol, quote: "" };
  }
  const parts = symbol.split("_");
  if (parts.length === 2) return { base: parts[0], quote: parts[1] };
  return { base: symbol, quote: "" };
}

/**
 * Returns TradingView chart URL.
 * Your screener scans Binance USDM perpetual futures.
 * TradingView uses SYMBOL.P for perps (e.g. BTCUSDT.P, STBLUSDT.P).
 * Most symbols exist as both spot and perp on TradingView — for these,
 * .P works fine. A small number exist on TradingView spot but NOT as perp
 * (e.g. QKCUSDT) — those need the plain spot URL.
 *
 * Strategy: always try .P (perp) first since that's what your screener tracks.
 * User can open chart and if it errors, they remove .P manually (rare case).
 * This is better than spot-first because perp candles match your CPR data.
 */

// Symbols that only exist as perp on TradingView (no spot) — append .P
const PERP_ONLY_ON_TV = new Set([
  "STBLUSDT",
]);

export function getChartUrl(symbol: string, source: "binance" | "delta"): string {
  if (source === "delta") {
    // Delta Exchange India symbols on TradingView: DELTAIN: prefix, in.tradingview.com, .p suffix
    // e.g. AAPLXUSD → https://in.tradingview.com/chart/?symbol=DELTAIN:AAPLXUSD.p
    return `https://in.tradingview.com/chart/?symbol=DELTAIN:${symbol}.p`;
  }
  // Binance — default no suffix, .P only for known perp-only symbols
  const suffix = PERP_ONLY_ON_TV.has(symbol) ? ".P" : "";
  return `https://www.tradingview.com/chart/?symbol=BINANCE:${symbol}${suffix}`;
}

export function passesPattern(r: CPRResult, pattern: string): boolean {
  switch (pattern) {
    case "littleabove":
      return r.cprRising && r.narrowCPR;
    case "la-2tiny":
      return r.cprRising && r.narrowCPR && r.bothTight;
    case "LA-PL12CL23":
      return r.cprRising && r.narrowCPR && r.PL12CL23;
    // LA Expando: Little Above + today L4 < prev L4 (S4) AND today R4 > prev R4
    case "la-expando":
      return (
        r.cprRising &&
        r.narrowCPR &&
        r.todayCPR.s4 < r.prevCPR.s4 &&
        r.todayCPR.r4 > r.prevCPR.r4
      );
    case "la-allstepup":
      return r.cprRising && r.narrowCPR && r.allupabove && r.allupbelow;
    case "littlebelow":
      return r.cprFalling && r.narrowCPR;
    case "lb-2tiny":
      return r.cprFalling && r.narrowCPR && r.bothTight;
    case "lb-allstepdown":
      return r.cprFalling && r.narrowCPR && r.alldownabove && r.alldownbelow;
    case "LB-PU12CU23":
      return r.cprFalling && r.narrowCPR  && r.todayCPR.s2  > r.prevCPR.s2 && (r.PU12CU23 || r.PU23CU34);
    case "1LB-PL12CL23":
      return r.lbJPattern1;
    case "LBALLD-U2<PU1":
      return r.lbJPattern2;
    // NEW: LB Compressed — LittleBelow + today S4 > prev S3 + today R4 < prev R2
    case "lb-cmprss-l4>3-u4<2":
      return (
        r.cprFalling &&
        r.narrowCPR &&
        (r.todayCPR.s4 > r.prevCPR.s3 && r.todayCPR.s4 < r.prevCPR.s2) &&
        (r.todayCPR.r4 < r.prevCPR.r2 && r.todayCPR.r4 > r.prevCPR.r1)
      );
    // NEW: LB-C-L34C4/U23C4 — LittleBelow + PL34CL4 + today R4 between prev R2 and R3
    case "lb-c-l34c4/u23c4":
      return (
        r.cprFalling &&
        r.narrowCPR &&
        r.PL34CL4 &&
        r.todayCPR.r4 > r.prevCPR.r2 &&
        r.todayCPR.r4 < r.prevCPR.r3
      );
    case "inside-cpr":
      return r.todayCPR.tc < r.prevCPR.tc && r.todayCPR.bc > r.prevCPR.bc;
    case "inside-cpr-expanded":
      return r.todayCPR.tc < r.prevCPR.tc && r.todayCPR.bc > r.prevCPR.bc && (r.todayCPR.r4 > r.prevCPR.r4 || r.todayCPR.s4 < r.prevCPR.s4);
    case "outside-cpr":
      return r.todayCPR.tc > r.prevCPR.tc && r.todayCPR.bc < r.prevCPR.bc;
    case "outside-cpr-compressed":
      return r.todayCPR.tc > r.prevCPR.tc && r.todayCPR.bc < r.prevCPR.bc && r.todayCPR.r4 < r.prevCPR.r4 && r.todayCPR.s4 > r.prevCPR.s4;
    case "overlapping-higher":
      return r.overlapHigher;
    case  "LAT-PU12CU23":
      return r.overlapHigher && r.PU12CU23 && r.PL12CL23 && r.todayCPR.prevHigh > r.prevCPR.prevHigh;
    case "overlapping-lower":
      return r.overlapLower;
    case "LBT-PU1>U1PL1>L1":
      return (r.overlapLower && r.lbtJPattern1 && r.bothTight);
    case "lower-bullish":
      return (r.cprFalling && r.cprNarrowing && r.prevCPR.r1  > r.todayCPR.r4);
    case "Price-AbovePDH":
      return (r.currentPrice > r.todayCPR.prevHigh);
    case "Price-BelowPDL":
      return (r.currentPrice < r.todayCPR.prevLow);
    case "structure-bigabove":
      return r.cprRising && r.strWideCPR;
    case "bigabove-pl34cl4-u3>pu4":
      return r.cprRising && r.strWideCPR && r.PL34CL4 && r.todayCPR.r3 > r.prevCPR.r4;
    case "HA-U1>PU4":
      return (r.cprRising && r.strWideCPR && r.todayCPR.r1 > r.prevCPR.r4);
    case "HAThin-U1>PU4":
      return (r.cprRising && r.strWideCPR && r.bothTight && r.todayCPR.r1 > r.prevCPR.r4);
    case "structure-bigbelow":
      return r.cprFalling && r.strWideCPR;
    case "bigbelow-pmini-pl3":
      return r.cprFalling && r.strWideCPR && r.prevCPR.widthPct < 0.5 && r.PL34CL4 &&
             r.prevCPR.r3  > r.todayCPR.r4 && r.currentPrice > r.todayCPR.tc;
    case "HB-L1<PL1-PU12CU23":
      return r.cprFalling && r.strWideCPR && r.hbJPattern1;
    case "HB-L1<PL4-U1>TCPR":
      return r.cprFalling && r.strWideCPR && r.hbJPattern2;
    case "HB-L1<PL2-U12CPU12":
      return r.cprFalling && r.strWideCPR && r.hbJPattern3;
    case "HB-L1>PL1-PU1CU234":
      return r.cprFalling && r.strWideCPR && r.hbJPattern4;
    default:
      return false;
  }
}

/**
 * Pivot Level — compares today's R4/S4 to previous day's R4/S4 to classify
 * how today's CPR range sits relative to yesterday's:
 *   Expanded:   today R4 > prev R4  AND today S4 < prev S4  (range widened both sides)
 *   Compressed: today R4 < prev R4  AND today S4 > prev S4  (range narrowed both sides)
 *   Higher:     today R4 > prev R4  AND today S4 > prev S4  (range shifted up)
 *   Lower:      today R4 < prev R4  AND today S4 < prev S4  (range shifted down)
 * These four cases are mutually exclusive and exhaustive (modulo exact ties).
 */
export interface PivotLevelInfo {
  label: "Expanded" | "Compressed" | "Higher" | "Lower";
  classes: string;
}

export function getPivotLevel(r: CPRResult): PivotLevelInfo | null {
  const { r4: tR4, s4: tS4 } = r.todayCPR;
  const { r4: pR4, s4: pS4 } = r.prevCPR;

  if (tR4 > pR4 && tS4 < pS4) {
    return { label: "Expanded", classes: "bg-purple-500/10 text-purple-400 border-purple-500/20" };
  }
  if (tR4 < pR4 && tS4 > pS4) {
    return { label: "Compressed", classes: "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" };
  }
  if (tR4 > pR4 && tS4 > pS4) {
    return { label: "Higher", classes: "bg-green-500/10 text-green-400 border-green-500/20" };
  }
  if (tR4 < pR4 && tS4 < pS4) {
    return { label: "Lower", classes: "bg-destructive/10 text-destructive border-destructive/20" };
  }
  return null;
}

export function distanceFromCPR(
  price: number,
  tc: number,
  bc: number
): { label: string; color: string } {
  if (price > tc) {
    const pct = ((price - tc) / tc) * 100;
    return { label: `+${pct.toFixed(2)}% above TC`, color: "text-green-400" };
  }
  if (price < bc) {
    const pct = ((bc - price) / bc) * 100;
    return { label: `−${pct.toFixed(2)}% below BC`, color: "text-destructive" };
  }
  return { label: "Inside CPR", color: "text-yellow-500" };
}

/**
 * ADK-style S/R Ladder.
 *
 * Shows all CPR levels in the same order as "CPR by Ask Dinesh Kumar (ADK)":
 *   R4, R3, R2, PH (Previous High), R1, TC, Pivot, BC, PL (Previous Low), S1, S2, S3, S4
 *
 * The live price row is inserted at the correct position in the ladder.
 */
export function SRLadder({
  cpr,
  currentPrice,
  label,
}: {
  cpr: CPRLevels;
  currentPrice: number;
  label: string;
}) {
  const levels = [
    { key: "R4",    value: cpr.r4 },
    { key: "R3",    value: cpr.r3 },
    { key: "R2",    value: cpr.r2 },
    { key: "PH",    value: cpr.prevHigh },
    { key: "R1",    value: cpr.r1 },
    { key: "TC",    value: cpr.tc },
    { key: "Pivot", value: cpr.pivot },
    { key: "BC",    value: cpr.bc },
    { key: "PL",    value: cpr.prevLow },
    { key: "S1",    value: cpr.s1 },
    { key: "S2",    value: cpr.s2 },
    { key: "S3",    value: cpr.s3 },
    { key: "S4",    value: cpr.s4 },
  ].sort((a, b) => b.value - a.value);

  type Row =
    | { type: "level"; key: string; value: number }
    | { type: "price" };

  const rows: Row[] = [];
  let priceInserted = false;
  for (const lvl of levels) {
    if (!priceInserted && currentPrice > lvl.value) {
      rows.push({ type: "price" });
      priceInserted = true;
    }
    rows.push({ type: "level", key: lvl.key, value: lvl.value });
  }
  if (!priceInserted) rows.push({ type: "price" });

  const rowColor = (key: string) => {
    if (key === "TC" || key === "BC" || key === "Pivot")
      return "text-yellow-500 font-semibold bg-yellow-500/5";
    if (key === "PH" || key === "PL")
      return "text-orange-400 font-medium bg-orange-500/5";
    if (key.startsWith("R")) return "text-red-400";
    return "text-green-400";
  };

  return (
    <div className="min-w-[170px]">
      <p className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-1.5">
        {label}
      </p>
      {rows.map((row, i) =>
        row.type === "price" ? (
          <div
            key={`price-${i}`}
            className="flex justify-between bg-blue-500 text-white text-xs px-2 py-1 rounded font-bold my-0.5"
          >
            <span>▶ Price</span>
            <span className="font-mono">{fmt(currentPrice)}</span>
          </div>
        ) : (
          <div
            key={row.key}
            className={`flex justify-between text-xs px-2 py-0.5 rounded ${rowColor(row.key)}`}
          >
            <span className="w-14 shrink-0">{row.key}</span>
            <span className="font-mono">{fmt(row.value)}</span>
          </div>
        )
      )}
    </div>
  );
}
