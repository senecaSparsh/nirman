import Link from "next/link";
import { TrendingDown, TrendingUp, Landmark } from "lucide-react";
import { formatCurrency } from "@/lib/utils";

/**
 * CashRunwayCard — the next-30-day money position for the owner.
 *
 * The projection starts from cash actually in the bank and adds expected
 * collections, then subtracts committed spend. Without the opening balance
 * this card told an owner holding ₹7.42Cr that they faced a "-₹10.18L net
 * shortfall" — a red alert that is technically "net of flows" but reads as
 * "you are running out of money". A shortfall is only real when projected
 * cash goes negative.
 */
export function CashRunwayCard({
  openingCash,
  expectedIn,
  committedOut,
  statutoryDue,
  draftPayroll,
  posInFlight,
}: {
  openingCash: number;
  expectedIn: number;
  committedOut: number;
  statutoryDue: number;
  draftPayroll: number;
  posInFlight: number;
}) {
  const projected = openingCash + expectedIn - committedOut;
  const shortfall = projected < 0;
  const positive = !shortfall;
  const netFlow = expectedIn - committedOut;

  return (
    <div className={`flex flex-wrap items-center justify-between gap-4 rounded-lg border px-4 py-3 ${positive ? "border-success-border bg-success-soft/40" : "border-danger/30 bg-danger-soft/30"}`}>
      <div className="flex items-start gap-3">
        <div className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-md ${positive ? "bg-success/15 text-success" : "bg-danger/15 text-danger"}`}>
          {positive ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}
        </div>
        <div>
          <p className="text-body font-semibold text-foreground">
            In 30 days: <span className="tnum">{formatCurrency(projected)}</span> cash
            {shortfall && <span className="ml-2 text-danger">— shortfall</span>}
          </p>
          <p className="text-caption text-muted-foreground">
            {formatCurrency(openingCash)} in hand · {formatCurrency(expectedIn)} expected in · {formatCurrency(committedOut)} committed out
          </p>
          <p className="text-micro text-muted-foreground">
            Net movement {netFlow >= 0 ? "+" : ""}{formatCurrency(netFlow)}
            {posInFlight > 0 && ` · POs ${formatCurrency(posInFlight)}`}
            {draftPayroll > 0 && ` · payroll ${formatCurrency(draftPayroll)}`}
            {statutoryDue > 0 && ` · statutory ${formatCurrency(statutoryDue)}`}
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
