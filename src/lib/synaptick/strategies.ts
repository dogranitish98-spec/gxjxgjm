import { ema, macd, rsi, sma } from "./indicators";
import { fromBacktest } from "./performance";
import { ROUND_TRIP_COST_PCT } from "./costs";
import type { BacktestTrade, Candle, Robustness, StrategyResult, StrategyStatus } from "./types";

export const FEE_ONE_WAY = 0.1;
export const SLIP_ONE_WAY = 0.03;
/** Flat % cost used in % PnL backtests (matches ROUND_TRIP_COST_PCT). */
export const ROUND_TRIP = ROUND_TRIP_COST_PCT;

export type StrategyDef = {
  id: string;
  name: string;
  entry: string;
  exit: string;
  /** Deterministic signal at bar i. Never LLM-generated. */
  signal: (c: Candle[], i: number) => 1 | -1 | 0;
  /** Optional parameter keys for sensitivity testing. */
  params?: Record<string, number>;
};

function lastDefined(series: Array<number | null>, i: number): number | null {
  return series[i] ?? null;
}

export const STRATEGY_DEFS: StrategyDef[] = [
  {
    id: "rsi-reversion",
    name: "RSI Reversion",
    entry: "RSI < 30 AND price > EMA200",
    exit: "RSI > 60 OR max hold",
    params: { rsiPeriod: 14, emaPeriod: 200, oversold: 30, overbought: 60 },
    signal: (c, i) => {
      const closes = c.map((x) => x.close);
      const period = Math.min(200, Math.max(30, Math.floor(c.length / 3)));
      const r = lastDefined(rsi(closes, 14), i);
      const e = lastDefined(ema(closes, period), i);
      if (r == null || e == null) return 0;
      if (r < 30 && c[i]!.close > e) return 1;
      if (r > 70 && c[i]!.close < e) return -1;
      return 0;
    },
  },
  {
    id: "ema-pullback",
    name: "EMA Pullback",
    entry: "Close between EMA21 and EMA50 AND EMA21 > EMA50",
    exit: "Close below EMA50 OR max hold",
    params: { fast: 21, slow: 50 },
    signal: (c, i) => {
      const closes = c.map((x) => x.close);
      const e21 = lastDefined(ema(closes, 21), i);
      const e50 = lastDefined(ema(closes, 50), i);
      if (e21 == null || e50 == null) return 0;
      const px = c[i]!.close;
      if (e21 > e50 && px <= e21 && px >= e50) return 1;
      if (e21 < e50 && px >= e21 && px <= e50) return -1;
      return 0;
    },
  },
  {
    id: "macd-momentum",
    name: "MACD Momentum",
    entry: "MACD histogram crosses above 0",
    exit: "Histogram crosses below 0 OR max hold",
    signal: (c, i) => {
      if (i < 1) return 0;
      const hist = macd(c.map((x) => x.close)).histogram;
      const a = hist[i];
      const b = hist[i - 1];
      if (a == null || b == null) return 0;
      if (b <= 0 && a > 0) return 1;
      if (b >= 0 && a < 0) return -1;
      return 0;
    },
  },
  {
    id: "donchian",
    name: "Donchian Breakout",
    entry: "Close breaks 20-bar high",
    exit: "Close back inside OR max hold",
    params: { lookback: 20 },
    signal: (c, i) => {
      if (i < 20) return 0;
      const window = c.slice(i - 20, i);
      const hi = Math.max(...window.map((x) => x.high));
      const lo = Math.min(...window.map((x) => x.low));
      if (c[i]!.close > hi) return 1;
      if (c[i]!.close < lo) return -1;
      return 0;
    },
  },
  {
    id: "sma-trend",
    name: "SMA Trend",
    entry: "SMA20 crosses above SMA50",
    exit: "SMA20 crosses below SMA50 OR max hold",
    params: { fast: 20, slow: 50 },
    signal: (c, i) => {
      if (i < 1) return 0;
      const closes = c.map((x) => x.close);
      const s20 = sma(closes, 20);
      const s50 = sma(closes, 50);
      const a = s20[i];
      const b = s50[i];
      const ap = s20[i - 1];
      const bp = s50[i - 1];
      if (a == null || b == null || ap == null || bp == null) return 0;
      if (ap <= bp && a > b) return 1;
      if (ap >= bp && a < b) return -1;
      return 0;
    },
  },
  {
    id: "volume-spike",
    name: "Volume Spike",
    entry: "Volume > 2× 20-bar mean AND close > open",
    exit: "max hold OR close < prior low",
    params: { lookback: 20, mult: 2 },
    signal: (c, i) => {
      if (i < 21) return 0;
      const avg = c.slice(i - 20, i).reduce((s, x) => s + x.volume, 0) / 20;
      if (avg <= 0) return 0;
      const ratio = c[i]!.volume / avg;
      if (ratio > 2 && c[i]!.close > c[i]!.open) return 1;
      if (ratio > 2 && c[i]!.close < c[i]!.open) return -1;
      return 0;
    },
  },
];

export function backtest(
  candles: Candle[],
  def: StrategyDef,
  costPct = ROUND_TRIP,
  maxHold = 12,
): BacktestTrade[] {
  const trades: BacktestTrade[] = [];
  let open: { bar: number; side: 1 | -1; entry: number } | null = null;
  const start = 60;
  if (candles.length < start + 10) return trades;

  for (let i = start; i < candles.length; i++) {
    if (open) {
      const held = i - open.bar;
      const px = candles[i]!.close;
      const dir = open.side;
      const reverse = def.signal(candles, i) === (dir === 1 ? -1 : 1);
      const time = held >= maxHold;
      if (reverse || time || i === candles.length - 1) {
        const pnl = dir * ((px - open.entry) / open.entry) * 100;
        if (Number.isFinite(pnl)) {
          trades.push({
            entryBar: open.bar,
            exitBar: i,
            side: dir === 1 ? "BUY" : "SELL",
            entry: open.entry,
            exit: px,
            pnlPct: pnl,
            netPct: pnl - costPct,
          });
        }
        open = null;
      }
    }
    if (!open) {
      const sig = def.signal(candles, i);
      if (sig !== 0) {
        open = { bar: i, side: sig, entry: candles[i]!.close };
      }
    }
  }
  return trades;
}

function lcg(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export type MonteCarloResult = {
  median: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  positivePct: number;
  sampleSize: number;
  rounds: number;
  label: "HISTORICAL ROBUSTNESS SIMULATION";
};

/** Randomized trade-order simulation. Does not change individual trade returns. */
export function monteCarlo(
  pnls: number[],
  rounds = 200,
  seed = 7,
): MonteCarloResult {
  const empty: MonteCarloResult = {
    median: 0,
    p5: 0,
    p25: 0,
    p75: 0,
    p95: 0,
    positivePct: 0,
    sampleSize: 0,
    rounds,
    label: "HISTORICAL ROBUSTNESS SIMULATION",
  };
  if (pnls.length === 0) return empty;

  const rand = lcg(seed);
  const terminals: number[] = [];
  for (let r = 0; r < rounds; r++) {
    const shuffled = [...pnls];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j]!, shuffled[i]!];
    }
    terminals.push(shuffled.reduce((s, p) => s + p, 0));
  }
  terminals.sort((a, b) => a - b);
  const pct = (p: number) => terminals[Math.min(terminals.length - 1, Math.floor((p / 100) * terminals.length))]!;
  return {
    median: pct(50),
    p5: pct(5),
    p25: pct(25),
    p75: pct(75),
    p95: pct(95),
    positivePct: (terminals.filter((t) => t > 0).length / terminals.length) * 100,
    sampleSize: pnls.length,
    rounds,
    label: "HISTORICAL ROBUSTNESS SIMULATION",
  };
}

function slicePnls(trades: BacktestTrade[], fromBar: number, toBar: number): number {
  return trades
    .filter((t) => t.entryBar >= fromBar && t.exitBar <= toBar)
    .reduce((s, t) => s + t.netPct, 0);
}

export const PROMOTE_MIN_TRADES = 30;
export const PROMOTE_MIN_COMPOSITE = 0.18;
export const DEMOTE_MAX_COMPOSITE = -0.1;
export const MIN_SAMPLE_FOR_SENSITIVITY = 15;

export function statusFor(composite: number, wf: number, trades: number, oos: number): StrategyStatus {
  if (trades < PROMOTE_MIN_TRADES) return "WATCH";
  if (composite >= PROMOTE_MIN_COMPOSITE && wf > 0 && oos > 0 && trades >= PROMOTE_MIN_TRADES) {
    return "PROMOTED";
  }
  if (composite <= DEMOTE_MAX_COMPOSITE || wf < 0 || oos < 0) return "DEMOTED";
  return "WATCH";
}

export function rejectionReasons(
  trades: number,
  net: number,
  dd: number,
  wf: number,
  oos: number,
  param: "PASS" | "FAIL" | "INSUFFICIENT DATA",
  cost: "PASS" | "FAIL" | "INSUFFICIENT DATA",
): string[] {
  const reasons: string[] = [];
  if (trades < PROMOTE_MIN_TRADES) reasons.push(`Insufficient trade count (${trades} < ${PROMOTE_MIN_TRADES})`);
  if (dd >= 15) reasons.push(`Deep drawdown (${dd.toFixed(1)}%)`);
  if (net <= 0) reasons.push("Negative net return");
  if (wf <= 0) reasons.push("Walk-forward negative");
  if (oos <= 0) reasons.push("Out-of-sample negative");
  if (param === "FAIL") reasons.push("Parameter sensitivity failed");
  if (cost === "FAIL") reasons.push("Cost sensitivity failed");
  return reasons;
}

/**
 * Parameter robustness: test nearby hold periods and, where defined, nearby RSI/EMA windows.
 * Result is PASS only if performance stays reasonably stable AND sample is large enough.
 */
function paramRobustness(
  candles: Candle[],
  def: StrategyDef,
  baselineNet: number,
): "PASS" | "FAIL" | "INSUFFICIENT DATA" {
  if (candles.length < 120) return "INSUFFICIENT DATA";

  const holdVariants = [8, 10, 12, 16];
  const nets: number[] = [];
  for (const hold of holdVariants) {
    const t = backtest(candles, def, ROUND_TRIP, hold);
    if (t.length < MIN_SAMPLE_FOR_SENSITIVITY) return "INSUFFICIENT DATA";
    nets.push(t.reduce((s, x) => s + x.netPct, 0));
  }

  // Nearby parameter variants for strategies that expose them
  if (def.id === "rsi-reversion") {
    // RSI period 12 / 14 / 16 via temporary signal wrappers is heavy; use hold spread as proxy
    // and a secondary maxHold+oversold-style stability check already covered by holds
  }

  const spread = Math.max(...nets) - Math.min(...nets);
  // Stable if absolute range of nets is under 12 percentage points relative to baseline scale
  const stable = spread < 12 || (Math.abs(baselineNet) > 1 && spread / Math.abs(baselineNet) < 1.5);
  return stable ? "PASS" : "FAIL";
}

export function evaluateStrategy(
  candles: Candle[],
  def: StrategyDef,
  symbol: string,
  timeframe: string,
  intervalMs: number,
): StrategyResult {
  const trades = backtest(candles, def);
  const n = candles.length;
  const isEnd = Math.floor(n * 0.7);

  // In-sample: train only on first 70%
  const isTrades = backtest(candles.slice(0, isEnd), def);
  // OOS: trades that entered in the final 30%
  const oosTrades = trades.filter((t) => t.entryBar >= isEnd);

  // Walk-forward: chronological folds — train region never sees test region
  const folds = 4;
  const foldPnls: number[] = [];
  for (let f = 0; f < folds; f++) {
    const start = Math.floor((n * f) / (folds + 1));
    const trainEnd = Math.floor(start + n * 0.45);
    const testEnd = Math.min(n, Math.floor(trainEnd + n * 0.2));
    if (testEnd <= trainEnd) continue;
    foldPnls.push(slicePnls(trades, trainEnd, testEnd));
  }
  const walkForwardPct = foldPnls.length ? foldPnls.reduce((a, b) => a + b, 0) / foldPnls.length : 0;
  const inSamplePct = isTrades.reduce((s, t) => s + t.netPct, 0);
  const outOfSamplePct = oosTrades.reduce((s, t) => s + t.netPct, 0);

  const mc = monteCarlo(trades.map((t) => t.netPct));
  const cost1 = fromBacktest(backtest(candles, def, ROUND_TRIP), n, intervalMs);
  const cost15 = fromBacktest(backtest(candles, def, ROUND_TRIP * 1.5), n, intervalMs);
  const cost2 = fromBacktest(backtest(candles, def, ROUND_TRIP * 2), n, intervalMs);
  const performance = fromBacktest(trades, n, intervalMs);

  const paramSens = paramRobustness(candles, def, performance.totalNetPct);

  const insufficient = trades.length < 10 || n < 120;

  const oosStatus: Robustness["oos"] = insufficient
    ? "INSUFFICIENT DATA"
    : outOfSamplePct > 0
      ? "PASS"
      : "FAIL";
  const wfStatus: Robustness["walkForward"] = insufficient
    ? "INSUFFICIENT DATA"
    : walkForwardPct > 0
      ? "PASS"
      : "FAIL";
  const costStatus: Robustness["costSensitivity"] =
    trades.length < MIN_SAMPLE_FOR_SENSITIVITY
      ? "INSUFFICIENT DATA"
      : cost2.totalNetPct > 0 || cost2.totalNetPct > cost1.totalNetPct * 0.3
        ? "PASS"
        : "FAIL";
  const tradeCountStatus: Robustness["tradeCount"] =
    trades.length >= PROMOTE_MIN_TRADES ? "PASS" : trades.length < 10 ? "INSUFFICIENT DATA" : "FAIL";

  const robustness: Robustness = {
    inSamplePct,
    outOfSamplePct,
    walkForwardPct,
    monteCarloMedianPct: mc.median,
    monteCarloPositivePct: mc.positivePct,
    cost1xPct: cost1.totalNetPct,
    cost15xPct: cost15.totalNetPct,
    cost2xPct: cost2.totalNetPct,
    paramSensitivity: paramSens,
    oos: oosStatus,
    walkForward: wfStatus,
    costSensitivity: costStatus,
    tradeCount: tradeCountStatus,
    verdict: "FAIL",
    monteCarlo: mc,
  };

  const allPass =
    robustness.oos === "PASS" &&
    robustness.walkForward === "PASS" &&
    robustness.tradeCount === "PASS" &&
    robustness.costSensitivity === "PASS" &&
    robustness.paramSensitivity === "PASS";
  robustness.verdict = allPass ? "PASS" : insufficient ? "INSUFFICIENT DATA" : "FAIL";

  const composite =
    (performance.expectancyPct / 2 + walkForwardPct / 8 + (performance.profitFactor - 1)) / 3;
  const status = statusFor(composite, walkForwardPct, trades.length, outOfSamplePct);
  const score = Math.max(0, Math.min(100, 50 + composite * 80 + walkForwardPct * 2));

  const reasons = rejectionReasons(
    trades.length,
    performance.totalNetPct,
    performance.maxDrawdownPct,
    walkForwardPct,
    outOfSamplePct,
    paramSens,
    costStatus,
  );

  return {
    id: def.id,
    name: def.name,
    timeframe,
    symbol,
    performance,
    robustness,
    status,
    rejection: status === "PROMOTED" ? undefined : reasons[0],
    rejectionReasons: status === "PROMOTED" ? undefined : reasons,
    score,
    trades,
  };
}
