-- Synaptick Research History schema
-- Applied when DATABASE_URL (Neon) or PGLite is active.
-- Client-side IndexedDB is the always-on store when DB is unavailable.

CREATE TABLE IF NOT EXISTS research_runs (
  analysis_id       TEXT PRIMARY KEY,
  user_id           TEXT,
  symbol            TEXT NOT NULL,
  status            TEXT NOT NULL DEFAULT 'COMPLETED',
  data_source       TEXT NOT NULL DEFAULT 'unknown',
  final_decision    TEXT NOT NULL,
  eligibility       TEXT,
  bullish_evidence  DOUBLE PRECISION,
  bearish_evidence  DOUBLE PRECISION,
  model_confidence  DOUBLE PRECISION,
  confidence_label  TEXT,
  regime            TEXT,
  alignment         DOUBLE PRECISION,
  net_edge          DOUBLE PRECISION,
  risk_reward       DOUBLE PRECISION,
  failed_gates      TEXT,
  passed_gates      TEXT,
  decision_reasons  TEXT,
  pipeline_version  TEXT NOT NULL DEFAULT '0.2.0',
  app_version       TEXT,
  strategy_version  TEXT,
  ai_model          TEXT,
  config_json       TEXT,
  snapshot_json     TEXT NOT NULL,
  analysis_started_at  TIMESTAMPTZ NOT NULL,
  analysis_completed_at TIMESTAMPTZ NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_research_runs_symbol ON research_runs (symbol);
CREATE INDEX IF NOT EXISTS idx_research_runs_decision ON research_runs (final_decision);
CREATE INDEX IF NOT EXISTS idx_research_runs_completed ON research_runs (analysis_completed_at DESC);
CREATE INDEX IF NOT EXISTS idx_research_runs_user ON research_runs (user_id);

CREATE TABLE IF NOT EXISTS analysis_outcomes (
  id                TEXT PRIMARY KEY,
  analysis_id       TEXT NOT NULL REFERENCES research_runs (analysis_id) ON DELETE CASCADE,
  horizon_bars      INTEGER,
  horizon_label     TEXT,
  price_at_eval     DOUBLE PRECISION,
  mfe_pct           DOUBLE PRECISION,
  mae_pct           DOUBLE PRECISION,
  return_pct        DOUBLE PRECISION,
  directional_ok    BOOLEAN,
  stop_hit          BOOLEAN,
  target_hit        BOOLEAN,
  evaluated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_outcomes_analysis ON analysis_outcomes (analysis_id);

CREATE TABLE IF NOT EXISTS paper_trade_links (
  trade_id          TEXT PRIMARY KEY,
  analysis_id       TEXT REFERENCES research_runs (analysis_id) ON DELETE SET NULL,
  symbol            TEXT NOT NULL,
  side              TEXT NOT NULL,
  entry             DOUBLE PRECISION,
  exit              DOUBLE PRECISION,
  quantity          DOUBLE PRECISION,
  net_pnl           DOUBLE PRECISION,
  opened_at_ms      BIGINT,
  closed_at_ms      BIGINT,
  reason            TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paper_links_analysis ON paper_trade_links (analysis_id);
