/**
 * Permanent research memory — IndexedDB (client).
 * Survives refresh. Survives logout when auth is off (device-local).
 * When Neon/PGLite is available, server can mirror; this remains the always-on store.
 */

import type {
  AnalysisOutcome,
  ResearchFilters,
  ResearchListItem,
  ResearchPage,
  ResearchRun,
  ResearchStats,
} from "./research-types";

const DB_NAME = "synaptick-research-v1";
const DB_VERSION = 1;
const STORE_RUNS = "research_runs";
const STORE_OUTCOMES = "analysis_outcomes";

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === "undefined") {
      reject(new Error("IndexedDB unavailable"));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onerror = () => reject(req.error ?? new Error("IDB open failed"));
    req.onsuccess = () => resolve(req.result);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_RUNS)) {
        const runs = db.createObjectStore(STORE_RUNS, { keyPath: "analysisId" });
        runs.createIndex("by_symbol", "symbol", { unique: false });
        runs.createIndex("by_decision", "finalDecision", { unique: false });
        runs.createIndex("by_completed", "analysisCompletedAtMs", { unique: false });
      }
      if (!db.objectStoreNames.contains(STORE_OUTCOMES)) {
        const out = db.createObjectStore(STORE_OUTCOMES, { keyPath: "id" });
        out.createIndex("by_analysis", "analysisId", { unique: false });
      }
    };
  });
}

function idbReq<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("IDB request failed"));
  });
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("IDB tx failed"));
    tx.onabort = () => reject(tx.error ?? new Error("IDB tx aborted"));
  });
}

/** Generate immutable analysis id: ana_<timestamp>_<random> */
export function newAnalysisId(nowMs = Date.now()): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `ana_${nowMs.toString(36)}_${rand}`;
}

export async function saveResearchRun(run: ResearchRun): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_RUNS, "readwrite");
  tx.objectStore(STORE_RUNS).put(run);
  await txDone(tx);
  db.close();
}

export async function getResearchRun(analysisId: string): Promise<ResearchRun | null> {
  const db = await openDb();
  const tx = db.transaction(STORE_RUNS, "readonly");
  const row = await idbReq(tx.objectStore(STORE_RUNS).get(analysisId));
  db.close();
  return (row as ResearchRun) ?? null;
}

export async function listResearchRuns(filters: ResearchFilters = {}): Promise<ResearchPage> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filters.pageSize ?? 25));
  const db = await openDb();
  const tx = db.transaction(STORE_RUNS, "readonly");
  const store = tx.objectStore(STORE_RUNS);
  const all = (await idbReq(store.getAll())) as ResearchRun[];
  db.close();

  let rows = all;
  if (filters.symbol) {
    const sym = filters.symbol.toUpperCase();
    rows = rows.filter((r) => r.symbol.includes(sym));
  }
  if (filters.decision && filters.decision !== "ALL") {
    rows = rows.filter((r) => r.finalDecision === filters.decision);
  }
  if (filters.fromMs) rows = rows.filter((r) => r.analysisCompletedAtMs >= filters.fromMs!);
  if (filters.toMs) rows = rows.filter((r) => r.analysisCompletedAtMs <= filters.toMs!);
  if (filters.query) {
    const q = filters.query.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.analysisId.toLowerCase().includes(q) ||
        r.symbol.toLowerCase().includes(q) ||
        r.regime.toLowerCase().includes(q) ||
        r.failedGates.some((g) => g.toLowerCase().includes(q)) ||
        r.finalDecision.toLowerCase().includes(q),
    );
  }

  rows.sort((a, b) => b.analysisCompletedAtMs - a.analysisCompletedAtMs);
  const total = rows.length;
  const start = (page - 1) * pageSize;
  const slice = rows.slice(start, start + pageSize);

  const items: ResearchListItem[] = slice.map((r) => ({
    analysisId: r.analysisId,
    symbol: r.symbol,
    finalDecision: r.finalDecision,
    eligibility: r.eligibility,
    regime: r.regime,
    bullishEvidence: r.bullishEvidence,
    bearishEvidence: r.bearishEvidence,
    modelConfidence: r.modelConfidence,
    alignment: r.alignment,
    riskReward: r.riskReward,
    failedGates: r.failedGates,
    strategySummary: r.strategy
      ? `${r.strategy.name} · ${r.strategy.status}`
      : r.strategies
        ? `${r.strategies.length} tested · ${r.strategies.filter((s) => s.status === "PROMOTED").length} promoted`
        : "—",
    dataSource: r.dataSource,
    analysisCompletedAtMs: r.analysisCompletedAtMs,
    status: r.status,
  }));

  return {
    items,
    total,
    page,
    pageSize,
    hasMore: start + pageSize < total,
  };
}

export async function researchStats(): Promise<ResearchStats> {
  const db = await openDb();
  const tx = db.transaction(STORE_RUNS, "readonly");
  const all = (await idbReq(tx.objectStore(STORE_RUNS).getAll())) as ResearchRun[];
  db.close();

  const now = Date.now();
  const dayStart = new Date();
  dayStart.setUTCHours(0, 0, 0, 0);
  const weekStart = now - 7 * 86_400_000;

  const byDecision: Record<string, number> = {};
  const symbolCount: Record<string, number> = {};
  const gateCount: Record<string, number> = {};

  for (const r of all) {
    byDecision[r.finalDecision] = (byDecision[r.finalDecision] ?? 0) + 1;
    symbolCount[r.symbol] = (symbolCount[r.symbol] ?? 0) + 1;
    for (const g of r.failedGates) {
      gateCount[g] = (gateCount[g] ?? 0) + 1;
    }
  }

  const total = all.length;
  const topSymbols = Object.entries(symbolCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([symbol, count]) => ({ symbol, count }));

  let mostCommonFailedGate: string | null = null;
  let maxG = 0;
  for (const [g, c] of Object.entries(gateCount)) {
    if (c > maxG) {
      maxG = c;
      mostCommonFailedGate = g;
    }
  }

  const pct = (k: string) => (total ? ((byDecision[k] ?? 0) / total) * 100 : 0);

  return {
    total,
    today: all.filter((r) => r.analysisCompletedAtMs >= dayStart.getTime()).length,
    thisWeek: all.filter((r) => r.analysisCompletedAtMs >= weekStart).length,
    byDecision,
    topSymbols,
    mostCommonFailedGate,
    waitPct: pct("WAIT"),
    buyPct: pct("BUY"),
    sellPct: pct("SELL"),
  };
}

export async function saveOutcome(outcome: AnalysisOutcome): Promise<void> {
  const db = await openDb();
  const tx = db.transaction(STORE_OUTCOMES, "readwrite");
  tx.objectStore(STORE_OUTCOMES).put(outcome);
  await txDone(tx);
  db.close();
}

export async function getOutcomesFor(analysisId: string): Promise<AnalysisOutcome[]> {
  const db = await openDb();
  const tx = db.transaction(STORE_OUTCOMES, "readonly");
  const idx = tx.objectStore(STORE_OUTCOMES).index("by_analysis");
  const rows = (await idbReq(idx.getAll(analysisId))) as AnalysisOutcome[];
  db.close();
  return rows.sort((a, b) => a.evaluatedAtMs - b.evaluatedAtMs);
}

/** Export a single run as structured JSON (real data only). */
export function exportRunJson(run: ResearchRun, outcomes: AnalysisOutcome[] = []): string {
  return JSON.stringify(
    {
      analysis_id: run.analysisId,
      symbol: run.symbol,
      status: run.status,
      versions: {
        pipeline: run.pipelineVersion,
        strategy: run.strategyVersion,
        risk: run.riskVersion,
        decision: run.decisionVersion,
      },
      market: run.market,
      brain: run.brain,
      ai_research: run.ai,
      analogs: run.analog,
      strategy: run.strategy,
      strategies: run.strategies,
      risk: run.riskPlan,
      evidence: run.ledger,
      decision: run.decision,
      timeline: run.timeline,
      outcome: outcomes,
      config: run.config,
      analysis_started_at: new Date(run.analysisStartedAtMs).toISOString(),
      analysis_completed_at: new Date(run.analysisCompletedAtMs).toISOString(),
    },
    null,
    2,
  );
}

/** CSV summary of list items. */
export function exportListCsv(items: ResearchListItem[]): string {
  const header = [
    "analysis_id",
    "symbol",
    "decision",
    "eligibility",
    "regime",
    "bullish",
    "bearish",
    "confidence",
    "alignment",
    "risk_reward",
    "completed_at_utc",
  ].join(",");
  const lines = items.map((i) =>
    [
      i.analysisId,
      i.symbol,
      i.finalDecision,
      i.eligibility,
      JSON.stringify(i.regime),
      i.bullishEvidence,
      i.bearishEvidence,
      i.modelConfidence,
      i.alignment,
      i.riskReward ?? "",
      new Date(i.analysisCompletedAtMs).toISOString(),
    ].join(","),
  );
  return [header, ...lines].join("\n");
}
