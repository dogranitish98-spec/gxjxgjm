import { ema, rsi } from "./indicators";
import type { Candle } from "./types";

export type AnalogReport = {
  comparable: number;
  qualified: number;
  threshold: number;
  favorablePct: number;
  medianReturn: number;
  medianAdverse: number;
  sampleNote: string;
  weak: boolean;
  /** Explicit status for UI */
  status: "PASS" | "FAIL" | "INSUFFICIENT DATA";
  samplePeriodBars: number;
  minSampleRequired: number;
};

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Similar RSI/EMA setups in the same series. Forward 8 bars. Causal — only past bars. */
export function historicalAnalogs(candles: Candle[], horizon = 8): AnalogReport {
  const closes = candles.map((c) => c.close);
  const r = rsi(closes, 14);
  const e21 = ema(closes, 21);
  const now = candles.length - 1;
  const rNow = r[now];
  const eNow = e21[now];
  const px = closes[now]!;
  const MIN_SAMPLE = 30;
  if (rNow == null || eNow == null || now < 80) {
    return {
      comparable: 0,
      qualified: 0,
      threshold: 80,
      favorablePct: 0,
      medianReturn: 0,
      medianAdverse: 0,
      sampleNote: "not enough history",
      weak: true,
      status: "INSUFFICIENT DATA",
      samplePeriodBars: now,
      minSampleRequired: MIN_SAMPLE,
    };
  }
  const distNow = ((px - eNow) / eNow) * 100;
  const returns: number[] = [];
  const adverse: number[] = [];
  let comparable = 0;
  for (let i = 40; i < now - horizon; i++) {
    const ri = r[i];
    const ei = e21[i];
    if (ri == null || ei == null) continue;
    comparable++;
    const dist = ((closes[i]! - ei) / ei) * 100;
    const rsiGap = Math.abs(ri - rNow);
    const emaGap = Math.abs(dist - distNow);
    const similarity = Math.max(0, 100 - rsiGap * 2 - emaGap * 8);
    if (similarity < 80) continue;
    const fwd = ((closes[i + horizon]! / closes[i]! - 1) * 100);
    let min = 0;
    for (let k = 1; k <= horizon; k++) {
      min = Math.min(min, ((closes[i + k]! / closes[i]! - 1) * 100));
    }
    returns.push(fwd);
    adverse.push(min);
  }
  const qualified = returns.length;
  const fav = qualified ? (returns.filter((x) => x > 0).length / qualified) * 100 : 0;
  const weak = qualified < MIN_SAMPLE;
  const status: AnalogReport["status"] = weak
    ? "INSUFFICIENT DATA"
    : fav >= 52
      ? "PASS"
      : "FAIL";
  return {
    comparable,
    qualified,
    threshold: 80,
    favorablePct: fav,
    medianReturn: median(returns),
    medianAdverse: median(adverse),
    sampleNote: weak
      ? `only ${qualified} analogs — too small to treat as evidence (need ≥ ${MIN_SAMPLE})`
      : `${qualified} analogs ≥ 80% similar • favorable ${fav.toFixed(1)}% (not a guaranteed probability)`,
    weak,
    status,
    samplePeriodBars: now,
    minSampleRequired: MIN_SAMPLE,
  };
}
