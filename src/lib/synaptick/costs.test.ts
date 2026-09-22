import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  applyEntrySlip,
  applyExitSlip,
  computeCosts,
  netPnl,
  ROUND_TRIP_COST_PCT,
  FEE_RATE,
  SLIP_RATE,
} from "./costs.ts";
import { planTrade, openPosition, closePosition, emptyBook } from "./paper.ts";

describe("costs", () => {
  it("computes notional-based fees and slippage", () => {
    const c = computeCosts({ entryPrice: 100, exitPrice: 110, quantity: 2, side: "BUY" });
    assert.equal(c.entryNotional, 200);
    assert.equal(c.exitNotional, 220);
    assert.ok(Math.abs(c.entryFee - 200 * FEE_RATE) < 1e-9);
    assert.ok(Math.abs(c.totalCost - (200 + 220) * (FEE_RATE + SLIP_RATE)) < 1e-9);
  });

  it("round-trip pct matches 0.26", () => {
    assert.ok(Math.abs(ROUND_TRIP_COST_PCT - 0.26) < 1e-9);
  });

  it("entry/exit slip directions are correct", () => {
    assert.ok(applyEntrySlip(100, "BUY") > 100);
    assert.ok(applyEntrySlip(100, "SELL") < 100);
    assert.ok(applyExitSlip(100, "BUY") < 100);
    assert.ok(applyExitSlip(100, "SELL") > 100);
  });

  it("netPnl subtracts costs", () => {
    const { gross, net } = netPnl({ side: "BUY", entry: 100, exit: 110, quantity: 1 });
    assert.equal(gross, 10);
    assert.ok(net < gross);
  });
});

describe("planTrade / R:R / sizing", () => {
  it("rejects invalid LONG geometry", () => {
    const p = planTrade({
      equity: 10_000,
      price: 100,
      stop: 105,
      target: 110,
      side: "BUY",
      riskPct: 1,
    });
    assert.equal(p.valid, false);
    assert.ok(p.invalidReason?.includes("LONG"));
  });

  it("rejects invalid SHORT geometry", () => {
    const p = planTrade({
      equity: 10_000,
      price: 100,
      stop: 95,
      target: 110,
      side: "SELL",
      riskPct: 1,
    });
    assert.equal(p.valid, false);
  });

  it("sizes from risk %", () => {
    const p = planTrade({
      equity: 10_000,
      price: 100,
      stop: 95,
      target: 110,
      side: "BUY",
      riskPct: 2,
    });
    assert.equal(p.valid, true);
    assert.ok(Math.abs(p.quantity - 40) < 1e-9);
    assert.ok(p.netRR > 1);
  });

  it("rejects zero risk", () => {
    const p = planTrade({
      equity: 10_000,
      price: 100,
      stop: 100,
      target: 110,
      side: "BUY",
      riskPct: 1,
    });
    assert.equal(p.valid, false);
  });
});

describe("paper trading", () => {
  it("opens and closes a long with positive PnL", () => {
    let book = emptyBook();
    const open = openPosition(book, {
      symbol: "ETHUSDT",
      side: "BUY",
      price: 100,
      stop: 95,
      target: 110,
      quantity: 10,
      nowMs: 1_000,
    });
    assert.equal(open.ok, true);
    book = open.book;
    assert.ok(book.positions.length === 1);
    assert.ok(book.cash < 10_000);

    const close = closePosition(book, book.positions[0]!.id, 110, 2_000, "TARGET");
    assert.equal(close.ok, true);
    book = close.book;
    assert.equal(book.positions.length, 0);
    assert.equal(book.trades.length, 1);
    assert.ok(book.trades[0]!.netPnl > 0);
  });

  it("blocks duplicate open on same symbol+side", () => {
    let book = emptyBook();
    const a = openPosition(book, {
      symbol: "ETHUSDT",
      side: "BUY",
      price: 100,
      stop: 95,
      target: 110,
      quantity: 1,
      nowMs: 1,
    });
    book = a.book;
    const b = openPosition(book, {
      symbol: "ETHUSDT",
      side: "BUY",
      price: 100,
      stop: 95,
      target: 110,
      quantity: 1,
      nowMs: 2,
    });
    assert.equal(b.ok, false);
  });

  it("blocks insufficient cash", () => {
    const book = emptyBook();
    book.cash = 1;
    const r = openPosition(book, {
      symbol: "ETHUSDT",
      side: "BUY",
      price: 100,
      stop: 95,
      target: 110,
      quantity: 10,
      nowMs: 1,
    });
    assert.equal(r.ok, false);
  });
});
