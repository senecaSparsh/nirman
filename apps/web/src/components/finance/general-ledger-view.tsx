"use client";

import { useEffect, useState } from "react";
import { useFetch } from "@/lib/use-fetch";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Link from "next/link";
import { BookOpen, Loader2, CheckCircle2, AlertCircle, ExternalLink, RefreshCw, TriangleAlert, Coins, DatabaseZap, Landmark, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DataTable, type Column } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { Dialog } from "@/components/ui/dialog";
import { Input, Label, Select } from "@/components/ui/input";
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
  journalEntryId: string;
  entryNumber: string;
  entryDate: string;
  sourceType: string;
  isReversed: boolean;
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
function ledgerColumns(
  fmt: (v: number | string | null | undefined) => string,
  opts?: { canManage?: boolean; onReverse?: (l: LedgerLine) => void; reversingId?: string | null },
): Column<LedgerLine>[] {
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
  ...(opts?.canManage
    ? [{
        key: "actions",
        label: "",
        sortable: false,
        render: (l: LedgerLine) =>
          l.isReversed || l.sourceType.endsWith("_REVERSAL") ? (
            <Badge variant="muted">{l.sourceType.endsWith("_REVERSAL") ? "reversal" : "reversed"}</Badge>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              disabled={opts.reversingId === l.journalEntryId}
              onClick={() => opts.onReverse?.(l)}
              title="Post a reversing entry for this journal entry"
            >
              {opts.reversingId === l.journalEntryId ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Undo2 className="h-3 w-3" />
              )}
            </Button>
          ),
        exportValue: () => "",
      } as Column<LedgerLine>]
    : []),
];
}

export function GeneralLedgerView({
  accounts,
  trialBalance,
  totalDebit,
  totalCredit,
  isBalanced,
  canManage,
  projects = [],
}: {
  accounts: AccountRow[];
  trialBalance: TrialBalanceRow[];
  totalDebit: number;
  totalCredit: number;
  isBalanced: boolean;
  canManage?: boolean;
  projects?: { id: string; name: string }[];
}) {
  const [selectedAccount, setSelectedAccount] = useState<string | null>(null);
  const {
    data: ledgerData,
    loading: loadingLedger,
    error: ledgerError,
  } = useFetch<{ lines: LedgerLine[]; hasMore: boolean; nextCursor: string | null }>(
    selectedAccount ? `/api/gl/ledger?account=${encodeURIComponent(selectedAccount)}` : null,
  );
  const ledger = ledgerData?.lines ?? null;
  const [seeding, setSeeding] = useState(false);
  const [reversingId, setReversingId] = useState<string | null>(null);
  const [openingOpen, setOpeningOpen] = useState(false);
  const [voucherOpen, setVoucherOpen] = useState(false);
  const { mode, toggle } = useCurrencyMode();
  const showPaise = mode === "detailed";
  const router = useRouter();

  // Currency formatter based on global precision toggle
  const fmt = showPaise ? formatCurrencyDetailed : formatCurrencyCompact;

  useEffect(() => {
    if (ledgerError) toast.error("Failed to load account ledger");
  }, [ledgerError]);

  async function reverseEntry(l: LedgerLine) {
    if (!window.confirm(
      `Reverse journal entry ${l.entryNumber}?\n\nPosts a mirror entry that un-does every debit/credit — the standard correction (books are append-only).`,
    )) return;
    setReversingId(l.journalEntryId);
    try {
      const res = await fetch(`/api/gl/entries/${l.journalEntryId}/reverse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to reverse entry");
      toast.success(`Reversed — posted ${data.entryNumber}`);
      router.refresh();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to reverse entry");
    } finally {
      setReversingId(null);
    }
  }

  return (
    <div className="space-y-5">
      {/* Balance status banner */}
      <div
        className={`flex items-center gap-2.5 rounded-lg border px-4 py-3 ${
          isBalanced
            ? "border-success-border bg-success-soft/50 text-foreground [&_svg]:text-success"
            : "border-danger-border bg-danger-soft/50 text-foreground [&_svg]:text-danger"
        }`}
      >
        {isBalanced ? (
          <CheckCircle2 className="size-4 shrink-0" />
        ) : (
          <AlertCircle className="size-4 shrink-0" />
        )}
        <span className="text-body font-medium">
          {isBalanced
            ? "Books are balanced — total debits equal total credits."
            : `Books are out of balance — debits exceed credits by ${fmt(totalDebit - totalCredit)}. Contact support.`}
        </span>
      </div>

      {/* Trial balance */}
      <Card>
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
            <div className="flex items-center gap-4">
              <h2 className="text-section text-foreground">Trial Balance</h2>
              <div className="flex items-center gap-3 text-caption text-muted-foreground">
                <span>
                  Debit: <span className="tnum font-semibold text-foreground">{fmt(totalDebit)}</span>
                </span>
                <span>
                  Credit: <span className="tnum font-semibold text-foreground">{fmt(totalCredit)}</span>
                </span>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 text-caption">
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
              {canManage && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1.5"
                disabled={seeding}
                onClick={async () => {
                  setSeeding(true);
                  try {
                    const res = await fetch("/api/gl/accounts", { method: "POST" });
                    const data = await res.json();
                    if (!res.ok) throw new Error(data.error ?? "Failed to re-seed");
                    toast.success(`Chart of accounts re-seeded (${data.count} accounts)`);
                    router.refresh();
                  } catch (err: unknown) {
                    toast.error(err instanceof Error ? err.message : "Failed to re-seed");
                  } finally {
                    setSeeding(false);
                  }
                }}
                title="Re-seed the chart of accounts (idempotent upsert)"
              >
                {seeding ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <DatabaseZap className="h-3.5 w-3.5" />}
                Re-seed
              </Button>
              )}
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5"
                  onClick={() => setVoucherOpen(true)}
                  title="Post a manual journal voucher — accrual, write-off, reclass"
                >
                  <BookOpen className="h-3.5 w-3.5" />
                  Journal voucher
                </Button>
              )}
              {canManage && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 gap-1.5"
                  onClick={() => setOpeningOpen(true)}
                  title="Post the opening cash/bank balance for go-live"
                >
                  <Landmark className="h-3.5 w-3.5" />
                  Opening balance
                </Button>
              )}
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
                columns={ledgerColumns(fmt, { canManage, onReverse: reverseEntry, reversingId })}
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

      <OpeningBalanceDialog
        open={openingOpen}
        onClose={() => setOpeningOpen(false)}
        onPosted={() => router.refresh()}
      />
      <JournalVoucherDialog
        open={voucherOpen}
        accounts={accounts}
        projects={projects}
        onClose={() => setVoucherOpen(false)}
        onPosted={() => router.refresh()}
      />
    </div>
  );
}

function OpeningBalanceDialog({
  open,
  onClose,
  onPosted,
}: {
  open: boolean;
  onClose: () => void;
  onPosted: () => void;
}) {
  const [amount, setAmount] = useState("");
  const [asOfDate, setAsOfDate] = useState("");
  const [memo, setMemo] = useState("");
  const [posting, setPosting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    try {
      const res = await fetch("/api/gl/opening-balance", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          amount: Number(amount),
          ...(asOfDate ? { asOfDate } : {}),
          ...(memo.trim() ? { memo: memo.trim() } : {}),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post");
      toast.success(`Opening balance posted — ${data.entryNumber}`);
      onClose();
      onPosted();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Opening cash/bank balance"
      description="Post the balance in the bank on go-live day. Debits Cash/Bank (1000), credits Opening Balance Equity (3100). One-time entry — corrections need a reversal."
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="ob-amount">Amount (₹) *</Label>
          <Input id="ob-amount" type="number" min="0.01" step="0.01" required autoFocus value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000000" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="ob-date">As-of date</Label>
            <Input id="ob-date" type="date" value={asOfDate} onChange={(e) => setAsOfDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ob-memo">Memo</Label>
            <Input id="ob-memo" value={memo} onChange={(e) => setMemo(e.target.value)} placeholder="Opening balance" />
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={posting}>Cancel</Button>
          <Button type="submit" disabled={posting}>{posting ? "Posting…" : "Post opening balance"}</Button>
        </div>
      </form>
    </Dialog>
  );
}

type VoucherLine = { accountCode: string; debit: string; credit: string; projectId: string };

function JournalVoucherDialog({
  open,
  accounts,
  projects,
  onClose,
  onPosted,
}: {
  open: boolean;
  accounts: AccountRow[];
  projects?: { id: string; name: string }[];
  onClose: () => void;
  onPosted: () => void;
}) {
  const [memo, setMemo] = useState("");
  const [entryDate, setEntryDate] = useState("");
  const [lines, setLines] = useState<VoucherLine[]>([
    { accountCode: "", debit: "", credit: "", projectId: "" },
    { accountCode: "", debit: "", credit: "", projectId: "" },
  ]);
  const [posting, setPosting] = useState(false);

  const totalDr = lines.reduce((s, l) => s + (Number(l.debit) || 0), 0);
  const totalCr = lines.reduce((s, l) => s + (Number(l.credit) || 0), 0);
  const balanced = totalDr === totalCr && totalDr > 0;

  function setLine(i: number, patch: Partial<VoucherLine>) {
    setLines((prev) => prev.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setPosting(true);
    try {
      const res = await fetch("/api/gl/journal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          memo,
          ...(entryDate ? { entryDate } : {}),
          lines: lines.map((l) => ({
            accountCode: l.accountCode,
            debit: Number(l.debit) || 0,
            credit: Number(l.credit) || 0,
            ...(l.projectId ? { entityType: "Project", entityId: l.projectId } : {}),
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to post voucher");
      toast.success(`Journal voucher posted — ${data.entryNumber}`);
      setLines([{ accountCode: "", debit: "", credit: "", projectId: "" }, { accountCode: "", debit: "", credit: "", projectId: "" }]);
      setMemo("");
      setEntryDate("");
      onClose();
      onPosted();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to post");
    } finally {
      setPosting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Journal voucher"
      description="Manual adjustment with no source document — accrual, write-off, reclassification. Debits must equal credits; corrections go through reversal."
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="jv-memo">Narration *</Label>
            <Input id="jv-memo" value={memo} onChange={(e) => setMemo(e.target.value)} required autoFocus placeholder="e.g. Accrue October salaries" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="jv-date">Date</Label>
            <Input id="jv-date" type="date" value={entryDate} onChange={(e) => setEntryDate(e.target.value)} />
          </div>
        </div>
        <div className="space-y-2">
          <div className="grid grid-cols-[1fr_6rem_6rem_7rem_2rem] gap-2 text-caption font-medium text-muted-foreground">
            <span>Account</span><span className="text-right">Debit</span><span className="text-right">Credit</span><span>Project</span><span />
          </div>
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_6rem_6rem_7rem_2rem] gap-2 items-center">
              <Select aria-label="Date" value={l.accountCode} onChange={(e) => setLine(i, { accountCode: e.target.value })} required>
                <option value="">Pick account…</option>
                {accounts.map((a) => (
                  <option key={a.code} value={a.code}>{a.code} — {a.name}</option>
                ))}
              </Select>
              <Input type="number" min="0" step="0.01" value={l.debit} onChange={(e) => setLine(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })} placeholder="0" />
              <Input type="number" min="0" step="0.01" value={l.credit} onChange={(e) => setLine(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })} placeholder="0" />
              <Select value={l.projectId} onChange={(e) => setLine(i, { projectId: e.target.value })} title="Optional — allocate this line to a project (e.g. WIP write-off)">
                <option value="">—</option>
                {(projects ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </Select>
              <button
                type="button"
                className="text-muted-foreground hover:text-danger disabled:opacity-30"
                disabled={lines.length <= 2}
                onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}
                title="Remove line"
              >
                ×
              </button>
            </div>
          ))}
          <div className="flex items-center justify-between">
            <Button type="button" variant="ghost" size="sm" onClick={() => setLines((p) => [...p, { accountCode: "", debit: "", credit: "", projectId: "" }])}>
              + Add line
            </Button>
            <div className={`text-caption font-medium ${balanced ? "text-success" : "text-muted-foreground"}`}>
              Dr {formatCurrencyCompact(totalDr)} / Cr {formatCurrencyCompact(totalCr)}{balanced ? " ✓" : ""}
            </div>
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={posting}>Cancel</Button>
          <Button type="submit" disabled={posting || !balanced}>{posting ? "Posting…" : "Post voucher"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
