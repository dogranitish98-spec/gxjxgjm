import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

export type VerdictTone = "BUY" | "SELL" | "WAIT";

const TONE: Record<VerdictTone, { text: string; badge: "buy" | "sell" | "wait" }> = {
  BUY: { text: "text-buy", badge: "buy" },
  SELL: { text: "text-sell", badge: "sell" },
  WAIT: { text: "text-wait", badge: "wait" },
};

/**
 * Primary decision surface — always reflects backend final + eligibility.
 * Never invents a decision; displays what the gate produced.
 */
export function VerdictBanner({
  final,
  eligibility,
  symbol,
  subtitle,
  meta,
  className,
}: {
  final: VerdictTone | string;
  eligibility?: string | null;
  symbol?: string;
  subtitle?: string;
  meta?: ReactNode;
  className?: string;
}) {
  const key = (final === "BUY" || final === "SELL" || final === "WAIT" ? final : "WAIT") as VerdictTone;
  const t = TONE[key];
  const eligTone =
    eligibility === "PASS" ? "pass" : eligibility === "SOFT" ? "wait" : eligibility ? "fail" : "neutral";

  return (
    <div
      className={cn("rounded-xl border border-border bg-card px-5 py-5", className)}
      role="status"
      aria-live="polite"
      aria-label={`Decision ${key}${eligibility ? `, eligibility ${eligibility}` : ""}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {symbol ? <p className="font-mono text-xs text-muted-foreground">{symbol}</p> : null}
          <p className={cn("mt-1 text-4xl font-medium tracking-tight md:text-5xl", t.text)}>{key}</p>
          {subtitle ? <p className="mt-2 max-w-lg text-sm leading-relaxed text-muted-foreground">{subtitle}</p> : null}
        </div>
        {eligibility ? <Badge tone={eligTone}>{eligibility}</Badge> : null}
      </div>
      {meta ? <div className="mt-4 border-t border-border pt-3">{meta}</div> : null}
    </div>
  );
}
