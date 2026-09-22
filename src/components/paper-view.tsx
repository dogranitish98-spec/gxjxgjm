import { useId } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import { closePosition, persistClosedTrade } from "@/lib/synaptick/paper";
import { goLive, fromClosed } from "@/lib/synaptick/performance";
import { markToMarket } from "@/lib/synaptick/risk";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Callout,
  EmptyState,
  MetricCard,
  PageHeader,
  SectionCard,
} from "@/components/chrome";
import { cn, fmt, money, signed } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";

export function PaperView() {
  const book = useAppStore((s) => s.book);
  const setBook = useAppStore((s) => s.setBook);
  const settings = useAppStore((s) => s.settings);
  const setSettings = useAppStore((s) => s.setSettings);
  const log = useAppStore((s) => s.log);
  const killId = useId();
  const shortId = useId();
  const prices = Object.fromEntries(book.positions.map((p) => [p.symbol, p.entry]));
  const equity = markToMarket(book, prices);
  const perf = fromClosed(book.trades, book.startingCash);
  const live = goLive(perf);
  const pnl = equity - book.startingCash;
  const pnlTone = pnl > 0 ? "buy" : pnl < 0 ? "sell" : "muted";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Paper book"
        title={
          <>
            <span className="sr-only">Paper equity </span>
            {money(equity)}
          </>
        }
        description="Simulated fills with fee and slip from the cost engine. There is no live path. Opens require a passing desk gate."
        actions={
          <Button asChild variant="secondary">
            <Link to="/" search={{ symbol: undefined }}>
              Open desk
            </Link>
          </Button>
        }
      />

      {book.killSwitch ? (
        <Callout tone="danger" title="Kill switch latched">
          {book.killReason ? `${book.killReason}. ` : ""}New opens are blocked.
        </Callout>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard label="Cash" value={money(book.cash)} />
        <MetricCard label="Book P&L" value={signed(pnl, 2)} tone={pnlTone} />
        <MetricCard label="Open positions" value={book.positions.length} />
        <MetricCard label="Go-live evidence">
          <div className="mt-2">
            <Badge tone={live.status === "PASS" ? "pass" : live.status === "PROVISIONAL" ? "wait" : "fail"}>
              {live.status}
            </Badge>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">{live.summary}</p>
        </MetricCard>
      </div>

      <SectionCard title="Protections">
        <div className="flex flex-col gap-1">
          <label
            htmlFor={killId}
            className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-md px-1"
          >
            <span>
              <span className="block text-sm">Kill switch</span>
              <span className="block text-xs text-muted-foreground">
                Latches until you reset it. Blocks new entries, never exits.
              </span>
            </span>
            <Switch
              id={killId}
              checked={book.killSwitch}
              onCheckedChange={(v) => {
                setBook({ ...book, killSwitch: v, killReason: v ? "manual latch" : "" });
                log({
                  kind: "risk",
                  title: v ? "Kill switch latched" : "Kill switch cleared",
                  detail: "Paper only",
                });
                toast.message(v ? "Kill switch on" : "Kill switch cleared");
              }}
            />
          </label>
          <label
            htmlFor={shortId}
            className="flex min-h-14 cursor-pointer items-center justify-between gap-4 rounded-md px-1"
          >
            <span>
              <span className="block text-sm">Allow paper shorts</span>
              <span className="block text-xs text-muted-foreground">
                Off by default — Binance spot cannot short.
              </span>
            </span>
            <Switch
              id={shortId}
              checked={settings.allowShorts}
              onCheckedChange={(v) => setSettings({ allowShorts: v })}
            />
          </label>
        </div>
      </SectionCard>

      <SectionCard title="Open positions">
        {book.positions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            None. Analyze on the desk, then paper a permitted side.
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {book.positions.map((p) => (
              <li
                key={p.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
              >
                <div className="min-w-0">
                  <p className="font-medium">
                    {p.symbol}{" "}
                    <span className={p.side === "BUY" ? "text-buy" : "text-sell"}>{p.side}</span>
                  </p>
                  <p className="font-mono text-xs text-muted-foreground">
                    {fmt(p.quantity, 4)} @ {fmt(p.entry, 4)} · stop {fmt(p.stop, 4)} · target{" "}
                    {fmt(p.target, 4)}
                  </p>
                  {"analysisId" in p && p.analysisId ? (
                    <p className="mt-1 font-mono text-[11px] text-muted-foreground">
                      from {p.analysisId}
                    </p>
                  ) : null}
                </div>
                <Button
                  variant="secondary"
                  onClick={() => {
                    const { book: next, event, trade } = closePosition(
                      book,
                      p.id,
                      p.entry,
                      Date.now(),
                      "MANUAL",
                    );
                    setBook(next);
                    log({ kind: "paper", symbol: p.symbol, title: event, detail: "Manual paper close" });
                    toast.message("Position closed", { description: `${p.symbol} · paper only` });
                    if (trade) void persistClosedTrade(trade);
                  }}
                >
                  Close
                </Button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Closed trades">
        {book.trades.length === 0 ? (
          <EmptyState
            title="No closed trades"
            description="Paper fills from the desk appear here after they close."
          />
        ) : (
          <>
            <ul className="flex max-h-96 flex-col gap-1 overflow-y-auto">
              {[...book.trades].reverse().map((t) => (
                <li
                  key={t.id}
                  className="flex justify-between gap-3 border-b border-border/60 py-2 font-mono text-xs last:border-0"
                >
                  <span className="min-w-0 truncate">
                    <span className={t.side === "BUY" ? "text-buy" : "text-sell"}>{t.side}</span>{" "}
                    {t.symbol} · {t.reason}
                    {t.analysisId ? <span className="text-muted-foreground"> · linked</span> : null}
                  </span>
                  <span
                    className={cn(
                      "shrink-0 tabular-nums",
                      t.netPnl >= 0 ? "text-buy" : "text-sell",
                    )}
                  >
                    {signed(t.netPnl, 2)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              {book.trades.length} closed
              {perf.trades > 0
                ? ` · win ${fmt(perf.winRatePct, 0)}% · PF ${fmt(perf.profitFactor, 2)} · exp ${signed(perf.expectancyPct, 2)}% · DD ${fmt(perf.maxDrawdownPct, 1)}%`
                : ""}
            </p>
          </>
        )}
      </SectionCard>
    </div>
  );
}
