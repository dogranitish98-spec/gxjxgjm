-- Permanent paper trade journal (no retention cap).
-- Links to research_runs when the trade originated from an analysis.

CREATE TABLE IF NOT EXISTS paper_trades (
  trade_id          TEXT PRIMARY KEY,
  user_id           TEXT,
  analysis_id       TEXT REFERENCES research_runs (analysis_id) ON DELETE SET NULL,
  symbol            TEXT NOT NULL,
  side              TEXT NOT NULL,
  strategy_id       TEXT,
  entry             DOUBLE PRECISION NOT NULL,
  exit              DOUBLE PRECISION NOT NULL,
  quantity          DOUBLE PRECISION NOT NULL,
  net_pnl           DOUBLE PRECISION NOT NULL,
  pnl_pct           DOUBLE PRECISION,
  fees              DOUBLE PRECISION,
  reason            TEXT,
  opened_at_ms      BIGINT NOT NULL,
  closed_at_ms      BIGINT NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_paper_trades_user ON paper_trades (user_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_analysis ON paper_trades (analysis_id);
CREATE INDEX IF NOT EXISTS idx_paper_trades_closed ON paper_trades (closed_at_ms DESC);
CREATE INDEX IF NOT EXISTS idx_paper_trades_symbol ON paper_trades (symbol);
