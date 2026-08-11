"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { BookOpen, Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, TriangleAlert, Coins } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrencyCompact, formatCurrencyDetailed, formatDate } from "@/lib/utils";
import { useCurrencyMode } from "@/components/currency-provider";
import { entityUrl } from "@/lib/entity-url";

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
  CONTRA_EXPENSE: "muted",
};

/**
 * Detect abnormal account balances — asset accounts should have debit
 * balances, liability accounts should have credit balances. A negative
 * balance on either indicates a posting error (e.g. WIP capitalization
 * was never posted, so UNIT_ASSET went negative from sale COGS credits
 * with no offsetting capitalization debits).
 */
function isAbnormalBalance(type: string, balance: number): boolean {
  if (balance === 0) return false;
  if (type === "ASSET" && balance < 0) return true; // asset with credit balance
  if (type === "LIABILITY" && balance > 0) return true; // liability with debit balance
  return false;
}

/**
 * Map a journal line's entityType + entityId to a navigable URL so the
 * accountant can drill from any GL line back to the source document.
 */
function sourceDocUrl(entityType: string | null, entityId: string | null): string | null {
  return entityUrl(entityType, entityId);
}

/** Column definitions for the trial balance DataTable. */
function trialBalanceColumns(fmt: (v: number | string | null | undefined) => string): Column<TrialBalanceRow>[] {
  return [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (r) => <span className="font-mono text-caption font-medium">{r.code}</span>,
    exportValue: (r) => r.code,
  },
  {
    key: "name",
    label: "Account",
    sortable: true,
    render: (r) => (
      <span className="flex items-center gap-1.5">
        <span className="text-body font-medium">{r.name}</span>
        {isAbnormalBalance(r.type, r.balance) && (
          <span
            title={`Abnormal balance: ${r.type} account has ${r.balance < 0 ? "credit" : "debit"} balance (expected ${r.type === "ASSET" ? "debit" : "credit"})`}
          >
            <TriangleAlert className="h-3.5 w-3.5 text-danger" />
          </span>
        )}
      </span>
    ),
    exportValue: (r) => r.name,
  },
  {
    key: "type",
    label: "Type",
    sortable: true,
    filterable: true,
    render: (r) => <Badge variant={TYPE_VARIANT[r.type] ?? "default"}>{r.type}</Badge>,
    filterValue: (r) => r.type,
    exportValue: (r) => r.type,
  },
  {
    key: "debit",
    label: "Debit",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum">{r.debit !== 0 ? fmt(r.debit) : "—"}</span>,
    exportValue: (r) => r.debit,
  },
  {
    key: "credit",
    label: "Credit",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum">{r.credit !== 0 ? fmt(r.credit) : "—"}</span>,
    exportValue: (r) => r.credit,
  },
  {
    key: "balance",
    label: "Balance",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum font-medium">{fmt(r.balance)}</span>,
    exportValue: (r) => r.balance,
  },
];
}

/** Column definitions for the account ledger drill-down DataTable. */
function ledgerColumns(fmt: (v: number | string | null | undefined) => string): Column<LedgerLine>[] {
  return [
  {
    key: "entryNumber",
    label: "Entry #",
    sortable: true,
    render: (l) => <span className="font-mono text-caption font-semibold text-foreground">{l.entryNumber}</span>,
    exportValue: (l) => l.entryNumber,
  },
  {
    key: "entryDate",
    label: "Date",
    sortable: true,
    sortValue: (l) => new Date(l.entryDate),
    render: (l) => <span className="tnum text-muted-foreground">{formatDate(l.entryDate)}</span>,
    exportValue: (l) => l.entryDate,
  },
  {
    key: "sourceType",
    label: "Source",
    sortable: true,
    filterable: true,
    render: (l) => {
      const docUrl = sourceDocUrl(l.entityType, l.entityId);
      return docUrl ? (
        <Link
          href={docUrl}
          className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          title={`Open ${l.entityType}`}
        >
          <Badge variant="muted">{l.sourceType}</Badge>
          <ExternalLink className="h-3 w-3 text-muted-foreground/50" />
        </Link>
      ) : (
        <Badge variant="muted">{l.sourceType}</Badge>
      );
    },
    filterValue: (l) => l.sourceType,
    exportValue: (l) => l.sourceType,
  },
  {
    key: "memo",
    label: "Memo",
    sortable: true,
    render: (l) => <span className="text-muted-foreground">{l.memo ?? "—"}</span>,
    exportValue: (l) => l.memo ?? "",
  },
  {
    key: "debit",
    label: "Debit",
    align: "right",
    sortable: true,
    render: (l) => <span className="tnum">{l.debit !== 0 ? fmt(l.debit) : "—"}</span>,
    exportValue: (l) => l.debit,
  },
  {
    key: "credit",
    label: "Credit",
    align: "right",
    sortable: true,
    render: (l) => <span className="tnum">{l.credit !== 0 ? fmt(l.credit) : "—"}</span>,
    exportValue: (l) => l.credit,
  },
];
}

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
  const { mode, toggle } = useCurrencyMode();
  const showPaise = mode === "detailed";
  const router = useRouter();

  // Currency formatter based on global precision toggle
  const fmt = showPaise ? formatCurrencyDetailed : formatCurrencyCompact;

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
            <div className="flex items-center gap-4 text-caption">
              <span>
                Total Debit: <span className="tnum font-medium">{fmt(totalDebit)}</span>
              </span>
              <span>
                Total Credit: <span className="tnum font-medium">{fmt(totalCredit)}</span>
              </span>
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5"
                onClick={toggle}
                title={showPaise ? "Hide paise (show compact ₹1.2L)" : "Show paise (2 decimal places)"}
              >
                <Coins className="h-3.5 w-3.5" />
                {showPaise ? "₹0.00" : "₹0"}
              </Button>
              <Button variant="outline" size="icon" className="h-7 w-7" onClick={() => router.refresh()} title="Refresh">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          {trialBalance.length === 0 ? (
            <EmptyState
              icon={<BookOpen className="h-5 w-5" />}
              title="No journal entries yet"
              description="Post a purchase receipt, material issue, asset sale, or expense to populate the ledger."
            />
          ) : (
            <DataTable
              data={trialBalance}
              columns={trialBalanceColumns(fmt)}
              storageKey="gl-trial-balance"
              hideable
              exportFileName="trial-balance"
              onRowClick={(row) => setSelectedAccount(row.code)}
              searchable
              searchPlaceholder="Search by code, account name…"
              pageSize={50}
              showTotals
              sumColumns={["debit", "credit"]}
              totalFormat={(_k, sum) => fmt(sum)}
            />
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
              <DataTable
                data={ledger}
                initialSort={{ key: "entryDate", direction: "desc" }}
                columns={ledgerColumns(fmt)}
                storageKey="gl-ledger"
                hideable
                exportFileName="account-ledger"
                searchable
                searchPlaceholder="Search by entry no, source, memo…"
                showTotals
                sumColumns={["debit", "credit"]}
                totalFormat={(_k, sum) => fmt(sum)}
                pageSize={50}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
