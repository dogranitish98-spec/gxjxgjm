import { createFileRoute } from "@tanstack/react-router";
import { AuditView } from "@/components/audit-view";

export const Route = createFileRoute("/audit")({ component: AuditView });
