import { createFileRoute } from "@tanstack/react-router";
import { ScannerView } from "@/components/scanner-view";

export const Route = createFileRoute("/scanner")({ component: ScannerView });
