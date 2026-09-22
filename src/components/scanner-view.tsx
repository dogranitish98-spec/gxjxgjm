import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { fetchKlineBatch, fetchTickers } from "@/lib/server/market";
import { analyzeMarket } from "@/lib/synaptick/brain";
import { validateQuality } from "@/lib/synaptick/candles";
import { bestEligible, isEligible } from "@/lib/synaptick/reconciler";
import { computeScreen } from "@/lib/synaptick/screen";
import { parseTickers, spreadPct, type Ticker24h } from "@/lib/synaptick/universe";
import { checkRanking, insufficient, type RankingCheck } from "@/lib/synaptick/validator";
import type { Candle } from "@/lib/synaptick/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Chip, EmptyState, PageHeader, SectionCard } from "@/components/chrome";
import { compactUsd, cn, fmt, signed } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

type Entry = {
  rank: number;
  ticker: Ticker24h;
  score: number;
  screen: NonNullable<ReturnType<typeof computeScreen>["last"]>;
  ready: boolean;
  regime?: string;
  netAfterSpread?: number;
};

export function ScannerView() {
  const [busy, setBusy] = useState(false);
  const [stage, setStage] = useState("");
  const [progress, setProgress] = useState(0);
  const [check, setCheck] = useState<RankingCheck | null>(null);
  const [entries, setEntries] = useState<Entry[]>([]);
  const [meta, setMeta] = useState<{
    source: string;
    eligible: number;
    screened: number;
    note: string;
  } | null>(null);
  const [readyOnly, setReadyOnly] = useState(false);

  const log = useAppStore((s) => s.log);
  const settings = useAppStore((s) => s.settings);

  async function scan() {
    setBusy(true);
    setStage("Loading every USDT market");
    setProgress(4);

    try {
      const tickers = await fetchTickers();
      const uni = parseTickers(tickers.rows);
      const symbols = uni.eligible.slice(0, 40);

      if (symbols.length === 0) {
        setMeta({
          source: tickers.source,
          eligible: 0,
          screened: 0,
          note: "No pair passed liquidity and spread filters.",
        });
        setEntries([]);
        setCheck(insufficient(4));
        return;
      }

      setStage(`Screening ${symbols.length} liquid pairs`);

      const history: Record<string, Candle[]> = {};

      const screened: {
        ticker: Ticker24h;
        candles: Candle[];
        detail: NonNullable<ReturnType<typeof computeScreen>["last"]>;
      }[] = [];

      for (let i = 0; i < symbols.length; i += 8) {
        const chunk = symbols.slice(i, i + 8);

        const batch = await fetchKlineBatch({
          items: chunk.map((t) => ({
            symbol: t.symbol,
            interval: "1h",
            limit: 220,
          })),
        });

        for (let j = 0; j < chunk.length; j++) {
          const candles = batch[j]?.candles ?? [];
          const detail = computeScreen(candles).last;

          if (!detail) continue;

          screened.push({
            ticker: chunk[j]!,
            candles,
            detail,
          });

          history[chunk[j]!.symbol] = candles;
        }

        setProgress(
          10 + Math.round(((i + chunk.length) / symbols.length) * 55),
        );
      }

      setStage("Checking the ranking against history");

      const ranking = checkRanking(
        history,
        4,
        3_600_000,
        Math.min(
          30,
          Math.max(8, Math.floor(screened.length * 0.6)),
        ),
        10_000_000,
      );

      setCheck(ranking);
      setProgress(72);

      const ordered = [...screened].sort(
        (a, b) =>
          b.detail.score - a.detail.score ||
          b.ticker.quoteVolume - a.ticker.quoteVolume,
      );

      const targets = ordered.slice(0, 8);

      setStage(`Running the brain on the top ${targets.length}`);

      const deep = new Map<
        string,
        {
          ready: boolean;
          regime: string;
          net?: number;
        }
      >();

      for (let i = 0; i < targets.length; i++) {
        const t = targets[i]!;

        const pack = await fetchKlineBatch({
          items: ["1m", "5m", "15m", "1h"].map((interval) => ({
            symbol: t.ticker.symbol,
            interval,
            limit: 200,
          })),
        });

        const frames = {
          "1m": pack[0]?.candles ?? [],
          "5m": pack[1]?.candles ?? [],
          "15m": pack[2]?.candles ?? [],
          "1h": pack[3]?.candles ?? [],
        };

        const quality = validateQuality(frames);

        if (!quality.ok) {
          deep.set(t.ticker.symbol, {
            ready: false,
            regime: "data rejected",
          });
        } else {
          const brain = analyzeMarket(
            frames,
            settings.minConfidence,
            settings.minNetEdge,
          );

          const best = bestEligible(
            brain.decisions,
            settings.minConfidence,
            settings.minNetEdge,
          );

          const spread = spreadPct(t.ticker) ?? 0;

          const after =
            best && best.signal === "BUY"
              ? best.netEdge - spread
              : undefined;

          deep.set(t.ticker.symbol, {
            ready:
              after != null &&
              after > settings.minNetEdge &&
              isEligible(
                best!,
                settings.minConfidence,
                settings.minNetEdge,
              ),
            regime: brain.regime,
            net: after,
          });
        }

        setProgress(
          72 + Math.round(((i + 1) / targets.length) * 28),
        );
      }

      const rows: Entry[] = ordered.map((s, idx) => {
        const d = deep.get(s.ticker.symbol);

        return {
          rank: idx + 1,
          ticker: s.ticker,
          score: s.detail.score,
          screen: s.detail,
          ready: d?.ready ?? false,
          regime: d?.regime,
          netAfterSpread: d?.net,
        };
      });

      setEntries(rows);

      setMeta({
        source: tickers.source,
        eligible: uni.eligible.length,
        screened: screened.length,
        note:
          tickers.source === "demo"
            ? "Demo feed — same causal rules, not live tape."
            : "",
      });

      log({
        kind: "scan",
        title: `Scan ${screened.length} pairs`,
        detail: `${ranking.verdict} · ${
          rows.filter((r) => r.ready).length
        } ready`,
      });
    } finally {
      setBusy(false);
      setStage("");
      setProgress(100);
    }
  }

  const shown = entries.filter(
    (e) => !readyOnly || e.ready,
  );

  const readyN = entries.filter((e) => e.ready).length;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Scanner"
        title="Scan liquid pairs"
        description="Liquid USDT only. Closed 1h candles. The score is a checklist, then a rank-IC check. Ready is not a trade."
        actions={
          <Button
            onClick={() => void scan()}
            disabled={busy}
            aria-busy={busy}
          >
            {busy ? "Scanning…" : "Scan liquid pairs"}
          </Button>
        }
      />

      {busy ? (
        <div>
          <div className="mb-2 flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
            <p
              role="status"
              aria-live="polite"
            >
              {stage}
            </p>

            <p className="font-mono tabular-nums">
              {progress}%
            </p>
          </div>

          <Progress
            value={progress}
            label={stage || "Scan progress"}
          />
        </div>
      ) : null}

      {check ? (
        <SectionCard
          title="Ranking self-check"
          action={
            <Badge
              tone={
                check.verdict === "PREDICTIVE"
                  ? "pass"
                  : check.verdict === "WEAK"
                    ? "wait"
                    : check.verdict === "NO EDGE"
                      ? "fail"
                      : "neutral"
              }
            >
              {check.verdict}
            </Badge>
          }
        >
          {check.sections > 0 ? (
            <p className="text-sm leading-relaxed text-muted-foreground">
              Rank correlation{" "}
              {signed(check.meanRankIc, 3)}{" "}
              (t {fmt(check.tStat, 1)}) over{" "}
              {check.sections} independent{" "}
              {check.horizonBars}h windows. Next{" "}
              {check.horizonBars}h: top fifth{" "}
              {signed(check.topFifthPct, 2)}% · all{" "}
              {signed(check.allCoinsPct, 2)}% · bottom{" "}
              {signed(check.bottomFifthPct, 2)}%. Gross of
              0.26% costs.
            </p>
          ) : (
            <p className="text-sm text-muted-foreground">
              Not enough coins or history to judge the
              ranking. That is a valid result.
            </p>
          )}

          {meta?.note ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {meta.note}
            </p>
          ) : null}
        </SectionCard>
      ) : null}

      {entries.length > 0 ? (
        <>
          <div
            role="group"
            aria-label="Filter results"
            className="flex flex-wrap gap-2"
          >
            <Chip
              selected={!readyOnly}
              onClick={() => setReadyOnly(false)}
            >
              All {entries.length}
            </Chip>

            <Chip
              selected={readyOnly}
              onClick={() => setReadyOnly(true)}
            >
              Ready {readyN}
            </Chip>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              title="No ready pairs"
              description="Nothing in this scan passed the brain after spread. Try All, or scan again later."
              action={
                <Button
                  variant="secondary"
                  onClick={() => setReadyOnly(false)}
                >
                  Show all
                </Button>
              }
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {shown.slice(0, 40).map((e) => (
                <li key={e.ticker.symbol}>
                  <Link
                    to="/"
                    search={{ symbol: e.ticker.symbol }}
                    className="block rounded-xl focus-visible:outline-none"
                  >
                    <Card className="transition-[border-color,box-shadow] duration-150 hover:shadow-[var(--shadow-border-hover)]">
                      <CardContent className="flex items-center gap-4 py-4">
                        <span className="w-8 font-mono text-xs tabular-nums text-muted-foreground">
                          #{e.rank}
                        </span>

                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">
                              {e.ticker.baseAsset}/USDT
                            </p>

                            {e.ready ? (
                              <Badge tone="pass">
                                Ready
                              </Badge>
                            ) : null}
                          </div>

                          <p className="truncate text-xs text-muted-foreground">
                            {signed(
                              e.ticker.priceChangePct,
                              1,
                            )}
                            % ·{" "}
                            {compactUsd(
                              e.ticker.quoteVolume,
                            )}{" "}
                            · RSI{" "}
                            {fmt(e.screen.rsi, 0)} ·{" "}
                            {e.regime?.toLowerCase() ??
                              "screen only"}
                          </p>
                        </div>

                        <p
                          className={cn(
                            "font-mono text-xl tabular-nums",
                            e.score >= 70
                              ? "text-foreground"
                              : "text-muted-foreground",
                          )}
                        >
                          <span className="sr-only">
                            Score{" "}
                          </span>
                          {fmt(e.score, 0)}
                        </p>
                      </CardContent>
                    </Card>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      ) : !busy ? (
        <EmptyState
          title="Run a scan"
          description="Ranks liquid Binance USDT pairs, then asks whether that ranking predicted the next 4 hours. NO EDGE is an honest outcome."
          action={
            <Button onClick={() => void scan()}>
              Scan liquid pairs
            </Button>
          }
        />
      ) : null}
    </div>
  );
                            }
