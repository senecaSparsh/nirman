"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { BookOpen, Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, Download } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";

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

/**
 * Map a journal line's entityType + entityId to a navigable URL so the
 * accountant can drill from any GL line back to the source document.
 */
function sourceDocUrl(entityType: string | null, entityId: string | null): string | null {
  if (!entityType || !entityId) return null;
  const map: Record<string, (id: string) => string> = {
    PurchaseOrder: (id) => `/procurement?po=${id}`,
    Project: (id) => `/projects/${id}`,
    AssetSale: () => `/sales`,
    AssetSalePayment: () => `/sales`,
    MaterialIssue: () => `/stock?tab=issues`,
    MaterialSale: () => `/material-sales`,
    ProjectCost: () => `/finance`,
    Expense: () => `/finance`,
    SupplierReturn: () => `/supplier-returns`,
    LandPurchase: () => `/land`,
    DirectPurchase: () => `/procurement`,
    StockCount: () => `/stock?tab=counts`,
    StockTransfer: () => `/stock?tab=transfers`,
    Equipment: () => `/equipment`,
    EquipmentMaintenance: () => `/equipment`,
    PayrollPeriod: () => `/hr/payroll`,
    Tenancy: () => `/rentals`,
    RenovationProject: () => `/renovations`,
    RenovationCost: () => `/renovations`,
  };
  const fn = map[entityType];
  return fn ? fn(entityId) : null;
}

/** Column definitions for the trial balance DataTable. */
const trialBalanceColumns: Column<TrialBalanceRow>[] = [
  {
    key: "code",
    label: "Code",
    sortable: true,
    render: (r) => <span className="font-mono text-caption font-medium">{r.code}</span>,
  },
  {
    key: "name",
    label: "Account",
    sortable: true,
    render: (r) => <span className="text-body font-medium">{r.name}</span>,
  },
  {
    key: "type",
    label: "Type",
    sortable: true,
    render: (r) => <Badge variant={TYPE_VARIANT[r.type] ?? "default"}>{r.type}</Badge>,
  },
  {
    key: "debit",
    label: "Debit",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum">{r.debit !== 0 ? formatCurrency(r.debit) : "—"}</span>,
  },
  {
    key: "credit",
    label: "Credit",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum">{r.credit !== 0 ? formatCurrency(r.credit) : "—"}</span>,
  },
  {
    key: "balance",
    label: "Balance",
    align: "right",
    sortable: true,
    render: (r) => <span className="tnum font-medium">{formatCurrency(r.balance)}</span>,
  },
];

/** Column definitions for the account ledger drill-down DataTable. */
const ledgerColumns: Column<LedgerLine>[] = [
  {
    key: "entryNumber",
    label: "Entry #",
    sortable: true,
    render: (l) => <span className="font-mono text-caption font-semibold text-foreground">{l.entryNumber}</span>,
  },
  {
    key: "entryDate",
    label: "Date",
    sortable: true,
    sortValue: (l) => new Date(l.entryDate),
    render: (l) => <span className="tnum text-muted-foreground">{formatDate(l.entryDate)}</span>,
  },
  {
    key: "sourceType",
    label: "Source",
    sortable: true,
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
  },
  {
    key: "memo",
    label: "Memo",
    sortable: true,
    render: (l) => <span className="text-muted-foreground">{l.memo ?? "—"}</span>,
  },
  {
    key: "debit",
    label: "Debit",
    align: "right",
    sortable: true,
    render: (l) => <span className="tnum">{l.debit !== 0 ? formatCurrency(l.debit) : "—"}</span>,
  },
  {
    key: "credit",
    label: "Credit",
    align: "right",
    sortable: true,
    render: (l) => <span className="tnum">{l.credit !== 0 ? formatCurrency(l.credit) : "—"}</span>,
  },
];

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
  const router = useRouter();

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
                Total Debit: <span className="tnum font-medium">{formatCurrency(totalDebit)}</span>
              </span>
              <span>
                Total Credit: <span className="tnum font-medium">{formatCurrency(totalCredit)}</span>
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-7 w-7"
                onClick={() =>
                  downloadCSV("trial-balance.csv", trialBalance as unknown as Record<string, unknown>[], [
                    { key: "code", label: "Code" },
                    { key: "name", label: "Account" },
                    { key: "type", label: "Type" },
                    { key: "debit", label: "Debit", format: (v) => formatCurrency(v as number) },
                    { key: "credit", label: "Credit", format: (v) => formatCurrency(v as number) },
                  ])
                }
                title="Export CSV"
              >
                <Download className="h-3.5 w-3.5" />
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
              columns={trialBalanceColumns}
              onRowClick={(row) => setSelectedAccount(row.code)}
              searchable
              searchPlaceholder="Search by code, account name…"
              hideable
              pageSize={50}
              showTotals
              sumColumns={["debit", "credit"]}
              totalFormat={(_k, sum) => formatCurrency(sum)}
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
                columns={ledgerColumns}
                searchable
                searchPlaceholder="Search by entry no, source, memo…"
                showTotals
                sumColumns={["debit", "credit"]}
                totalFormat={(_k, sum) => formatCurrency(sum)}
                hideable
                pageSize={50}
              />
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
