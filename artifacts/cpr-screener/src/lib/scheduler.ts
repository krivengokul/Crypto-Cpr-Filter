const STORAGE_KEY = "cpr_last_scan_date";

function getNowIST(): Date {
  const now = new Date();
  const utcMs = now.getTime() + now.getTimezoneOffset() * 60_000;
  const istOffsetMs = 5.5 * 60 * 60_000;
  return new Date(utcMs + istOffsetMs);
}

function toISTDateString(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function getTodayISTDate(): string {
  return toISTDateString(getNowIST());
}

export function getLastScanDate(): string | null {
  return localStorage.getItem(STORAGE_KEY);
}

export function markScannedToday(): void {
  localStorage.setItem(STORAGE_KEY, getTodayISTDate());
}

export function hasScannedToday(): boolean {
  return getLastScanDate() === getTodayISTDate();
}

export function isPastScheduledTime(): boolean {
  const ist = getNowIST();
  const h = ist.getHours();
  const m = ist.getMinutes();
  return h > 5 || (h === 5 && m >= 31);
}

export function shouldAutoScan(): boolean {
  return isPastScheduledTime() && !hasScannedToday();
}

export function getNextScanIST(): Date {
  const ist = getNowIST();
  const next = new Date(ist);

  if (isPastScheduledTime()) {
    next.setDate(next.getDate() + 1);
  }

  next.setHours(5, 31, 0, 0);

  const utcMs = next.getTime() - 5.5 * 60 * 60_000;
  return new Date(utcMs);
}

export function formatISTTime(utcDate: Date): string {
  return utcDate.toLocaleString("en-IN", {
    timeZone: "Asia/Kolkata",
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}

export function formatCountdown(targetUtc: Date): string {
  const diff = targetUtc.getTime() - Date.now();
  if (diff <= 0) return "now";
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1_000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}
