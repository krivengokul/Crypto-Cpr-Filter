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
  lbJPattern1: boolean;
  lbJPattern2: boolean;
  hbJPattern1: boolean;
  cprNarrowing: boolean;
  overlapHigher: boolean;
  overlapLower: boolean;
  strHBBearish: boolean;
  bothTight: boolean;        
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
    quoteVolume: number,
    openPrice?: number
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
  const lbJPattern1  = ((prevCPR.bc  - todayCPR.tc) >= minGap) && todayCPR.widthPct < 1 && 
                          (todayCPR.s2 < prevCPR.s1 && todayCPR.s3 > prevCPR.s2); //1LB-PL12CL23:2PU4
  const lbJPattern2  = ((prevCPR.bc  - todayCPR.tc) >= minGap) && todayCPR.widthPct < 1 && todayCPR.r2 < prevCPR.r1 &&
                        (todayCPR.s1 < prevCPR.s1 && todayCPR.s2 < prevCPR.s2 && 
                          todayCPR.s3 < prevCPR.s3 && todayCPR.s4 < prevCPR.s4); //LBALLD-U2<PU1:2U4
  const hbJPattern1  = ((prevCPR.bc  - todayCPR.tc) >= minGap) && prevCPR.widthPct < 1 && 
                          (todayCPR.s2 > prevCPR.s1 && todayCPR.s3 < prevCPR.s2); //HB-PU12CU23:2PU4
  const compressionRatio = prevCPR.width > 0 ? (todayCPR.width / prevCPR.width) * 100 : 100;
  const cprNarrowing     = compressionRatio < 50;
  const bothTight        = todayCPR.widthPct < 1 && prevCPR.widthPct < 1;
  const overlapHigher    = (todayCPR.bc > prevCPR.bc && todayCPR.bc < prevCPR.tc) && todayCPR.tc > prevCPR.tc;
  const overlapLower    = (todayCPR.tc < prevCPR.tc && todayCPR.tc > prevCPR.bc) && todayCPR.bc < prevCPR.bc;
  const strHBBearish    = todayCPR.widthPct > prevCPR.widthPct;

  return {
    symbol,
    todayCPR,
    prevCPR,
    compressionRatio,
    cprRising,
    cprFalling,
    lbJPattern1,
    lbJPattern2,
    hbJPattern1,
    cprNarrowing,
    overlapHigher,
    overlapLower,
    strHBBearish,  
    bothTight,
    passes: cprRising && cprNarrowing,
    currentPrice,
    openPrice: openPrice ?? todayCandle.open,
    change24h,
    quoteVolume,
  };
}
