import type { AnalogReport } from "./analogs";
import type {
  BrainSnapshot,
  DataQuality,
  Decision,
  GateItem,
  HorizonDecision,
  IntegrityReport,
  StrategyResult,
} from "./types";
import { isEligible, MIN_CONFIDENCE, MIN_NET_EDGE, MIN_RISK_REWARD, MAX_DRAWDOWN_RISK } from "./reconciler";
import { TOTAL_COST_PCT } from "./brain";
import type { ProtectionVerdict, RiskVerdict } from "./risk";

export type DeskVerdict = {
  final: Decision;
  eligibility: "PASS" | "FAIL";
  bullishEvidence: number;
  bearishEvidence: number;
  /** Model confidence — capped, never presented as calibrated probability unless sample supports it. */
  modelConfidence: number;
  modelConfidenceLabel: "CALIBRATED" | "UNCALIBRATED";
  items: GateItem[];
  best: HorizonDecision | null;
  blockedBy: string[];
  passedCount: number;
  failedCount: number;
  hardFailedCount: number;
};

export function runGate(args: {
  quality: DataQuality;
  integrity: IntegrityReport;
  brain: BrainSnapshot;
  best: HorizonDecision | null;
  analog: AnalogReport;
  strategy: StrategyResult | null;
  risk: RiskVerdict;
  protection: ProtectionVerdict;
  minConfidence?: number;
  minNetEdge?: number;
}): DeskVerdict {
  const minC = args.minConfidence ?? MIN_CONFIDENCE;
  const minE = args.minNetEdge ?? MIN_NET_EDGE;
  const { brain, analog, strategy, risk, protection, quality, integrity } = args;
  const best = args.best;

  const bullish = Math.max(
    0,
    Math.min(
      100,
      brain.decisions.reduce((s, d) => s + d.bullEvidence, 0) / Math.max(1, brain.decisions.length),
    ),
  );
  const bearish = Math.max(
    0,
    Math.min(
      100,
      brain.decisions.reduce((s, d) => s + d.bearEvidence, 0) / Math.max(1, brain.decisions.length),
    ),
  );

  const items: GateItem[] = [];
  const add = (item: GateItem) => items.push(item);

  add({
    id: "data",
    ok: quality.ok,
    hard: true,
    title: quality.ok ? "Market data cleared the quality gate" : "Market data rejected",
    detail: quality.summary,
  });
  add({
    id: "lookahead",
    ok: integrity.lookAhead === "PASS" && !integrity.futureDetected,
    hard: true,
    title:
      integrity.lookAhead === "PASS"
        ? "Closed candles only — no look-ahead in the snapshot"
        : "Look-ahead detected — backtest blocked",
    detail: integrity.note,
  });
  add({
    id: "align",
    ok: brain.alignment >= 50,
    hard: false,
    title:
      brain.alignment >= 50
        ? `Multi-timeframe alignment ${brain.alignment.toFixed(0)}`
        : `Multi-timeframe alignment only ${brain.alignment.toFixed(0)}`,
    detail: brain.regime.toLowerCase(),
  });

  const eligible = best != null && isEligible(best, minC, minE);
  add({
    id: "conf",
    ok: best != null && best.confidence >= minC,
    hard: true,
    title:
      best && best.confidence >= minC
        ? `Horizon confidence ${best.confidence.toFixed(0)} ≥ ${minC}`
        : `Confidence below ${minC} (best ${best ? best.confidence.toFixed(0) : "n/a"})`,
  });
  add({
    id: "edge",
    ok: best != null && best.netEdge > minE,
    hard: true,
    title:
      best && best.netEdge > minE
        ? `Net edge ${best.netEdge.toFixed(2)}% after ${TOTAL_COST_PCT.toFixed(2)}% costs`
        : `Expected edge does not clear ${TOTAL_COST_PCT.toFixed(2)}% round-trip cost`,
    detail: best ? `gross ${best.expectedGross.toFixed(2)}%` : undefined,
  });
  add({
    id: "rr",
    ok: best != null && best.riskReward >= MIN_RISK_REWARD,
    hard: true,
    title:
      best && best.riskReward >= MIN_RISK_REWARD
        ? `R:R ${best.riskReward.toFixed(2)} ≥ ${MIN_RISK_REWARD.toFixed(2)}`
        : `R:R ${best ? best.riskReward.toFixed(2) : "0.00"} < ${MIN_RISK_REWARD.toFixed(2)} minimum`,
  });
  add({
    id: "dd",
    ok: best != null && best.drawdownRisk < MAX_DRAWDOWN_RISK,
    hard: true,
    title:
      best && best.drawdownRisk < MAX_DRAWDOWN_RISK
        ? `Drawdown risk ${best.drawdownRisk.toFixed(0)} < ${MAX_DRAWDOWN_RISK}`
        : `Drawdown risk too high`,
  });

  add({
    id: "wf",
    ok: strategy != null && strategy.robustness.walkForward === "PASS",
    hard: false,
    title:
      strategy == null
        ? "No strategy walk-forward yet"
        : strategy.robustness.walkForward === "INSUFFICIENT DATA"
          ? "Strategy walk-forward: insufficient data"
          : strategy.robustness.walkForward === "PASS"
            ? `Strategy walk-forward ${strategy.robustness.walkForwardPct.toFixed(2)}%`
            : `Strategy walk-forward ${strategy.robustness.walkForwardPct.toFixed(2)}% (failed)`,
    detail: strategy?.status,
  });

  add({
    id: "analog",
    ok: !analog.weak && analog.favorablePct >= 52,
    hard: false,
    title: analog.weak
      ? `Historical analogs: insufficient data (${analog.qualified} < 30)`
      : `Analogs ${analog.favorablePct.toFixed(1)}% favorable`,
    detail: analog.sampleNote,
  });
  add({
    id: "risk",
    ok: risk.allowed,
    hard: true,
    title: risk.allowed ? "Risk gate clear" : `Risk gate • ${risk.reasons[0] ?? "blocked"}`,
    detail: risk.reasons.slice(1).join(" • ") || undefined,
  });
  add({
    id: "lock",
    ok: !protection.locked,
    hard: true,
    title: protection.locked ? `Temporary lock • ${protection.reason}` : "No temporary protection lock",
  });

  const hardFails = items.filter((i) => i.hard && !i.ok);
  const softFails = items.filter((i) => !i.hard && !i.ok);
  const eligibility: "PASS" | "FAIL" = eligible && hardFails.length === 0 ? "PASS" : "FAIL";

  // DETERMINISTIC FINAL GATE — AI evidence never reaches here as an override
  let final: Decision = "WAIT";
  if (eligibility === "PASS" && best && (best.signal === "BUY" || best.signal === "SELL")) {
    final = best.signal;
  }

  // Confidence terminology: never claim 99% calibrated probability without sample
  const sampleOk = analog.qualified >= 30;
  const raw = best?.confidence ?? brain.regimeConfidence;
  const modelConfidence =
    final === "WAIT" ? Math.min(69, Math.max(0, raw)) : Math.min(sampleOk ? 92 : 78, Math.max(0, raw));
  const modelConfidenceLabel: "CALIBRATED" | "UNCALIBRATED" = sampleOk ? "CALIBRATED" : "UNCALIBRATED";

  return {
    final,
    eligibility,
    bullishEvidence: bullish,
    bearishEvidence: bearish,
    modelConfidence,
    modelConfidenceLabel,
    items,
    best,
    blockedBy: hardFails.map((i) => i.title),
    passedCount: items.filter((i) => i.ok).length,
    failedCount: hardFails.length + softFails.length,
    hardFailedCount: hardFails.length,
  };
}
