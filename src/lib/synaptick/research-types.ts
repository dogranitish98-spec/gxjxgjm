/**
 * Canonical research-history snapshot shapes.
 * One analysis_id owns the entire evidence chain for a single run.
 */

import type { AnalogReport } from "./analogs";
import type { AiEvidence } from "./evidence";
import type {
  BrainSnapshot,
  DataQuality,
  Decision,
  GateItem,
  HorizonDecision,
  IntegrityReport,
  LedgerRow,
  StrategyResult,
} from "./types";

export const PIPELINE_VERSION = "0.2.0";
export const STRATEGY_ENGINE_VERSION = "0.2.0";
export const RISK_ENGINE_VERSION = "0.2.0";
export const DECISION_ENGINE_VERSION = "0.2.0";

export type ResearchStatus = "COMPLETED" | "PARTIAL" | "FAILED";

export type ResearchConfigSnapshot = {
  minConfidence: number;
  minNetEdge: number;
  riskPct: number;
  allowShorts: boolean;
  timeframes: string[];
};

export type MarketSnapshotMem = {
  symbol: string;
  source: "binance" | "demo" | "unknown";
  price: number;
  referencePrice: number;
  analysisAtMs: number;
  marketSnapshotMs: number;
  barsByTf: Record<string, number>;
  quality: DataQuality;
  integrity: IntegrityReport;
  spark: number[];
  rsi: number;
};

export type RiskPlanMem = {
  side: "BUY" | "SELL";
  entry: number;
  stop: number;
  target: number;
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
  portfolioExisting: number;
  portfolioAfter: number;
  portfolioCap: number;
};

export type DecisionMem = {
  final: Decision;
  eligibility: "PASS" | "FAIL";
  bullishEvidence: number;
  bearishEvidence: number;
  modelConfidence: number;
  modelConfidenceLabel: "CALIBRATED" | "UNCALIBRATED" | string;
  items: GateItem[];
  blockedBy: string[];
  passedCount: number;
  failedCount: number;
  hardFailedCount: number;
  best: HorizonDecision | null;
};

/** Immutable snapshot of one full analysis run. */
export type ResearchRun = {
  analysisId: string;
  userId: string | null;
  symbol: string;
  status: ResearchStatus;
  dataSource: "binance" | "demo" | "unknown";
  finalDecision: Decision;
  eligibility: "PASS" | "FAIL";
  bullishEvidence: number;
  bearishEvidence: number;
  modelConfidence: number;
  confidenceLabel: string;
  regime: string;
  alignment: number;
  netEdge: number | null;
  riskReward: number | null;
  failedGates: string[];
  passedGates: string[];
  pipelineVersion: string;
  strategyVersion: string;
  riskVersion: string;
  decisionVersion: string;
  aiModel: string | null;
  config: ResearchConfigSnapshot;
  market: MarketSnapshotMem;
  brain: BrainSnapshot;
  analog: AnalogReport;
  strategy: StrategyResult | null;
  /** All strategies if tournament was run in-session; otherwise null */
  strategies: StrategyResult[] | null;
  ledger: { rows: LedgerRow[]; total: number };
  decision: DecisionMem;
  riskPlan: RiskPlanMem | null;
  ai: AiEvidence | null;
  timeline: { atMs: number; label: string }[];
  analysisStartedAtMs: number;
  analysisCompletedAtMs: number;
  createdAtMs: number;
};

export type AnalysisOutcome = {
  id: string;
  analysisId: string;
  horizonLabel: string;
  horizonBars: number;
  priceAtEval: number;
  mfePct: number;
  maePct: number;
  returnPct: number;
  directionalOk: boolean | null;
  stopHit: boolean | null;
  targetHit: boolean | null;
  evaluatedAtMs: number;
};

export type ResearchListItem = {
  analysisId: string;
  symbol: string;
  finalDecision: Decision;
  eligibility: "PASS" | "FAIL";
  regime: string;
  bullishEvidence: number;
  bearishEvidence: number;
  modelConfidence: number;
  alignment: number;
  riskReward: number | null;
  failedGates: string[];
  strategySummary: string;
  dataSource: string;
  analysisCompletedAtMs: number;
  status: ResearchStatus;
};

export type ResearchFilters = {
  symbol?: string;
  decision?: Decision | "ALL";
  query?: string;
  fromMs?: number;
  toMs?: number;
  page?: number;
  pageSize?: number;
};

export type ResearchPage = {
  items: ResearchListItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
};

export type ResearchStats = {
  total: number;
  today: number;
  thisWeek: number;
  byDecision: Record<string, number>;
  topSymbols: { symbol: string; count: number }[];
  mostCommonFailedGate: string | null;
  waitPct: number;
  buyPct: number;
  sellPct: number;
};
