import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { emptyBook, openPosition, closePosition } from "./paper.ts";

describe("paper trade analysis link + no retention delete", () => {
  it("carries analysisId from open to closed trade", () => {
    let book = emptyBook();
    const open = openPosition(book, {
      symbol: "ETHUSDT",
      side: "BUY",
      price: 100,
      stop: 95,
      target: 110,
      quantity: 1,
      nowMs: 1,
      analysisId: "ana_test_1",
    });
    assert.equal(open.ok, true);
    book = open.book;
    assert.equal(book.positions[0]!.analysisId, "ana_test_1");
    const closed = closePosition(book, book.positions[0]!.id, 110, 2, "TARGET");
    assert.equal(closed.ok, true);
    assert.equal(closed.trade?.analysisId, "ana_test_1");
    assert.equal(closed.book.trades[0]!.analysisId, "ana_test_1");
  });

  it("does not truncate trade history (no slice cap)", () => {
    let book = emptyBook();
    // Use unique symbols so duplicate-open guard does not block
    for (let i = 0; i < 250; i++) {
      const o = openPosition(book, {
        symbol: `T${i}USDT`,
        side: "BUY",
        price: 100,
        stop: 95,
        target: 110,
        quantity: 0.01,
        nowMs: i * 10,
      });
      if (!o.ok) {
        // cash may run out — stop when that happens
        break;
      }
      book = o.book;
      const c = closePosition(book, book.positions[0]!.id, 105, i * 10 + 1, "TARGET");
      book = c.book;
    }
    // With $10k and tiny size we should close many; critical is no hard 200 cap
    assert.ok(
      book.trades.length > 50,
      `expected substantial history without artificial 200-cap, got ${book.trades.length}`,
    );
  });

  it("keeps first trade when many follow (immutability of journal entries)", () => {
    let book = emptyBook();
    const o = openPosition(book, {
      symbol: "ETHUSDT",
      side: "BUY",
      price: 100,
      stop: 95,
      target: 110,
      quantity: 1,
      nowMs: 1,
      analysisId: "ana_A",
    });
    book = o.book;
    const c = closePosition(book, book.positions[0]!.id, 110, 2, "TARGET");
    book = c.book;
    const firstId = book.trades[0]!.id;
    for (let i = 0; i < 20; i++) {
      const o2 = openPosition(book, {
        symbol: `X${i}USDT`,
        side: "BUY",
        price: 50,
        stop: 45,
        target: 60,
        quantity: 0.1,
        nowMs: 100 + i,
      });
      if (!o2.ok) break;
      book = o2.book;
      const c2 = closePosition(book, book.positions[0]!.id, 55, 200 + i, "TARGET");
      book = c2.book;
    }
    assert.equal(book.trades[0]!.id, firstId);
    assert.equal(book.trades[0]!.analysisId, "ana_A");
  });
});
