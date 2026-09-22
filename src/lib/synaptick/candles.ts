import type { Candle } from "./types";

const INTERVAL_MS: Record<string, number> = {
  "1m": 60_000,
  "5m": 300_000,
  "15m": 900_000,
  "1h": 3_600_000,
  "4h": 14_400_000,
  "1d": 86_400_000,
};

export function intervalMs(interval: string): number {
  return INTERVAL_MS[interval] ?? 60_000;
}

/** Binance kline row → candles that had already closed at nowMs. Malformed series → null. */
export function parseClosed(
  rows: unknown[],
  nowMs: number,
  interval: string,
): Candle[] | null {
  const ms = intervalMs(interval);
  const out: Candle[] = [];
  let prevOpen = Number.NEGATIVE_INFINITY;
  for (const raw of rows) {
    if (!Array.isArray(raw) || raw.length < 6) return null;
    const openTime = Number(raw[0]);
    const open = Number(raw[1]);
    const high = Number(raw[2]);
    const low = Number(raw[3]);
    const close = Number(raw[4]);
    const volume = Number(raw[5]);
    if (!(openTime > 0) || openTime <= prevOpen) return null;
    if (![open, high, low, close, volume].every((v) => Number.isFinite(v))) return null;
    if (close <= 0 || low <= 0 || high < low || volume < 0) return null;
    prevOpen = openTime;
    const reportedClose = raw.length > 6 ? Number(raw[6]) : NaN;
    const closesAt = reportedClose > 0 ? reportedClose : openTime + ms - 1;
    if (closesAt > nowMs) continue;
    out.push({
      openTimeMs: openTime,
      closeTimeMs: closesAt,
      open,
      high,
      low,
      close,
      volume,
    });
  }
  return out;
}

export function requiredTimeframes(): string[] {
  return ["1m", "5m", "15m", "1h"];
}

export function validateQuality(data: Record<string, Candle[]>): {
  ok: boolean;
  issues: string[];
  barsByTf: Record<string, number>;
  summary: string;
} {
  const issues: string[] = [];
  const barsByTf: Record<string, number> = {};
  for (const tf of requiredTimeframes()) {
    const series = data[tf] ?? [];
    barsByTf[tf] = series.length;
    if (series.length === 0) {
      issues.push(`MISSING_${tf}`);
      continue;
    }
    if (series.length < 80) issues.push(`SHORT_${tf}(${series.length})`);
    let prev = -1;
    let prevClose = -1;
    let bad = 0;
    const start = Math.max(0, series.length - 120);
    for (let i = start; i < series.length; i++) {
      const c = series[i]!;
      if (c.close <= 0 || c.high < c.low) bad++;
      if (prev > 0 && c.openTimeMs < prev) bad++;
      if (prevClose > 0 && c.close > 0) {
        const jump = Math.abs(c.close / prevClose - 1) * 100;
        const limit = tf === "1m" ? 12 : tf === "5m" ? 18 : tf === "15m" ? 25 : 35;
        if (jump > limit) bad++;
      }
      prev = c.openTimeMs;
      prevClose = c.close;
    }
    if (bad > 0) issues.push(`BAD_${tf}(${bad})`);
  }
  const ok = issues.length === 0;
  return {
    ok,
    issues,
    barsByTf,
    summary: ok
      ? `DATA OK • ${Object.entries(barsByTf)
          .map(([k, v]) => `${k}=${v}`)
          .join(" ")}`
      : `DATA REJECTED • ${issues.slice(0, 4).join(" | ")}`,
  };
}

export function closes(c: Candle[]): number[] {
  return c.map((x) => x.close);
}
export function highs(c: Candle[]): number[] {
  return c.map((x) => x.high);
}
export function lows(c: Candle[]): number[] {
  return c.map((x) => x.low);
}
export function volumes(c: Candle[]): number[] {
  return c.map((x) => x.volume);
}
