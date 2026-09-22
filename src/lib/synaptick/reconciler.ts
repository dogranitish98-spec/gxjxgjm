import type { HorizonDecision } from "./types";

export const MIN_CONFIDENCE = 60;
export const MIN_NET_EDGE = 0;
export const MIN_RISK_REWARD = 1;
export const MAX_DRAWDOWN_RISK = 45;

export function isEligible(
  g: HorizonDecision,
  minConfidence = MIN_CONFIDENCE,
  minNetEdge = MIN_NET_EDGE,
): boolean {
  return (
    (g.signal === "BUY" || g.signal === "SELL") &&
    g.confidence >= minConfidence &&
    g.netEdge > minNetEdge &&
    g.riskReward >= MIN_RISK_REWARD &&
    g.drawdownRisk < MAX_DRAWDOWN_RISK
  );
}

export function bestEligible(
  decisions: HorizonDecision[],
  minConfidence = MIN_CONFIDENCE,
  minNetEdge = MIN_NET_EDGE,
): HorizonDecision | null {
  const eligible = decisions.filter((d) => isEligible(d, minConfidence, minNetEdge));
  if (eligible.length === 0) return null;
  return [...eligible].sort((a, b) => b.netEdge - a.netEdge || b.confidence - a.confidence)[0] ?? null;
}

/** Model confidence is not raw bullish evidence. Cap WAIT, blend with sample when present. */
export function calibrateConfidence(
  raw: number,
  decision: "BUY" | "SELL" | "WAIT",
  observedWinRate: number | null,
  sampleCount: number,
): number {
  if (decision === "WAIT") return Math.min(69, Math.max(0, raw));
  if (sampleCount < 5 || observedWinRate == null) return Math.min(99, Math.max(0, raw));
  return Math.min(99, Math.max(0, raw * 0.55 + observedWinRate * 0.45));
}
