"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BookOpen, Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency } from "@/lib/utils";

type AccountRow = { code: string; name: string; type: string; isSystem: boolean };
type TrialBalanceRow = {
  code: string;
  name: string;
  type: string;
  debit: number;
  credit: number;
  balance: number;
};
type LedgerLine = {
  id: string;
  entryNumber: string;
  entryDate: string;
  sourceType: string;
  memo: string | null;
  debit: number;
  credit: number;
  entityType: string | null;
  entityId: string | null;
};

const TYPE_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  ASSET: "default",
  LIABILITY: "warning",
  EQUITY: "muted",
  REVENUE: "success",
  EXPENSE: "danger",
};

export function GeneralLedgerView({
  accounts,
  trialBalance,
  totalDebit,
  totalCredit,
  isBalanced,
}: {
  accounts: AccountRow[];
  trialBalance: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
}) {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const [ledger, setLedger] = useState<LedgerLine[] | null>(null);
  const [loadingLedger, setLoadingLedger] = useState(false);

  useEffect(() => {
    if (!selectedAccount) {
      setLedger(null);
      return;
    }
    setLoadingLedger(true);
    fetch(`/api/gl/ledger?account=${encodeURIComponent(selectedAccount)}`)
      .then((r) => (r.ok ? r.json() : []))
      .then((d: LedgerLine[]) => setLedger(d))
      .catch(() => {
        toast.error("Failed to load account ledger");
        setLedger([]);
      })
      .finally(() => setLoadingLedger(false));
  }, [selectedAccount]);

  return (
    <div className="space-y-5">
      {/* Balance status banner */}
      <div
        className={`flex items-center gap-2 rounded-xl border p-4 ${
          isBalanced
            ? "border-success/30 bg-success/5 text-success"
            : "border-danger/30 bg-danger/5 text-danger"
        }`}
      >
        {isBalanced ? (
          <CheckCircle2 className="h-5 w-5" />
        ) : (
          <AlertCircle className="h-5 w-5" />
        )}
        <span className="text-body font-medium">
          {isBalanced
            ? "Books are balanced — total debits equal total credits."
            : "Books are out of balance — contact support."}
        </span>
      </div>

      {/* Trial balance */}
      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b border-border px-4 py-3">
            <h3 className="text-body font-semibold">Trial Balance</h3>
            <div className="flex gap-4 text-caption">
              <span>
                Total Debit: <span className="tnum font-medium">{formatCurrency(totalDebit)}</span>
              </span>
              <span>
                Total Credit: <span className="tnum font-medium">{formatCurrency(totalCredit)}</span>
              </span>
            </div>
          </div>
          {trialBalance.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-5 w-5" />}
              title="No journal entries yet"
              description="Post a purchase receipt, material issue, asset sale, or expense to populate the ledger."
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Code</TH>
                  <TH>Account</TH>
                  <TH>Type</TH>
                  <TH className="text-right">Debit</TH>
                  <TH className="text-right">Credit</TH>
                  <TH className="text-right">Balance</TH>
                </TR>
              </THead>
              <TBody>
                {trialBalance.map((row) => (
                  <TR
                    key={row.code}
                    className={selectedAccount === row.code ? "bg-muted/50" : ""}
                    onClick={() => setSelectedAccount(row.code)}
                    style={{ cursor: "pointer" }}
                  >
                    <TD className="font-mono text-caption font-medium">{row.code}</TD>
                    <TD className="text-body font-medium">{row.name}</TD>
                    <TD>
                      <Badge variant={TYPE_VARIANT[row.type] ?? "default"}>{row.type}</Badge>
                    </TD>
                    <TD className="text-right tnum">
                      {row.debit !== 0 ? formatCurrency(row.debit) : "—"}
                    </TD>
                    <TD className="text-right tnum">
                      {row.credit !== 0 ? formatCurrency(row.credit) : "—"}
                    </TD>
                    <TD className="text-right tnum font-medium">{formatCurrency(row.balance)}</TD>
                  </TR>
                ))}
                <TR className="border-t-2 border-border font-semibold">
                  <TD colSpan={3} className="text-body">
                    Totals
                  </TD>
                  <TD className="text-right tnum">{formatCurrency(totalDebit)}</TD>
                  <TD className="text-right tnum">{formatCurrency(totalCredit)}</TD>
                  <TD className="text-right tnum">
                    {formatCurrency(totalDebit - totalCredit)}
                  </TD>
                </TR>
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Account ledger drill-down */}
      {selectedAccount && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <h3 className="text-body font-semibold">
                Ledger — {accounts.find((a) => a.code === selectedAccount)?.name ?? selectedAccount}
              </h3>
              <button
                className="text-caption text-muted-foreground hover:text-foreground"
                onClick={() => setSelectedAccount(null)}
              >
                Close
              </button>
            </div>
            {loadingLedger ? (
              <div className="flex items-center justify-center p-8 text-muted-foreground">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : !ledger || ledger.length === 0 ? (
              <EmptyState
                icon={<BookOpen className="h-5 w-5" />}
                title="No entries for this account"
                description="This account has no posted journal lines."
              />
            ) : (
              <Table>
                <THead>
                  <TR className="hover:bg-transparent">
                    <TH>Entry #</TH>
                    <TH>Date</TH>
                    <TH>Source</TH>
                    <TH>Memo</TH>
                    <TH className="text-right">Debit</TH>
                    <TH className="text-right">Credit</TH>
                  </TR>
                </THead>
                <TBody>
                  {ledger.map((l) => (
                    <TR key={l.id}>
                      <TD className="font-mono text-caption">{l.entryNumber}</TD>
                      <TD className="text-caption text-muted-foreground">
                        {new Date(l.entryDate).toLocaleDateString()}
                      </TD>
                      <TD>
                        <Badge variant="muted">{l.sourceType}</Badge>
                      </TD>
                      <TD className="text-body text-muted-foreground">{l.memo ?? "—"}</TD>
                      <TD className="text-right tnum">
                        {l.debit !== 0 ? formatCurrency(l.debit) : "—"}
                      </TD>
                      <TD className="text-right tnum">
                        {l.credit !== 0 ? formatCurrency(l.credit) : "—"}
                      </TD>
                    </TR>
                  ))}
                </TBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
