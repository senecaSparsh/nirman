"use client";

import Link from "next/link";
import { AlertCircle, ArrowRight } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/**
 * OutstandingActionCard — converts the "Outstanding" stat into an
 * actionable card with links to record payments and view outstanding sales.
 */
export function OutstandingActionCard({
  outstanding,
  outstandingSaleCount,
}: {
  outstanding: number;
  outstandingSaleCount: number;
}) {
  if (outstanding <= 0) return null;

  return (
    <div className="flex items-center justify-between rounded-lg border border-warning/30 bg-warning/5 p-4">
      <div className="flex items-start gap-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-warning/10 text-warning">
          <AlertCircle className="h-4.5 w-4.5" />
        </div>
        <div>
          <p className="text-body font-medium text-foreground">
            {formatCurrency(outstanding)} outstanding from customers
          </p>
          <p className="text-caption text-muted-foreground">
            {outstandingSaleCount} sale{outstandingSaleCount === 1 ? "" : "s"} with pending balance — record payments to update your collection position.
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/sales?filter=outstanding"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-card px-3 text-body font-medium text-foreground transition-colors hover:bg-muted/40"
        >
          View outstanding <ArrowRight className="size-3.5" />
        </Link>
        <Link
          href="/sales"
          className="inline-flex h-8 items-center rounded-md bg-brand px-3 text-body font-medium text-brand-foreground transition-colors hover:bg-brand/90"
        >
          Record Payment
        </Link>
      </div>
    </div>
  );
}
