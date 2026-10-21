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
    <div className="flex flex-wrap items-center justify-between gap-4 rounded-lg border border-warning-border bg-warning-soft/50 px-4 py-3">
      <div className="flex items-start gap-3">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-warning/15 text-warning">
          <AlertCircle className="size-4" />
        </div>
        <div>
          <p className="text-body font-semibold text-foreground">
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
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-[13px] font-medium text-foreground shadow-raised transition-colors hover:border-border-strong hover:bg-muted"
        >
          View outstanding <ArrowRight className="size-3.5" />
        </Link>
        <Link
          href="/sales"
          className="inline-flex h-8 items-center rounded-md bg-primary px-3 text-[13px] font-medium text-primary-foreground shadow-raised shadow-inset transition-colors hover:bg-primary/88"
        >
          Record Payment
        </Link>
      </div>
    </div>
  );
}
