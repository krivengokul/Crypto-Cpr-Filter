import { OHLC, CPRResult, analyzeCPR } from "./cpr";

const BASE = "https://api.india.delta.exchange/v2";

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

type SessionOpenMap = Record<string, number>;

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function getTodayISTDate(): string {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return ist.toISOString().slice(0, 10);
}

function getTodayISTSessionStartMs(): number {
  const now = new Date();
  return Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
}

// ─── Session open cache (day-open price — stable all day) ─────────────────────

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

// ─── Fetch ALL perpetual futures tickers ─────────────────────────────────────

export async function fetchDeltaPerps(): Promise<DeltaTicker[]> {
  const all: DeltaTicker[] = [];
  let after: string | null = null;

  while (true) {
    const url =
      `${BASE}/tickers?contract_types=perpetual_futures` +
      (after ? `&after=${encodeURIComponent(after)}` : "");

    const res = await fetch(url, { cache: "no-store" });
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

// ─── Fetch daily candles ──────────────────────────────────────────────────────
// Handles two known Delta API response shapes:
//   Shape A (v2 docs):   { result: [...candles] }
//   Shape B (some envs): { result: { candles: [...] } }  ← nested object
// Logs the raw response for the first symbol so you can inspect in DevTools.

let _candleDebugLogged = false;

async function fetchDeltaCandles(symbol: string): Promise<OHLC[] | null> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const start = now - 6 * 86400;
    const res = await fetch(
      `${BASE}/history/candles?symbol=${symbol}&resolution=1d&start=${start}&end=${now}`,
      { cache: "no-store" }
    );
    if (!res.ok) return null;
    const data = await res.json();

    // ── Debug: log the raw response shape once so you can inspect it ────────
    if (!_candleDebugLogged) {
      _candleDebugLogged = true;
      console.log(`[Delta candles DEBUG] symbol=${symbol} raw response:`, JSON.stringify(data).slice(0, 500));
    }

    // ── Flexibly extract the candles array ───────────────────────────────────
    // Try all known shapes before giving up
    let raw: DeltaCandle[] | null = null;

    if (Array.isArray(data.result)) {
      // Shape A: { result: [ {time,open,...}, ... ] }
      raw = data.result as DeltaCandle[];
    } else if (data.result && Array.isArray(data.result.candles)) {
      // Shape B: { result: { candles: [...] } }
      raw = data.result.candles as DeltaCandle[];
    } else if (Array.isArray(data.candles)) {
      // Shape C: { candles: [...] }
      raw = data.candles as DeltaCandle[];
    } else if (Array.isArray(data)) {
      // Shape D: raw array at top level
      raw = data as DeltaCandle[];
    }

    if (!raw || raw.length < 3) return null;

    // ── Map to OHLC ──────────────────────────────────────────────────────────
    // Delta candle time field may be seconds (Unix) or ms — normalise to ms
    return raw.map((k) => ({
      openTime: k.time > 1e10 ? k.time : k.time * 1000, // seconds → ms if needed
      open:   Number(k.open),
      high:   Number(k.high),
      low:    Number(k.low),
      close:  Number(k.close),
      volume: Number(k.volume),
    }));
  } catch {
    return null;
  }
}

// ─── Main screener ────────────────────────────────────────────────────────────

export async function runDeltaScreener(
  onProgress: (done: number, total: number, symbol: string) => void
): Promise<CPRResult[]> {
  const todaySessionStartMs = getTodayISTSessionStartMs();

  // Reset debug flag so each scan logs fresh
  _candleDebugLogged = false;

  const tickers = await fetchDeltaPerps();

  const savedSessionMap = getPinnedSessionOpenMap() ?? {};
  const sessionOpenMap: SessionOpenMap = { ...savedSessionMap };

  const results: CPRResult[] = [];
  let nullCount = 0; // track how many symbols fail candle fetch
  const batchSize = 10;
  const delayMs   = 300;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const candles = await fetchDeltaCandles(t.symbol);
        if (!candles || candles.length < 3) {
          nullCount++;
          return null;
        }

        // ── Select the two completed candles for CPR ─────────────────────────
        const todayLiveCandleIdx = candles.findIndex(
          (c) => c.openTime === todaySessionStartMs
        );

        let prevCandle: OHLC;
        let todayCandle: OHLC;
        let todayLiveOpen: number | null = null;

        if (todayLiveCandleIdx !== -1) {
          // Live incomplete candle is in the array — pick the two before it
          if (todayLiveCandleIdx < 2) return null;
          prevCandle    = candles[todayLiveCandleIdx - 2];
          todayCandle   = candles[todayLiveCandleIdx - 1];
          todayLiveOpen = candles[todayLiveCandleIdx].open;
        } else {
          // No live candle — last two completed candles
          prevCandle  = candles[candles.length - 3] ?? candles[0];
          todayCandle = candles[candles.length - 2];
          todayLiveOpen = savedSessionMap[t.symbol] ?? null;
        }

        if (todayLiveOpen !== null) {
          sessionOpenMap[t.symbol] = todayLiveOpen;
        }

        const currentPrice = parseFloat(t.mark_price) || t.close;
        const changeFromDayOpen =
          todayLiveOpen !== null && todayLiveOpen > 0
            ? ((currentPrice - todayLiveOpen) / todayLiveOpen) * 100
            : parseFloat(t.ltp_change_24h);

        // Pass [prevCandle, todayCandle] — analyzeCPR uses [-2] and [-1]
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

  // Log summary to help diagnose if still broken
  console.log(`[Delta scan] total=${tickers.length} nullCandles=${nullCount} results=${results.length} matches=${results.filter(r=>r.passes).length}`);

  setPinnedSessionOpenMap(sessionOpenMap);
  return results;
}
