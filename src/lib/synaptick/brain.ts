import { atr, ema, lastNumber, macd, rsi, volumeRatio } from "./indicators";
import { closes, highs, lows, volumes } from "./candles";
import type { BrainSnapshot, Candle, HorizonDecision, HorizonName } from "./types";
import { MIN_RISK_REWARD, MAX_DRAWDOWN_RISK } from "./reconciler";
import { ROUND_TRIP_COST_PCT } from "./costs";

/** @deprecated Prefer ROUND_TRIP_COST_PCT from costs.ts — kept for ledger compatibility */
export const TOTAL_COST_PCT = ROUND_TRIP_COST_PCT;

type Frame = {
  bias: number;
  strength: number;
  volatility: number;
  rsi: number;
  momentum: number;
  reason: string;
};

function analyzeFrame(candles: Candle[]): Frame {
  if (candles.length < 60) {
    return {
      bias: 0,
      strength: 0,
      volatility: 0,
      rsi: 50,
      momentum: 0,
      reason: "Not enough closed candles",
    };
  }
  const c = closes(candles);
  const h = highs(candles);
  const l = lows(candles);
  const v = volumes(candles);
  const ema9 = lastNumber(ema(c, 9), c[c.length - 1]!);
  const ema21 = lastNumber(ema(c, 21), c[c.length - 1]!);
  const r = lastNumber(rsi(c, 14), 50);
  const hist = lastNumber(macd(c).histogram, 0);
  const a = lastNumber(atr(h, l, c, 14), 0);
  const volR = volumeRatio(v, 20);
  const momentum = c.length >= 6 ? (c[c.length - 1]! / c[c.length - 6]! - 1) * 100 : 0;

  let score = 0;
  if (ema9 > ema21) score += 2;
  else if (ema9 < ema21) score -= 2;
  if (hist > 0) score += 2;
  else if (hist < 0) score -= 2;
  if (momentum > 0.08) score += 1;
  else if (momentum < -0.08) score -= 1;
  if (volR > 1.15 && momentum > 0) score += 1;
  else if (volR > 1.15 && momentum < 0) score -= 1;
  if (r >= 52 && r <= 68) score += 1;
  else if (r >= 32 && r <= 48) score -= 1;

  const bias = score >= 2 ? 1 : score <= -2 ? -1 : 0;
  const strength = Math.min(100, Math.max(0, (Math.abs(score) / 8) * 100));
  const volatility = c[c.length - 1]! > 0 ? (a / c[c.length - 1]!) * 100 : 0;

  return {
    bias,
    strength,
    volatility,
    rsi: r,
    momentum,
    reason: `EMA ${ema9 > ema21 ? "bullish" : "bearish"}, MACD ${hist > 0 ? "positive" : "negative"}, RSI ${r.toFixed(0)}, volume ${volR.toFixed(2)}x`,
  };
}

function decide(
  name: HorizonName,
  fast: Frame,
  slow: Frame,
  gross: number,
  extraCost: number,
  regime: string,
): HorizonDecision {
  const same = fast.bias !== 0 && fast.bias === slow.bias;
  const conflict = fast.bias !== 0 && slow.bias !== 0 && fast.bias !== slow.bias;
  const bullEvidence = (fast.bias > 0 ? fast.strength : 0) + (slow.bias > 0 ? slow.strength : 0);
  const bearEvidence = (fast.bias < 0 ? fast.strength : 0) + (slow.bias < 0 ? slow.strength : 0);
  const conflictPenalty = conflict ? 22 : 0;
  const regimePenalty =
    (regime.includes("BULL") && bearEvidence > bullEvidence) ||
    (regime.includes("BEAR") && bullEvidence > bearEvidence)
      ? 15
      : 0;
  const confidence = Math.min(
    99,
    Math.max(0, 42 + Math.max(bullEvidence, bearEvidence) * 0.22 - conflictPenalty - regimePenalty),
  );
  const evidenceMargin = Math.abs(bullEvidence - bearEvidence);
  let direction: HorizonDecision["signal"] = "WAIT";
  if (conflict && evidenceMargin < 25) direction = "WAIT";
  else if (bullEvidence > bearEvidence && evidenceMargin >= 25) direction = "BUY";
  else if (bearEvidence > bullEvidence && evidenceMargin >= 25) direction = "SELL";

  const expectedGross = gross * (confidence / 100);
  const net = expectedGross - extraCost - TOTAL_COST_PCT;
  const riskBudgetPct = Math.max(fast.volatility, slow.volatility, 0.05);
  const riskReward = Math.min(5, Math.max(0, expectedGross / riskBudgetPct));
  const drawdownRisk = Math.min(100, Math.max(0, (100 - confidence) * 0.65 + (conflict ? 25 : 0)));

  return {
    horizon: name,
    signal: direction,
    confidence,
    expectedGross,
    netEdge: net,
    reason: `Bull ${bullEvidence.toFixed(0)} vs Bear ${bearEvidence.toFixed(0)} • ${
      conflict ? "CONFLICT" : same ? "ALIGNED" : "NO ALIGNMENT"
    } • gross ${expectedGross.toFixed(2)}% • costs ${(extraCost + TOTAL_COST_PCT).toFixed(2)}% • R:R ${riskReward.toFixed(2)}`,
    bullEvidence,
    bearEvidence,
    riskReward,
    drawdownRisk,
  };
}

export function analyzeMarket(
  frames: Record<string, Candle[]>,
  minConfidence = 60,
  minNetEdge = 0,
): BrainSnapshot {
  const f1 = analyzeFrame(frames["1m"] ?? []);
  const f5 = analyzeFrame(frames["5m"] ?? []);
  const f15 = analyzeFrame(frames["15m"] ?? []);
  const f1h = analyzeFrame(frames["1h"] ?? []);
  const pack = [f1, f5, f15, f1h];
  const bull = pack.filter((f) => f.bias > 0).length;
  const bear = pack.filter((f) => f.bias < 0).length;
  const volatility = Math.max(...pack.map((f) => f.volatility), 0);

  const regime =
    bull >= 3 && volatility < 3
      ? "BULL TREND"
      : bear >= 3 && volatility < 3
        ? "BEAR TREND"
        : volatility >= 3
          ? "HIGH VOLATILITY"
          : bull === bear
            ? "SIDEWAYS / UNCERTAIN"
            : "MIXED / UNCERTAIN";

  const regimeConfidence = Math.min(
    99,
    Math.max(0, 45 + Math.abs(bull - bear) * 14 + pack.reduce((s, f) => s + f.strength, 0) / 4 * 0.4),
  );
  const alignment = Math.min(100, Math.max(bull, bear) * 25);

  const decisions: HorizonDecision[] = [
    decide("SCALP", f1, f5, 0.18, 0.07, regime),
    decide("INTRADAY", f5, f15, 0.3, 0.09, regime),
    decide("SWING", f15, f1h, 0.65, 0.12, regime),
  ];

  const tradable = decisions.filter(
    (d) =>
      (d.signal === "BUY" || d.signal === "SELL") &&
      d.confidence >= minConfidence &&
      d.netEdge > minNetEdge &&
      d.riskReward >= MIN_RISK_REWARD &&
      d.drawdownRisk < MAX_DRAWDOWN_RISK,
  );

  return {
    regime,
    regimeConfidence,
    alignment,
    decisions,
    note: tradable.length === 0
      ? "WAIT: evidence is conflicting or the expected edge does not clear cost and risk gates. No forced BUY/SELL."
      : "A horizon cleared confidence, net edge, risk/reward and drawdown gates.",
  };
}

export { analyzeFrame };
