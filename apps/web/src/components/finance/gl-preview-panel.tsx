"use client";

import { useEffect, useState } from "react";
import { BookOpen, ChevronDown, ChevronRight, Loader2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyDetailed, formatCurrencyCompact } from "@/lib/utils";
import type { GlPreviewLine } from "@nirman/services/gl-preview";

/**
 * GL Impact Preview Panel — a collapsible inline panel (not a modal)
 * that shows which accounts will be debited and credited before the
 * user confirms a financial action. Renders inline in the form, before
 * the submit/post button.
 *
 * The preview lines are computed server-side (pure functions, no
 * persistence) and passed in as props. The panel also fetches the
 * current trial balance to show the resulting balance after posting.
 */
export function GlPreviewPanel({
  lines,
  title = "GL Impact Preview",
  description = "These journal entries will be posted when you confirm.",
  defaultOpen = false,
}: {
  lines: GlPreviewLine[];
  title?: string;
  description?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [currentBalances, setCurrentBalances] = useState<Record<string, number>>({});
  const [loadingBalances, setLoadingBalances] = useState(false);

  const totalDebit = lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = lines.reduce((s, l) => s + l.credit, 0);
  const balanced = Math.abs(totalDebit - totalCredit) < 0.01;
  const hasLines = lines.length > 0;

  useEffect(() => {
    if (!open || !hasLines) return;
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
  }, [open, hasLines, lines]);

  function resultingBalance(code: string, debit: number, credit: number): number | null {
    const current = currentBalances[code];
    if (current == null) return null;
    return current + debit - credit;
  }

  if (!hasLines) return null;

  return (
    <div className="rounded-lg border border-border bg-subtle/30">
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-body font-medium text-foreground transition-colors hover:bg-subtle/60"
      >
        {open ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <BookOpen className="h-4 w-4 text-muted-foreground" />
        <span>{title}</span>
        <Badge variant={balanced ? "success" : "danger"} className="ml-auto">
          {balanced ? "Balanced" : "Imbalanced"}
        </Badge>
      </button>

      {/* Collapsible content */}
      {open && (
        <div className="space-y-3 border-t border-border px-3 py-3">
          <p className="text-caption text-muted-foreground">{description}</p>

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
                        {loadingBalances ? (
                          <Loader2 className="ml-auto h-3 w-3 animate-spin" />
                        ) : resulting != null ? (
                          formatCurrencyCompact(resulting)
                        ) : (
                          "—"
                        )}
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
      )}
    </div>
  );
}
