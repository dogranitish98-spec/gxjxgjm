import { useId, useState } from "react";
import { fetchKlines } from "@/lib/server/market";
import { intervalMs } from "@/lib/synaptick/candles";
import { evaluateStrategy, STRATEGY_DEFS } from "@/lib/synaptick/strategies";
import type { StrategyResult } from "@/lib/synaptick/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Callout,
  Kv,
  MetricCard,
  NativeSelect,
  PageHeader,
  SectionCard,
} from "@/components/chrome";
import { fmt, signed } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

export function LabView() {
  const [symbol, setSymbol] = useState("ETHUSDT");
  const [timeframe, setTimeframe] = useState("15m");
  const [strategyId, setStrategyId] = useState(STRATEGY_DEFS[0]!.id);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<StrategyResult | null>(null);
  const setTournament = useAppStore((s) => s.setTournament);
  const tournament = useAppStore((s) => s.tournament);
  const log = useAppStore((s) => s.log);
  const sid = useId();

  async function run() {
    const def = STRATEGY_DEFS.find((d) => d.id === strategyId);
    if (!def) return;
    setBusy(true);
    setError(null);
    try {
      const k = await fetchKlines({ data: { symbol, interval: timeframe, limit: 500 } });
      const row = evaluateStrategy(k.candles, def, symbol, timeframe, intervalMs(timeframe));
      setResult(row);
      const others = tournament.filter(
        (t) => !(t.id === row.id && t.symbol === row.symbol && t.timeframe === row.timeframe),
      );
      setTournament([row, ...others]);
      log({
        kind: "lab",
        symbol,
        title: `${row.name} ${row.status}`,
        detail: `WF ${row.robustness.walkForwardPct.toFixed(2)}% · OOS ${row.robustness.outOfSamplePct.toFixed(2)}% · ${row.performance.trades} trades`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Backtest failed");
    } finally {
      setBusy(false);
    }
  }

  const def = STRATEGY_DEFS.find((d) => d.id === strategyId);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Lab"
        title="Backtest a rule"
        description="Status is calculated from walk-forward, out-of-sample, costs, and trade count. It is not assigned by hand."
      />

      <Card>
        <CardContent className="grid gap-4 py-5 md:grid-cols-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${sid}-strategy`}>Strategy</Label>
            <NativeSelect
              id={`${sid}-strategy`}
              value={strategyId}
              onChange={(e) => setStrategyId(e.target.value)}
            >
              {STRATEGY_DEFS.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${sid}-market`}>Market</Label>
            <Input
              id={`${sid}-market`}
              className="font-mono uppercase"
              autoComplete="off"
              autoCapitalize="characters"
              spellCheck={false}
              value={symbol}
              onChange={(e) => setSymbol(e.target.value.toUpperCase())}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={`${sid}-tf`}>Timeframe</Label>
            <NativeSelect
              id={`${sid}-tf`}
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value)}
            >
              {["5m", "15m", "1h"].map((tf) => (
                <option key={tf}>{tf}</option>
              ))}
            </NativeSelect>
          </div>
          <div className="flex items-end">
            <Button className="w-full" onClick={() => void run()} disabled={busy} aria-busy={busy}>
              {busy ? "Backtesting…" : "Backtest"}
            </Button>
          </div>
          {def ? (
            <p className="text-xs leading-relaxed text-muted-foreground md:col-span-4">
              Entry · {def.entry}. Exit · {def.exit}. Round-trip cost 0.26%.
            </p>
          ) : null}
        </CardContent>
      </Card>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      {result ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <MetricCard
              label="In-sample"
              value={signed(result.robustness.inSamplePct, 2) + "%"}
            />
            <MetricCard
              label="Out-of-sample"
              value={signed(result.robustness.outOfSamplePct, 2) + "%"}
            />
            <MetricCard
              label="Walk-forward"
              value={signed(result.robustness.walkForwardPct, 2) + "%"}
            />
            <MetricCard
              label="Monte Carlo median"
              value={signed(result.robustness.monteCarloMedianPct, 2) + "%"}
            />
          </div>
          <SectionCard
            title="Overfit check"
            action={
              <Badge tone={result.robustness.verdict === "PASS" ? "pass" : "fail"}>
                {result.robustness.verdict}
              </Badge>
            }
          >
            <div className="grid gap-2 sm:grid-cols-2">
              <Kv k="Parameter sensitivity" v={result.robustness.paramSensitivity} />
              <Kv k="Out-of-sample" v={result.robustness.oos} />
              <Kv k="Walk-forward" v={result.robustness.walkForward} />
              <Kv k="Cost sensitivity" v={result.robustness.costSensitivity} />
              <Kv k="Trade-count minimum" v={result.robustness.tradeCount} />
              <Kv k="Status" v={result.status} />
              {result.rejection ? <Kv k="Rejection" v={result.rejection} /> : null}
            </div>
          </SectionCard>
          <SectionCard title="Performance">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Kv k="Trades" v={String(result.performance.trades)} />
              <Kv k="Win rate" v={`${fmt(result.performance.winRatePct, 1)}%`} />
              <Kv k="Profit factor" v={fmt(result.performance.profitFactor, 2)} />
              <Kv k="Expectancy" v={`${signed(result.performance.expectancyPct, 2)}%`} />
              <Kv k="Max drawdown" v={`${fmt(result.performance.maxDrawdownPct, 1)}%`} />
              <Kv
                k="Sharpe"
                v={result.performance.sharpe == null ? "n/a" : fmt(result.performance.sharpe, 2)}
              />
              <Kv
                k="Sortino"
                v={result.performance.sortino == null ? "n/a" : fmt(result.performance.sortino, 2)}
              />
              <Kv
                k="CAGR"
                v={
                  result.performance.cagrPct == null
                    ? "n/a"
                    : `${fmt(result.performance.cagrPct, 1)}%`
                }
              />
            </div>
          </SectionCard>
        </>
      ) : null}
    </div>
  );
}
