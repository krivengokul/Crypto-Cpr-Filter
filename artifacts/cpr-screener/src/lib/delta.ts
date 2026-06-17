import { OHLC, CPRResult, analyzeCPR } from "./cpr";

const BASE = "https://api.india.delta.exchange/v2";

interface DeltaTicker {
  symbol: string;
  close: number;
  open: number;
  high: number;
  low: number;
  ltp_change_24h: string;
  turnover_usd: number;
  contract_type: string;
  mark_price: string;
}

interface DeltaCandle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function fetchDeltaPerps(): Promise<DeltaTicker[]> {
  const res = await fetch(`${BASE}/tickers`);
  if (!res.ok) throw new Error(`Delta ticker error: ${res.status}`);
  const data = await res.json();
  return (data.result as DeltaTicker[])
    .filter((t) => t.contract_type === "perpetual_futures")
    .sort((a, b) => (b.turnover_usd || 0) - (a.turnover_usd || 0));
}

async function fetchDeltaCandles(symbol: string): Promise<OHLC[] | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 4 * 86400;
    const res = await fetch(
      `${BASE}/history/candles?symbol=${symbol}&resolution=1d&start=${start}&end=${now}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result || data.result.length < 2) return null;
    return (data.result as DeltaCandle[]).map((k) => ({
      openTime: k.time * 1000,
      open: k.open,
      high: k.high,
      low: k.low,
      close: k.close,
      volume: k.volume,
    }));
  } catch {
    return null;
  }
}

export async function runDeltaScreener(
  onProgress: (done: number, total: number, symbol: string) => void
): Promise<CPRResult[]> {
  const tickers = await fetchDeltaPerps();
  const results: CPRResult[] = [];
  const batchSize = 10;
  const delayMs = 300;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const candles = await fetchDeltaCandles(t.symbol);
        if (!candles || candles.length < 2) return null;

        const prevCandle = candles[candles.length - 3] ?? candles[0];
        const todayCandle = candles[candles.length - 2];

        const currentPrice = parseFloat(t.mark_price) || t.close;
        const changeFromDayOpen =
          t.open > 0
            ? ((currentPrice - t.open) / t.open) * 100
            : parseFloat(t.ltp_change_24h);

        return analyzeCPR(
          t.symbol,
          [prevCandle, todayCandle],
          currentPrice,
          changeFromDayOpen,
          t.turnover_usd || 0
        );
      })
    );

    batchResults.forEach((r) => { if (r) results.push(r); });
    onProgress(
      Math.min(i + batchSize, tickers.length),
      tickers.length,
      batch[batch.length - 1].symbol
    );

    if (i + batchSize < tickers.length) await sleep(delayMs);
  }

  return results;
}
