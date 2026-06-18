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
// FIX: add page_size=500 to get all tickers in one request instead of relying
// solely on cursor pagination (which previously only returned ~7 results when
// the cursor field wasn't found in the response meta).

export async function fetchDeltaPerps(): Promise<DeltaTicker[]> {
  const all: DeltaTicker[] = [];
  let after: string | null = null;
  let pageNum = 0;

  while (true) {
    // Request a large page so we usually get all 195 in one shot.
    // page_size=500 is safe — Delta caps at 500 per page.
    const url =
      `${BASE}/tickers?contract_types=perpetual_futures&page_size=500` +
      (after ? `&after=${encodeURIComponent(after)}` : "");

    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Delta ticker error: ${res.status}`);
    const data = await res.json();

    // Log first page so we can inspect the real meta shape in DevTools
    if (pageNum === 0) {
      console.log(
        "[Delta tickers DEBUG] meta:",
        JSON.stringify(data.meta ?? data.pagination ?? null)
      );
    }
    pageNum++;

    const page: DeltaTicker[] = (data.result ?? []) as DeltaTicker[];
    all.push(...page);

    // Try every known cursor field name the Delta API may use
    const nextAfter: string | null =
      data.meta?.after ??
      data.meta?.cursor ??
      data.meta?.next_cursor ??
      data.pagination?.after ??
      data.pagination?.cursor ??
      null;

    if (!nextAfter || page.length === 0) break;
    after = nextAfter;
  }

  return all.sort((a, b) => (b.turnover_usd || 0) - (a.turnover_usd || 0));
}

// ─── Fetch daily candles ──────────────────────────────────────────────────────
// Handles multiple known Delta API response shapes:
//   Shape A (v2 docs):   { result: [...candles] }
//   Shape B (some envs): { result: { candles: [...] } }
//   Shape C:             { candles: [...] }
//   Shape D:             [...candles]

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

    if (!_candleDebugLogged) {
      _candleDebugLogged = true;
      console.log(
        `[Delta candles DEBUG] symbol=${symbol} raw:`,
        JSON.stringify(data).slice(0, 500)
      );
    }

    let raw: DeltaCandle[] | null = null;

    if (Array.isArray(data.result)) {
      raw = data.result as DeltaCandle[];
    } else if (data.result && Array.isArray(data.result.candles)) {
      raw = data.result.candles as DeltaCandle[];
    } else if (Array.isArray(data.candles)) {
      raw = data.candles as DeltaCandle[];
    } else if (Array.isArray(data)) {
      raw = data as DeltaCandle[];
    }

    if (!raw || raw.length < 3) return null;
    
    // Delta returns candles newest-first — sort ascending so index 0 = oldest
    raw.sort((a, b) => a.time - b.time);
    
    return raw.map((k) => ({
      openTime: k.time > 1e10 ? k.time : k.time * 1000,
      open: Number(k.open),
      high: Number(k.high),
      low: Number(k.low),
      close: Number(k.close),
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

  _candleDebugLogged = false;

  const tickers = await fetchDeltaPerps();
  console.log(`[Delta] Fetched ${tickers.length} perpetual futures tickers`);

  const savedSessionMap = getPinnedSessionOpenMap() ?? {};
  const sessionOpenMap: SessionOpenMap = { ...savedSessionMap };

  const results: CPRResult[] = [];
  let nullCount = 0;
  const batchSize = 10;
  const delayMs = 300;

  for (let i = 0; i < tickers.length; i += batchSize) {
    const batch = tickers.slice(i, i + batchSize);

    const batchResults = await Promise.all(
      batch.map(async (t) => {
        const candles = await fetchDeltaCandles(t.symbol);
        if (!candles || candles.length < 3) {
          nullCount++;
          return null;
        }

        const todayLiveCandleIdx = candles.findIndex(
          (c) => c.openTime === todaySessionStartMs
        );

        let prevCandle: OHLC;
        let todayCandle: OHLC;
        let todayLiveOpen: number | null = null;

        if (todayLiveCandleIdx !== -1) {
          if (todayLiveCandleIdx < 2) return null;
          prevCandle = candles[todayLiveCandleIdx - 2];
          todayCandle = candles[todayLiveCandleIdx - 1];
          todayLiveOpen = candles[todayLiveCandleIdx].open;
        } else {
          prevCandle = candles[candles.length - 3] ?? candles[0];
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

  console.log(
    `[Delta scan] total=${tickers.length} nullCandles=${nullCount} results=${results.length} matches=${results.filter((r) => r.passes).length}`
  );

  setPinnedSessionOpenMap(sessionOpenMap);
  return results;
}
