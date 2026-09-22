import { computeScreen, SCREEN_START } from "./screen";
import type { Candle } from "./types";

export type RankingCheck = {
  horizonBars: number;
  sections: number;
  avgSymbols: number;
  meanRankIc: number;
  tStat: number;
  topFifthPct: number;
  allCoinsPct: number;
  bottomFifthPct: number;
  verdict: "PREDICTIVE" | "WEAK" | "NO EDGE" | "INSUFFICIENT DATA";
};

type Sample = { symbol: string; score: number; fwdPct: number };

export function insufficient(horizonBars: number): RankingCheck {
  return {
    horizonBars,
    sections: 0,
    avgSymbols: 0,
    meanRankIc: 0,
    tStat: 0,
    topFifthPct: 0,
    allCoinsPct: 0,
    bottomFifthPct: 0,
    verdict: "INSUFFICIENT DATA",
  };
}

export function checkRanking(
  candlesBySymbol: Record<string, Candle[]>,
  horizonBars = 4,
  intervalMs = 3_600_000,
  minSymbols = 30,
  minDayVolumeUsd = 0,
): RankingCheck {
  if (horizonBars <= 0) return insufficient(horizonBars);
  const byTime = collect(candlesBySymbol, horizonBars, intervalMs, minDayVolumeUsd);
  const sections: Sample[][] = [];
  let nextAllowed = Number.NEGATIVE_INFINITY;
  const horizonMs = horizonBars * intervalMs;
  for (const time of Object.keys(byTime).map(Number).sort((a, b) => a - b)) {
    if (time < nextAllowed) continue;
    const samples = byTime[time] ?? [];
    if (samples.length < minSymbols) continue;
    sections.push(samples);
    nextAllowed = time + horizonMs;
  }
  return summarize(sections, horizonBars);
}

export function collect(
  candlesBySymbol: Record<string, Candle[]>,
  horizonBars: number,
  intervalMs: number,
  minDayVolumeUsd = 0,
): Record<number, Sample[]> {
  const horizonMs = horizonBars * intervalMs;
  const dayBars = Math.max(1, Math.floor((24 * 3_600_000) / intervalMs));
  const byTime: Record<number, Sample[]> = {};
  for (const [symbol, candles] of Object.entries(candlesBySymbol)) {
    const scores = computeScreen(candles).scores;
    const n = candles.length;
    const traded = Array(n + 1).fill(0);
    for (let i = 0; i < n; i++) traded[i + 1] = traded[i]! + candles[i]!.close * candles[i]!.volume;
    for (let t = SCREEN_START; t + horizonBars < n; t++) {
      const score = scores[t]!;
      const liquid =
        minDayVolumeUsd <= 0 ||
        (t + 1 - dayBars >= 0 && traded[t + 1]! - traded[t + 1 - dayBars]! >= minDayVolumeUsd);
      if (!Number.isFinite(score) || !liquid) continue;
      const entry = candles[t]!.close;
      const exit = candles[t + horizonBars]!.close;
      const span = candles[t + horizonBars]!.openTimeMs - candles[t]!.openTimeMs;
      if (entry > 0 && span === horizonMs) {
        const key = candles[t]!.openTimeMs;
        (byTime[key] ??= []).push({ symbol, score, fwdPct: (exit / entry - 1) * 100 });
      }
    }
  }
  return byTime;
}

export function summarize(sections: Sample[][], horizonBars: number): RankingCheck {
  const ics: number[] = [];
  let topSum = 0;
  let bottomSum = 0;
  let allSum = 0;
  let symbolSum = 0;
  for (const section of sections) {
    const ic = spearman(
      section.map((s) => s.score),
      section.map((s) => s.fwdPct),
    );
    if (Number.isNaN(ic)) continue;
    ics.push(ic);
    const ordered = [...section].sort((a, b) => b.score - a.score || a.symbol.localeCompare(b.symbol));
    const fifth = Math.max(1, Math.floor(ordered.length / 5));
    topSum += mean(ordered.slice(0, fifth).map((s) => s.fwdPct));
    bottomSum += mean(ordered.slice(-fifth).map((s) => s.fwdPct));
    allSum += mean(ordered.map((s) => s.fwdPct));
    symbolSum += section.length;
  }
  const k = ics.length;
  if (k < 12) return insufficient(horizonBars);
  const meanIc = mean(ics);
  const sd = Math.sqrt(ics.reduce((s, ic) => s + (ic - meanIc) ** 2, 0) / (k - 1));
  const t = sd > 1e-12 ? meanIc / (sd / Math.sqrt(k)) : 0;
  const top = topSum / k;
  const bottom = bottomSum / k;
  const all = allSum / k;
  const verdict: RankingCheck["verdict"] =
    meanIc > 0 && t >= 2 && top > all ? "PREDICTIVE" : meanIc > 0 && t >= 1 ? "WEAK" : "NO EDGE";
  return {
    horizonBars,
    sections: k,
    avgSymbols: symbolSum / k,
    meanRankIc: meanIc,
    tStat: t,
    topFifthPct: top,
    allCoinsPct: all,
    bottomFifthPct: bottom,
    verdict,
  };
}

export function spearman(x: number[], y: number[]): number {
  if (x.length !== y.length || x.length < 3) return Number.NaN;
  return pearson(ranks(x), ranks(y));
}

function ranks(values: number[]): number[] {
  const order = values.map((_, i) => i).sort((a, b) => values[a]! - values[b]!);
  const out = Array(values.length).fill(0);
  let i = 0;
  while (i < order.length) {
    let j = i;
    while (j + 1 < order.length && values[order[j + 1]!] === values[order[i]!]) j++;
    const average = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[order[k]!] = average;
    i = j + 1;
  }
  return out;
}

function pearson(a: number[], b: number[]): number {
  const n = a.length;
  const meanA = mean(a);
  const meanB = mean(b);
  let sab = 0;
  let saa = 0;
  let sbb = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i]! - meanA;
    const db = b[i]! - meanB;
    sab += da * db;
    saa += da * da;
    sbb += db * db;
  }
  if (saa <= 0 || sbb <= 0) return Number.NaN;
  return sab / Math.sqrt(saa * sbb);
}

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}
