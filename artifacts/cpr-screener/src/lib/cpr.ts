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
  PL12CL23: boolean;
  allupabove: boolean;
  allupbelow: boolean;
  alldownabove: boolean;
  alldownbelow: boolean;
  cprFalling: boolean;
  PU12CU23: boolean;
  PU23CU34: boolean;
  PL34CL34: boolean;
  lbJPattern1: boolean;
  lbJPattern2: boolean;
  cprNarrowing: boolean;
  overlapHigher: boolean;
  overlapLower: boolean;
  lbtJPattern1: boolean;
  hbJPattern1: boolean;
  hbJPattern2: boolean;
  hbJPattern3: boolean;
  hbJPattern4: boolean;
  strWideCPR: boolean;
  narrowCPR: boolean;
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
 *   R2 = P + (H − L)
 *   R3 = H + 2 × (P − L)
 *   R4 = R3 + R2 − R1
 *
 * Support (S1–S4):
 *   S1 = 2P − H
 *   S2 = P − (H − L)
 *   S3 = L − 2 × (H − P)
 *   S4 = S3 + S2 − S1
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
  const r1 = 2 * pivot - l;
  const s1 = 2 * pivot - h;
  const r2 = pivot + range;
  const s2 = pivot - range;
  const r3 = h + 2 * (pivot - l);
  const s3 = l - 2 * (h - pivot);
  // TradingView-style extension
  const r4 = r3 + r2 - r1;
  const s4 = s3 + s2 - s1;

  return {
    pivot,
    bc,
    tc,
    width,
    widthPct,
    prevHigh: h,
    prevLow:  l,
    r1,
    r2,
    r3,
    r4,
    s1,
    s2,
    s3,
    s4
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
  const strWideCPR    = todayCPR.widthPct > prevCPR.widthPct;
  const narrowCPR    = todayCPR.widthPct < prevCPR.widthPct;
  const compressionRatio = prevCPR.width > 0 ? (todayCPR.width / prevCPR.width) * 100 : 100;
  const cprNarrowing     = compressionRatio < 50;
  const bothTight        = todayCPR.widthPct < 0.5 && prevCPR.widthPct < 0.5;

  const PL12CL23 = (todayCPR.s2 < prevCPR.s1 && todayCPR.s3 > prevCPR.s2); //LA-PL12CL23:2PL4;
  const PU12CU23  =  (prevCPR.r1 < todayCPR.r2 && prevCPR.r2 > todayCPR.r3); //PU12CU23
  const PU23CU34  =  (prevCPR.r2 < todayCPR.r3 && prevCPR.r3 > todayCPR.r4); //PU23CU34
  const PL34CL34  =  (prevCPR.s3 > todayCPR.s3 && prevCPR.s4 < todayCPR.s4); //PL34CL34
  const lbJPattern1  = ((prevCPR.bc  - todayCPR.tc) >= minGap) && todayCPR.widthPct < 1 && 
                          (todayCPR.s2 < prevCPR.s1 && todayCPR.s3 > prevCPR.s2); //1LB-PL12CL23:2PU4
  const lbJPattern2  = ((prevCPR.bc  - todayCPR.tc) >= minGap) && todayCPR.widthPct < 1 && todayCPR.r2 < prevCPR.r1 &&
                        (todayCPR.s1 < prevCPR.s1 && todayCPR.s2 < prevCPR.s2 && 
                          todayCPR.s3 < prevCPR.s3 && todayCPR.s4 < prevCPR.s4); //LBALLD-U2<PU1:2U4
  
  const overlapHigher    = (todayCPR.bc > prevCPR.bc && todayCPR.bc < prevCPR.tc) && todayCPR.tc > prevCPR.tc;

  const allupabove =  (todayCPR.r1 > prevCPR.r1) && (todayCPR.r1 < prevCPR.r2) &&// R1 stepped up
                      (todayCPR.r2 > prevCPR.r2) && (todayCPR.r2 < prevCPR.r3) &&// R2 stepped up
                      (todayCPR.r3 > prevCPR.r3) && (todayCPR.r3 < prevCPR.r4) &&// R3 stepped up
                      (todayCPR.r4 > prevCPR.r4);// R4 stepped up
  
  const allupbelow =  (todayCPR.s1 > prevCPR.s1) && (todayCPR.s1 < prevCPR.bc) &&// S1 stepped up
                      (todayCPR.s2 > prevCPR.s2) && (todayCPR.s2 < prevCPR.s1) &&// S2 stepped up
                      (todayCPR.s3 > prevCPR.s3) && (todayCPR.s3 < prevCPR.s2) &&// S3 stepped up
                      (todayCPR.s4 > prevCPR.s4) && (todayCPR.s4 < prevCPR.s3);// S4 stepped up

  const alldownabove = (todayCPR.r1 < prevCPR.r1 && todayCPR.r1 > prevCPR.tc) && // R1 stepped down
                        (todayCPR.r2 < prevCPR.r2  && todayCPR.r2 > prevCPR.r1)&& 
                        (todayCPR.r3 < prevCPR.r3  && todayCPR.r3 > prevCPR.r2) && 
                        (todayCPR.r4 < prevCPR.r4 && todayCPR.r4 > prevCPR.r3); // R4 stepped down

  const alldownbelow = (todayCPR.s1 < prevCPR.s1 && todayCPR.s1 > prevCPR.s2) && // S1 stepped down
                        (todayCPR.s2 < prevCPR.s2  && todayCPR.s2 > prevCPR.s3)&& 
                        (todayCPR.s3 < prevCPR.s3  && todayCPR.s3 > prevCPR.s4) && 
                          todayCPR.s4 < prevCPR.s4 ; // S4 stepped down

  const overlapLower    = (todayCPR.tc < prevCPR.tc && todayCPR.tc > prevCPR.bc) && todayCPR.bc < prevCPR.bc;
  const lbtJPattern1   = (todayCPR.r1 < prevCPR.r1 && todayCPR.s1 < prevCPR.s1) &&
                          (prevCPR.r1 > todayCPR.r1 && prevCPR.r2 > todayCPR.r2 && prevCPR.r3 > todayCPR.r3 && prevCPR.r4 > todayCPR.r4)
  
  const hbJPattern1  = (todayCPR.s1 < prevCPR.s2 && todayCPR.s1 > prevCPR.s3) && prevCPR.widthPct < 0.5 && // L1<PL2
                          (todayCPR.s2 > prevCPR.r1 && todayCPR.s3 < prevCPR.r2); //HB-PU12CU23:2PU4
  const hbJPattern2  = (todayCPR.s1 < prevCPR.s4 && todayCPR.r1 > prevCPR.tc) && prevCPR.widthPct < 0.5; //ONE,2 MORE COND
  const hbJPattern3  = (todayCPR.s1 < prevCPR.s2 && todayCPR.s1 > prevCPR.s3) && prevCPR.widthPct < 0.5 && // L1<PL2
                        ((todayCPR.r1 < prevCPR.r1 && todayCPR.r1 > prevCPR.tc) && (todayCPR.r2 > prevCPR.r2 && todayCPR.r2 < prevCPR.r3)); //HB-U12CPU12:2L4 REFACTOR THIS
  const hbJPattern4  = (todayCPR.s1 > prevCPR.s1 && todayCPR.s1 < prevCPR.bc) && prevCPR.widthPct < 0.5 && // L1>PL1
                        todayCPR.r4 < prevCPR.r1 ; //HB-PU1CU234:2L4                      
  return {
    symbol,
    todayCPR,
    prevCPR,
    compressionRatio,
    cprRising,
    PL12CL23,
    allupabove,
    allupbelow,
    alldownabove,
    alldownbelow,
    cprFalling,
    PU12CU23,
    PU23CU34,
    PL34CL34,
    lbJPattern1,
    lbJPattern2,
    hbJPattern1,
    hbJPattern2,
    hbJPattern3,
    hbJPattern4,
    cprNarrowing,
    overlapHigher,
    overlapLower,
    lbtJPattern1,
    strWideCPR,
    narrowCPR,  
    bothTight,
    passes: cprRising && cprNarrowing,
    currentPrice,
    openPrice: openPrice ?? todayCandle.open,
    change24h,
    quoteVolume,
  };
}
