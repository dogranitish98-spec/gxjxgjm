import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Area, AreaChart, ResponsiveContainer } from "recharts";
import { toast } from "sonner";
import { fetchKlines } from "@/lib/server/market";
import { aiStatus, runAiResearch } from "@/lib/server/ai-research";
import { analyzeFrames, type Analysis } from "@/lib/synaptick/pipeline";
import { buildLedger } from "@/lib/synaptick/evidence";
import { openPosition } from "@/lib/synaptick/paper";
import { DEFAULT_LIMITS } from "@/lib/synaptick/risk";
import { Badge } from "@/components/ui/badge";
import { VerdictBanner } from "@/components/ui/verdict-banner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Callout,
  Chip,
  Disclosure,
  EmptyState,
  GateList,
  Kv,
  Metric,
  PageHeader,
  SectionCard,
} from "@/components/chrome";
import { fmt, money, signed } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import type { AiEvidence } from "@/lib/synaptick/evidence";
import { persistAnalysis } from "@/lib/synaptick/research-persist";

const PAIRS = ["BTCUSDT", "ETHUSDT", "SOLUSDT", "BNBUSDT", "XRPUSDT", "LINKUSDT"];

export function DeskView({ initialSymbol = "ETHUSDT" }: { initialSymbol?: string }) {
  const [symbol, setSymbol] = useState(initialSymbol);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [ai, setAi] = useState<AiEvidence | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [showCalc, setShowCalc] = useState(false);
  const [lastAnalysisId, setLastAnalysisId] = useState<string | null>(null);
  const book = useAppStore((s) => s.book);
  const setBook = useAppStore((s) => s.setBook);
  const settings = useAppStore((s) => s.settings);
  const log = useAppStore((s) => s.log);

  useEffect(() => {
    void run(initialSymbol);
    // initial load only
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sparkData = useMemo(
    () => (analysis?.spark ?? []).map((v, i) => ({ i, v })),
    [analysis],
  );

  async function run(sym = symbol) {
    const pair = sym.toUpperCase().replace(/[^A-Z0-9]/g, "");
    setSymbol(pair);
    setBusy(true);
    setError(null);
    setAi(null);
    try {
      const [m1, m5, m15, h1] = await Promise.all([
        fetchKlines({ data: { symbol: pair, interval: "1m", limit: 200 } }),
        fetchKlines({ data: { symbol: pair, interval: "5m", limit: 200 } }),
        fetchKlines({ data: { symbol: pair, interval: "15m", limit: 400 } }),
        fetchKlines({ data: { symbol: pair, interval: "1h", limit: 220 } }),
      ]);
      const source = [m1, m5, m15, h1].some((x) => x.source === "demo") ? "demo" : "binance";
      const result = analyzeFrames({
        symbol: pair,
        frames: { "1m": m1.candles, "5m": m5.candles, "15m": m15.candles, "1h": h1.candles },
        nowMs: m15.nowMs,
        source,
        book: useAppStore.getState().book,
        prices: { [pair]: m15.candles.at(-1)?.close ?? 0 },
        minConfidence: settings.minConfidence,
        minNetEdge: settings.minNetEdge,
        riskPct: settings.riskPct,
        limits: { ...DEFAULT_LIMITS, allowShorts: settings.allowShorts },
      });
      setAnalysis(result);
      setBusy(false);
      try {
        const startedAtMs = m15.nowMs || Date.now();
        const analysisId = await persistAnalysis({
          analysis: result,
          startedAtMs,
          config: {
            minConfidence: settings.minConfidence,
            minNetEdge: settings.minNetEdge,
            riskPct: settings.riskPct,
            allowShorts: settings.allowShorts,
            timeframes: ["1m", "5m", "15m", "1h"],
          },
          ai: null,
          strategies: useAppStore.getState().tournament.length
            ? useAppStore.getState().tournament
            : null,
        });
        setLastAnalysisId(analysisId);
        log({
          kind: "decision",
          symbol: pair,
          title: `${result.verdict.final} ${pair}`,
          detail: analysisId
            ? `${result.verdict.blockedBy[0] ?? result.brain.note} · ${analysisId}`
            : (result.verdict.blockedBy[0] ?? result.brain.note),
          decision: result.verdict.final,
        });
      } catch {
        log({
          kind: "decision",
          symbol: pair,
          title: `${result.verdict.final} ${pair}`,
          detail: result.verdict.blockedBy[0] ?? result.brain.note,
          decision: result.verdict.final,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Analyze failed");
      setBusy(false);
    }
  }

  async function askAi() {
    if (!analysis) return;
    setAiBusy(true);
    try {
      const status = await aiStatus();
      if (!status.available) {
        setError("AI research is unavailable here. The gate still runs without it.");
        return;
      }
      const res = await runAiResearch({
        data: {
          symbol: analysis.symbol,
          regime: analysis.brain.regime,
          alignment: analysis.brain.alignment,
          rsi: analysis.rsi,
          netEdge: analysis.verdict.best?.netEdge ?? 0,
          analogNote: analysis.analog.sampleNote,
        },
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setAi(res.evidence);
      const ledger = buildLedger({
        brain: analysis.brain,
        best: analysis.verdict.best,
        analog: analysis.analog,
        strategy: analysis.strategy,
        portfolioPenalty: Math.max(0, analysis.portfolio.symbol - 1),
        ai: res.evidence,
      });
      const enriched = { ...analysis, ledger };
      setAnalysis(enriched);
      const id = await persistAnalysis({
        analysis: enriched,
        startedAtMs: Date.now(),
        config: {
          minConfidence: settings.minConfidence,
          minNetEdge: settings.minNetEdge,
          riskPct: settings.riskPct,
          allowShorts: settings.allowShorts,
          timeframes: ["1m", "5m", "15m", "1h"],
        },
        ai: res.evidence,
        strategies: useAppStore.getState().tournament.length
          ? useAppStore.getState().tournament
          : null,
      });
      if (id) setLastAnalysisId(id);
    } finally {
      setAiBusy(false);
    }
  }

  function paperNow() {
    if (!analysis?.plan || !analysis.plan.valid || analysis.verdict.final === "WAIT") return;
    if (analysis.verdict.eligibility !== "PASS") return;
    const side = analysis.verdict.final;
    const stop =
      side === "BUY"
        ? analysis.price - analysis.plan.riskPerUnit
        : analysis.price + analysis.plan.riskPerUnit;
    const target =
      side === "BUY"
        ? analysis.price + analysis.plan.rewardPerUnit
        : analysis.price - analysis.plan.rewardPerUnit;
    const result = openPosition(book, {
      symbol: analysis.symbol,
      side,
      price: analysis.price,
      stop,
      target,
      quantity: analysis.plan.quantity,
      nowMs: Date.now(),
      analysisId: lastAnalysisId ?? undefined,
    });
    if (!result.ok) {
      log({
        kind: "paper",
        symbol: analysis.symbol,
        title: result.event,
        detail: "Order blocked by paper engine.",
      });
      toast.error("Paper order blocked", { description: result.event });
      return;
    }
    setBook(result.book);
    log({
      kind: "paper",
      symbol: analysis.symbol,
      title: result.event,
      detail: "User-initiated paper fill. Not live.",
    });
    toast.success(`Paper ${side} filled`, {
      description: `${analysis.symbol} · simulated only`,
    });
  }

  const final = analysis?.verdict.final ?? "WAIT";
  const paperLabel = !analysis
    ? "Paper"
    : analysis.verdict.final === "WAIT" || analysis.verdict.eligibility !== "PASS"
      ? "Paper blocked by gate"
      : !analysis.plan?.valid
        ? "Paper blocked — invalid plan"
        : analysis.portfolio.after > 6
          ? "Paper blocked — portfolio risk"
          : `Paper ${analysis.verdict.final}`;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Desk"
        title="Analyze a pair"
        description="Evidence first. A deterministic gate returns BUY, WAIT, or SELL. WAIT is a complete answer. Nothing here is live trading."
      />

      <Card>
        <CardContent className="flex flex-col gap-4 pt-5">
          <div
            role="radiogroup"
            aria-label="Quick pairs"
            className="flex flex-wrap gap-2"
          >
            {PAIRS.map((p) => (
              <Chip
                key={p}
                role="radio"
                aria-checked={symbol === p}
                selected={symbol === p}
                disabled={busy}
                onClick={() => void run(p)}
              >
                {p.replace("USDT", "")}
                <span className="sr-only"> / USDT</span>
              </Chip>
            ))}
          </div>
          <form
            className="flex flex-col gap-2 sm:flex-row sm:items-end"
            onSubmit={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            <div className="min-w-0 flex-1 sm:max-w-56">
              <Label htmlFor="desk-symbol">Symbol</Label>
              <Input
                id="desk-symbol"
                name="symbol"
                value={symbol}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-label="Trading pair"
                className="mt-1.5 font-mono uppercase"
                disabled={busy}
                onChange={(e) => setSymbol(e.target.value.toUpperCase())}
              />
            </div>
            <Button type="submit" disabled={busy} aria-busy={busy} className="sm:min-w-36">
              {busy ? "Analyzing…" : "Analyze"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="sr-only" role="status" aria-live="polite">
        {busy ? `Analyzing ${symbol}` : analysis ? `Decision ${final} for ${analysis.symbol}` : ""}
      </div>

      {error ? <Callout tone="danger">{error}</Callout> : null}

      {busy && !analysis ? (
        <div className="grid gap-4 md:grid-cols-2" aria-hidden>
          <Skeleton className="h-64" />
          <Skeleton className="h-64" />
        </div>
      ) : null}

      {!analysis && !busy ? (
        <EmptyState
          title="Pick a pair"
          description="You get multi-timeframe evidence, a gate checklist, calibrated confidence, and a paper plan when eligibility passes — never a live order."
          action={PAIRS.slice(0, 4).map((p) => (
            <Button key={p} variant="secondary" onClick={() => void run(p)}>
              Analyze {p.replace("USDT", "")}
            </Button>
          ))}
        />
      ) : null}

      {analysis ? (
        <div className="flex flex-col gap-4">
          <VerdictBanner
            final={final}
            eligibility={analysis.verdict.eligibility}
            symbol={`${analysis.symbol} · ${fmt(analysis.price, analysis.price > 100 ? 2 : 4)}`}
            subtitle={analysis.brain.note}
            meta={
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <Badge tone={analysis.source === "demo" ? "wait" : "neutral"}>
                  {analysis.source === "demo" ? "Demo feed" : "Live market data"}
                </Badge>
                <span>
                  Gates{" "}
                  {analysis.verdict.passedCount ??
                    analysis.verdict.items.filter((i) => i.ok).length}
                  /{analysis.verdict.items.length} passed
                </span>
                {(analysis.verdict.hardFailedCount ??
                  analysis.verdict.items.filter((i) => i.hard && !i.ok).length) > 0 ? (
                  <span className="text-sell">
                    {analysis.verdict.hardFailedCount ??
                      analysis.verdict.items.filter((i) => i.hard && !i.ok).length}{" "}
                    hard fail
                  </span>
                ) : null}
                {lastAnalysisId ? (
                  <span className="font-mono text-[11px]">{lastAnalysisId}</span>
                ) : null}
              </div>
            }
          />

          <Card>
            <CardContent className="pt-5">
              <div className="flex items-start justify-between gap-4">
                <p className="text-xs text-muted-foreground">Market snapshot</p>
                <Badge tone={analysis.source === "demo" ? "wait" : "neutral"}>
                  {analysis.source === "demo" ? "Demo feed" : "Binance"}
                </Badge>
              </div>
              {sparkData.length > 2 ? (
                <div className="mt-4 h-16" aria-hidden>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={sparkData}>
                      <Area
                        type="monotone"
                        dataKey="v"
                        stroke="var(--color-foreground)"
                        fill="var(--color-muted)"
                        strokeWidth={1.2}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : null}
              <p className="sr-only">
                Recent price path for {analysis.symbol} at{" "}
                {fmt(analysis.price, analysis.price > 100 ? 2 : 4)}
              </p>
              <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4 sm:grid-cols-4">
                <Metric
                  label="Bullish evidence"
                  value={fmt(analysis.verdict.bullishEvidence, 0)}
                  hint="/ 100"
                />
                <Metric
                  label="Bearish evidence"
                  value={fmt(analysis.verdict.bearishEvidence ?? 0, 0)}
                  hint="/ 100"
                />
                <Metric
                  label="Model confidence"
                  value={`${fmt(analysis.calibrated, 0)}%`}
                  hint={analysis.verdict.modelConfidenceLabel ?? "UNCALIBRATED"}
                />
                <Metric
                  label="Eligibility"
                  value={analysis.verdict.eligibility}
                  hint={analysis.verdict.best?.horizon.toLowerCase() ?? "none"}
                />
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <SectionCard title={`Why ${final}`}>
              <GateList items={analysis.verdict.items} />
              <p className="mt-4 border-t border-border pt-3 text-xs text-muted-foreground">
                Final gate: {final}. AI cannot override this decision.
              </p>
            </SectionCard>

            {analysis.plan ? (
              <SectionCard title="Paper plan">
                <div className="flex flex-col gap-2">
                  {!analysis.plan.valid ? (
                    <Callout tone="danger">
                      Plan invalid: {analysis.plan.invalidReason ?? "geometry or inputs failed"}
                    </Callout>
                  ) : null}
                  <Kv
                    k="Side"
                    v={analysis.verdict.final === "WAIT" ? "no permission" : analysis.verdict.final}
                  />
                  <Kv
                    k="Size"
                    v={
                      analysis.plan.valid
                        ? `${fmt(analysis.plan.quantity, 4)} · ${money(analysis.plan.allocated)}`
                        : "N/A"
                    }
                  />
                  <Kv
                    k="Risk / unit"
                    v={analysis.plan.valid ? fmt(analysis.plan.riskPerUnit, 4) : "N/A"}
                  />
                  <Kv
                    k="Reward / unit"
                    v={analysis.plan.valid ? fmt(analysis.plan.rewardPerUnit, 4) : "N/A"}
                  />
                  <Kv
                    k="Max loss"
                    v={analysis.plan.valid ? money(-analysis.plan.expectedLoss) : "N/A"}
                  />
                  <Kv
                    k="Potential net"
                    v={analysis.plan.valid ? money(analysis.plan.expectedGain) : "N/A"}
                  />
                  <Kv
                    k="Fees + slip (entry)"
                    v={analysis.plan.valid ? money(-(analysis.plan.fee + analysis.plan.slip)) : "N/A"}
                  />
                  <Kv k="Net R:R" v={analysis.plan.valid ? fmt(analysis.plan.netRR, 2) : "N/A"} />
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <Button
                      disabled={
                        analysis.verdict.final === "WAIT" ||
                        analysis.verdict.eligibility !== "PASS" ||
                        !analysis.plan.valid ||
                        analysis.portfolio.after > 6
                      }
                      onClick={paperNow}
                    >
                      {paperLabel}
                    </Button>
                    <Button variant="secondary" onClick={() => void askAi()} disabled={aiBusy}>
                      {aiBusy ? "Researching…" : "AI research"}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Paper fills never hit an exchange. Not personalized investment advice.
                  </p>
                </div>
              </SectionCard>
            ) : null}
          </div>

          <Card>
            <CardContent className="flex flex-col gap-1 pt-2">
              <Disclosure title="Evidence ledger">
                <div className="flex flex-col gap-2">
                  {analysis.ledger.rows.map((row) => (
                    <Kv
                      key={row.id}
                      k={row.label}
                      v={signed(row.value, 2)}
                      tone={row.value >= 0 ? "buy" : "sell"}
                    />
                  ))}
                  <div className="mt-1 flex items-baseline justify-between border-t border-border pt-3 text-sm">
                    <span className="text-muted-foreground">Ledger sum</span>
                    <span className="font-mono tabular-nums">{signed(analysis.ledger.total, 2)}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    The sum explains. It does not decide. The gate above is authoritative.
                  </p>
                  <button
                    type="button"
                    className="h-11 self-start text-xs text-muted-foreground underline-offset-4 hover:underline"
                    onClick={() => setShowCalc((v) => !v)}
                    aria-expanded={showCalc}
                  >
                    {showCalc ? "Hide calculation" : "Show calculation"}
                  </button>
                  {showCalc ? (
                    <ul className="space-y-1 text-xs text-muted-foreground">
                      {analysis.ledger.rows.map((row) => (
                        <li key={row.id}>
                          <span className="text-foreground">{row.label}:</span> {row.formula} · {row.note}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </Disclosure>
              <Disclosure title="Portfolio impact">
                <div className="flex flex-col gap-2">
                  <Kv k="Existing risk" v={`${fmt(analysis.portfolio.total, 2)}%`} />
                  <Kv k="New risk" v={`${fmt(analysis.portfolio.after - analysis.portfolio.total, 2)}%`} />
                  <Kv k="Combined" v={`${fmt(analysis.portfolio.after, 2)}%`} />
                  <Kv k="Maximum allowed" v="6.0% book · 2.0% symbol" />
                  <Badge
                    tone={
                      analysis.portfolio.after <= 6 &&
                      analysis.portfolio.symbol + (analysis.portfolio.after - analysis.portfolio.total) <=
                        2
                        ? "pass"
                        : "fail"
                    }
                  >
                    {analysis.portfolio.after <= 6 ? "PASS" : "TRADE BLOCKED — portfolio risk"}
                  </Badge>
                </div>
              </Disclosure>
              <Disclosure title="Data integrity">
                <div className="grid grid-cols-2 gap-3">
                  <Metric
                    label="Analysis"
                    value={
                      new Date(analysis.integrity.analysisAtMs).toISOString().slice(11, 19) + " UTC"
                    }
                  />
                  <Metric
                    label="Market snapshot"
                    value={
                      new Date(analysis.integrity.marketSnapshotMs).toISOString().slice(11, 19) +
                      " UTC"
                    }
                  />
                  <Metric label="Source" value={analysis.source} />
                  <Metric label="Look-ahead" value={analysis.integrity.lookAhead} />
                </div>
                <p className="mt-3 text-xs text-muted-foreground">{analysis.integrity.note}</p>
              </Disclosure>
              {ai ? (
                <Disclosure title="AI research notes">
                  <div className="flex flex-col gap-3 text-sm">
                    <p>
                      <span className="text-muted-foreground">Bull · </span>
                      {ai.bull}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Bear · </span>
                      {ai.bear}
                    </p>
                    <p>
                      <span className="text-muted-foreground">Risk · </span>
                      {ai.risk}
                    </p>
                    {ai.notes.map((n) => (
                      <p key={n.role} className="text-xs text-muted-foreground">
                        {n.role} — {n.text}
                      </p>
                    ))}
                  </div>
                </Disclosure>
              ) : null}
            </CardContent>
          </Card>

          <p className="text-sm text-muted-foreground">
            Related:{" "}
            <Link to="/scanner" className="underline-offset-4 hover:underline">
              scan liquid pairs
            </Link>
            {" · "}
            <Link to="/lab" className="underline-offset-4 hover:underline">
              strategy lab
            </Link>
          </p>
        </div>
      ) : null}
    </div>
  );
}
