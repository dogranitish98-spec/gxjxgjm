import { atr, ema, macd, rsi } from "./indicators";
import type { Candle } from "./types";

export const SCREEN_START = 55;
export const SCREEN_MIN = 80;

export type ScreenDetail = {
  score: number;
  trend: number;
  momentum: number;
  participation: number;
  tradability: number;
  rsi: number;
  atrPct: number;
  volumeRatio: number;
  aboveEma50: boolean;
  ema20AboveEma50: boolean;
  macdPositive: boolean;
};

export function tradabilityPoints(atrPct: number): number {
  if (atrPct < 0.15) return 3;
  if (atrPct < 0.35) return 3 + ((atrPct - 0.15) / 0.2) * 17;
  if (atrPct <= 1.5) return 20;
  if (atrPct < 3) return 20 - ((atrPct - 1.5) / 1.5) * 15;
  return 5;
}

export function computeScreen(candles: Candle[]): { scores: number[]; last: ScreenDetail | null } {
  const n = candles.length;
  const scores = Array(n).fill(Number.NaN);
  if (n < SCREEN_MIN) return { scores, last: null };
  const closes = candles.map((c) => c.close);
  const highs = candles.map((c) => c.high);
  const lows = candles.map((c) => c.low);
  const ema20 = ema(closes, 20);
  const ema50 = ema(closes, 50);
  const rsis = rsi(closes, 14);
  const hist = macd(closes).histogram;
  const atrs = atr(highs, lows, closes, 14);
  const prefix = Array(n + 1).fill(0);
  for (let i = 0; i < n; i++) prefix[i + 1] = prefix[i]! + candles[i]!.volume;

  let last: ScreenDetail | null = null;
  for (let t = SCREEN_START; t < n; t++) {
    const c = candles[t]!.close;
    const e20 = ema20[t];
    const e50 = ema50[t];
    const e20Prev = ema20[t - 5];
    const r = rsis[t];
    const h = hist[t];
    const hPrev = hist[t - 1];
    const a = atrs[t];
    if (e20 == null || e50 == null || e20Prev == null || r == null || h == null || hPrev == null || a == null) {
      continue;
    }
    const baseline = (prefix[t]! - prefix[t - 20]!) / 20;
    const volumeRatio = baseline > 0 ? candles[t]!.volume / baseline : 1;
    const atrPct = (a / c) * 100;
    let trend = 0;
    if (c > e50) trend += 10;
    if (e20 > e50) trend += 10;
    if (e20 > e20Prev) trend += 10;
    let momentum = 0;
    if (h > 0) momentum += 12;
    if (h > hPrev) momentum += 6;
    if (r >= 50 && r <= 68) momentum += 12;
    else if ((r >= 40 && r < 50) || (r > 68 && r <= 75)) momentum += 6;
    const participation = Math.min(1, Math.max(0, (volumeRatio - 0.5) / 1.5)) * 20;
    const tradability = tradabilityPoints(atrPct);
    const score = trend + momentum + participation + tradability;
    scores[t] = score;
    if (t === n - 1) {
      last = {
        score,
        trend,
        momentum,
        participation,
        tradability,
        rsi: r,
        atrPct,
        volumeRatio,
        aboveEma50: c > e50,
        ema20AboveEma50: e20 > e50,
        macdPositive: h > 0,
      };
    }
  }
  return { scores, last };
}
