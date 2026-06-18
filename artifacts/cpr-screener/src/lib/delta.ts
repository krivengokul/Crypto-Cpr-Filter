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

/**
 * Returns the Unix timestamp (seconds) for today's 5:30 AM IST session open.
 * Delta Exchange India daily candles start at 5:30 AM IST = 00:00 UTC.
 * So today's session start is simply today's UTC midnight.
 */
function getTodayISTSessionStartSec(): number {
  const now = new Date();
  return Math.floor(
    Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) / 1000
  );
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
    // FIX: Request 6 days instead of 4 to guarantee we always get enough
    // completed candles regardless of where we are in the current IST session.
    const start = now - 6 * 86400;
    const res = await fetch(
      `${BASE}/history/candles?symbol=${symbol}&resolution=1d&start=${start}&end=${now}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result || data.result.length < 3) return null;
    return (data.result as DeltaCandle[]).map((k) => ({
      openTime: k.time * 1000, // convert to ms
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

  // FIX: compute today's IST session start once (in seconds, for candle.time comparison)
  const todaySessionStartSec = getTodayISTSessionStartSec();

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const candles = await fetchDeltaCandles(t.symbol);
        if (!candles || candles.length < 3) return null;

        // FIX: Identify today's live (incomplete) candle by its timestamp.
        // Delta daily candles start at 5:30 AM IST = 00:00 UTC.
        // candle.openTime is in ms; todaySessionStartSec is in seconds.
        const todaySessionStartMs = todaySessionStartSec * 1000;

        // Find index of today's live candle (may or may not exist in array)
        const todayLiveCandleIdx = candles.findIndex(
          (c) => c.openTime === todaySessionStartMs
        );

        let todayCandle: OHLC; // yesterday's completed candle → used to compute TODAY's CPR
        let prevCandle: OHLC;  // day before yesterday → used to compute YESTERDAY's CPR
        let todayLiveOpen: number | null = null;

        if (todayLiveCandleIdx !== -1) {
          // Today's live candle exists in the array
          // todayCandle = the completed candle right before today's live candle
          // prevCandle  = the one before todayCandle
          if (todayLiveCandleIdx < 2) return null; // not enough completed candles
          todayCandle = candles[todayLiveCandleIdx - 1];
          prevCandle  = candles[todayLiveCandleIdx - 2];
          todayLiveOpen = candles[todayLiveCandleIdx].open;
        } else {
          // Today's live candle not in array yet (scanned before 5:30 AM IST or API lag)
          // Last candle in array = yesterday's completed candle (today's CPR source)
          // Second-to-last = day before yesterday (prev CPR source)
          if (candles.length < 2) return null;
          todayCandle = candles[candles.length - 1];
          prevCandle  = candles[candles.length - 2];
          todayLiveOpen = null; // session hasn't started yet
        }

        const currentPrice = parseFloat(t.mark_price) || t.close;

        // FIX: Use today's IST session open for changeFromDayOpen (mirrors Binance logic).
        // If today's live candle exists, use its open price.
        // Otherwise fall back to ltp_change_24h from ticker.
        const changeFromDayOpen =
          todayLiveOpen !== null && todayLiveOpen > 0
            ? ((currentPrice - todayLiveOpen) / todayLiveOpen) * 100
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

    batchResults.forEach((r) => {
      if (r) results.push(r);
    });
    onProgress(
      Math.min(i + batchSize, tickers.length),
      tickers.length,
      batch[batch.length - 1].symbol
    );

    if (i + batchSize < tickers.length) await sleep(delayMs);
  }

  return results;
}
