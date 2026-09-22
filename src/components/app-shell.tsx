import { useEffect, useState, type ReactNode } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import * as Dialog from "@radix-ui/react-dialog";
import {
  Activity,
  FlaskConical,
  History,
  MoreHorizontal,
  ScanLine,
  ScrollText,
  Trophy,
  Wallet,
  X,
} from "lucide-react";
import { cn, money, signed } from "@/lib/utils";
import { useAppStore } from "@/store/app-store";
import { markToMarket } from "@/lib/synaptick/risk";
import { Toaster } from "@/components/ui/toaster";
import { Badge } from "@/components/ui/badge";

const NAV = [
  { to: "/", label: "Desk", icon: Activity, hint: "Analyze a pair" },
  { to: "/scanner", label: "Scanner", icon: ScanLine, hint: "Rank liquid pairs" },
  { to: "/lab", label: "Lab", icon: FlaskConical, hint: "Backtest a rule" },
  { to: "/tournament", label: "Tournament", icon: Trophy, hint: "Compare strategies" },
  { to: "/paper", label: "Paper", icon: Wallet, hint: "Simulated book" },
  { to: "/history", label: "History", icon: History, hint: "Saved analyses" },
  { to: "/audit", label: "Log", icon: ScrollText, hint: "Activity on this device" },
] as const;

const MOBILE_PRIMARY = ["/", "/scanner", "/paper", "/history"] as const;

function isActive(pathname: string, to: string) {
  return to === "/" ? pathname === "/" : pathname.startsWith(to);
}

function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="6.5" cy="12" r="2.25" fill="currentColor" />
      <circle cx="17.5" cy="12" r="2.25" fill="currentColor" />
      <path
        d="M8.7 12h6.6"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const book = useAppStore((s) => s.book);
  const setHydrated = useAppStore((s) => s.setHydrated);
  const [moreOpen, setMoreOpen] = useState(false);
  const equity = markToMarket(
    book,
    Object.fromEntries(book.positions.map((p) => [p.symbol, p.entry])),
  );
  const pnl = equity - book.startingCash;
  const pnlTone = pnl > 0 ? "text-buy" : pnl < 0 ? "text-sell" : "text-muted-foreground";
  const moreActive = NAV.filter((n) => !MOBILE_PRIMARY.includes(n.to as (typeof MOBILE_PRIMARY)[number])).some(
    (n) => isActive(pathname, n.to),
  );

  useEffect(() => {
    void Promise.resolve(useAppStore.persist.rehydrate()).then(() => setHydrated());
  }, [setHydrated]);

  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-background text-foreground lg:grid lg:grid-cols-[232px_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-primary focus:px-3.5 focus:py-2.5 focus:text-sm focus:font-medium focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-border bg-background lg:flex">
        <div className="flex h-14 items-center gap-2.5 px-5">
          <Link
            to="/"
            search={{ symbol: undefined }}
            className="flex items-center gap-2.5 rounded-md focus-visible:outline-none"
            aria-label="Synaptick home"
          >
            <LogoMark className="size-5" />
            <span className="text-sm font-medium tracking-tight">Synaptick</span>
          </Link>
        </div>
        <nav className="flex flex-1 flex-col gap-0.5 px-3 py-2" aria-label="Primary">
          {NAV.map((item) => {
            const active = isActive(pathname, item.to);
            const Icon = item.icon;
            return (
              <Link
                key={item.to}
                to={item.to}
                search={item.to === "/" ? { symbol: undefined } : undefined}
                className={cn(
                  "flex min-h-11 items-center gap-3 rounded-md px-3 text-sm transition-colors duration-150",
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
                )}
                aria-current={active ? "page" : undefined}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.6} aria-hidden />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
        <EquityBlock equity={equity} pnl={pnl} pnlTone={pnlTone} kill={book.killSwitch} />
      </aside>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center justify-between gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-sm lg:hidden">
          <Link
            to="/"
            search={{ symbol: undefined }}
            className="flex items-center gap-2 rounded-md"
            aria-label="Synaptick home"
          >
            <LogoMark className="size-5" />
            <span className="text-sm font-medium tracking-tight">Synaptick</span>
          </Link>
          <p className={cn("font-mono text-sm tabular-nums", pnlTone)} aria-live="polite">
            <span className="sr-only">Paper equity </span>
            {money(equity)}
          </p>
        </header>

        <main
          id="main"
          tabIndex={-1}
          className="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-6 outline-none md:px-6 md:pt-8 lg:pb-12"
        >
          {children}
        </main>
      </div>

      <nav
        className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-sm lg:hidden"
        aria-label="Primary"
      >
        <div className="mx-auto grid max-w-6xl grid-cols-5">
          {NAV.filter((n) => MOBILE_PRIMARY.includes(n.to as (typeof MOBILE_PRIMARY)[number])).map(
            (item) => {
              const active = isActive(pathname, item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  search={item.to === "/" ? { symbol: undefined } : undefined}
                  className={cn(
                    "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium",
                    active ? "text-foreground" : "text-muted-foreground",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <Icon className="size-5" strokeWidth={1.6} aria-hidden />
                  <span>{item.label}</span>
                </Link>
              );
            },
          )}
          <Dialog.Root open={moreOpen} onOpenChange={setMoreOpen}>
            <Dialog.Trigger asChild>
              <button
                type="button"
                className={cn(
                  "flex min-h-14 flex-col items-center justify-center gap-0.5 px-1 text-[11px] font-medium",
                  moreActive || moreOpen ? "text-foreground" : "text-muted-foreground",
                )}
                aria-expanded={moreOpen}
              >
                <MoreHorizontal className="size-5" strokeWidth={1.6} aria-hidden />
                More
              </button>
            </Dialog.Trigger>
            <Dialog.Portal>
              <Dialog.Overlay className="fixed inset-0 z-40 bg-background/80" />
              <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-border bg-card p-4 pb-[calc(env(safe-area-inset-bottom)+1.25rem)] shadow-[var(--shadow-border)] focus:outline-none">
                <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-border" aria-hidden />
                <div className="flex items-center justify-between gap-3">
                  <Dialog.Title className="text-sm font-medium">More</Dialog.Title>
                  <Dialog.Close asChild>
                    <button
                      type="button"
                      className="inline-flex size-11 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
                      aria-label="Close menu"
                    >
                      <X className="size-4" strokeWidth={1.75} />
                    </button>
                  </Dialog.Close>
                </div>
                <Dialog.Description className="sr-only">
                  Lab, tournament, and activity log
                </Dialog.Description>
                <ul className="mt-2 flex flex-col gap-1">
                  {NAV.filter(
                    (n) => !MOBILE_PRIMARY.includes(n.to as (typeof MOBILE_PRIMARY)[number]),
                  ).map((item) => {
                    const active = isActive(pathname, item.to);
                    const Icon = item.icon;
                    return (
                      <li key={item.to}>
                        <Link
                          to={item.to}
                          className={cn(
                            "flex min-h-12 items-center gap-3 rounded-md px-3 text-sm",
                            active ? "bg-muted text-foreground" : "text-foreground hover:bg-muted/60",
                          )}
                          aria-current={active ? "page" : undefined}
                        >
                          <Icon className="size-4" strokeWidth={1.6} aria-hidden />
                          <span className="flex flex-col">
                            <span>{item.label}</span>
                            <span className="text-xs text-muted-foreground">{item.hint}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Dialog.Content>
            </Dialog.Portal>
          </Dialog.Root>
        </div>
      </nav>
      <Toaster />
    </div>
  );
}

function EquityBlock({
  equity,
  pnl,
  pnlTone,
  kill,
}: {
  equity: number;
  pnl: number;
  pnlTone: string;
  kill: boolean;
}) {
  return (
    <div className="border-t border-border px-5 py-4">
      <p className="text-xs text-muted-foreground">Paper equity</p>
      <p className="mt-1 font-mono text-base tabular-nums" aria-live="polite">
        {money(equity)}
      </p>
      <p className={cn("mt-0.5 font-mono text-xs tabular-nums", pnlTone)}>
        {signed(pnl, 2)}
        <span className="sr-only"> versus starting cash</span>
      </p>
      <div className="mt-3">
        {kill ? (
          <Badge tone="fail">Kill switch on</Badge>
        ) : (
          <p className="text-xs text-muted-foreground">Live trading off</p>
        )}
      </div>
    </div>
  );
}
