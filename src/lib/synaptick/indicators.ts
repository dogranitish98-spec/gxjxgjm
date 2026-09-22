/** Causal technicals. Each series is oldest → newest; null until enough history. */

export function sma(values: number[], period: number): Array<number | null> {
  if (period <= 0) return values.map(() => null);
  const result: Array<number | null> = Array(values.length).fill(null);
  let windowSum = 0;
  for (let i = 0; i < values.length; i++) {
    windowSum += values[i]!;
    if (i >= period) windowSum -= values[i - period]!;
    if (i >= period - 1) result[i] = windowSum / period;
  }
  return result;
}

export function ema(values: number[], period: number): Array<number | null> {
  const result: Array<number | null> = Array(values.length).fill(null);
  if (period <= 0 || values.length < period) return result;
  const multiplier = 2 / (period + 1);
  let prev = values.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = prev;
  for (let i = period; i < values.length; i++) {
    prev = (values[i]! - prev) * multiplier + prev;
    result[i] = prev;
  }
  return result;
}

export function rsi(closes: number[], period = 14): Array<number | null> {
  const result: Array<number | null> = Array(closes.length).fill(null);
  if (closes.length <= period) return result;
  let gainSum = 0;
  let lossSum = 0;
  for (let i = 1; i <= period; i++) {
    const change = closes[i]! - closes[i - 1]!;
    if (change >= 0) gainSum += change;
    else lossSum -= change;
  }
  let avgGain = gainSum / period;
  let avgLoss = lossSum / period;
  result[period] = rsiFrom(avgGain, avgLoss);
  for (let i = period + 1; i < closes.length; i++) {
    const change = closes[i]! - closes[i - 1]!;
    const gain = change >= 0 ? change : 0;
    const loss = change < 0 ? -change : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i] = rsiFrom(avgGain, avgLoss);
  }
  return result;
}

function rsiFrom(avgGain: number, avgLoss: number): number {
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export type MacdResult = {
  macdLine: Array<number | null>;
  signalLine: Array<number | null>;
  histogram: Array<number | null>;
};

export function macd(
  closes: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9,
): MacdResult {
  const fastEma = ema(closes, fastPeriod);
  const slowEma = ema(closes, slowPeriod);
  const macdLine = closes.map((_, i) => {
    const f = fastEma[i];
    const s = slowEma[i];
    return f != null && s != null ? f - s : null;
  });
  const signalLine: Array<number | null> = Array(closes.length).fill(null);
  const firstValid = macdLine.findIndex((v) => v != null);
  if (firstValid !== -1) {
    const macdValues = macdLine.slice(firstValid).map((v) => v!);
    const emaOfMacd = ema(macdValues, signalPeriod);
    for (let i = 0; i < emaOfMacd.length; i++) {
      signalLine[firstValid + i] = emaOfMacd[i] ?? null;
    }
  }
  const histogram = closes.map((_, i) => {
    const m = macdLine[i];
    const s = signalLine[i];
    return m != null && s != null ? m - s : null;
  });
  return { macdLine, signalLine, histogram };
}

export function atr(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14,
): Array<number | null> {
  const result: Array<number | null> = Array(closes.length).fill(null);
  if (highs.length !== lows.length || lows.length !== closes.length || closes.length <= period) {
    return result;
  }
  const tr = Array(closes.length).fill(0);
  tr[0] = highs[0]! - lows[0]!;
  for (let i = 1; i < closes.length; i++) {
    tr[i] = Math.max(
      highs[i]! - lows[i]!,
      Math.abs(highs[i]! - closes[i - 1]!),
      Math.abs(lows[i]! - closes[i - 1]!),
    );
  }
  let value = tr.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result[period - 1] = value;
  for (let i = period; i < tr.length; i++) {
    value = (value * (period - 1) + tr[i]!) / period;
    result[i] = value;
  }
  return result;
}

export function volumeRatio(volumes: number[], period = 20): number {
  if (volumes.length < period + 1) return 1;
  const avg = volumes.slice(-period - 1, -1).reduce((a, b) => a + b, 0) / period;
  return avg <= 0 ? 1 : volumes[volumes.length - 1]! / avg;
}

export function lastNumber(series: Array<number | null>, fallback: number): number {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i];
    if (v != null && Number.isFinite(v)) return v;
  }
  return fallback;
}
