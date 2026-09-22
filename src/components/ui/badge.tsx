import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Badge({
  className,
  tone = "neutral",
  children,
}: {
  className?: string;
  tone?: "neutral" | "buy" | "sell" | "wait" | "pass" | "fail";
  children: ReactNode;
}) {
  const tones = {
    neutral: "text-muted-foreground border-border",
    buy: "text-buy border-buy/40",
    sell: "text-sell border-sell/40",
    wait: "text-wait border-wait/40",
    pass: "text-buy border-buy/40",
    fail: "text-sell border-sell/40",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium uppercase tracking-[0.08em]",
        tones[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
