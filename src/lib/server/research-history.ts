/**
 * Database-backed research history + paper trade permanent journal.
 * Uses existing getSql() (PGLite / Neon). Does not change trading logic.
 */
import { createServerFn } from "@tanstack/react-start";
import { getSql } from "@/lib/db";

const DEV_USER = "dev-user";

async function resolveUserId(): Promise<string> {
  try {
    const { requireUserId } = await import("@/lib/auth/verify.server");
    return await requireUserId();
  } catch {
    // Auth off / no session: device-scoped dev user (matches app default).
    return DEV_USER;
  }
}

export type SaveResearchPayload = {
  analysisId: string;
  userId?: string | null;
  symbol: string;
  status: string;
  dataSource: string;
  finalDecision: string;
  eligibility: string | null;
  bullishEvidence: number | null;
  bearishEvidence: number | null;
  modelConfidence: number | null;
  confidenceLabel: string | null;
  regime: string | null;
  alignment: number | null;
  netEdge: number | null;
  riskReward: number | null;
  failedGates: string[];
  passedGates: string[];
  pipelineVersion: string;
  strategyVersion: string;
  aiModel: string | null;
  configJson: string;
  snapshotJson: string;
  analysisStartedAtMs: number;
  analysisCompletedAtMs: number;
};

export const saveResearchRunDb = createServerFn({ method: "POST" })
  .validator((data: SaveResearchPayload) => data)
  .handler(async ({ data }) => {
    const userId = data.userId ?? (await resolveUserId());
    const sql = await getSql();
    try {
      await sql.query(
        `INSERT INTO research_runs (
          analysis_id, user_id, symbol, status, data_source, final_decision, eligibility,
          bullish_evidence, bearish_evidence, model_confidence, confidence_label,
          regime, alignment, net_edge, risk_reward, failed_gates, passed_gates,
          pipeline_version, strategy_version, ai_model, config_json, snapshot_json,
          analysis_started_at, analysis_completed_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
          to_timestamp($23/1000.0), to_timestamp($24/1000.0)
        )
        ON CONFLICT (analysis_id) DO NOTHING`,
        [
          data.analysisId,
          userId,
          data.symbol,
          data.status,
          data.dataSource,
          data.finalDecision,
          data.eligibility,
          data.bullishEvidence,
          data.bearishEvidence,
          data.modelConfidence,
          data.confidenceLabel,
          data.regime,
          data.alignment,
          data.netEdge,
          data.riskReward,
          JSON.stringify(data.failedGates),
          JSON.stringify(data.passedGates),
          data.pipelineVersion,
          data.strategyVersion,
          data.aiModel,
          data.configJson,
          data.snapshotJson,
          data.analysisStartedAtMs,
          data.analysisCompletedAtMs,
        ],
      );
      return { ok: true as const, analysisId: data.analysisId };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "save failed";
      console.error("[research-history] saveResearchRunDb:", msg);
      return { ok: false as const, error: msg };
    }
  });

export type ListResearchInput = {
  symbol?: string;
  decision?: string;
  query?: string;
  page?: number;
  pageSize?: number;
};

export const listResearchRunsDb = createServerFn({ method: "POST" })
  .validator((data: ListResearchInput) => data)
  .handler(async ({ data }) => {
    const userId = await resolveUserId();
    const page = Math.max(1, data.page ?? 1);
    const pageSize = Math.min(50, Math.max(1, data.pageSize ?? 25));
    const offset = (page - 1) * pageSize;
    const sql = await getSql();

    const params: unknown[] = [userId];
    let where = `user_id = $1`;
    if (data.symbol) {
      params.push(`%${data.symbol.toUpperCase()}%`);
      where += ` AND symbol LIKE $${params.length}`;
    }
    if (data.decision && data.decision !== "ALL") {
      params.push(data.decision);
      where += ` AND final_decision = $${params.length}`;
    }
    if (data.query) {
      params.push(`%${data.query}%`);
      where += ` AND (symbol ILIKE $${params.length} OR analysis_id ILIKE $${params.length} OR regime ILIKE $${params.length} OR failed_gates ILIKE $${params.length})`;
    }

    const countRows = await sql.query<{ c: number }>(
      `SELECT count(*)::int AS c FROM research_runs WHERE ${where}`,
      params,
    );
    const total = countRows[0]?.c ?? 0;

    params.push(pageSize, offset);
    const rows = await sql.query<Record<string, unknown>>(
      `SELECT analysis_id, symbol, final_decision, eligibility, regime,
              bullish_evidence, bearish_evidence, model_confidence, alignment,
              risk_reward, failed_gates, data_source, status,
              extract(epoch from analysis_completed_at)*1000 AS completed_ms
       FROM research_runs
       WHERE ${where}
       ORDER BY analysis_completed_at DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params,
    );

    return {
      items: rows.map((r) => ({
        analysisId: String(r.analysis_id),
        symbol: String(r.symbol),
        finalDecision: String(r.final_decision),
        eligibility: String(r.eligibility ?? "FAIL"),
        regime: String(r.regime ?? ""),
        bullishEvidence: Number(r.bullish_evidence ?? 0),
        bearishEvidence: Number(r.bearish_evidence ?? 0),
        modelConfidence: Number(r.model_confidence ?? 0),
        alignment: Number(r.alignment ?? 0),
        riskReward: r.risk_reward != null ? Number(r.risk_reward) : null,
        failedGates: safeJsonArray(r.failed_gates),
        strategySummary: "—",
        dataSource: String(r.data_source ?? ""),
        analysisCompletedAtMs: Number(r.completed_ms ?? 0),
        status: String(r.status ?? "COMPLETED"),
      })),
      total,
      page,
      pageSize,
      hasMore: offset + pageSize < total,
    };
  });

export const getResearchRunDb = createServerFn({ method: "POST" })
  .validator((data: { analysisId: string }) => data)
  .handler(async ({ data }) => {
    const userId = await resolveUserId();
    const sql = await getSql();
    const rows = await sql.query<{ snapshot_json: string; user_id: string }>(
      `SELECT snapshot_json, user_id FROM research_runs
       WHERE analysis_id = $1 AND user_id = $2`,
      [data.analysisId, userId],
    );
    const row = rows[0];
    if (!row) return { ok: false as const, error: "not_found" };
    try {
      return { ok: true as const, run: JSON.parse(row.snapshot_json) };
    } catch {
      return { ok: false as const, error: "corrupt_snapshot" };
    }
  });

export type SavePaperTradePayload = {
  tradeId: string;
  analysisId?: string | null;
  symbol: string;
  side: string;
  strategyId?: string;
  entry: number;
  exit: number;
  quantity: number;
  netPnl: number;
  pnlPct: number;
  fees: number;
  reason: string;
  openedAtMs: number;
  closedAtMs: number;
};

export const savePaperTradeDb = createServerFn({ method: "POST" })
  .validator((data: SavePaperTradePayload) => data)
  .handler(async ({ data }) => {
    const userId = await resolveUserId();
    const sql = await getSql();
    try {
      await sql.query(
        `INSERT INTO paper_trades (
          trade_id, user_id, analysis_id, symbol, side, strategy_id,
          entry, exit, quantity, net_pnl, pnl_pct, fees, reason,
          opened_at_ms, closed_at_ms
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)
        ON CONFLICT (trade_id) DO NOTHING`,
        [
          data.tradeId,
          userId,
          data.analysisId ?? null,
          data.symbol,
          data.side,
          data.strategyId ?? null,
          data.entry,
          data.exit,
          data.quantity,
          data.netPnl,
          data.pnlPct,
          data.fees,
          data.reason,
          data.openedAtMs,
          data.closedAtMs,
        ],
      );
      return { ok: true as const };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "save failed";
      console.error("[research-history] savePaperTradeDb:", msg);
      return { ok: false as const, error: msg };
    }
  });

export const saveOutcomeDb = createServerFn({ method: "POST" })
  .validator(
    (data: {
      id: string;
      analysisId: string;
      horizonLabel?: string;
      horizonBars?: number;
      priceAtEval?: number;
      mfePct?: number;
      maePct?: number;
      returnPct?: number;
      directionalOk?: boolean | null;
      stopHit?: boolean | null;
      targetHit?: boolean | null;
      evaluatedAtMs: number;
    }) => data,
  )
  .handler(async ({ data }) => {
    const userId = await resolveUserId();
    const sql = await getSql();
    // Ensure the analysis belongs to this user before inserting outcome
    const own = await sql.query(
      `SELECT 1 FROM research_runs WHERE analysis_id = $1 AND user_id = $2`,
      [data.analysisId, userId],
    );
    if (!own.length) return { ok: false as const, error: "not_found" };
    await sql.query(
      `INSERT INTO analysis_outcomes (
        id, analysis_id, horizon_bars, horizon_label, price_at_eval,
        mfe_pct, mae_pct, return_pct, directional_ok, stop_hit, target_hit, evaluated_at
      ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11, to_timestamp($12/1000.0))
      ON CONFLICT (id) DO NOTHING`,
      [
        data.id,
        data.analysisId,
        data.horizonBars ?? null,
        data.horizonLabel ?? null,
        data.priceAtEval ?? null,
        data.mfePct ?? null,
        data.maePct ?? null,
        data.returnPct ?? null,
        data.directionalOk ?? null,
        data.stopHit ?? null,
        data.targetHit ?? null,
        data.evaluatedAtMs,
      ],
    );
    return { ok: true as const };
  });

function safeJsonArray(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String);
  if (typeof v === "string") {
    try {
      const p = JSON.parse(v);
      return Array.isArray(p) ? p.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}
