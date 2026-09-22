export type Side = "BUY" | "SELL";
export type Decision = "BUY" | "SELL" | "WAIT";
export type StrategyStatus = "PROMOTED" | "WATCH" | "DEMOTED";

export type Candle = {
  openTimeMs: number;
  closeTimeMs: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
};

export type HorizonName = "SCALP" | "INTRADAY" | "SWING";

export type HorizonDecision = {
  horizon: HorizonName;
  signal: Decision;
  confidence: number;
  expectedGross: number;
  netEdge: number;
  reason: string;
  bullEvidence: number;
  bearEvidence: number;
  riskReward: number;
  drawdownRisk: number;
};

export type BrainSnapshot = {
  regime: string;
  regimeConfidence: number;
  alignment: number;
  decisions: HorizonDecision[];
  note: string;
};

export type DataQuality = {
  ok: boolean;
  issues: string[];
  barsByTf: Record<string, number>;
  summary: string;
};

export type IntegrityReport = {
  analysisAtMs: number;
  marketSnapshotMs: number;
  source: "binance" | "demo";
  formingDropped: number;
  futureDetected: boolean;
  lookAhead: "PASS" | "FAIL";
  note: string;
};

export type GateItem = {
  id: string;
  ok: boolean;
  hard: boolean;
  title: string;
  detail?: string;
};

export type LedgerRow = {
  id: string;
  label: string;
  value: number;
  note: string;
  formula: string;
};

export type ClosedTrade = {
  id: string;
  symbol: string;
  strategyId: string;
  side: Side;
  openedAtMs: number;
  closedAtMs: number;
  entry: number;
  exit: number;
  quantity: number;
  netPnl: number;
  pnlPct: number;
  fees: number;
  reason: string;
  /** Originating research run when the trade was opened from an analysis. */
  analysisId?: string;
};

export type OpenPosition = {
  id: string;
  symbol: string;
  side: Side;
  entry: number;
  stop: number;
  target: number;
  quantity: number;
  allocated: number;
  openedAtMs: number;
  fees: number;
  /** Originating research run when opened from an analysis. */
  analysisId?: string;
};

export type PaperBook = {
  cash: number;
  startingCash: number;
  peakEquity: number;
  positions: OpenPosition[];
  trades: ClosedTrade[];
  killSwitch: boolean;
  killReason: string;
};

export type BacktestTrade = {
  entryBar: number;
  exitBar: number;
  side: Side;
  entry: number;
  exit: number;
  pnlPct: number;
  netPct: number;
};

export type PerformanceReport = {
  trades: number;
  wins: number;
  winRatePct: number;
  totalNetPct: number;
  expectancyPct: number;
  profitFactor: number;
  maxDrawdownPct: number;
  sharpe: number | null;
  sortino: number | null;
  cagrPct: number | null;
  feesPct: number;
  spanDays: number;
};

export type ValidationStatus = "PASS" | "FAIL" | "INSUFFICIENT DATA";

export type MonteCarloSnapshot = {
  median: number;
  p5: number;
  p25: number;
  p75: number;
  p95: number;
  positivePct: number;
  sampleSize: number;
  rounds: number;
  label: "HISTORICAL ROBUSTNESS SIMULATION";
};

export type Robustness = {
  inSamplePct: number;
  outOfSamplePct: number;
  walkForwardPct: number;
  monteCarloMedianPct: number;
  monteCarloPositivePct: number;
  cost1xPct: number;
  cost15xPct: number;
  cost2xPct: number;
  paramSensitivity: ValidationStatus;
  oos: ValidationStatus;
  walkForward: ValidationStatus;
  costSensitivity: ValidationStatus;
  tradeCount: ValidationStatus;
  verdict: ValidationStatus;
  monteCarlo?: MonteCarloSnapshot;
};

export type StrategyResult = {
  id: string;
  name: string;
  timeframe: string;
  symbol: string;
  performance: PerformanceReport;
  robustness: Robustness;
  status: StrategyStatus;
  rejection?: string;
  rejectionReasons?: string[];
  score: number;
  trades: BacktestTrade[];
};
