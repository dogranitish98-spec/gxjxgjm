import type { ButtonHTMLAttributes, ReactNode, SelectHTMLAttributes } from "react";
import { Check, ChevronDown, Minus, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { GateItem } from "@/lib/synaptick/types";

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <header
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0 max-w-xl">
        <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          {eyebrow}
        </p>
        <h1 className="mt-1.5 text-3xl font-medium tracking-tight md:text-[2.5rem] md:leading-tight">
          {title}
        </h1>
        {description ? (
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
    </header>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card px-6 py-12">
      <h2 className="text-lg font-medium tracking-tight">{title}</h2>
      <p className="mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">{description}</p>
      {action ? <div className="mt-6 flex flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function Callout({
  tone = "info",
  title,
  children,
}: {
  tone?: "info" | "danger" | "warning";
  title?: string;
  children: ReactNode;
}) {
  const styles = {
    info: "border-border bg-muted/50 text-foreground",
    danger: "border-sell/35 bg-sell/10 text-sell",
    warning: "border-wait/35 bg-wait/10 text-wait",
  };
  return (
    <div
      role={tone === "danger" ? "alert" : "status"}
      className={cn("rounded-xl border px-4 py-3 text-sm leading-relaxed", styles[tone])}
    >
      {title ? <p className="font-medium">{title}</p> : null}
      <div className={title ? "mt-1" : undefined}>{children}</div>
    </div>
  );
}

export function Metric({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: "buy" | "sell" | "muted";
}) {
  const valueClass =
    tone === "buy"
      ? "text-buy"
      : tone === "sell"
        ? "text-sell"
        : tone === "muted"
          ? "text-muted-foreground"
          : "text-foreground";
  return (
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("mt-1 font-mono text-lg tabular-nums tracking-tight", valueClass)}>{value}</p>
      {hint ? <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

export function MetricCard({
  label,
  value,
  hint,
  tone,
  children,
}: {
  label: string;
  value?: ReactNode;
  hint?: ReactNode;
  tone?: "buy" | "sell" | "muted";
  children?: ReactNode;
}) {
  return (
    <Card>
      <CardContent className="py-5">
        <p className="text-xs text-muted-foreground">{label}</p>
        {value != null ? (
          <p
            className={cn(
              "mt-2 font-mono text-xl tabular-nums tracking-tight",
              tone === "buy"
                ? "text-buy"
                : tone === "sell"
                  ? "text-sell"
                  : tone === "muted"
                    ? "text-muted-foreground"
                    : "text-foreground",
            )}
          >
            {value}
          </p>
        ) : null}
        {children}
        {hint ? <p className="mt-2 text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}

export function Kv({ k, v, tone }: { k: string; v: ReactNode; tone?: "buy" | "sell" }) {
  return (
    <div className="flex items-baseline justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{k}</span>
      <span
        className={cn(
          "font-mono text-xs tabular-nums",
          tone === "buy" ? "text-buy" : tone === "sell" ? "text-sell" : "text-foreground",
        )}
      >
        {v}
      </span>
    </div>
  );
}

export function Chip({
  selected,
  className,
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  const radio = props.role === "radio";
  return (
    <button
      type="button"
      aria-pressed={radio ? undefined : selected}
      className={cn(
        "inline-flex h-11 min-h-11 items-center justify-center rounded-md border px-3 text-sm transition-[color,background-color,border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:opacity-40",
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-transparent text-muted-foreground hover:border-foreground/40 hover:text-foreground",
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
}

export function NativeSelect({
  className,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select
        className={cn(
          "h-11 min-h-11 w-full appearance-none rounded-md border border-input bg-background px-3 pr-10 text-sm text-foreground transition-[border-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40",
          className,
        )}
        {...props}
      >
        {children}
      </select>
      <ChevronDown
        className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        aria-hidden
      />
    </div>
  );
}

export function SectionCard({
  title,
  action,
  children,
}: {
  title: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className={action ? "flex-row items-center justify-between gap-3" : undefined}>
        <CardTitle>{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export function GateList({ items }: { items: GateItem[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {items.map((item) => (
        <li key={item.id} className="flex gap-3 text-sm">
          <span className="mt-0.5 shrink-0" aria-hidden>
            {item.ok ? (
              <Check className="size-4 text-buy" strokeWidth={1.75} />
            ) : item.hard ? (
              <X className="size-4 text-sell" strokeWidth={1.75} />
            ) : (
              <Minus className="size-4 text-wait" strokeWidth={1.75} />
            )}
          </span>
          <span className="sr-only">
            {item.ok ? "Passed" : item.hard ? "Failed" : "Soft fail"}:{" "}
          </span>
          <div className="min-w-0">
            <p className={item.ok || item.hard ? "text-foreground" : "text-muted-foreground"}>
              {item.title}
            </p>
            {item.detail ? <p className="text-xs text-muted-foreground">{item.detail}</p> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export function Disclosure({ title, children }: { title: string; children: ReactNode }) {
  return (
    <details className="group border-t border-border pt-1">
      <summary className="flex h-11 min-h-11 cursor-pointer items-center justify-between gap-3 text-sm font-medium">
        {title}
        <ChevronDown
          className="size-4 shrink-0 text-muted-foreground transition-transform duration-150 group-open:rotate-180"
          aria-hidden
        />
      </summary>
      <div className="pb-2 pt-1">{children}</div>
    </details>
  );
}
