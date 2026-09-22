import { EmptyState, PageHeader } from "@/components/chrome";
import { useAppStore } from "@/store/app-store";

export function AuditView() {
  const journal = useAppStore((s) => s.journal);
  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow="Log"
        title="Activity"
        description="Append-only on this device. Decisions, paper fills, scans, and risk latches."
      />
      {journal.length === 0 ? (
        <EmptyState
          title="Nothing recorded yet"
          description="Analyze a market or run a scan. Every action on this device is listed here."
        />
      ) : (
        <ol className="flex flex-col">
          {journal.map((e) => (
            <li key={e.id} className="border-b border-border py-4 first:pt-0">
              <p className="text-xs text-muted-foreground">
                {e.kind} · {new Date(e.atMs).toISOString().slice(0, 19).replace("T", " ")} UTC
                {e.symbol ? ` · ${e.symbol}` : ""}
              </p>
              <p className="mt-1 text-sm">{e.title}</p>
              <p className="text-xs text-muted-foreground">{e.detail}</p>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
