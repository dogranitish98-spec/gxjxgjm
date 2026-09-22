import { createFileRoute } from "@tanstack/react-router";
import { TournamentView } from "@/components/tournament-view";

export const Route = createFileRoute("/tournament")({ component: TournamentView });
