export interface OHLC {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  openTime: number;
}

export interface CPRLevels {
  pivot: number;
  bc: number;
  tc: number;
  width: number;
  widthPct: number;
  // ADK: Previous Day High/Low shown as additional S/R levels
  prevHigh: number;
  prevLow: number;
  // ADK Classic Pivot Resistance levels
  r1: number;
  r2: number;
  r3: number;
  r4: number;
  // ADK Classic Pivot Support levels
  s1: number;
  s2: number;
  s3: number;
  s4: number;
}

export interface CPRResult {
  symbol: string;
  todayCPR: CPRLevels;
  prevCPR: CPRLevels;
  compressionRatio: number;
  cprRising: boolean;
  cprFalling: boolean;
  cprNarrowing: boolean;
  passes: boolean;
  currentPrice: number;
  openPrice: number;
  change24h: number;
  quoteVolume: number;
}

function isValidCandle(c: OHLC): boolean {
  return (
    c.high > 0 &&
    c.low > 0 &&
    c.close > 0 &&
    c.high >= c.low &&
    !isNaN(c.high) &&
    !isNaN(c.low) &&
    !isNaN(c.close)
  );
}

/**
 * ADK Classic Pivot CPR calculation.
 *
 * Matches "CPR by Ask Dinesh Kumar (ADK)" TradingView indicator exactly:
 *   Pivot  = (H + L + C) / 3
 *   BC     = (H + L) / 2          — always the lower CPR boundary
 *   TC     = 2 × Pivot − BC       — always the upper CPR boundary
 *
 * Resistance (R1–R4):
 *   R1 = 2P − L
 *   R2 = P  + (H − L)
 *   R3 = H  + 2 × (P − L)
 *   R4 = H  + 3 × (P − L)
 *
 * Support (S1–S4):
 *   S1 = 2P − H
 *   S2 = P  − (H − L)
 *   S3 = L  − 2 × (H − P)
 *   S4 = L  − 3 × (H − P)
 *
 * prevHigh / prevLow are stored so the S/R ladder can display them
 * exactly as ADK shows "PH" and "PL" lines on the chart.
 */
export function calcCPR(candle: OHLC): CPRLevels {
  const h = candle.high;
  const l = candle.low;
  const c = candle.close;

  const pivot    = (h + l + c) / 3;
  const midpoint = (h + l) / 2;
  const other    = 2 * pivot - midpoint;
  const bc       = Math.min(midpoint, other);
  const tc       = Math.max(midpoint, other);
  const width    = tc - bc;
  const widthPct = (width / pivot) * 100;
  const range    = h - l;

  return {
    pivot,
    bc,
    tc,
    width,
    widthPct,
    prevHigh: h,
    prevLow:  l,
    r1: 2 * pivot - l,
    r2: pivot + range,
    r3: h + 2 * (pivot - l),
    r4: h + 3 * (pivot - l),
    s1: 2 * pivot - h,
    s2: pivot - range,
    s3: l - 2 * (h - pivot),
    s4: l - 3 * (h - pivot),
  };
}

export function analyzeCPR(
  symbol: string,
  candles: OHLC[],
  currentPrice: number,
  change24h: number,
  quoteVolume: number
): CPRResult | null {
  if (candles.length < 2) return null;

  const prevCandle  = candles[candles.length - 2];
  const todayCandle = candles[candles.length - 1];

  if (!isValidCandle(prevCandle) || !isValidCandle(todayCandle)) return null;

  const prevCPR  = calcCPR(prevCandle);
  const todayCPR = calcCPR(todayCandle);

  const minGap     = prevCPR.pivot * 0.001;
  const cprRising  = (todayCPR.bc - prevCPR.tc) >= minGap;
  const cprFalling = (prevCPR.bc  - todayCPR.tc) >= minGap;

  const compressionRatio = prevCPR.width > 0 ? (todayCPR.width / prevCPR.width) * 100 : 100;
  const cprNarrowing     = compressionRatio < 50;

  return {
    symbol,
    todayCPR,
    prevCPR,
    compressionRatio,
    cprRising,
    cprFalling,
    cprNarrowing,
    passes: cprRising && cprNarrowing,
    currentPrice,
    openPrice: todayCandle.open,
    change24h,
    quoteVolume,
  };
}
