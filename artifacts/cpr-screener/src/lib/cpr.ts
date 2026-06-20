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

export function calcCPR(candle: OHLC): CPRLevels {
  const pivot = (candle.high + candle.low + candle.close) / 3;
  const midpoint = (candle.high + candle.low) / 2;
  const other = 2 * pivot - midpoint;
  const bc = Math.min(midpoint, other);  // always the lower boundary
  const tc = Math.max(midpoint, other);  // always the upper boundary
  const width = tc - bc;
  const widthPct = (width / pivot) * 100;
  return { pivot, bc, tc, width, widthPct };
}

export function analyzeCPR(
  symbol: string,
  candles: OHLC[],
  currentPrice: number,
  change24h: number,
  quoteVolume: number
): CPRResult | null {
  if (candles.length < 2) return null;

  const prevCandle = candles[candles.length - 2];
  const todayCandle = candles[candles.length - 1];

  // Reject candles with missing/zero/corrupt data
  if (!isValidCandle(prevCandle) || !isValidCandle(todayCandle)) return null;

  const prevCPR = calcCPR(prevCandle);
  const todayCPR = calcCPR(todayCandle);

  // Require a minimum gap of 0.1% of pivot — filters out near-touching CPRs (noise)
  const minGap     = prevCPR.pivot * 0.001;
  const cprRising  = (todayCPR.bc  - prevCPR.tc) >= minGap;
  const cprFalling = (prevCPR.bc   - todayCPR.tc) >= minGap;

  const compressionRatio = prevCPR.width > 0 ? (todayCPR.width / prevCPR.width) * 100 : 100;
  const cprNarrowing = compressionRatio < 50;

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
