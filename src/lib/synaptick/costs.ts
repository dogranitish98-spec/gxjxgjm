/**
 * Canonical cost engine — single source of truth for fees + slippage.
 * All backtests, paper trading, plans, and reports must use these helpers.
 */

export const FEE_RATE = 0.001; // 0.10% per side (notional)
export const SLIP_RATE = 0.0003; // 0.03% per side (notional)

/** Round-trip cost as a percentage of notional (for edge estimates). */
export const ROUND_TRIP_COST_PCT = (FEE_RATE + SLIP_RATE) * 2 * 100; // 0.26

export type CostBreakdown = {
  entryNotional: number;
  exitNotional: number;
  entryFee: number;
  exitFee: number;
  totalFees: number;
  entrySlip: number;
  exitSlip: number;
  totalSlip: number;
  totalCost: number;
};

/** Compute fees + slippage from actual notionals. */
export function computeCosts(args: {
  entryPrice: number;
  exitPrice: number;
  quantity: number;
  side: "BUY" | "SELL";
}): CostBreakdown {
  const qty = Math.max(0, args.quantity);
  const entryNotional = qty * Math.max(0, args.entryPrice);
  const exitNotional = qty * Math.max(0, args.exitPrice);
  const entryFee = entryNotional * FEE_RATE;
  const exitFee = exitNotional * FEE_RATE;
  const entrySlip = entryNotional * SLIP_RATE;
  const exitSlip = exitNotional * SLIP_RATE;
  return {
    entryNotional,
    exitNotional,
    entryFee,
    exitFee,
    totalFees: entryFee + exitFee,
    entrySlip,
    exitSlip,
    totalSlip: entrySlip + exitSlip,
    totalCost: entryFee + exitFee + entrySlip + exitSlip,
  };
}

/** Apply entry slippage to fill price. */
export function applyEntrySlip(price: number, side: "BUY" | "SELL"): number {
  if (!(price > 0) || !Number.isFinite(price)) return price;
  return side === "BUY" ? price * (1 + SLIP_RATE) : price * (1 - SLIP_RATE);
}

/** Apply exit slippage to fill price. */
export function applyExitSlip(price: number, side: "BUY" | "SELL"): number {
  if (!(price > 0) || !Number.isFinite(price)) return price;
  return side === "BUY" ? price * (1 - SLIP_RATE) : price * (1 + SLIP_RATE);
}

/**
 * Net P&L from a completed trade using notional-based costs.
 * Gross is directional price move × quantity; costs are subtracted.
 */
export function netPnl(args: {
  side: "BUY" | "SELL";
  entry: number;
  exit: number;
  quantity: number;
  priorFees?: number; // fees already paid on entry (paper open)
}): { gross: number; costs: CostBreakdown; net: number } {
  const dir = args.side === "BUY" ? 1 : -1;
  const gross = dir * (args.exit - args.entry) * args.quantity;
  const costs = computeCosts({
    entryPrice: args.entry,
    exitPrice: args.exit,
    quantity: args.quantity,
    side: args.side,
  });
  // If priorFees already charged at open, only charge exit fee+slip now
  const alreadyPaid = args.priorFees ?? 0;
  // When priorFees is provided, subtract only remaining; prior was already deducted from cash
  const adjustedNet =
    alreadyPaid > 0
      ? gross - (costs.exitFee + costs.exitSlip) - alreadyPaid
      : gross - costs.totalCost;
  return { gross, costs, net: adjustedNet };
}

/**
 * Estimate round-trip cost as % of entry notional (for expected-edge calculations).
 * Prefer this over hard-coded constants when notional is known.
 */
export function estimatedRoundTripPct(): number {
  return ROUND_TRIP_COST_PCT;
}
