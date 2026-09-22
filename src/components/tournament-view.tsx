import { useMemo, useState } from "react";
import { fetchKlines } from "@/lib/server/market";
import { intervalMs } from "@/lib/synaptick/candles";
import { evaluateStrategy, STRATEGY_DEFS } from "@/lib/synaptick/strategies";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState, PageHeader } from "@/components/chrome";
import { fmt, signed } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

export function TournamentView() {
  const rows = useAppStore((s) => s.tournament);
  const setTournament = useAppStore((s) => s.setTournament);
  const log = useAppStore((s) => s.log);
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const counts = useMemo(() => {
    const promoted = rows.filter((r) => r.status === "PROMOTED").length;
    const watch = rows.filter((r) => r.status === "WATCH").length;
    const demoted = rows.filter((r) => r.status === "DEMOTED").length;
    return { promoted, watch, demoted, total: rows.length };
  }, [rows]);

  async function runAll() {
    setBusy(true);
    try {
      const k = await fetchKlines({ data: { symbol: "ETHUSDT", interval: "15m", limit: 500 } });
      const next = STRATEGY_DEFS.map((def) =>
        evaluateStrategy(k.candles, def, "ETHUSDT", "15m", intervalMs("15m")),
      );
      next.sort((a, b) => b.score - a.score);
      setTournament(next);
      log({
        kind: "lab",
        symbol: "ETHUSDT",
        title: "Tournament ETH 15m",
        detail: next.map((r) => `${r.name} ${r.status}`).join(" · "),
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Tournament"
        title="Compare strategies"
        description="Status is calculated: ≥30 trades, positive OOS, positive walk-forward, cost and parameter robustness, and composite ≥ 0.18."
        actions={
          <Button onClick={() => void runAll()} disabled={busy} aria-busy={busy}>
            {busy ? "Running…" : "Run ETH 15m field"}
          </Button>
        }
      />

      {rows.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <Badge tone="pass">Promoted {counts.promoted}</Badge>
          <Badge tone="wait">Watch {counts.watch}</Badge>
          <Badge tone="fail">Demoted {counts.demoted}</Badge>
          <span className="text-muted-foreground">of {counts.total}</span>
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title="No field yet"
          description="Run the ETH 15m field, or backtest a rule in the lab. Results persist on this device."
          action={
            <Button onClick={() => void runAll()} disabled={busy}>
              Run ETH 15m field
            </Button>
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border">
          <div
            className="hidden border-b border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground lg:grid lg:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,0.7fr))_auto] lg:gap-2"
            aria-hidden
          >
            <span>Strategy</span>
            <span>Score</span>
            <span>OOS</span>
            <span>Walk-forward</span>
            <span>Cost</span>
            <span>Robust</span>
            <span>Trades</span>
            <span className="sr-only">Details</span>
          </div>
          <ul>
            {rows.map((r) => {
              const key = `${r.id}-${r.symbol}-${r.timeframe}`;
              const open = expanded === key;
              return (
                <li key={key} className="border-b border-border last:border-0">
                  <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-4 py-3 lg:grid-cols-[minmax(0,1.6fr)_repeat(6,minmax(0,0.7fr))_auto] lg:gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{r.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {r.symbol} · {r.timeframe}
                      </p>
                      <div className="mt-1.5">
                        <Badge
                          tone={
                            r.status === "PROMOTED" ? "pass" : r.status === "DEMOTED" ? "fail" : "wait"
                          }
                        >
                          {r.status}
                        </Badge>
                      </div>
                    </div>
                    <p className="font-mono text-sm tabular-nums lg:text-xs">
                      <span className="lg:hidden">Score </span>
                      {fmt(r.score, 0)}
                    </p>
                    <p className="hidden font-mono text-xs uppercase lg:block">{r.robustness.oos}</p>
                    <p className="hidden font-mono text-xs tabular-nums lg:block">
                      {signed(r.robustness.walkForwardPct, 2)}%
                    </p>
                    <p className="hidden font-mono text-xs uppercase lg:block">
                      {r.robustness.costSensitivity}
                    </p>
                    <p className="hidden font-mono text-xs uppercase lg:block">
                      {r.robustness.paramSensitivity}
                    </p>
                    <p className="hidden font-mono text-xs tabular-nums lg:block">
                      {r.performance.trades}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="justify-self-end"
                      aria-expanded={open}
                      onClick={() => setExpanded(open ? null : key)}
                    >
                      {open ? "Hide" : "Details"}
                    </Button>
                  </div>
                  {open ? (
                    <Card className="mx-4 mb-4 border-0 bg-muted/40 shadow-none">
                      <CardContent className="grid gap-2 py-4 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-3">
                        <span>In-sample: {signed(r.robustness.inSamplePct, 2)}%</span>
                        <span>OOS net: {signed(r.robustness.outOfSamplePct, 2)}%</span>
                        <span>WF net: {signed(r.robustness.walkForwardPct, 2)}%</span>
                        <span>
                          MC median: {signed(r.robustness.monteCarloMedianPct, 2)}% (
                          {r.robustness.monteCarlo?.label ?? "simulation"})
                        </span>
                        {r.robustness.monteCarlo ? (
                          <span>
                            MC p5…p95: {signed(r.robustness.monteCarlo.p5, 1)} …{" "}
                            {signed(r.robustness.monteCarlo.p95, 1)}
                          </span>
                        ) : null}
                        <span>Verdict: {r.robustness.verdict}</span>
                        {r.rejectionReasons && r.rejectionReasons.length > 0 ? (
                          <p className="text-sell sm:col-span-2 lg:col-span-3">
                            {r.status}: {r.rejectionReasons.join(" · ")}
                          </p>
                        ) : null}
                      </CardContent>
                    </Card>
                  ) : null}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
