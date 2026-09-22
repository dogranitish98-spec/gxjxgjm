/**
 * Auto-persist a completed analysis into research memory.
 * Called after the normal pipeline finishes — does not change gate logic.
 */

import type { Analysis } from "./pipeline";
import type { AiEvidence } from "./evidence";
import type { StrategyResult } from "./types";
import {
  DECISION_ENGINE_VERSION,
  PIPELINE_VERSION,
  RISK_ENGINE_VERSION,
  STRATEGY_ENGINE_VERSION,
  type ResearchConfigSnapshot,
  type ResearchRun,
  type RiskPlanMem,
} from "./research-types";
import { newAnalysisId, saveResearchRun } from "./research-store";

export type PersistInput = {
  analysis: Analysis;
  startedAtMs: number;
  config: ResearchConfigSnapshot;
  ai?: AiEvidence | null;
  strategies?: StrategyResult[] | null;
  userId?: string | null;
  status?: ResearchRun["status"];
};

export function buildResearchRun(input: PersistInput): ResearchRun {
  const { analysis: a, startedAtMs, config } = input;
  const completedAtMs = Date.now();
  const analysisId = newAnalysisId(completedAtMs);
  const v = a.verdict;

  const riskPlan: RiskPlanMem | null =
    a.plan != null
      ? {
          side: a.verdict.best?.signal === "SELL" ? "SELL" : "BUY",
          entry: a.price,
          stop:
            a.plan.valid && a.plan.riskPerUnit
              ? a.verdict.best?.signal === "SELL"
                ? a.price + a.plan.riskPerUnit
                : a.price - a.plan.riskPerUnit
              : 0,
          target:
            a.plan.valid && a.plan.rewardPerUnit
              ? a.verdict.best?.signal === "SELL"
                ? a.price - a.plan.rewardPerUnit
                : a.price + a.plan.rewardPerUnit
              : 0,
          quantity: a.plan.quantity,
          allocated: a.plan.allocated,
          fee: a.plan.fee,
          slip: a.plan.slip,
          expectedLoss: a.plan.expectedLoss,
          expectedGain: a.plan.expectedGain,
          netRR: a.plan.netRR,
          riskPerUnit: a.plan.riskPerUnit,
          rewardPerUnit: a.plan.rewardPerUnit,
          valid: a.plan.valid,
          invalidReason: a.plan.invalidReason,
          portfolioExisting: a.portfolio.total,
          portfolioAfter: a.portfolio.after,
          portfolioCap: 6,
        }
      : null;

  const timeline = [
    { atMs: startedAtMs, label: "Analysis started" },
    { atMs: startedAtMs + 1, label: "Market data captured" },
    { atMs: startedAtMs + 2, label: "Indicators & multi-timeframe calculated" },
    { atMs: startedAtMs + 3, label: "Historical analogs scanned" },
    { atMs: startedAtMs + 4, label: "Strategy evaluation" },
    ...(input.ai
      ? [{ atMs: startedAtMs + 5, label: "AI research panel completed" }]
      : [{ atMs: startedAtMs + 5, label: "AI research not run (evidence treated as 0)" }]),
    { atMs: startedAtMs + 6, label: "Risk gates evaluated" },
    {
      atMs: completedAtMs,
      label: `Final decision = ${v.final}`,
    },
  ];

  const passedGates = v.items.filter((i) => i.ok).map((i) => i.title);
  const failedGates = v.items.filter((i) => !i.ok).map((i) => i.title);

  return {
    analysisId,
    userId: input.userId ?? null,
    symbol: a.symbol,
    status: input.status ?? "COMPLETED",
    dataSource: a.source,
    finalDecision: v.final,
    eligibility: v.eligibility,
    bullishEvidence: v.bullishEvidence,
    bearishEvidence: v.bearishEvidence ?? 0,
    modelConfidence: v.modelConfidence,
    confidenceLabel: v.modelConfidenceLabel ?? "UNCALIBRATED",
    regime: a.brain.regime,
    alignment: a.brain.alignment,
    netEdge: v.best?.netEdge ?? null,
    riskReward: v.best?.riskReward ?? a.plan?.netRR ?? null,
    failedGates,
    passedGates,
    pipelineVersion: PIPELINE_VERSION,
    strategyVersion: STRATEGY_ENGINE_VERSION,
    riskVersion: RISK_ENGINE_VERSION,
    decisionVersion: DECISION_ENGINE_VERSION,
    aiModel: input.ai ? "xai-research-panel" : null,
    config,
    market: {
      symbol: a.symbol,
      source: a.source,
      price: a.price,
      referencePrice: a.referencePrice,
      analysisAtMs: a.integrity.analysisAtMs,
      marketSnapshotMs: a.integrity.marketSnapshotMs,
      barsByTf: a.quality.barsByTf,
      quality: a.quality,
      integrity: a.integrity,
      spark: a.spark,
      rsi: a.rsi,
    },
    brain: a.brain,
    analog: a.analog,
    strategy: a.strategy,
    strategies: input.strategies ?? null,
    ledger: a.ledger,
    decision: {
      final: v.final,
      eligibility: v.eligibility,
      bullishEvidence: v.bullishEvidence,
      bearishEvidence: v.bearishEvidence ?? 0,
      modelConfidence: v.modelConfidence,
      modelConfidenceLabel: v.modelConfidenceLabel ?? "UNCALIBRATED",
      items: v.items,
      blockedBy: v.blockedBy,
      passedCount: v.passedCount ?? v.items.filter((i) => i.ok).length,
      failedCount: v.failedCount ?? v.items.filter((i) => !i.ok).length,
      hardFailedCount: v.hardFailedCount ?? v.items.filter((i) => i.hard && !i.ok).length,
      best: v.best,
    },
    riskPlan,
    ai: input.ai ?? null,
    timeline,
    analysisStartedAtMs: startedAtMs,
    analysisCompletedAtMs: completedAtMs,
    createdAtMs: completedAtMs,
  };
}

/**
 * Build + save to IndexedDB (client) and SQL (server). Returns the analysis_id.
 * Never throws into the UI path — logs and returns null on total failure.
 * Does not change the analysis decision itself.
 */
export async function persistAnalysis(input: PersistInput): Promise<string | null> {
  try {
    const run = buildResearchRun(input);

    // Client mirror (fast History UI; survives refresh)
    try {
      await saveResearchRun(run);
    } catch (e) {
      console.error("[research-memory] IndexedDB save failed:", e);
    }

    // Canonical DB (PGLite / Neon) — immutable insert
    try {
      const { saveResearchRunDb } = await import("@/lib/server/research-history");
      const res = await saveResearchRunDb({
        data: {
          analysisId: run.analysisId,
          userId: run.userId,
          symbol: run.symbol,
          status: run.status,
          dataSource: run.dataSource,
          finalDecision: run.finalDecision,
          eligibility: run.eligibility,
          bullishEvidence: run.bullishEvidence,
          bearishEvidence: run.bearishEvidence,
          modelConfidence: run.modelConfidence,
          confidenceLabel: run.confidenceLabel,
          regime: run.regime,
          alignment: run.alignment,
          netEdge: run.netEdge,
          riskReward: run.riskReward,
          failedGates: run.failedGates,
          passedGates: run.passedGates,
          pipelineVersion: run.pipelineVersion,
          strategyVersion: run.strategyVersion,
          aiModel: run.aiModel,
          configJson: JSON.stringify(run.config),
          snapshotJson: JSON.stringify(run),
          analysisStartedAtMs: run.analysisStartedAtMs,
          analysisCompletedAtMs: run.analysisCompletedAtMs,
        },
      });
      if (!res.ok) {
        console.error("[research-memory] DB save failed:", res.error);
      }
    } catch (e) {
      console.error("[research-memory] DB save error:", e);
    }

    return run.analysisId;
  } catch (e) {
    console.error("[research-memory] persist failed:", e);
    return null;
  }
}
