import { OHLC, CPRResult, analyzeCPR } from "./cpr";

const BASE = "https://api.india.delta.exchange/v2";

// ─── localStorage key prefixes (mirror Binance pattern) ──────────────────────
const DELTA_RESULTS_KEY_PREFIX      = "delta_cpr_results_";
const DELTA_SESSION_OPEN_KEY_PREFIX = "delta_session_open_";

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

// sessionOpenMap: symbol → open price at 5:30 AM IST today
type SessionOpenMap = Record<string, number>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

/** Returns today's date string in IST, e.g. "2026-06-18" */
function getTodayISTDate(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

/**
 * Today's 5:30 AM IST session start in milliseconds.
 * Delta daily candles start at 5:30 AM IST = 00:00 UTC.
 */
function getTodayISTSessionStartMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// ─── localStorage: pinned CPR results ────────────────────────────────────────

function getPinnedResults(): CPRResult[] | null {
  const key = DELTA_RESULTS_KEY_PREFIX + getTodayISTDate();
  const stored = localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as CPRResult[]) : null;
}

function setPinnedResults(results: CPRResult[]): void {
  const key = DELTA_RESULTS_KEY_PREFIX + getTodayISTDate();
  localStorage.setItem(key, JSON.stringify(results));
  Object.keys(localStorage)
    .filter((k) => k.startsWith(DELTA_RESULTS_KEY_PREFIX) && k !== key)
    .forEach((k) => localStorage.removeItem(k));
}

// ── NEW: clear today's pinned CPR results from localStorage ──────────────────
function clearPinnedResults(): void {
  const key = DELTA_RESULTS_KEY_PREFIX + getTodayISTDate();
  localStorage.removeItem(key);
}

// ─── localStorage: session open prices ───────────────────────────────────────

function getPinnedSessionOpenMap(): SessionOpenMap | null {
  const key = DELTA_SESSION_OPEN_KEY_PREFIX + getTodayISTDate();
  const stored = localStorage.getItem(key);
  return stored ? (JSON.parse(stored) as SessionOpenMap) : null;
}

function setPinnedSessionOpenMap(map: SessionOpenMap): void {
  const key = DELTA_SESSION_OPEN_KEY_PREFIX + getTodayISTDate();
  localStorage.setItem(key, JSON.stringify(map));
  Object.keys(localStorage)
    .filter((k) => k.startsWith(DELTA_SESSION_OPEN_KEY_PREFIX) && k !== key)
    .forEach((k) => localStorage.removeItem(k));
}

// ── NEW: clear today's pinned session open map from localStorage ──────────────
function clearPinnedSessionOpenMap(): void {
  const key = DELTA_SESSION_OPEN_KEY_PREFIX + getTodayISTDate();
  localStorage.removeItem(key);
}

// ─── Fetch ALL perpetual futures tickers (handles pagination) ─────────────────

export async function fetchDeltaPerps(): Promise<DeltaTicker[]> {
  const all: DeltaTicker[] = [];
  let after: string | null = null;

  while (true) {
    const url =
      `${BASE}/tickers?contract_types=perpetual_futures` +
      (after ? `&after=${encodeURIComponent(after)}` : "");

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Delta ticker error: ${res.status}`);
    const data = await res.json();

    const page: DeltaTicker[] = (data.result ?? []) as DeltaTicker[];
    all.push(...page);

    const nextAfter: string | null = data.meta?.after ?? null;
    if (!nextAfter || page.length === 0) break;
    after = nextAfter;
  }

  return all.sort((a, b) => (b.turnover_usd || 0) - (a.turnover_usd || 0));
}

// ─── Fetch daily candles for one symbol ──────────────────────────────────────

async function fetchDeltaCandles(symbol: string): Promise<OHLC[] | null> {
  try {
    // ── FIX: add cache-busting timestamp so the browser never serves a
    //    stale cached response for this URL ──────────────────────────────────
    const now = Math.floor(Date.now() / 1000);
    const start = now - 6 * 86400;
    const res = await fetch(
      `${BASE}/history/candles?symbol=${symbol}&resolution=1d&start=${start}&end=${now}&_t=${now}`
    );
    if (!res.ok) return null;
    const data = await res.json();
    if (!data.result || data.result.length < 3) return null;
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

// ─── CPR computation for a single symbol ─────────────────────────────────────

function computeCPRForSymbol(
  t: DeltaTicker,
  candles: OHLC[],
  todaySessionStartMs: number
): { result: CPRResult; sessionOpen: number | null } | null {
  const todayLiveCandleIdx = candles.findIndex(
    (c) => c.openTime === todaySessionStartMs
  );

  let todayCandle: OHLC;
  let prevCandle: OHLC;
  let todayLiveOpen: number | null = null;

  if (todayLiveCandleIdx !== -1) {
    if (todayLiveCandleIdx < 2) return null;
    todayCandle   = candles[todayLiveCandleIdx - 1];
    prevCandle    = candles[todayLiveCandleIdx - 2];
    todayLiveOpen = candles[todayLiveCandleIdx].open;
  } else {
    if (candles.length < 2) return null;
    todayCandle = candles[candles.length - 1];
    prevCandle  = candles[candles.length - 2];
  }

  const currentPrice = parseFloat(t.mark_price) || t.close;
  const changeFromDayOpen =
    todayLiveOpen !== null && todayLiveOpen > 0
      ? ((currentPrice - todayLiveOpen) / todayLiveOpen) * 100
      : parseFloat(t.ltp_change_24h);

  const result = analyzeCPR(
    t.symbol,
    [prevCandle, todayCandle],
    currentPrice,
    changeFromDayOpen,
    t.turnover_usd || 0
  );

  if (!result) return null;
  return { result, sessionOpen: todayLiveOpen };
}

// ─── Main screener ────────────────────────────────────────────────────────────

export async function runDeltaScreener(
  onProgress: (done: number, total: number, symbol: string) => void,
  forceRefresh = false   // ── NEW parameter ──────────────────────────────────
): Promise<CPRResult[]> {
  const todaySessionStartMs = getTodayISTSessionStartMs();

  // Always fetch live tickers (needed for current price on every scan)
  const tickers = await fetchDeltaPerps();
  const tickerMap: Record<string, DeltaTicker> = {};
  for (const t of tickers) tickerMap[t.symbol] = t;

  // ── FIX: if forceRefresh, wipe the pinned cache so we do a full rescan ────
  if (forceRefresh) {
    clearPinnedResults();
    clearPinnedSessionOpenMap();
  }

  // ── CHECK: do we already have today's pinned CPR results? ──────────────────
  const pinnedResults    = getPinnedResults();
  const pinnedSessionMap = getPinnedSessionOpenMap();

  if (pinnedResults && pinnedResults.length > 0 && pinnedSessionMap) {
    // ── RESCAN PATH: reuse pinned CPR levels, update live price only ──────────
    const total = pinnedResults.length;
    const updated: CPRResult[] = pinnedResults.map((saved, i) => {
      const live = tickerMap[saved.symbol];
      onProgress(i + 1, total, saved.symbol);
      if (!live) return saved;

      const currentPrice = parseFloat(live.mark_price) || live.close;
      const sessionOpen  = pinnedSessionMap[saved.symbol] ?? null;
      const changeFromDayOpen =
        sessionOpen !== null && sessionOpen > 0
          ? ((currentPrice - sessionOpen) / sessionOpen) * 100
          : parseFloat(live.ltp_change_24h);

      return {
        ...saved,
        currentPrice,
        change24h: changeFromDayOpen,
      } as CPRResult;
    });
    return updated;
  }

  // ── FULL SCAN PATH: fetch candles for all symbols, compute + pin CPR ───────
  const results: CPRResult[]           = [];
  const sessionOpenMap: SessionOpenMap = {};
  const batchSize = 10;
  const delayMs   = 300;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const candles = await fetchDeltaCandles(t.symbol);
        if (!candles || candles.length < 3) return null;
        return computeCPRForSymbol(t, candles, todaySessionStartMs);
      })
    );

    batchResults.forEach((r) => {
      if (!r) return;
      results.push(r.result);
      if (r.sessionOpen !== null) {
        sessionOpenMap[r.result.symbol] = r.sessionOpen;
      }
    });

    onProgress(
      Math.min(i + batchSize, tickers.length),
      tickers.length,
      batch[batch.length - 1].symbol
    );

    if (i + batchSize < tickers.length) await sleep(delayMs);
  }

  // Pin for the rest of the day
  setPinnedResults(results);
  setPinnedSessionOpenMap(sessionOpenMap);

  return results;
}
