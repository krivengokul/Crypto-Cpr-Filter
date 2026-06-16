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
  cprNarrowing: boolean;
  passes: boolean;
  currentPrice: number;
  change24h: number;
  quoteVolume: number;
}

export function calcCPR(candle: OHLC): CPRLevels {
  const pivot = (candle.high + candle.low + candle.close) / 3;
  const bc = (candle.high + candle.low) / 2;
  const tc = 2 * pivot - bc;
  const width = Math.abs(tc - bc);
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

  const prevCPR = calcCPR(prevCandle);
  const todayCPR = calcCPR(todayCandle);

  const cprRising = todayCPR.pivot > prevCPR.pivot;
  const compressionRatio = prevCPR.width > 0 ? (todayCPR.width / prevCPR.width) * 100 : 100;
  const cprNarrowing = compressionRatio < 50;

  return {
    symbol,
    todayCPR,
    prevCPR,
    compressionRatio,
    cprRising,
    cprNarrowing,
    passes: cprRising && cprNarrowing,
    currentPrice,
    change24h,
    quoteVolume,
  };
}
