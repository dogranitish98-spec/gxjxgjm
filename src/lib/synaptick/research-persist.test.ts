import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildResearchRun } from "./research-persist.ts";
import type { Analysis } from "./pipeline.ts";

function minimalAnalysis(overrides: Partial<Analysis> = {}): Analysis {
  return {
    symbol: "ETHUSDT",
    price: 2500,
    referencePrice: 2490,
    source: "demo",
    quality: { ok: true, issues: [], barsByTf: { "15m": 100 }, summary: "ok" },
    integrity: {
      analysisAtMs: 1,
      marketSnapshotMs: 1,
      source: "demo",
      formingDropped: 1,
      futureDetected: false,
      lookAhead: "PASS",
      note: "ok",
    },
    brain: {
      regime: "BULL TREND",
      regimeConfidence: 70,
      alignment: 75,
      decisions: [
        {
          horizon: "INTRADAY",
          signal: "WAIT",
          confidence: 55,
          expectedGross: 0.2,
          netEdge: -0.1,
          reason: "test",
          bullEvidence: 40,
          bearEvidence: 20,
          riskReward: 0.8,
          drawdownRisk: 40,
        },
      ],
      note: "WAIT",
    },
    analog: {
      comparable: 10,
      qualified: 5,
      threshold: 80,
      favorablePct: 40,
      medianReturn: 0,
      medianAdverse: -1,
      sampleNote: "small",
      weak: true,
      status: "INSUFFICIENT DATA",
      samplePeriodBars: 50,
      minSampleRequired: 30,
    },
    strategy: null,
    ledger: { rows: [], total: 0 },
    verdict: {
      final: "WAIT",
      eligibility: "FAIL",
      bullishEvidence: 40,
      bearishEvidence: 20,
      modelConfidence: 55,
      modelConfidenceLabel: "UNCALIBRATED",
      items: [
        { id: "rr", ok: false, hard: true, title: "R:R below minimum" },
        { id: "align", ok: true, hard: false, title: "Aligned" },
      ],
      best: null,
      blockedBy: ["R:R below minimum"],
      passedCount: 1,
      failedCount: 1,
      hardFailedCount: 1,
    },
    calibrated: 55,
    spark: [1, 2, 3],
    plan: null,
    portfolio: { total: 0, symbol: 0, after: 0 },
    rsi: 48,
    ...overrides,
  } as Analysis;
}

describe("buildResearchRun", () => {
  it("creates immutable snapshot with analysis_id", () => {
    const run = buildResearchRun({
      analysis: minimalAnalysis(),
      startedAtMs: 1_000,
      config: {
        minConfidence: 60,
        minNetEdge: 0,
        riskPct: 1,
        allowShorts: false,
        timeframes: ["15m"],
      },
    });
    assert.ok(run.analysisId.startsWith("ana_"));
    assert.equal(run.symbol, "ETHUSDT");
    assert.equal(run.finalDecision, "WAIT");
    assert.ok(run.failedGates.some((g) => g.includes("R:R")));
    assert.equal(run.pipelineVersion, "0.2.0");
  });

  it("does not mutate prior run when building another", () => {
    const a = buildResearchRun({
      analysis: minimalAnalysis(),
      startedAtMs: 1,
      config: {
        minConfidence: 60,
        minNetEdge: 0,
        riskPct: 1,
        allowShorts: false,
        timeframes: ["15m"],
      },
    });
    const b = buildResearchRun({
      analysis: minimalAnalysis({
        verdict: {
          final: "BUY",
          eligibility: "PASS",
          bullishEvidence: 80,
          bearishEvidence: 10,
          modelConfidence: 70,
          modelConfidenceLabel: "CALIBRATED",
          items: [],
          best: null,
          blockedBy: [],
          passedCount: 0,
          failedCount: 0,
          hardFailedCount: 0,
        },
      } as any),
      startedAtMs: 2,
      config: {
        minConfidence: 60,
        minNetEdge: 0,
        riskPct: 1,
        allowShorts: false,
        timeframes: ["15m"],
      },
    });
    assert.equal(a.finalDecision, "WAIT");
    assert.equal(b.finalDecision, "BUY");
    assert.notEqual(a.analysisId, b.analysisId);
  });
});

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
    for (let i = 0; i < 250; i++) {
      const o = openPosition(book, {
        symbol: `S${i}USDT`,
        side: "BUY",
        price: 100,
        stop: 95,
        target: 110,
        quantity: 0.01,
        nowMs: i,
      });
      if (!o.ok) break;
      book = o.book;
      const c = closePosition(book, book.positions[0]!.id, 105, i + 1, "TARGET");
      book = c.book;
    }
    assert.ok(book.trades.length > 200, `expected >200 trades, got ${book.trades.length}`);
  });
});
