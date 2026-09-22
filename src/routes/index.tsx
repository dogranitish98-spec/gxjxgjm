import { createFileRoute } from "@tanstack/react-router";
import { DeskView } from "@/components/desk-view";

export const Route = createFileRoute("/")({
  validateSearch: (search: Record<string, unknown>) => ({
    symbol: typeof search.symbol === "string" ? search.symbol : undefined,
  }),
  component: Home,
});

function Home() {
  const { symbol } = Route.useSearch();
  return <DeskView key={symbol ?? "ETHUSDT"} initialSymbol={symbol ?? "ETHUSDT"} />;
}
