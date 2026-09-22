import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Callout,
  EmptyState,
  GateList,
  Kv,
  Metric,
  PageHeader,
  SectionCard,
} from "@/components/chrome";
import { cn, fmt, money, signed } from "@/lib/utils";
import {
  exportRunJson,
  getOutcomesFor,
  getResearchRun,
} from "@/lib/synaptick/research-store";
import type { AnalysisOutcome, ResearchRun } from "@/lib/synaptick/research-types";

export function HistoryDetailView({ analysisId }: { analysisId: string }) {
  const [run, setRun] = useState<ResearchRun | null>(null);
  const [outcomes, setOutcomes] = useState<AnalysisOutcome[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        let r = null as Awaited<ReturnType<typeof getResearchRun>>;
        try {
          const { getResearchRunDb } = await import("@/lib/server/research-history");
          const dbRes = await getResearchRunDb({ data: { analysisId } });
          if (dbRes.ok) r = dbRes.run as NonNullable<typeof r>;
        } catch {
          /* fall through to IndexedDB */
        }
        if (!r) r = await getResearchRun(analysisId);
        const o = await getOutcomesFor(analysisId);
        if (cancelled) return;
        if (!r) {
          setError("Analysis not found in research memory.");
          setRun(null);
        } else {
          setRun(r);
          setOutcomes(o);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Load failed");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [analysisId]);

  function downloadJson() {
    if (!run) return;
    const json = exportRunJson(run, outcomes);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${run.analysisId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (busy) {
    return (
      <div className="flex flex-col gap-4" aria-busy aria-label="Loading analysis">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex flex-col gap-4">
        <Link to="/history" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Back to history
        </Link>
        <EmptyState title="Not found" description={error ?? "Not available for this analysis."} />
      </div>
    );
  }

  const when = new Date(run.analysisCompletedAtMs).toISOString().replace("T", " ").slice(0, 19);
  const final = run.finalDecision;
  const finalTone =
    final === "BUY" ? "text-buy" : final === "SELL" ? "text-sell" : "text-wait";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Historical snapshot · read-only"
        title={run.symbol}
        description={
          <>
            {when} UTC · {run.analysisId}
            <span className="mt-1 block text-xs">
              pipeline {run.pipelineVersion} · strategy {run.strategyVersion} · decision{" "}
              {run.decisionVersion}
            </span>
          </>
        }
        actions={
          <div className="flex flex-col items-start gap-2 md:items-end">
            <p className={cn("text-4xl font-medium tracking-tight md:text-5xl", finalTone)}>{final}</p>
            <Badge tone={run.eligibility === "PASS" ? "pass" : "fail"}>
              Eligibility {run.eligibility}
            </Badge>
            <Button variant="secondary" onClick={downloadJson}>
              Export JSON
            </Button>
          </div>
        }
      />

      <p>
        <Link to="/history" className="text-sm text-muted-foreground underline-offset-4 hover:underline">
          Back to history
        </Link>
      </p>

      <Callout>
        This is what Synaptick knew at that time. The snapshot is immutable. A later analysis of the
        same symbol does not rewrite this record.
      </Callout>

      <SectionCard title="Research timeline">
        <ol className="flex flex-col gap-2">
          {run.timeline.map((t, i) => (
            <li key={i} className="flex gap-3 text-sm">
              <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
                {new Date(t.atMs).toISOString().slice(11, 19)}
              </span>
              <span>{t.label}</span>
            </li>
          ))}
        </ol>
      </SectionCard>

      <SectionCard title={final === "WAIT" ? "Why WAIT" : `Why ${final}`}>
        <GateList items={run.decision.items} />
        <p className="mt-3 text-xs text-muted-foreground">
          {run.decision.passedCount} passed · {run.decision.failedCount} failed ·{" "}
          {run.decision.hardFailedCount} hard fails
        </p>
      </SectionCard>

      <SectionCard title="Market snapshot">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Metric label="Price" value={fmt(run.market.price, run.market.price > 100 ? 2 : 4)} />
          <Metric label="Source" value={run.market.source} />
          <Metric label="Regime" value={run.regime} />
          <Metric label="Alignment" value={fmt(run.alignment, 0)} />
          <Metric label="RSI" value={fmt(run.market.rsi, 1)} />
          <Metric label="Data quality" value={run.market.quality.ok ? "OK" : "REJECTED"} />
          <Metric label="Look-ahead" value={run.market.integrity.lookAhead} />
          <Metric
            label="Bars"
            value={Object.entries(run.market.barsByTf)
              .map(([k, v]) => `${k}=${v}`)
              .join(" ")}
          />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{run.market.integrity.note}</p>
      </SectionCard>

      <SectionCard title="Multi-timeframe">
        <div className="flex flex-col">
          {run.brain.decisions.map((d) => (
            <div
              key={d.horizon}
              className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-3 text-sm last:border-0"
            >
              <span className="font-mono text-xs uppercase">{d.horizon}</span>
              <Badge tone={d.signal === "BUY" ? "pass" : d.signal === "SELL" ? "fail" : "wait"}>
                {d.signal}
              </Badge>
              <span className="font-mono text-xs tabular-nums">conf {fmt(d.confidence, 0)}</span>
              <span className="font-mono text-xs tabular-nums">edge {signed(d.netEdge, 2)}%</span>
              <span className="font-mono text-xs tabular-nums">R:R {fmt(d.riskReward, 2)}</span>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{run.brain.note}</p>
      </SectionCard>

      <SectionCard title="AI research panel">
        {run.ai ? (
          <div className="flex flex-col gap-2 text-sm">
            <Kv k="Technical" v={fmt(run.ai.technical, 2)} />
            <Kv k="Sentiment" v={fmt(run.ai.sentiment, 2)} />
            <Kv k="News" v={fmt(run.ai.news, 2)} />
            <Kv k="Fundamental" v={fmt(run.ai.fundamental, 2)} />
            <p className="text-xs text-muted-foreground">Bull: {run.ai.bull}</p>
            <p className="text-xs text-muted-foreground">Bear: {run.ai.bear}</p>
            <p className="text-xs text-muted-foreground">Risk: {run.ai.risk}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Evidence only — did not override the deterministic gate
            </p>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">
            Not available for this analysis. AI was not run; treated as 0, not as a skip.
          </p>
        )}
      </SectionCard>

      <SectionCard title="Historical analogs">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Metric
            label="Status"
            value={run.analog.status ?? (run.analog.weak ? "INSUFFICIENT DATA" : "—")}
          />
          <Metric label="Qualified" value={String(run.analog.qualified)} />
          <Metric label="Favorable" value={`${fmt(run.analog.favorablePct, 1)}%`} />
          <Metric label="Median return" value={`${signed(run.analog.medianReturn, 2)}%`} />
          <Metric label="Median adverse" value={`${signed(run.analog.medianAdverse, 2)}%`} />
          <Metric label="Threshold" value={`${run.analog.threshold}% similar`} />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">{run.analog.sampleNote}</p>
      </SectionCard>

      <SectionCard title="Strategy">
        {run.strategy ? (
          <div className="flex flex-col gap-2">
            <Kv k="Name" v={run.strategy.name} />
            <Kv k="Status" v={run.strategy.status} />
            <Kv k="Trades" v={String(run.strategy.performance.trades)} />
            <Kv k="Win rate" v={`${fmt(run.strategy.performance.winRatePct, 1)}%`} />
            <Kv k="Net" v={`${signed(run.strategy.performance.totalNetPct, 2)}%`} />
            <Kv k="OOS" v={run.strategy.robustness.oos} />
            <Kv k="Walk-forward" v={run.strategy.robustness.walkForward} />
            <Kv k="Cost sens." v={run.strategy.robustness.costSensitivity} />
            <Kv k="Param sens." v={run.strategy.robustness.paramSensitivity} />
            {run.strategy.rejectionReasons?.length ? (
              <p className="text-xs text-sell">{run.strategy.rejectionReasons.join(" · ")}</p>
            ) : null}
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not available for this analysis.</p>
        )}
      </SectionCard>

      <SectionCard title="Evidence ledger">
        <div className="flex flex-col gap-1">
          {run.ledger.rows.map((row) => (
            <Kv
              key={row.id}
              k={row.label}
              v={signed(row.value, 2)}
              tone={row.value >= 0 ? "buy" : "sell"}
            />
          ))}
          <div className="mt-2 flex justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-mono tabular-nums">{signed(run.ledger.total, 2)}</span>
          </div>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">
          Ledger is evidence only. It does not override the final deterministic gate.
        </p>
      </SectionCard>

      <SectionCard title="Risk / trade plan">
        {run.riskPlan ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Metric label="Valid" value={run.riskPlan.valid ? "yes" : "no"} />
            <Metric label="Side" value={run.riskPlan.side} />
            <Metric label="Size" value={run.riskPlan.valid ? fmt(run.riskPlan.quantity, 4) : "N/A"} />
            <Metric label="Net R:R" value={run.riskPlan.valid ? fmt(run.riskPlan.netRR, 2) : "N/A"} />
            <Metric
              label="Max loss"
              value={run.riskPlan.valid ? money(-run.riskPlan.expectedLoss) : "N/A"}
            />
            <Metric
              label="Potential net"
              value={run.riskPlan.valid ? money(run.riskPlan.expectedGain) : "N/A"}
            />
            <Metric label="Portfolio after" value={`${fmt(run.riskPlan.portfolioAfter, 2)}%`} />
            <Metric label="Cap" value={`${run.riskPlan.portfolioCap}%`} />
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">Not available for this analysis.</p>
        )}
        {run.riskPlan?.invalidReason ? (
          <p className="mt-2 text-xs text-sell">{run.riskPlan.invalidReason}</p>
        ) : null}
      </SectionCard>

      <SectionCard title="Later outcome">
        {outcomes.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No outcome evaluation recorded yet. Outcomes are separate records and never rewrite this
            analysis.
          </p>
        ) : (
          <div className="flex flex-col">
            {outcomes.map((o) => (
              <div key={o.id} className="border-b border-border py-3 text-sm last:border-0">
                <p className="font-mono text-xs text-muted-foreground">
                  {o.horizonLabel} · {new Date(o.evaluatedAtMs).toISOString().slice(0, 19)} UTC
                </p>
                <p>
                  Return {signed(o.returnPct, 2)}% · MFE {signed(o.mfePct, 2)}% · MAE{" "}
                  {signed(o.maePct, 2)}%
                </p>
              </div>
            ))}
          </div>
        )}
      </SectionCard>

      <p className="text-xs text-muted-foreground">
        Research report — not personalized investment advice. Config at time of run: conf ≥{" "}
        {run.config.minConfidence}, edge ≥ {run.config.minNetEdge}, risk {run.config.riskPct}%.
      </p>
    </div>
  );
}
