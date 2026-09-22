import { TOTAL_COST_PCT } from "./brain";
import type { AnalogReport } from "./analogs";
import type { BrainSnapshot, HorizonDecision, LedgerRow } from "./types";
import type { StrategyResult } from "./types";

export type AiEvidence = {
  technical: number;
  sentiment: number;
  news: number;
  fundamental: number;
  bull: string;
  bear: string;
  risk: string;
  notes: { role: string; text: string }[];
};

export function buildLedger(args: {
  brain: BrainSnapshot;
  best: HorizonDecision | null;
  analog: AnalogReport;
  strategy: StrategyResult | null;
  portfolioPenalty: number;
  ai?: AiEvidence | null;
}): { rows: LedgerRow[]; total: number } {
  const { brain, best, analog, strategy, portfolioPenalty, ai } = args;
  const bull = brain.decisions.reduce((s, d) => s + d.bullEvidence, 0) / Math.max(1, brain.decisions.length);
  const bear = brain.decisions.reduce((s, d) => s + d.bearEvidence, 0) / Math.max(1, brain.decisions.length);
  const technical = ((bull - bear) / 200) * 0.4;
  const trend =
    brain.regime.includes("BULL") ? 0.24 : brain.regime.includes("BEAR") ? -0.24 : 0.04;
  const sentiment = ai ? ai.sentiment : 0;
  const news = ai ? ai.news : 0;
  const wf = strategy ? Math.max(-0.35, Math.min(0.35, strategy.robustness.walkForwardPct / 20)) : 0;
  const costs = -(TOTAL_COST_PCT / 100) * 0.85;
  const rr = best ? Math.max(-0.4, Math.min(0.3, (best.riskReward - 1.25) * 0.2)) : -0.28;
  const analogRow = analog.weak ? -0.12 : (analog.favorablePct - 50) / 400;
  const port = -Math.abs(portfolioPenalty);

  const rows: LedgerRow[] = [
    {
      id: "technical",
      label: "Technical",
      value: technical,
      note: `bull ${bull.toFixed(0)} vs bear ${bear.toFixed(0)}`,
      formula: "(mean bull − mean bear) / 200 × 0.40",
    },
    {
      id: "trend",
      label: "Trend / regime",
      value: trend,
      note: brain.regime.toLowerCase(),
      formula: "regime sign × 0.24 (sideways ≈ 0.04)",
    },
    {
      id: "sentiment",
      label: "Sentiment",
      value: sentiment,
      note: ai ? "AI research desk" : "not run — treated as 0, not as a skip",
      formula: "AI signed score in [−0.20, +0.20], else 0",
    },
    {
      id: "news",
      label: "News",
      value: news,
      note: ai ? "AI research desk" : "no news feed on the gate",
      formula: "AI signed score in [−0.20, +0.20], else 0",
    },
    {
      id: "wf",
      label: "Strategy walk-forward",
      value: wf,
      note: strategy
        ? `${strategy.name} WF ${strategy.robustness.walkForwardPct.toFixed(2)}%`
        : "no strategy result yet",
      formula: "clamp(WF net % / 20, −0.35, +0.35)",
    },
    {
      id: "analog",
      label: "Historical analogs",
      value: analogRow,
      note: analog.sampleNote,
      formula: "weak sample −0.12, else (hit rate − 50) / 400",
    },
    {
      id: "costs",
      label: "Costs",
      value: costs,
      note: `${TOTAL_COST_PCT.toFixed(2)}% round-trip (10 bps fee + 3 bps slip each way)`,
      formula: "−0.26% × 0.85",
    },
    {
      id: "rr",
      label: "Risk / reward",
      value: rr,
      note: best ? `R:R ${best.riskReward.toFixed(2)}` : "no eligible horizon",
      formula: "clamp((R:R − 1.25) × 0.20, −0.40, +0.30)",
    },
    {
      id: "port",
      label: "Portfolio risk",
      value: port,
      note: portfolioPenalty === 0 ? "no extra concentration" : `concentration penalty ${portfolioPenalty.toFixed(2)}`,
      formula: "−|proposed symbol risk beyond 1%|",
    },
  ];
  const total = rows.reduce((s, r) => s + r.value, 0);
  return { rows, total };
}
