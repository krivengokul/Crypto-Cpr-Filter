import { OHLC, CPRResult, analyzeCPR } from "./cpr";

const BASE = "https://api.binance.com/api/v3";

interface KlineRaw extends Array<string | number> {
  0: number;
  1: string;
  2: string;
  3: string;
  4: string;
  5: string;
}

interface Ticker24h {
  symbol: string;
  lastPrice: string;
  priceChangePercent: string;
  quoteVolume: string;
}

function parseKline(k: KlineRaw): OHLC {
  return {
    openTime: k[0] as number,
    open: parseFloat(k[1] as string),
    high: parseFloat(k[2] as string),
    low: parseFloat(k[3] as string),
    close: parseFloat(k[4] as string),
    volume: parseFloat(k[5] as string),
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchTopUSDTSymbols(limit = 150): Promise<Ticker24h[]> {
  const res = await fetch(`${BASE}/ticker/24hr`);
  if (!res.ok) throw new Error(`Binance ticker error: ${res.status}`);
  const data: Ticker24h[] = await res.json();

  return data
    .filter(
      (t) =>
        t.symbol.endsWith("USDT") &&
        !t.symbol.includes("DOWN") &&
        !t.symbol.includes("UP") &&
        !t.symbol.includes("BEAR") &&
        !t.symbol.includes("BULL") &&
        parseFloat(t.quoteVolume) > 0
    )
    .sort((a, b) => parseFloat(b.quoteVolume) - parseFloat(a.quoteVolume))
    .slice(0, limit);
}

async function fetchKlines(symbol: string): Promise<OHLC[] | null> {
  try {
    const res = await fetch(
      `${BASE}/klines?symbol=${symbol}&interval=1d&limit=3`
    );
    if (!res.ok) return null;
    const data: KlineRaw[] = await res.json();
    if (data.length < 2) return null;
    return data.map(parseKline);
  } catch {
    return null;
  }
}

export async function runScreener(
  onProgress: (done: number, total: number, symbol: string) => void
): Promise<CPRResult[]> {
  const tickers = await fetchTopUSDTSymbols(200);
  const results: CPRResult[] = [];
  const batchSize = 10;
  const delayMs = 300;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const klines = await fetchKlines(t.symbol);
        if (!klines || klines.length < 2) return null;
        const prevCandle = klines[0];
        const todayCandle = klines[1];
        const currentPrice = parseFloat(t.lastPrice);
        const changeFromDayOpen = ((currentPrice - todayCandle.open) / todayCandle.open) * 100;
        return analyzeCPR(
          t.symbol,
          [prevCandle, todayCandle],
          currentPrice,
          changeFromDayOpen,  // ← % change from 5:30 AM IST (00:00 UTC daily open)
          parseFloat(t.quoteVolume)
        );
      })
    );

    batchResults.forEach((r) => {
      if (r) results.push(r);
    });

    const processed = Math.min(i + batchSize, tickers.length);
    onProgress(processed, tickers.length, batch[batch.length - 1].symbol);

    if (i + batchSize < tickers.length) {
      await sleep(delayMs);
    }
  }

  return results;
}
