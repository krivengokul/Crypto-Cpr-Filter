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
    open:     parseFloat(k[1] as string),
    high:     parseFloat(k[2] as string),
    low:      parseFloat(k[3] as string),
    close:    parseFloat(k[4] as string),
    volume:   parseFloat(k[5] as string),
  };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

const PINNED_KEY_PREFIX = "cpr_symbols_";

function getTodayISTDate(): string {
  const now = new Date();
  const istDate = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return istDate.toISOString().slice(0, 10);
}

function getPinnedSymbols(): string[] | null {
  const key = PINNED_KEY_PREFIX + getTodayISTDate();
  const stored = localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as string[]) : null;
}

function setPinnedSymbols(symbols: string[]): void {
  const key = PINNED_KEY_PREFIX + getTodayISTDate();
  localStorage.setItem(key, JSON.stringify(symbols));
  Object.keys(localStorage)
    .filter((k) => k.startsWith(PINNED_KEY_PREFIX) && k !== key)
    .forEach((k) => localStorage.removeItem(k));
}

/**
 * ADK FIX: Detect today's live (incomplete) daily candle using the UTC midnight
 * boundary — identical to TradingView's `high[1]` + `lookahead_off` behaviour.
 *
 * Binance resets daily candles at UTC 00:00. Any candle whose openTime falls on
 * today's UTC date is still forming and must NOT be used for CPR calculation.
 * Using the 24h heuristic was fragile; this check is exact.
 */
function isLiveDailyCandle(openTimeMs: number): boolean {
  const now = new Date();
  const utcMidnightToday = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate()
  );
  return openTimeMs >= utcMidnightToday;
}

async function fetchActiveSymbols(): Promise<Set<string>> {
  const res = await fetch(`${BASE}/exchangeInfo`);
  if (!res.ok) throw new Error(`Binance exchangeInfo error: ${res.status}`);
  const data: { symbols: { symbol: string; status: string }[] } = await res.json();
  return new Set(
    data.symbols
      .filter((s) => s.status === "TRADING")
      .map((s) => s.symbol)
  );
}

export async function fetchTopUSDTSymbols(limit = 500): Promise<Ticker24h[]> {
  const [res, activeSymbols] = await Promise.all([
    fetch(`${BASE}/ticker/24hr`),
    fetchActiveSymbols(),
  ]);
  if (!res.ok) throw new Error(`Binance ticker error: ${res.status}`);
  const data: Ticker24h[] = await res.json();

  return data
    .filter(
      (t) =>
        activeSymbols.has(t.symbol) &&     // ← filters out delisted coins
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
      `${BASE}/klines?symbol=${symbol}&interval=1d&limit=4`
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
  const allTickers = await fetchTopUSDTSymbols(500);

  let pinnedSymbols = getPinnedSymbols();
  if (!pinnedSymbols) {
    pinnedSymbols = allTickers.map((t) => t.symbol);
    setPinnedSymbols(pinnedSymbols);
  }
  const pinnedSet = new Set(pinnedSymbols);
  const tickers = allTickers.filter((t) => pinnedSet.has(t.symbol));

  const results: CPRResult[] = [];
  const batchSize = 10;
  const delayMs = 300;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const klines = await fetchKlines(t.symbol);
        if (!klines || klines.length < 2) return null;

        const lastKline = klines[klines.length - 1];

        // ADK FIX: use UTC midnight boundary — matches TradingView high[1] lookahead_off
        const lastKlineIsLive = isLiveDailyCandle(lastKline.openTime);

        let prevCandle: OHLC;
        let todayCandle: OHLC;
        let liveCandle: OHLC | null = null;

        if (lastKlineIsLive) {
          if (klines.length < 3) return null;
          prevCandle  = klines[klines.length - 3]; // 2 days ago (completed)
          todayCandle = klines[klines.length - 2]; // yesterday (completed) → today's CPR
          liveCandle  = lastKline;                  // today's forming candle (not used for CPR)
        } else {
          prevCandle  = klines[klines.length - 2];
          todayCandle = klines[klines.length - 1];
          liveCandle  = null;
        }

        const currentPrice = parseFloat(t.lastPrice);
        // AFTER — always derive % from the same openPrice that's displayed
        const openPriceUsed = liveCandle ? liveCandle.open : todayCandle.open;
        const changeFromDayOpen = ((currentPrice - openPriceUsed) / openPriceUsed) * 100;

          return analyzeCPR(
          t.symbol,
          [prevCandle, todayCandle],
          currentPrice,
          changeFromDayOpen,
          parseFloat(t.quoteVolume),
          liveCandle ? liveCandle.open : todayCandle.open
        );
      })
    );

    batchResults.forEach((r) => { if (r) results.push(r); });

    const processed = Math.min(i + batchSize, tickers.length);
    onProgress(processed, tickers.length, batch[batch.length - 1].symbol);

    if (i + batchSize < tickers.length) await sleep(delayMs);
  }

  return results;
}
