import {
  applyEntrySlip,
  applyExitSlip,
  computeCosts,
  netPnl,
  FEE_RATE,
  SLIP_RATE,
} from "./costs";
import type { ClosedTrade, OpenPosition, PaperBook, Side } from "./types";

export const STARTING_CASH = 10_000;
// Re-export for any residual imports
export { FEE_RATE, SLIP_RATE };

export function emptyBook(): PaperBook {
  return {
    cash: STARTING_CASH,
    startingCash: STARTING_CASH,
    peakEquity: STARTING_CASH,
    positions: [],
    trades: [],
    killSwitch: false,
    killReason: "",
  };
}

export type TradePlan = {
  quantity: number;
  allocated: number;
  fee: number;
  slip: number;
  expectedLoss: number;
  expectedGain: number;
  netRR: number;
  riskPerUnit: number;
  rewardPerUnit: number;
  valid: boolean;
  invalidReason?: string;
};

/**
 * Position sizing from account risk %.
 * Validates stop/target geometry and rejects zero-risk / NaN / negative qty.
 */
export function planTrade(args: {
  equity: number;
  price: number;
  stop: number;
  target: number;
  side: Side;
  riskPct: number;
  minQty?: number;
  maxQty?: number;
}): TradePlan {
  const invalid = (reason: string): TradePlan => ({
    quantity: 0,
    allocated: 0,
    fee: 0,
    slip: 0,
    expectedLoss: 0,
    expectedGain: 0,
    netRR: 0,
    riskPerUnit: 0,
    rewardPerUnit: 0,
    valid: false,
    invalidReason: reason,
  });

  if (!(args.equity > 0) || !Number.isFinite(args.equity)) {
    return invalid("equity is not a usable positive number");
  }
  if (!(args.price > 0) || !Number.isFinite(args.price)) {
    return invalid("entry price is not a usable positive number");
  }
  if (!Number.isFinite(args.stop) || !Number.isFinite(args.target)) {
    return invalid("stop or target is not a finite number");
  }
  if (!(args.riskPct > 0) || !Number.isFinite(args.riskPct)) {
    return invalid("risk % must be positive");
  }

  // Geometry validation
  if (args.side === "BUY") {
    if (!(args.stop < args.price && args.price < args.target)) {
      return invalid(`LONG requires stop < entry < target (got stop=${args.stop}, entry=${args.price}, target=${args.target})`);
    }
  } else {
    if (!(args.target < args.price && args.price < args.stop)) {
      return invalid(`SHORT requires target < entry < stop (got target=${args.target}, entry=${args.price}, stop=${args.stop})`);
    }
  }

  const riskPerUnit = Math.abs(args.price - args.stop);
  const rewardPerUnit = Math.abs(args.target - args.price);

  if (!(riskPerUnit > 0) || !Number.isFinite(riskPerUnit)) {
    return invalid("risk per unit is zero or non-finite");
  }

  const riskBudget = args.equity * (args.riskPct / 100);
  let quantity = riskBudget / riskPerUnit;

  if (!Number.isFinite(quantity) || quantity <= 0) {
    return invalid("computed quantity is zero, negative, or non-finite");
  }

  const minQty = args.minQty ?? 0;
  const maxQty = args.maxQty ?? Number.POSITIVE_INFINITY;
  quantity = Math.max(minQty, Math.min(maxQty, quantity));

  const allocated = quantity * args.price;
  const entryCosts = computeCosts({
    entryPrice: args.price,
    exitPrice: args.price, // provisional
    quantity,
    side: args.side,
  });
  const fee = entryCosts.entryFee;
  const slip = entryCosts.entrySlip;

  // Expected loss includes entry costs + residual risk to stop
  const expectedLoss = riskPerUnit * quantity + fee + slip;
  // Expected gain at target after round-trip costs estimate
  const exitFeeEst = quantity * args.target * FEE_RATE;
  const exitSlipEst = quantity * args.target * SLIP_RATE;
  const expectedGain = rewardPerUnit * quantity - fee - slip - exitFeeEst - exitSlipEst;
  const netRR = expectedLoss > 0 ? expectedGain / expectedLoss : 0;

  return {
    quantity,
    allocated,
    fee,
    slip,
    expectedLoss,
    expectedGain,
    netRR: Number.isFinite(netRR) ? netRR : 0,
    riskPerUnit,
    rewardPerUnit,
    valid: true,
  };
}

export function openPosition(
  book: PaperBook,
  args: {
    symbol: string;
    side: Side;
    price: number;
    stop: number;
    target: number;
    quantity: number;
    nowMs: number;
    /** Link to research run when opened from an analysis. */
    analysisId?: string;
  },
): { book: PaperBook; event: string; ok: boolean } {
  if (!(args.quantity > 0) || !Number.isFinite(args.quantity)) {
    return { book, event: "PAPER WAIT • invalid quantity", ok: false };
  }
  if (!(args.price > 0) || !Number.isFinite(args.price)) {
    return { book, event: "PAPER WAIT • invalid price", ok: false };
  }
  // Geometry
  if (args.side === "BUY" && !(args.stop < args.price && args.price < args.target)) {
    return { book, event: "PAPER WAIT • invalid LONG stop/target geometry", ok: false };
  }
  if (args.side === "SELL" && !(args.target < args.price && args.price < args.stop)) {
    return { book, event: "PAPER WAIT • invalid SHORT stop/target geometry", ok: false };
  }

  // Prevent duplicate open on same symbol+side (simple guard)
  if (book.positions.some((p) => p.symbol === args.symbol && p.side === args.side)) {
    return { book, event: `PAPER WAIT • already have open ${args.side} ${args.symbol}`, ok: false };
  }

  const fill = applyEntrySlip(args.price, args.side);
  const allocated = args.quantity * args.price; // intentional: size on quoted price (pnlPct only)
  const costs = computeCosts({
    entryPrice: fill,
    exitPrice: fill,
    quantity: args.quantity,
    side: args.side,
  });
  // Cash uses fill notional + entry fee only; slip is already in `fill` — do not double-count.
  const cost = args.quantity * fill + costs.entryFee;

  if (cost > book.cash + 1e-9) {
    return { book, event: "PAPER WAIT • not enough cash", ok: false };
  }
  if (book.killSwitch) {
    return { book, event: `PAPER WAIT • kill switch: ${book.killReason || "latched"}`, ok: false };
  }

  const pos: OpenPosition = {
    id: `p-${args.nowMs}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: args.symbol,
    side: args.side,
    entry: fill,
    stop: args.stop,
    target: args.target,
    quantity: args.quantity,
    allocated,
    openedAtMs: args.nowMs,
    fees: costs.entryFee,
    analysisId: args.analysisId,
  };

  const next: PaperBook = {
    ...book,
    cash: book.cash - cost,
    positions: [...book.positions, pos],
  };
  return {
    book: next,
    event: `PAPER ${args.side} ${args.symbol} • ${args.quantity.toFixed(4)} @ ${pos.entry.toFixed(4)}`,
    ok: true,
  };
}

export function closePosition(
  book: PaperBook,
  id: string,
  price: number,
  nowMs: number,
  reason: string,
): { book: PaperBook; event: string; ok: boolean; trade?: ClosedTrade } {
  const pos = book.positions.find((p) => p.id === id);
  if (!pos) return { book, event: "PAPER • position gone", ok: false };
  if (!(price > 0) || !Number.isFinite(price)) {
    return { book, event: "PAPER • invalid exit price", ok: false };
  }

  const exit = applyExitSlip(price, pos.side);
  const { gross, costs } = netPnl({
    side: pos.side,
    entry: pos.entry,
    exit,
    quantity: pos.quantity,
    priorFees: pos.fees,
  });
  // Exit fee from canonical costs; slip already in fill price (do not subtract exitSlip again)
  const exitFee = costs.exitFee;
  // prior entry fees were already deducted from cash at open
  const net = gross - exitFee - pos.fees;

  const trade: ClosedTrade = {
    id: `t-${nowMs}-${Math.random().toString(36).slice(2, 7)}`,
    symbol: pos.symbol,
    strategyId: "cognitive",
    side: pos.side,
    openedAtMs: pos.openedAtMs,
    closedAtMs: nowMs,
    entry: pos.entry,
    exit,
    quantity: pos.quantity,
    netPnl: net,
    pnlPct: pos.allocated > 0 ? (net / pos.allocated) * 100 : 0,
    fees: pos.fees + exitFee,
    reason,
    analysisId: pos.analysisId,
  };

  // Return reserved entry notional + gross P&L − exit fee (works for BUY and SELL).
  const cash = book.cash + pos.quantity * pos.entry + gross - exitFee;
  const positions = book.positions.filter((p) => p.id !== id);
  // peak equity tracked on realized cash + remaining marked positions externally
  const peakEquity = Math.max(book.peakEquity, cash);

  // No retention cap — full history kept in-memory; permanent journal is also written to DB.
  return {
    book: {
      ...book,
      cash,
      peakEquity,
      positions,
      trades: [...book.trades, trade],
    },
    event: `PAPER CLOSE ${pos.symbol} • ${reason} • PnL ${net >= 0 ? "+" : ""}${net.toFixed(2)}`,
    ok: true,
    trade,
  };
}

/** Persist closed trade to SQL journal (does not alter trade calculations). */
export async function persistClosedTrade(trade: ClosedTrade): Promise<void> {
  try {
    const { savePaperTradeDb } = await import("@/lib/server/research-history");
    await savePaperTradeDb({
      data: {
        tradeId: trade.id,
        analysisId: trade.analysisId ?? null,
        symbol: trade.symbol,
        side: trade.side,
        strategyId: trade.strategyId,
        entry: trade.entry,
        exit: trade.exit,
        quantity: trade.quantity,
        netPnl: trade.netPnl,
        pnlPct: trade.pnlPct,
        fees: trade.fees,
        reason: trade.reason,
        openedAtMs: trade.openedAtMs,
        closedAtMs: trade.closedAtMs,
      },
    });
  } catch (e) {
    console.error("[paper] permanent trade journal write failed:", e);
  }
}

export function applyStops(book: PaperBook, prices: Record<string, number>, nowMs: number): PaperBook {
  let next = book;
  for (const p of [...book.positions]) {
    const px = prices[p.symbol];
    if (!(px != null && px > 0)) continue;
    if (p.side === "BUY" && px <= p.stop) {
      next = closePosition(next, p.id, p.stop, nowMs, "STOP").book;
    } else if (p.side === "BUY" && px >= p.target) {
      next = closePosition(next, p.id, p.target, nowMs, "TARGET").book;
    } else if (p.side === "SELL" && px >= p.stop) {
      next = closePosition(next, p.id, p.stop, nowMs, "STOP").book;
    } else if (p.side === "SELL" && px <= p.target) {
      next = closePosition(next, p.id, p.target, nowMs, "TARGET").book;
    }
  }
  return next;
}
