"use client";

import { useEffect, useState } from "react";
import { BookOpen } from "lucide-react";
import { Dialog } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyDetailed, formatCurrencyCompact } from "@/lib/utils";
import type { GlPreviewLine } from "@nirman/services";

/**
 * GL Impact Preview Dialog — shows which accounts will be debited
 * and credited before the user confirms a financial action.
 *
 * The preview lines are computed server-side (pure functions, no
 * persistence) and passed in as props. The dialog also fetches the
 * current trial balance to show the resulting balance after posting.
 */
export function GlPreviewDialog({
  open,
  onOpenChange,
  lines,
  title = "GL Impact Preview",
  description = "These journal entries will be posted when you confirm.",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  lines: GlPreviewLine[];
  title?: string;
  description?: string;
}) {
  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;

  // Fetch current account balances to show resulting balances
  const [currentBalances, setCurrentBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  useEffect(() => {
    if (!open || lines.length === 0) return;
    const codes = [...new Set(lines.map((l) => l.accountCode))];
    setLoadingBalances(true);
    fetch("/api/gl/trial-balance")
      .then((r) => r.json())
      .then((data) => {
        if (data.accounts) {
          const map: Record<string, number> = {};
          for (const a of data.accounts) {
            map[a.code] = Number(a.balance);
          }
          setCurrentBalances(map);
        }
      })
      .catch(() => { /* balances are nice-to-have, not critical */ })
      .finally(() => setLoadingBalances(false));
  }, [open, lines]);

  // Compute resulting balance = current + debit - credit
  function resultingBalance(code: string, debit: number, credit: number): number | null {
    const current = currentBalances[code];
    if (current == null) return null;
    return current + debit - credit;
  }

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={title}
      description={description}
      className="max-w-lg"
    >
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-caption text-muted-foreground">
          <BookOpen className="h-4 w-4" />
          <span>Double-entry journal preview</span>
          <Badge variant={balanced ? "success" : "danger"} className="ml-auto">
            {balanced ? "Balanced" : "Imbalanced"}
          </Badge>
        </div>

        <div className="overflow-x-auto rounded-lg border border-border">
          <table className="w-full text-body">
            <thead>
              <tr className="border-b border-border bg-subtle/50 text-left text-caption text-muted-foreground">
                <th className="px-3 py-2 font-medium">Account</th>
                <th className="px-3 py-2 text-right font-medium">Debit</th>
                <th className="px-3 py-2 text-right font-medium">Credit</th>
                <th className="px-3 py-2 text-right font-medium">Resulting Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {lines.map((line, i) => {
                const resulting = resultingBalance(line.accountCode, line.debit, line.credit);
                return (
                  <tr key={i}>
                    <td className="px-3 py-2">
                      <div className="font-medium text-foreground">{line.accountName}</div>
                      <div className="text-caption text-muted-foreground">
                        {line.accountCode}
                        {line.memo ? ` · ${line.memo}` : ""}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tnum text-foreground">
                      {line.debit > 0 ? formatCurrencyDetailed(line.debit) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tnum text-foreground">
                      {line.credit > 0 ? formatCurrencyDetailed(line.credit) : "—"}
                    </td>
                    <td className="px-3 py-2 text-right tnum text-caption text-muted-foreground">
                      {loadingBalances ? "…" : resulting != null ? formatCurrencyCompact(resulting) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-border-strong bg-subtle/50 font-semibold">
                <td className="px-3 py-2 text-foreground">Total</td>
                <td className="px-3 py-2 text-right tnum text-foreground">
                  {formatCurrencyDetailed(totalDebit)}
                </td>
                <td className="px-3 py-2 text-right tnum text-foreground">
                  {formatCurrencyDetailed(totalCredit)}
                </td>
                <td className="px-3 py-2" />
              </tr>
            </tfoot>
          </table>
        </div>

        <p className="text-caption text-muted-foreground">
          {balanced
            ? "The entry is balanced (Σ debits = Σ credits) and will post cleanly."
            : "Warning: the entry is imbalanced and will be rejected."}
        </p>
      </div>
    </Dialog>
  );
}
