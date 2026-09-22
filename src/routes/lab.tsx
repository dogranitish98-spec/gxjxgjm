import { createFileRoute } from "@tanstack/react-router";
import { LabView } from "@/components/lab-view";

export const Route = createFileRoute("/lab")({ component: LabView });
