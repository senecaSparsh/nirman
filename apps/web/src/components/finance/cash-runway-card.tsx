import Link from "next/link";
import { TrendingDown, TrendingUp, Landmark } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/**
 * CashRunwayCard — next-30-day money position for the owner:
 * expected collections in vs committed spend out, with the components
 * visible so the number is trusted rather than a black box.
 */
export function CashRunwayCard({
  expectedIn,
  committedOut,
  statutoryDue,
  draftPayroll,
  posInFlight,
}: {
  expectedIn: number;
  committedOut: number;
  statutoryDue: number;
  draftPayroll: number;
  posInFlight: number;
}) {
  const net = expectedIn - committedOut;
  const positive = net >= 0;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border px-4 py-3 ${positive ? "border-success-border bg-success-soft/40" : "border-danger/30 bg-danger-soft/30"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${positive ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
          {positive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        </div>
        <div>
          <p className="text-body font-semibold text-foreground">
            Next 30 days: <span className="tnum">{formatCurrency(net)}</span> {positive ? "net inflow" : "net shortfall"}
          </p>
          <p className="text-caption text-muted-foreground">
            {formatCurrency(expectedIn)} expected from installments · {formatCurrency(committedOut)} committed
            {posInFlight > 0 && ` (POs ${formatCurrency(posInFlight)}`}
            {draftPayroll > 0 && ` · payroll ${formatCurrency(draftPayroll)}`}
            {statutoryDue > 0 && ` · statutory ${formatCurrency(statutoryDue)}`}
            {posInFlight > 0 && ")"}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        <Link
          href="/reports/pending-payments"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input bg-card px-3 text-[13px] font-medium text-foreground shadow-raised transition-colors hover:border-border-strong hover:bg-muted"
        >
          <Landmark className="size-3.5" /> Collections & payables
        </Link>
      </div>
    </div>
  );
}
