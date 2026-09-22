import { createFileRoute } from "@tanstack/react-router";
import { HistoryView } from "@/components/history-view";

export const Route = createFileRoute("/history")({
  component: HistoryView,
});
