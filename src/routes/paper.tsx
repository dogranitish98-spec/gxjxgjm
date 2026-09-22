import { createFileRoute } from "@tanstack/react-router";
import { PaperView } from "@/components/paper-view";

export const Route = createFileRoute("/paper")({ component: PaperView });
