import { createFileRoute } from "@tanstack/react-router";
import { HistoryDetailView } from "@/components/history-detail-view";

export const Route = createFileRoute("/history/$analysisId")({
  component: HistoryDetailPage,
});

function HistoryDetailPage() {
  const { analysisId } = Route.useParams();
  return <HistoryDetailView analysisId={analysisId} />;
}
