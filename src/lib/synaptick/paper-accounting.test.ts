import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyBook, openPosition, closePosition, STARTING_CASH } from "./paper.ts";

function roundTrip(
  side: "BUY" | "SELL",
  entryPrice: number,
  exitPrice: number,
  qty = 10,
) {
  let book = emptyBook();
  const stop = side === "BUY" ? entryPrice - 5 : entryPrice + 5;
  const target = side === "BUY" ? entryPrice + 10 : entryPrice - 10;
  const o = openPosition(book, {
    symbol: "ETHUSDT",
    side,
    price: entryPrice,
    stop,
    target,
    quantity: qty,
    nowMs: 1,
  });
  assert.equal(o.ok, true, o.event);
  book = o.book;
  const c = closePosition(book, book.positions[0]!.id, exitPrice, 2, "TEST");
  assert.equal(c.ok, true, c.event);
  book = c.book;
  return { book, trade: c.trade! };
}

describe("paper accounting", () => {
  it("cash delta equals netPnl for BUY win", () => {
    const { book, trade } = roundTrip("BUY", 100, 110);
    assert.ok(Math.abs(book.cash - book.startingCash - trade.netPnl) < 1e-9);
  });

  it("cash delta equals netPnl for BUY loss", () => {
    const { book, trade } = roundTrip("BUY", 100, 90);
    assert.ok(Math.abs(book.cash - book.startingCash - trade.netPnl) < 1e-9);
  });

  it("cash delta equals netPnl for SELL win", () => {
    const { book, trade } = roundTrip("SELL", 100, 90);
    assert.ok(Math.abs(book.cash - book.startingCash - trade.netPnl) < 1e-9);
  });

  it("cash delta equals netPnl for SELL loss", () => {
    const { book, trade } = roundTrip("SELL", 100, 110);
    assert.ok(Math.abs(book.cash - book.startingCash - trade.netPnl) < 1e-9);
  });

  it("flat BUY 100→100: netPnl ≈ -2.60", () => {
    const { trade } = roundTrip("BUY", 100, 100);
    assert.ok(Math.abs(trade.netPnl - -2.6) < 0.01, `got ${trade.netPnl}`);
  });

  it("SELL 100→90: netPnl ≈ +97.53", () => {
    const { trade } = roundTrip("SELL", 100, 90);
    assert.ok(Math.abs(trade.netPnl - 97.53) < 0.01, `got ${trade.netPnl}`);
  });

  it("SELL 100→110: netPnl ≈ -102.73", () => {
    const { trade } = roundTrip("SELL", 100, 110);
    assert.ok(Math.abs(trade.netPnl - -102.73) < 0.01, `got ${trade.netPnl}`);
  });

  it("starting cash constant", () => {
    assert.equal(STARTING_CASH, 10_000);
  });
});
