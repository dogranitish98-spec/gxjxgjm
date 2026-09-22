import type { ClosedTrade, OpenPosition, PaperBook, Side } from "./types";

export type RiskLimits = {
  dailyLossLimitPct: number;
  maxDrawdownHaltPct: number;
  maxTradesPerDay: number;
  maxPriceDeviationPct: number;
  allowShorts: boolean;
  maxPortfolioRiskPct: number;
  maxSymbolRiskPct: number;
};

export const DEFAULT_LIMITS: RiskLimits = {
  dailyLossLimitPct: 3,
  maxDrawdownHaltPct: 15,
  maxTradesPerDay: 6,
  maxPriceDeviationPct: 8,
  allowShorts: false,
  maxPortfolioRiskPct: 6,
  maxSymbolRiskPct: 2,
};

export type RiskBreach = {
  rule: string;
  message: string;
  limitValue?: number;
  attemptedValue?: number;
};

export type RiskVerdict = {
  allowed: boolean;
  reasons: string[];
  tripKillSwitch: boolean;
  breaches: RiskBreach[];
};

export type ProtectionVerdict = {
  locked: boolean;
  reason: string;
  untilMs: number;
  rule: string;
};

const MIN_MS = 60_000;

function utcDayStart(ms: number): number {
  const d = new Date(ms);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

export function markToMarket(book: PaperBook, prices: Record<string, number>): number {
  let equity = book.cash;
  for (const p of book.positions) {
    const px = prices[p.symbol] ?? p.entry;
    const dir = p.side === "BUY" ? 1 : -1;
    equity += p.allocated + dir * (px - p.entry) * p.quantity;
  }
  return equity;
}

export function positionRiskPct(p: OpenPosition, equity: number): number {
  if (!(equity > 0)) return 0;
  const risk = Math.abs(p.entry - p.stop) * p.quantity;
  return (risk / equity) * 100;
}

export function portfolioRisk(book: PaperBook, equity: number) {
  const bySymbol: Record<string, number> = {};
  let total = 0;
  for (const p of book.positions) {
    const r = positionRiskPct(p, equity);
    bySymbol[p.symbol] = (bySymbol[p.symbol] ?? 0) + r;
    total += r;
  }
  return { total, bySymbol };
}

export function evaluateProtections(
  trades: ClosedTrade[],
  nowMs: number,
  equity: number,
): ProtectionVerdict {
  const clear: ProtectionVerdict = { locked: false, reason: "", untilMs: 0, rule: "" };
  try {
    const candidates = [
      postTrade(trades, nowMs),
      lossStreak(trades, nowMs),
      windowedDrawdown(trades, nowMs, equity),
    ].filter((v): v is ProtectionVerdict => v != null && v.locked);
    if (candidates.length === 0) return clear;
    return candidates.sort((a, b) => b.untilMs - a.untilMs)[0]!;
  } catch {
    return {
      locked: true,
      reason: "protection error; blocked to be safe",
      untilMs: nowMs + 30 * MIN_MS,
      rule: "gate_error",
    };
  }
}

function postTrade(trades: ClosedTrade[], nowMs: number): ProtectionVerdict | null {
  const cooldown = 5 * MIN_MS;
  const last = trades.reduce<ClosedTrade | null>((a, t) => {
    if (t.closedAtMs > nowMs) return a;
    if (!a || t.closedAtMs > a.closedAtMs) return t;
    return a;
  }, null);
  if (!last) return null;
  const until = last.closedAtMs + cooldown;
  if (nowMs >= until) return null;
  return {
    locked: true,
    reason: `post-trade cooldown until ${new Date(until).toISOString().slice(11, 16)} UTC`,
    untilMs: until,
    rule: "cooldown",
  };
}

function lossStreak(trades: ClosedTrade[], nowMs: number): ProtectionVerdict | null {
  const lookback = 60 * MIN_MS;
  const cooldown = 30 * MIN_MS;
  const window = trades.filter((t) => t.closedAtMs <= nowMs && t.closedAtMs >= nowMs - lookback && t.netPnl < 0);
  if (window.length < 4) return null;
  const latest = Math.max(...window.map((t) => t.closedAtMs));
  const until = latest + cooldown;
  if (nowMs >= until) return null;
  return {
    locked: true,
    reason: `loss streak (${window.length} losses in 60m)`,
    untilMs: until,
    rule: "loss_streak",
  };
}

function windowedDrawdown(
  trades: ClosedTrade[],
  nowMs: number,
  equity: number,
): ProtectionVerdict | null {
  const lookback = 240 * MIN_MS;
  const cooldown = 60 * MIN_MS;
  const window = trades
    .filter((t) => t.closedAtMs <= nowMs && t.closedAtMs >= nowMs - lookback)
    .sort((a, b) => a.closedAtMs - b.closedAtMs);
  if (window.length === 0) return null;
  let eq = equity - window.reduce((s, t) => s + t.netPnl, 0);
  let peak = eq;
  let troughAt = 0;
  let maxDd = 0;
  for (const t of window) {
    eq += t.netPnl;
    if (eq > peak) peak = eq;
    const dd = peak > 0 ? ((peak - eq) / peak) * 100 : 0;
    if (dd > maxDd) {
      maxDd = dd;
      troughAt = t.closedAtMs;
    }
  }
  if (maxDd < 5) return null;
  const until = troughAt + cooldown;
  if (nowMs >= until) return null;
  return {
    locked: true,
    reason: `windowed drawdown ${maxDd.toFixed(1)}% in 4h`,
    untilMs: until,
    rule: "window_dd",
  };
}

export function evaluateRisk(args: {
  decision: "BUY" | "SELL" | "WAIT";
  book: PaperBook;
  price: number;
  referencePrice: number;
  equity: number;
  nowMs: number;
  symbol: string;
  proposedRiskPct: number;
  protection: ProtectionVerdict;
  limits?: RiskLimits;
}): RiskVerdict {
  const limits = args.limits ?? DEFAULT_LIMITS;
  const directional = args.decision === "BUY" || args.decision === "SELL";
  if (!directional) return { allowed: true, reasons: [], tripKillSwitch: false, breaches: [] };

  const reasons: string[] = [];
  const breaches: RiskBreach[] = [];
  let trip = false;
  const push = (rule: string, message: string, limitValue?: number, attemptedValue?: number) => {
    reasons.push(message);
    breaches.push({ rule, message, limitValue, attemptedValue });
  };

  try {
    if (!(args.price > 0) || !(args.equity > 0) || !Number.isFinite(args.price)) {
      push("bad_input", "price or equity is not a usable number");
      return { allowed: false, reasons, tripKillSwitch: false, breaches };
    }
    if (args.book.killSwitch) {
      push("kill_switch", args.book.killReason || "kill switch is latched");
    }
    if (args.protection.locked) {
      push("protection_lock", args.protection.reason);
    }
    if (args.decision === "SELL" && !limits.allowShorts && !args.book.positions.some((p) => p.symbol === args.symbol && p.side === "BUY")) {
      push("shorts", "spot cannot short — SELL is only allowed to close a long");
    }
    const dayStart = utcDayStart(args.nowMs);
    const realizedToday = args.book.trades
      .filter((t) => t.closedAtMs >= dayStart && t.closedAtMs <= args.nowMs)
      .reduce((s, t) => s + t.netPnl, 0);
    const dayLossPct = args.equity > 0 ? (realizedToday / args.equity) * 100 : 0;
    if (limits.dailyLossLimitPct > 0 && dayLossPct <= -limits.dailyLossLimitPct) {
      push(
        "daily_loss",
        `daily loss ${dayLossPct.toFixed(1)}% reached the −${limits.dailyLossLimitPct.toFixed(1)}% limit`,
        limits.dailyLossLimitPct,
        dayLossPct,
      );
    }
    const ddPct = args.book.peakEquity > 0 ? ((args.book.peakEquity - args.equity) / args.book.peakEquity) * 100 : 0;
    if (limits.maxDrawdownHaltPct > 0 && ddPct >= limits.maxDrawdownHaltPct) {
      trip = true;
      push(
        "drawdown_halt",
        `equity ${ddPct.toFixed(1)}% below peak — kill switch trips`,
        limits.maxDrawdownHaltPct,
        ddPct,
      );
    }
    const openedToday = args.book.trades.filter((t) => t.openedAtMs >= dayStart).length + args.book.positions.length;
    if (limits.maxTradesPerDay > 0 && openedToday >= limits.maxTradesPerDay) {
      push("trades_per_day", `${openedToday} trades today, cap is ${limits.maxTradesPerDay}`, limits.maxTradesPerDay, openedToday);
    }
    if (args.referencePrice > 0) {
      const dev = (Math.abs(args.price - args.referencePrice) / args.referencePrice) * 100;
      if (dev > limits.maxPriceDeviationPct) {
        push("price_collar", `price is ${dev.toFixed(1)}% from the prior close`, limits.maxPriceDeviationPct, dev);
      }
    }
    const current = portfolioRisk(args.book, args.equity);
    const afterTotal = current.total + args.proposedRiskPct;
    const afterSymbol = (current.bySymbol[args.symbol] ?? 0) + args.proposedRiskPct;
    if (afterTotal > limits.maxPortfolioRiskPct) {
      push(
        "portfolio_risk",
        `portfolio risk would be ${afterTotal.toFixed(1)}% (max ${limits.maxPortfolioRiskPct.toFixed(1)}%)`,
        limits.maxPortfolioRiskPct,
        afterTotal,
      );
    }
    if (afterSymbol > limits.maxSymbolRiskPct) {
      push(
        "symbol_risk",
        `${args.symbol} risk would be ${afterSymbol.toFixed(1)}% (max ${limits.maxSymbolRiskPct.toFixed(1)}%)`,
        limits.maxSymbolRiskPct,
        afterSymbol,
      );
    }
  } catch (e) {
    push("gate_error", `risk gate error (${e instanceof Error ? e.name : "unknown"}); blocked to be safe`);
  }

  return { allowed: reasons.length === 0, reasons, tripKillSwitch: trip, breaches };
}

export function sideFrom(decision: "BUY" | "SELL"): Side {
  return decision;
}
