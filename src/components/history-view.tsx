import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Callout, Chip, EmptyState, Metric, PageHeader } from "@/components/chrome";
import { cn, fmt } from "@/lib/utils";
import {
  exportListCsv,
  listResearchRuns,
  researchStats,
} from "@/lib/synaptick/research-store";
import type {
  ResearchListItem,
  ResearchPage,
  ResearchStats,
} from "@/lib/synaptick/research-types";
import type { Decision as Dec } from "@/lib/synaptick/types";

const DECISIONS: Array<Dec | "ALL"> = ["ALL", "WAIT", "BUY", "SELL"];

function decisionTone(d: string): "pass" | "fail" | "wait" | "neutral" {
  if (d === "BUY") return "pass";
  if (d === "SELL") return "fail";
  if (d === "WAIT") return "wait";
  return "neutral";
}

export function HistoryView() {
  const [page, setPage] = useState<ResearchPage | null>(null);
  const [stats, setStats] = useState<ResearchStats | null>(null);
  const [query, setQuery] = useState("");
  const [decision, setDecision] = useState<Dec | "ALL">("ALL");
  const [pageNum, setPageNum] = useState(1);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      let p: ResearchPage | null = null;
      try {
        const { listResearchRunsDb } = await import("@/lib/server/research-history");
        p = (await listResearchRunsDb({
          data: {
            query: query.trim() || undefined,
            decision: decision === "ALL" ? undefined : decision,
            page: pageNum,
            pageSize: 25,
          },
        })) as ResearchPage;
      } catch {
        p = null;
      }
      if (!p || (p.total === 0 && pageNum === 1)) {
        const local = await listResearchRuns({
          query: query.trim() || undefined,
          decision,
          page: pageNum,
          pageSize: 25,
        });
        if (!p || local.total > p.total) p = local;
      }
      const s = await researchStats();
      setPage(p);
      setStats(s);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load research history");
    } finally {
      setBusy(false);
    }
  }, [query, decision, pageNum]);

  useEffect(() => {
    void load();
  }, [load]);

  function downloadCsv() {
    if (!page?.items.length) return;
    const csv = exportListCsv(page.items);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `synaptick-research-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="History"
        title="Saved analyses"
        description="Immutable snapshots of every run — data, evidence, gates, and decision. Later markets do not rewrite these records."
        actions={
          <>
            <Button variant="secondary" onClick={() => void load()} disabled={busy}>
              Refresh
            </Button>
            <Button variant="secondary" onClick={downloadCsv} disabled={!page?.items.length}>
              Export CSV
            </Button>
          </>
        }
      />

      {stats ? (
        <div className="grid grid-cols-2 gap-3 rounded-xl border border-border bg-card px-5 py-4 sm:grid-cols-3 lg:grid-cols-6">
          <Metric label="Total" value={String(stats.total)} />
          <Metric label="Today" value={String(stats.today)} />
          <Metric label="This week" value={String(stats.thisWeek)} />
          <Metric label="WAIT" value={`${fmt(stats.waitPct, 0)}%`} />
          <Metric label="BUY" value={`${fmt(stats.buyPct, 0)}%`} />
          <Metric label="SELL" value={`${fmt(stats.sellPct, 0)}%`} />
        </div>
      ) : null}

      {stats?.mostCommonFailedGate ? (
        <p className="text-xs text-muted-foreground">
          Most common failed gate: {stats.mostCommonFailedGate}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Input
          type="search"
          value={query}
          onChange={(e) => {
            setPageNum(1);
            setQuery(e.target.value);
          }}
          placeholder="Search symbol, analysis id, reason…"
          className="font-mono sm:max-w-xs"
          aria-label="Search research history"
          enterKeyHint="search"
        />
        <div role="group" aria-label="Filter by decision" className="flex flex-wrap gap-2">
          {DECISIONS.map((d) => (
            <Chip
              key={d}
              selected={decision === d}
              onClick={() => {
                setPageNum(1);
                setDecision(d);
              }}
            >
              {d}
            </Chip>
          ))}
        </div>
      </div>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      {busy && !page ? (
        <div className="grid gap-3" aria-hidden>
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
      ) : null}

      {!busy && page && page.items.length === 0 ? (
        <EmptyState
          title="No research runs yet"
          description="Analyze a market on the desk. Every completed run is saved automatically."
          action={
            <Button asChild>
              <Link to="/" search={{ symbol: undefined }}>
                Open desk
              </Link>
            </Button>
          }
        />
      ) : null}

      <ul className="flex flex-col gap-3">
        {page?.items.map((item) => (
          <li key={item.analysisId}>
            <HistoryCard item={item} />
          </li>
        ))}
      </ul>

      {page && page.total > page.pageSize ? (
        <nav className="flex items-center justify-between text-sm" aria-label="History pages">
          <span className="text-muted-foreground">
            {page.total} runs · page {page.page}
          </span>
          <div className="flex gap-2">
            <Button
              variant="secondary"
              disabled={pageNum <= 1}
              onClick={() => setPageNum((n) => Math.max(1, n - 1))}
            >
              Previous
            </Button>
            <Button variant="secondary" disabled={!page.hasMore} onClick={() => setPageNum((n) => n + 1)}>
              Next
            </Button>
          </div>
        </nav>
      ) : null}
    </div>
  );
}

function HistoryCard({ item }: { item: ResearchListItem }) {
  const when = new Date(item.analysisCompletedAtMs).toISOString().replace("T", " ").slice(0, 19);
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 pt-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-2">
            <span className="font-mono text-base">{item.symbol}</span>
            <span className="text-xs text-muted-foreground">{when} UTC</span>
            <Badge tone={item.dataSource === "demo" ? "wait" : "neutral"}>{item.dataSource}</Badge>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span
              className={cn(
                "text-2xl font-medium tracking-tight",
                item.finalDecision === "BUY"
                  ? "text-buy"
                  : item.finalDecision === "SELL"
                    ? "text-sell"
                    : "text-wait",
              )}
            >
              {item.finalDecision}
            </span>
            <Badge tone={decisionTone(item.finalDecision)}>{item.eligibility}</Badge>
            <span className="text-xs text-muted-foreground">{item.regime}</span>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
            <span>
              Bull {fmt(item.bullishEvidence, 0)}
              <span className="text-muted-foreground"> / 100</span>
            </span>
            <span>
              Align {fmt(item.alignment, 0)}
              <span className="text-muted-foreground">%</span>
            </span>
            <span>
              Conf {fmt(item.modelConfidence, 0)}
              <span className="text-muted-foreground">%</span>
            </span>
            <span>R:R {item.riskReward != null ? fmt(item.riskReward, 2) : "N/A"}</span>
          </div>
          {item.failedGates.length > 0 ? (
            <p className="mt-2 text-xs text-sell">
              Why: {item.failedGates.slice(0, 2).join(" · ")}
              {item.failedGates.length > 2 ? "…" : ""}
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">{item.strategySummary}</p>
          )}
          <p className="mt-1 font-mono text-[11px] text-muted-foreground">{item.analysisId}</p>
        </div>
        <Button asChild variant="secondary" className="shrink-0">
          <Link to="/history/$analysisId" params={{ analysisId: item.analysisId }}>
            View analysis
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
