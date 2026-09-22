import { historicalAnalogs, type AnalogReport } from "./analogs";
import { analyzeMarket } from "./brain";
import { validateQuality } from "./candles";
import { buildLedger, type AiEvidence } from "./evidence";
import { runGate, type DeskVerdict } from "./gate";
import { lastNumber, rsi } from "./indicators";
import { planTrade } from "./paper";
import { bestEligible, calibrateConfidence } from "./reconciler";
import {
  DEFAULT_LIMITS,
  evaluateProtections,
  evaluateRisk,
  markToMarket,
  portfolioRisk,
  type RiskLimits,
} from "./risk";
import { evaluateStrategy, STRATEGY_DEFS } from "./strategies";
import type {
  BrainSnapshot,
  Candle,
  DataQuality,
  IntegrityReport,
  LedgerRow,
  PaperBook,
} from "./types";

export type Analysis = {
  symbol: string;
  price: number;
  referencePrice: number;
  source: "binance" | "demo";
  quality: DataQuality;
  integrity: IntegrityReport;
  brain: BrainSnapshot;
  analog: AnalogReport;
  strategy: ReturnType<typeof evaluateStrategy> | null;
  ledger: { rows: LedgerRow[]; total: number };
  verdict: DeskVerdict;
  calibrated: number;
  spark: number[];
  plan: ReturnType<typeof planTrade> | null;
  portfolio: { total: number; symbol: number; after: number };
  rsi: number;
};

export function analyzeFrames(args: {
  symbol: string;
  frames: Record<string, Candle[]>;
  nowMs: number;
  source: "binance" | "demo";
  book: PaperBook;
  prices: Record<string, number>;
  minConfidence: number;
  minNetEdge: number;
  riskPct: number;
  limits?: RiskLimits;
  ai?: AiEvidence | null;
}): Analysis {
  const { symbol, frames, nowMs, source, book, minConfidence, minNetEdge, riskPct } = args;
  const limits = args.limits ?? { ...DEFAULT_LIMITS };
  const quality = validateQuality(frames);
  const h1 = frames["1h"] ?? [];
  const m15 = frames["15m"] ?? [];
  const price = (m15[m15.length - 1] ?? h1[h1.length - 1])?.close ?? 0;
  const reference = (m15[m15.length - 2] ?? h1[h1.length - 2])?.close ?? price;
  const lastClose = (m15[m15.length - 1] ?? h1[h1.length - 1])?.closeTimeMs ?? nowMs;
  let futureDetected = false;
  let futureCount = 0;
  for (const series of Object.values(frames)) {
    for (const c of series) {
      if (c.closeTimeMs > nowMs + 1_000) {
        futureDetected = true;
        futureCount++;
      }
    }
  }
  // Out-of-order / duplicate open times
  for (const series of Object.values(frames)) {
    for (let i = 1; i < series.length; i++) {
      if (series[i]!.openTimeMs <= series[i - 1]!.openTimeMs) {
        futureDetected = true;
        futureCount++;
      }
    }
  }
  const formingDropped = 1;
  const integrity: IntegrityReport = {
    analysisAtMs: nowMs,
    marketSnapshotMs: lastClose,
    source,
    formingDropped,
    futureDetected,
    lookAhead: futureDetected ? "FAIL" : "PASS",
    note: futureDetected
      ? `LOOK-AHEAD BLOCKED • ${futureCount} future or out-of-order bars detected. Analysis refused.`
      : source === "demo"
        ? "Demo feed — causal synthetic candles. Labeled so it cannot be mistaken for live tape."
        : "Binance public klines. Forming bars dropped. Analysis uses closed candles only (UTC).",
  };

  const brain = analyzeMarket(frames, minConfidence, minNetEdge);
  const best = bestEligible(brain.decisions, minConfidence, minNetEdge);
  const analog = historicalAnalogs(m15.length >= 80 ? m15 : h1);
  const def = STRATEGY_DEFS[0]!;
  const strategySeries = m15.length >= 120 ? m15 : h1;
  const strategy =
    strategySeries.length >= 120
      ? evaluateStrategy(strategySeries, def, symbol, m15.length >= 120 ? "15m" : "1h", 900_000)
      : null;

  const equity = markToMarket(book, { ...args.prices, [symbol]: price });
  const port = portfolioRisk(book, equity);
  const atrGuess = Math.max(price * 0.008, price * 0.004);
  const side = best?.signal === "SELL" ? "SELL" : "BUY";
  const stop = side === "BUY" ? price - atrGuess : price + atrGuess;
  const target = side === "BUY" ? price + atrGuess * 2.2 : price - atrGuess * 2.2;
  const plan =
    price > 0
      ? planTrade({ equity, price, stop, target, side, riskPct })
      : null;
  const proposed =
    plan && plan.valid && equity > 0 ? (plan.expectedLoss / equity) * 100 : riskPct;
  const protection = evaluateProtections(book.trades, nowMs, equity);
  const risk = evaluateRisk({
    decision: best?.signal === "BUY" || best?.signal === "SELL" ? best.signal : "WAIT",
    book,
    price,
    referencePrice: reference,
    equity,
    nowMs,
    symbol,
    proposedRiskPct: proposed,
    protection,
    limits,
  });

  const verdict = runGate({
    quality,
    integrity,
    brain,
    best,
    analog,
    strategy,
    risk,
    protection,
    minConfidence,
    minNetEdge,
  });

  const symbolRisk = port.bySymbol[symbol] ?? 0;
  const ledger = buildLedger({
    brain,
    best,
    analog,
    strategy,
    portfolioPenalty: Math.max(0, symbolRisk + proposed - 1),
    ai: args.ai,
  });

  const calibrated = calibrateConfidence(
    verdict.modelConfidence,
    verdict.final,
    analog.qualified >= 5 ? analog.favorablePct : null,
    analog.qualified,
  );

  return {
    symbol,
    price,
    referencePrice: reference,
    source,
    quality,
    integrity,
    brain,
    analog,
    strategy,
    ledger,
    verdict: { ...verdict, modelConfidence: calibrated },
    calibrated,
    spark: (m15.length ? m15 : h1).slice(-48).map((c) => c.close),
    plan,
    portfolio: { total: port.total, symbol: symbolRisk, after: port.total + proposed },
    rsi: lastNumber(
      rsi((m15.length ? m15 : h1).map((c) => c.close), 14),
      50,
    ),
  };
}

export function lastRsi(candles: Candle[]): number {
  return lastNumber(
    rsi(
      candles.map((c) => c.close),
      14,
    ),
    50,
  );
}
