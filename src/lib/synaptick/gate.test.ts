import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runGate } from "./gate.ts";
import { statusFor, rejectionReasons, PROMOTE_MIN_TRADES } from "./strategies.ts";
import type {
  BrainSnapshot,
  DataQuality,
  HorizonDecision,
  IntegrityReport,
} from "./types.ts";
import type { AnalogReport } from "./analogs.ts";
import type { ProtectionVerdict, RiskVerdict } from "./risk.ts";

const qualityOk: DataQuality = {
  ok: true,
  issues: [],
  barsByTf: { "1m": 200, "5m": 200, "15m": 400, "1h": 200 },
  summary: "DATA OK",
};

const integrityOk: IntegrityReport = {
  analysisAtMs: 1_000_000,
  marketSnapshotMs: 999_000,
  source: "demo",
  formingDropped: 1,
  futureDetected: false,
  lookAhead: "PASS",
  note: "ok",
};

const bestBuy: HorizonDecision = {
  horizon: "INTRADAY",
  signal: "BUY",
  confidence: 72,
  expectedGross: 0.4,
  netEdge: 0.14,
  reason: "test",
  bullEvidence: 60,
  bearEvidence: 20,
  riskReward: 1.5,
  drawdownRisk: 30,
};

const brain: BrainSnapshot = {
  regime: "BULL TREND",
  regimeConfidence: 70,
  alignment: 75,
  decisions: [bestBuy],
  note: "ok",
};

const analogOk: AnalogReport = {
  comparable: 100,
  qualified: 40,
  threshold: 80,
  favorablePct: 58,
  medianReturn: 0.4,
  medianAdverse: -0.8,
  sampleNote: "40 analogs",
  weak: false,
  status: "PASS",
  samplePeriodBars: 200,
  minSampleRequired: 30,
};

const riskOk: RiskVerdict = { allowed: true, reasons: [], tripKillSwitch: false, breaches: [] };
const protectionOk: ProtectionVerdict = { locked: false, reason: "", untilMs: 0, rule: "" };

describe("runGate", () => {
  it("passes BUY when all hard gates clear", () => {
    const v = runGate({
      quality: qualityOk,
      integrity: integrityOk,
      brain,
      best: bestBuy,
      analog: analogOk,
      strategy: null,
      risk: riskOk,
      protection: protectionOk,
    });
    assert.equal(v.final, "BUY");
    assert.equal(v.eligibility, "PASS");
    assert.ok(v.hardFailedCount === 0);
  });

  it("returns WAIT when R:R fails", () => {
    const weak = { ...bestBuy, riskReward: 0.4 };
    const v = runGate({
      quality: qualityOk,
      integrity: integrityOk,
      brain: { ...brain, decisions: [weak] },
      best: weak,
      analog: analogOk,
      strategy: null,
      risk: riskOk,
      protection: protectionOk,
    });
    assert.equal(v.final, "WAIT");
    assert.equal(v.eligibility, "FAIL");
    assert.ok(v.blockedBy.some((t) => t.includes("R:R")));
  });

  it("blocks on look-ahead", () => {
    const v = runGate({
      quality: qualityOk,
      integrity: { ...integrityOk, lookAhead: "FAIL", futureDetected: true },
      brain,
      best: bestBuy,
      analog: analogOk,
      strategy: null,
      risk: riskOk,
      protection: protectionOk,
    });
    assert.equal(v.final, "WAIT");
    assert.ok(v.blockedBy.some((t) => t.toLowerCase().includes("look")));
  });

  it("never lets risk failure through", () => {
    const v = runGate({
      quality: qualityOk,
      integrity: integrityOk,
      brain,
      best: bestBuy,
      analog: analogOk,
      strategy: null,
      risk: { allowed: false, reasons: ["portfolio risk"], tripKillSwitch: false, breaches: [] },
      protection: protectionOk,
    });
    assert.equal(v.final, "WAIT");
  });

  it("caps model confidence on WAIT", () => {
    const v = runGate({
      quality: qualityOk,
      integrity: integrityOk,
      brain: { ...brain, decisions: [{ ...bestBuy, confidence: 99, riskReward: 0.1 }] },
      best: { ...bestBuy, confidence: 99, riskReward: 0.1 },
      analog: analogOk,
      strategy: null,
      risk: riskOk,
      protection: protectionOk,
    });
    assert.equal(v.final, "WAIT");
    assert.ok(v.modelConfidence <= 69);
  });
});

describe("strategy status", () => {
  it("requires min trades for PROMOTED", () => {
    assert.equal(statusFor(0.5, 1, PROMOTE_MIN_TRADES - 1, 1), "WATCH");
    assert.equal(statusFor(0.5, 1, PROMOTE_MIN_TRADES, 1), "PROMOTED");
  });

  it("demotes on negative WF", () => {
    assert.equal(statusFor(0.5, -1, 50, 1), "DEMOTED");
  });

  it("lists rejection reasons", () => {
    const r = rejectionReasons(5, -1, 20, -2, -1, "FAIL", "FAIL");
    assert.ok(r.length >= 3);
    assert.ok(r.some((x) => x.includes("trade count")));
  });
});
