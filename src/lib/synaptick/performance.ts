import type { BacktestTrade, ClosedTrade, PerformanceReport } from "./types";
import { ROUND_TRIP_COST_PCT } from "./costs";

const PROFIT_FACTOR_CAP = 99;
const DAY_MS = 86_400_000;

export function fromBacktest(trades: BacktestTrade[], bars: number, intervalMs: number): PerformanceReport {
  const pnls = trades.map((t) => t.netPct);
  return summarize(
    pnls,
    trades.filter((t) => t.netPct > 0).length,
    bars * intervalMs,
  );
}

export function fromClosed(trades: ClosedTrade[], starting: number): PerformanceReport {
  const pnls = trades.map((t) => t.pnlPct);
  const span =
    trades.length === 0
      ? 0
      : Math.max(...trades.map((t) => t.closedAtMs)) - Math.min(...trades.map((t) => t.openedAtMs));
  const report = summarize(pnls, trades.filter((t) => t.netPnl > 0).length, span);
  let equity = starting;
  let peak = starting;
  let maxDd = 0;
  for (const t of [...trades].sort((a, b) => a.closedAtMs - b.closedAtMs)) {
    equity += t.netPnl;
    if (equity > peak) peak = equity;
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - equity) / peak) * 100);
  }
  return { ...report, maxDrawdownPct: maxDd };
}

function summarize(pnls: number[], wins: number, spanMs: number): PerformanceReport {
  const n = pnls.length;
  if (n === 0) {
    return {
      trades: 0,
      wins: 0,
      winRatePct: 0,
      totalNetPct: 0,
      expectancyPct: 0,
      profitFactor: 0,
      maxDrawdownPct: 0,
      sharpe: null,
      sortino: null,
      cagrPct: null,
      feesPct: 0,
      spanDays: 0,
    };
  }
  const total = pnls.reduce((a, b) => a + b, 0);
  const grossWin = pnls.filter((p) => p > 0).reduce((a, b) => a + b, 0);
  const grossLoss = pnls.filter((p) => p < 0).reduce((a, b) => a + -b, 0);
  const pf = grossLoss <= 0 ? (grossWin > 0 ? PROFIT_FACTOR_CAP : 0) : Math.min(PROFIT_FACTOR_CAP, grossWin / grossLoss);
  let eq = 100;
  let peak = 100;
  let maxDd = 0;
  for (const p of pnls) {
    eq *= 1 + p / 100;
    if (eq > peak) peak = eq;
    if (peak > 0) maxDd = Math.max(maxDd, ((peak - eq) / peak) * 100);
  }
  const mean = total / n;
  const variance = pnls.reduce((s, p) => s + (p - mean) ** 2, 0) / Math.max(1, n - 1);
  const sd = Math.sqrt(variance);
  const downside = pnls.filter((p) => p < 0);
  const downVar = downside.length ? downside.reduce((s, p) => s + p * p, 0) / downside.length : 0;
  const spanDays = spanMs / DAY_MS;
  const sharpe = sd > 1e-9 ? (mean / sd) * Math.sqrt(365) : null;
  const sortino = downVar > 1e-9 ? (mean / Math.sqrt(downVar)) * Math.sqrt(365) : null;
  const years = spanDays / 365;
  const cagr = years > 0 && eq > 0 ? (Math.pow(eq / 100, 1 / years) - 1) * 100 : null;
  // Fees are already subtracted inside each trade's netPct (via ROUND_TRIP cost).
  // Report estimated fee drag as n × one-way cost for transparency, not double-counted.
  // One-way cost % = half of round-trip constant from costs.ts (0.13)
  const estimatedFeeDragPct = n * (ROUND_TRIP_COST_PCT / 2);
  return {
    trades: n,
    wins,
    winRatePct: (wins / n) * 100,
    totalNetPct: total,
    expectancyPct: mean,
    profitFactor: pf,
    maxDrawdownPct: maxDd,
    sharpe,
    sortino,
    cagrPct: cagr,
    feesPct: estimatedFeeDragPct,
    spanDays,
  };
}

export type GoLiveStatus = "PASS" | "PROVISIONAL" | "NOT CLEARED";

export function goLive(report: PerformanceReport): { status: GoLiveStatus; summary: string } {
  if (report.trades === 0) return { status: "NOT CLEARED", summary: "no closed trades yet" };
  if (report.trades < 5) return { status: "NOT CLEARED", summary: `only ${report.trades} closed trades` };
  const fails: string[] = [];
  if (report.expectancyPct <= 0) fails.push("expectancy not positive");
  if (report.profitFactor < 1.1) fails.push("profit factor below 1.1");
  if (report.maxDrawdownPct > 25) fails.push("drawdown above 25%");
  if (report.sharpe != null && report.sharpe < 0.5) fails.push("Sharpe below 0.5");
  if (fails.length) return { status: "NOT CLEARED", summary: fails.join(" • ") };
  if (report.trades < 30 || report.spanDays < 30 || report.sharpe == null) {
    return { status: "PROVISIONAL", summary: "numbers pass but sample is still thin" };
  }
  return { status: "PASS", summary: "paper evidence clears the bar — still paper only" };
}
