"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { AlertCircle, ArrowDownRight, ArrowUpRight, Clock, SearchX, Send, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusPill } from "@/components/page";
import { Dialog } from "@/components/ui/dialog";
import { Select, Label } from "@/components/ui/input";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate, cn, toNum} from "@/lib/utils";

export type AgingBucket = "current" | "1-30d" | "31-60d" | "61-90d" | ">90d";

export interface AgingSummary {
  current: number;
  "1-30d": number;
  "31-60d": number;
  "61-90d": number;
  ">90d": number;
}

export type OverduePORow = {
  id: string;
  /** Supplier-backed rows only — PO payables + supplier opening dues.
   *  RA bills pay subcontractors and claims pay employees through their
   *  own surfaces, so they don't carry it. */
  supplierId?: string;
  purchaseOrderId?: string;
  poNumber: string;
  supplier: string;
  isMsme?: boolean;
  expectedDate: string | null;
  orderedValue: number;
  receivedValue: number;
  payable: number;
  status: string;
  daysOverdue: number;
  agingBucket: AgingBucket;
};
export type ReceivableRow = {
  id: string;
  saleNumber: string;
  customer: string;
  project: string;
  saleDate: string;
  salePrice: number;
  collected: number;
  outstanding: number;
  paymentStatus: string;
  daysSinceSale: number;
  agingBucket: AgingBucket;
};
export type DraftPORow = {
  id: string;
  poNumber: string;
  supplier: string;
  value: number;
  createdAt: string;
};
// Overdue schedule-item row for the collections tab — carries the
// MCLR+2%-accrued interest + demand dispatch action.
export type OverdueInstallmentRow = {
  id: string;
  saleNumber: string;
  customer: string;
  installment: string;
  dueDate: string;
  daysOverdue: number;
  principal: number;
  interest: number;
  totalPayable: number;
  lastDemanded: string | null;
};

export function PendingPaymentsReport({
  overduePOs,
  receivables,
  installments = [],
  draftPOs,
  totalPayable,
  totalReceivable,
  totalDraft,
  payableAging,
  receivableAging,
  canSendReminders,
}: {
  overduePOs: OverduePORow[];
  receivables: ReceivableRow[];
  installments?: OverdueInstallmentRow[];
  draftPOs: DraftPORow[];
  totalPayable: number;
  totalReceivable: number;
  totalDraft: number;
  payableAging: AgingSummary;
  receivableAging: AgingSummary;
  canSendReminders?: boolean;
}) {
  const [sending, setSending] = useState(false);
  const [demanding, setDemanding] = useState<string | null>(null);
  const [demandAllLoading, setDemandAllLoading] = useState(false);
  const [runOpen, setRunOpen] = useState(false);
  // Deep-linkable tab — the dashboard's overdue-installments queue and any
  // notification link land straight on the collections tab.
  const searchParams = useSearchParams();
  const initialTab = ["payables", "receivables", "installments", "drafts"].includes(searchParams.get("tab") ?? "")
    ? searchParams.get("tab")!
    : "payables";
  const hasData = overduePOs.length > 0 || receivables.length > 0 || draftPOs.length > 0 || installments.length > 0;

  async function sendReminders() {
    setSending(true);
    try {
      const res = await fetch("/api/payments/send-reminders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "ALL", daysAhead: 7 }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send reminders");
      toast.success(`Sent ${data.remindersSent} payment reminder${data.remindersSent === 1 ? "" : "s"}`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send reminders");
    } finally {
      setSending(false);
    }
  }

  // Collections-day action — demand letters for every overdue installment in
  // one sweep. The 24h cooldown + PAID/WAIVED guards make repeat clicks safe:
  // only undemanded items actually dispatch.
  async function demandAll() {
    setDemandAllLoading(true);
    let sent = 0, skipped = 0;
    for (const i of installments) {
      try {
        const res = await fetch(`/api/payment-schedules/items/${i.id}/demand`, { method: "POST" });
        if (res.ok) sent++; else skipped++;
      } catch {
        skipped++;
      }
    }
    toast.success(`Demand sweep done — ${sent} sent${skipped ? `, ${skipped} skipped` : ""}`);
    setDemandAllLoading(false);
  }

  async function sendDemand(itemId: string) {
    setDemanding(itemId);
    try {
      const res = await fetch(`/api/payment-schedules/items/${itemId}/demand`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to send demand");
      toast.success(`Demand sent — ${formatCurrency(Number(data.totalPayable))} incl. ${formatCurrency(Number(data.interest))} interest`);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to send demand");
    } finally {
      setDemanding(null);
    }
  }

  const installmentColumns: Column<OverdueInstallmentRow>[] = [
    {
      key: "saleNumber",
      label: "Sale",
      sortable: true,
      render: (i) => <span className="font-mono text-sm">{i.saleNumber}</span>,
      exportValue: (i) => i.saleNumber,
    },
    { key: "customer", label: "Customer", sortable: true, exportValue: (i) => i.customer },
    { key: "installment", label: "Installment", render: (i) => <span className="text-sm">{i.installment}</span>, exportValue: (i) => i.installment },
    {
      key: "dueDate",
      label: "Due",
      sortable: true,
      sortValue: (i) => new Date(i.dueDate).getTime(),
      render: (i) => <span className="text-muted-foreground">{formatDate(i.dueDate)}</span>,
      exportValue: (i) => formatDate(i.dueDate),
    },
    {
      key: "daysOverdue",
      label: "Days Late",
      align: "right",
      sortable: true,
      render: (i) => <span className="tnum text-danger font-semibold">{i.daysOverdue}d</span>,
      exportValue: (i) => i.daysOverdue,
    },
    {
      key: "principal",
      label: "Principal",
      align: "right",
      sortable: true,
      render: (i) => <span className="tnum">{formatCurrency(i.principal)}</span>,
      exportValue: (i) => i.principal,
    },
    {
      key: "interest",
      label: "Interest (MCLR+2%)",
      align: "right",
      sortable: true,
      render: (i) => <span className="tnum text-warning">{formatCurrency(i.interest)}</span>,
      exportValue: (i) => i.interest,
    },
    {
      key: "totalPayable",
      label: "Total Demanded",
      align: "right",
      sortable: true,
      render: (i) => <span className="tnum font-bold">{formatCurrency(i.totalPayable)}</span>,
      exportValue: (i) => i.totalPayable,
    },
    {
      key: "lastDemanded",
      label: "Demanded",
      sortable: true,
      sortValue: (i) => (i.lastDemanded ? new Date(i.lastDemanded).getTime() : 0),
      render: (i) =>
        i.lastDemanded
          ? <span className="text-caption text-muted-foreground">{formatDate(i.lastDemanded)}</span>
          : <span className="text-micro text-warning">never</span>,
      exportValue: (i) => (i.lastDemanded ? formatDate(i.lastDemanded) : "never"),
    },
    {
      key: "demand",
      label: "",
      align: "right",
      render: (i) =>
        canSendReminders ? (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            disabled={demanding === i.id}
            onClick={() => sendDemand(i.id)}
          >
            {demanding === i.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Demand
          </Button>
        ) : null,
    },
  ];

  if (!hasData) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-5 w-5" />}
        title="No pending payments"
        description="All received goods are paid for and all sales are fully collected."
      />
    );
  }

  const netCash = totalReceivable - totalPayable;

  const overdueColumns: Column<OverduePORow>[] = [
    {
      key: "poNumber",
      label: "PO",
      sortable: true,
      render: (p) => <span className="font-mono text-micro font-medium">{p.poNumber}</span>,
      exportValue: (p) => p.poNumber,
    },
    {
      key: "supplier",
      label: "Supplier",
      sortable: true,
      filterable: true,
      render: (p) => (
        <span className="font-medium text-foreground">
          {p.supplier}
          {p.isMsme && p.daysOverdue > 45 && (
            <span className="ml-1.5 rounded bg-danger-soft px-1 py-0.5 text-micro font-medium text-danger" title="MSME supplier unpaid >45 days — expense disallowed under Sec 43B(h)">
              43B(h)
            </span>
          )}
          {p.isMsme && p.daysOverdue <= 45 && (
            <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-micro text-muted-foreground" title="MSME-registered supplier — pay within 45 days (Sec 43B(h))">
              MSME
            </span>
          )}
        </span>
      ),
      filterValue: (p) => p.supplier,
      exportValue: (p) => p.supplier,
    },
    {
      key: "expectedDate",
      label: "Expected",
      sortable: true,
      sortValue: (p) => (p.expectedDate ? new Date(p.expectedDate).getTime() : 0),
      render: (p) => <span className="text-muted-foreground">{p.expectedDate ? formatDate(p.expectedDate) : "—"}</span>,
      exportValue: (p) => (p.expectedDate ? formatDate(p.expectedDate) : ""),
    },
    {
      key: "receivedValue",
      label: "Received",
      align: "right",
      sortable: true,
      render: (p) => <span className="tnum">{formatCurrency(p.receivedValue)}</span>,
      exportValue: (p) => p.receivedValue,
    },
    {
      key: "payable",
      label: "Payable",
      align: "right",
      sortable: true,
      render: (p) => <span className="tnum font-semibold text-danger">{formatCurrency(p.payable)}</span>,
      exportValue: (p) => p.payable,
    },
    {
      key: "daysOverdue",
      label: "Overdue",
      align: "right",
      sortable: true,
      render: (p) => (
        <span className={cn("tnum", p.daysOverdue > 30 ? "text-danger font-medium" : p.daysOverdue > 0 ? "text-warning" : "text-ink-faint")}>
          {p.daysOverdue > 0 ? `${p.daysOverdue}d` : "—"}
        </span>
      ),
      exportValue: (p) => p.daysOverdue,
    },
    {
      key: "agingBucket",
      label: "Bucket",
      sortable: true,
      filterable: true,
      render: (p) => <AgingBucketBadge bucket={p.agingBucket} />,
      filterValue: (p) => p.agingBucket,
      exportValue: (p) => p.agingBucket,
    },
    {
      key: "status",
      label: "Status",
      sortable: true,
      filterable: true,
      render: (p) => <StatusPill status={p.status} />,
      filterValue: (p) => p.status,
      exportValue: (p) => p.status,
    },
  ];

  const receivableColumns: Column<ReceivableRow>[] = [
    {
      key: "saleNumber",
      label: "Sale",
      sortable: true,
      render: (r) => <span className="font-mono text-micro font-medium">{r.saleNumber}</span>,
      exportValue: (r) => r.saleNumber,
    },
    {
      key: "customer",
      label: "Customer",
      sortable: true,
      filterable: true,
      render: (r) => <span className="font-medium text-foreground">{r.customer}</span>,
      filterValue: (r) => r.customer,
      exportValue: (r) => r.customer,
    },
    {
      key: "project",
      label: "Project",
      sortable: true,
      filterable: true,
      render: (r) => <span className="text-muted-foreground">{r.project}</span>,
      filterValue: (r) => r.project,
      exportValue: (r) => r.project,
    },
    {
      key: "salePrice",
      label: "Sale Price",
      align: "right",
      sortable: true,
      render: (r) => <span className="tnum">{formatCurrency(r.salePrice)}</span>,
      exportValue: (r) => r.salePrice,
    },
    {
      key: "collected",
      label: "Collected",
      align: "right",
      sortable: true,
      render: (r) => <span className="tnum text-success">{formatCurrency(r.collected)}</span>,
      exportValue: (r) => r.collected,
    },
    {
      key: "outstanding",
      label: "Outstanding",
      align: "right",
      sortable: true,
      render: (r) => <span className="tnum font-semibold text-warning">{formatCurrency(r.outstanding)}</span>,
      exportValue: (r) => r.outstanding,
    },
    {
      key: "daysSinceSale",
      label: "Ageing",
      align: "right",
      sortable: true,
      render: (r) => <span className={cn("tnum", r.daysSinceSale > 90 ? "text-danger" : "text-muted-foreground")}>{r.daysSinceSale}d</span>,
      exportValue: (r) => r.daysSinceSale,
    },
    {
      key: "agingBucket",
      label: "Bucket",
      sortable: true,
      filterable: true,
      render: (r) => <AgingBucketBadge bucket={r.agingBucket} />,
      filterValue: (r) => r.agingBucket,
      exportValue: (r) => r.agingBucket,
    },
    {
      key: "paymentStatus",
      label: "Status",
      sortable: true,
      filterable: true,
      render: (r) => <StatusPill status={r.paymentStatus} />,
      filterValue: (r) => r.paymentStatus,
      exportValue: (r) => r.paymentStatus,
    },
  ];

  const draftColumns: Column<DraftPORow>[] = [
    {
      key: "poNumber",
      label: "PO",
      sortable: true,
      render: (p) => <span className="font-mono text-micro font-medium">{p.poNumber}</span>,
      exportValue: (p) => p.poNumber,
    },
    {
      key: "supplier",
      label: "Supplier",
      sortable: true,
      filterable: true,
      render: (p) => <span className="font-medium text-foreground">{p.supplier}</span>,
      filterValue: (p) => p.supplier,
      exportValue: (p) => p.supplier,
    },
    {
      key: "createdAt",
      label: "Created",
      sortable: true,
      sortValue: (p) => new Date(p.createdAt).getTime(),
      render: (p) => <span className="text-muted-foreground">{formatDate(p.createdAt)}</span>,
      exportValue: (p) => formatDate(p.createdAt),
    },
    {
      key: "value",
      label: "Value",
      align: "right",
      sortable: true,
      render: (p) => <span className="tnum font-semibold">{formatCurrency(p.value)}</span>,
      exportValue: (p) => p.value,
    },
  ];

  const noMatch = (
    <EmptyState
      size="compact"
      icon={<SearchX />}
      title="No matches"
      description="Adjust the search or column filters."
    />
  );

  return (
    <div className="space-y-4">
      {/* Action bar */}
      {canSendReminders && (
        <div className="flex justify-end">
          <Button size="sm" onClick={sendReminders} disabled={sending}>
            {sending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Send className="mr-1 h-4 w-4" />}
            {sending ? "Sending…" : "Send Payment Reminders"}
          </Button>
        </div>
      )}
      {/* KPI strip */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-micro text-muted-foreground"><ArrowDownRight className="h-3 w-3" /> Payable</div>
          <div className="tnum text-body font-bold text-danger">{formatCurrency(totalPayable)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-micro text-muted-foreground"><ArrowUpRight className="h-3 w-3" /> Receivable</div>
          <div className="tnum text-body font-bold text-success">{formatCurrency(totalReceivable)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="text-micro text-muted-foreground">Net cash position</div>
          <div className={`tnum text-body font-bold ${netCash >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(netCash)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-1.5 text-micro text-muted-foreground"><Clock className="h-3 w-3" /> Draft POs</div>
          <div className="tnum text-body font-bold">{formatCurrency(totalDraft)}</div>
        </div>
      </div>

      {/* Aging bucket summary */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <AgingSummaryCard title="Payable Aging" summary={payableAging} variant="danger" />
        <AgingSummaryCard title="Receivable Aging" summary={receivableAging} variant="success" />
      </div>

      <Tabs defaultValue={initialTab}>
        <TabsList>
          <TabsTrigger value="payables" count={overduePOs.length}>Payables</TabsTrigger>
          <TabsTrigger value="receivables" count={receivables.length}>Receivables</TabsTrigger>
          {installments.length > 0 && (
            <TabsTrigger value="installments" count={installments.length}>Overdue Installments</TabsTrigger>
          )}
          {draftPOs.length > 0 && (
            <TabsTrigger value="drafts" count={draftPOs.length}>Draft POs</TabsTrigger>
          )}
        </TabsList>

        {/* ── Overdue POs (payables) ─────────────────────────────── */}
        <TabsContent value="payables">
          {overduePOs.length > 0 && canSendReminders && (
            <div className="mb-3 flex justify-end">
              <Button size="sm" variant="outline" onClick={() => setRunOpen(true)}>
                Start payment run
              </Button>
            </div>
          )}
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
            <DataTable
              data={overduePOs}
              columns={overdueColumns}
              storageKey="pending-payables"
              hideable
              exportFileName="overdue-payables"
              initialSort={{ key: "daysOverdue", direction: "desc" }}
              searchable
              searchPlaceholder="Search PO, supplier, status…"
              rowTone={(p) => (p.daysOverdue > 30 ? "danger" : "warning")}
              emptyState={noMatch}
            />
          </div>
        </TabsContent>

        {/* ── Outstanding receivables ─────────────────────────────── */}
        <TabsContent value="receivables">
          <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
            <DataTable
              data={receivables}
              columns={receivableColumns}
              storageKey="pending-receivables"
              hideable
              exportFileName="outstanding-receivables"
              initialSort={{ key: "outstanding", direction: "desc" }}
              searchable
              searchPlaceholder="Search sale, customer, project…"
              rowTone={(r) => (r.daysSinceSale > 90 ? "danger" : null)}
              emptyState={noMatch}
            />
          </div>
        </TabsContent>

        {/* ── Overdue installments (collections) ─────────────────── */}
        {installments.length > 0 && (
          <TabsContent value="installments">
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              {canSendReminders && (
                <div className="flex items-center justify-between border-b border-border bg-muted/30 px-4 py-2">
                  <p className="text-caption text-muted-foreground">Formal demand = WhatsApp + legal-language letter</p>
                  <Button
                    size="sm"
                    variant="destructive"
                    className="h-7 text-[11px]"
                    disabled={demandAllLoading}
                    onClick={demandAll}
                  >
                    {demandAllLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Send className="h-3 w-3" />} Demand all {installments.length}
                  </Button>
                </div>
              )}
              <DataTable
                data={installments}
                columns={installmentColumns}
                storageKey="overdue-installments"
                hideable
                exportFileName="overdue-installments"
                initialSort={{ key: "daysOverdue", direction: "desc" }}
                searchable
                searchPlaceholder="Search sale, customer, installment…"
                rowTone={(i) => (i.daysOverdue > 30 ? "danger" : "warning")}
                emptyState={noMatch}
              />
            </div>
          </TabsContent>
        )}

        {/* ── Draft POs awaiting approval ─────────────────────────── */}
        {draftPOs.length > 0 && (
          <TabsContent value="drafts">
            <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
              <DataTable
                data={draftPOs}
                columns={draftColumns}
                storageKey="pending-draft-pos"
                hideable
                exportFileName="draft-pos"
                initialSort={{ key: "createdAt", direction: "desc" }}
                searchable
                searchPlaceholder="Search PO, supplier…"
                rowTone={() => "warning"}
                emptyState={noMatch}
              />
            </div>
          </TabsContent>
        )}
      </Tabs>
      {runOpen && <PaymentRunDialog rows={overduePOs} open={runOpen} onOpenChange={setRunOpen} onDone={() => {}} />}

    </div>
  );
}

// ── Aging bucket badge ──────────────────────────────────────

function AgingBucketBadge({ bucket }: { bucket: AgingBucket }) {
  const styles: Record<AgingBucket, string> = {
    "current": "text-muted-foreground",
    "1-30d": "text-warning",
    "31-60d": "text-warning",
    "61-90d": "text-danger",
    ">90d": "text-danger font-semibold",
  };
  const labels: Record<AgingBucket, string> = {
    "current": "Current",
    "1-30d": "1-30d",
    "31-60d": "31-60d",
    "61-90d": "61-90d",
    ">90d": ">90d",
  };
  return <span className={cn("tnum text-micro", styles[bucket])}>{labels[bucket]}</span>;
}

// ── Aging summary card ──────────────────────────────────────

function AgingSummaryCard({
  title,
  summary,
  variant,
}: {
  title: string;
  summary: AgingSummary;
  variant: "danger" | "success";
}) {
  const buckets: { key: AgingBucket; label: string }[] = [
    { key: "current", label: "Current" },
    { key: "1-30d", label: "1-30d" },
    { key: "31-60d", label: "31-60d" },
    { key: "61-90d", label: "61-90d" },
    { key: ">90d", label: ">90d" },
  ];
  const total = buckets.reduce((s, b) => s + toNum(summary[b.key]), 0);

  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-caption font-semibold">{title}</span>
        <span className={cn("tnum text-body font-bold", variant === "danger" ? "text-danger" : "text-success")}>
          {formatCurrency(total)}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1.5">
        {buckets.map((b) => {
          const value = summary[b.key];
          const pct = total > 0 ? (value / total) * 100 : 0;
          const isOverdue = b.key !== "current";
          return (
            <div key={b.key} className="text-center">
              <div className="text-micro text-muted-foreground">{b.label}</div>
              <div className={cn(
                "tnum text-caption font-medium",
                isOverdue && value > 0 ? (b.key === ">90d" || b.key === "61-90d" ? "text-danger" : "text-warning") : "text-foreground",
              )}>
                {formatCurrency(value)}
              </div>
              <div className="mt-0.5 h-1 rounded-full bg-muted overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    isOverdue && value > 0 ? (b.key === ">90d" || b.key === "61-90d" ? "bg-danger" : "bg-warning") : "bg-muted-foreground/30",
                  )}
                  style={{ width: `${Math.max(pct, value > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}


// ── Payment run — batch AP disbursement ──

function PaymentRunDialog({
  rows: allRows,
  open,
  onOpenChange,
  onDone,
}: {
  rows: OverduePORow[];
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  // Only supplier-addressable rows qualify — RA bills pay subcontractors and
  // claims reimburse staff through their own flows.
  const rows = allRows.filter((r) => !!r.supplierId);
  const [selected, setSelected] = useState<Set<string>>(() => new Set(rows.map((r) => r.id)));
  const [mode, setMode] = useState("NEFT");
  const [tds, setTds] = useState<Record<string, string>>({});
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<{ succeeded: number; failed: number; bankFile: string; bankFileHeader: string; results: { ok: boolean; error?: string; supplierId: string }[] } | null>(null);

  const selectedRows = rows.filter((r) => selected.has(r.id));
  const total = selectedRows.reduce((s, r) => s + r.payable, 0);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function submit() {
    setRunning(true);
    try {
      const res = await fetch("/api/payment-runs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          paymentMode: mode,
          items: selectedRows.map((r) => ({
            supplierId: r.supplierId!,
            purchaseOrderId: r.id,
            amount: r.payable,
            tdsAmount: tds[r.id] ? Number(tds[r.id]) : undefined,
            tdsSection: tds[r.id] ? "194C" : undefined,
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Payment run failed");
      setResult(data);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Payment run failed");
    } finally {
      setRunning(false);
    }
  }

  function downloadFile() {
    if (!result) return;
    const blob = new Blob([result.bankFileHeader + "\n" + result.bankFile + "\n"], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `payment-run-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => { onOpenChange(o); if (!o) { setResult(null); onDone(); } }}
      title="Supplier payment run"
      description="Select the payables to disburse. Each posts a real payment + ledger entry; download the bank file after."
    >
      {result ? (
        <div className="space-y-3">
          <p className="text-sm">
            <span className="font-medium text-success">{result.succeeded} posted</span>
            {result.failed > 0 && <span className="ml-2 text-danger">{result.failed} failed</span>}
          </p>
          {result.failed > 0 && (
            <div className="max-h-32 overflow-auto rounded border border-border p-2 text-xs">
              {result.results.filter((r) => !r.ok).map((r, i) => (
                <div key={i} className="text-danger">{r.supplierId}: {r.error}</div>
              ))}
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={downloadFile}>Download bank file</Button>
            <Button onClick={() => { onOpenChange(false); setResult(null); onDone(); }}>Done</Button>
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="max-h-56 overflow-auto rounded border border-border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted">
                <tr>
                  <th className="px-2 py-1.5 text-left"></th>
                  <th className="px-2 py-1.5 text-left">Supplier / PO</th>
                  <th className="px-2 py-1.5 text-right">Payable</th>
                  <th className="px-2 py-1.5 text-right">TDS ₹</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-2 py-1.5">
                      <input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} className="rounded" aria-label={`Select ${r.supplier}`} />
                    </td>
                    <td className="px-2 py-1.5">
                      <div className="font-medium">{r.supplier}</div>
                      <div className="text-micro text-muted-foreground">{r.poNumber}{r.isMsme ? " · MSME" : ""}</div>
                    </td>
                    <td className="px-2 py-1.5 text-right tnum">{formatCurrency(r.payable)}</td>
                    <td className="px-2 py-1.5">
                      <input aria-label="TDS"
                        type="number"
                        min="0"
                        step="0.01"
                        value={tds[r.id] ?? ""}
                        onChange={(e) => setTds((p) => ({ ...p, [r.id]: e.target.value }))}
                        placeholder="0"
                        className="w-20 rounded border border-border bg-background px-1.5 py-1 text-right text-xs tnum"
                        disabled={!selected.has(r.id)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm">
            <span>{selected.size} payable{selected.size !== 1 ? "s" : ""}</span>
            <span className="font-bold tnum">{formatCurrency(total)}</span>
          </div>
          <div className="flex items-end justify-between gap-3">
            <div>
              <Label>Payment mode</Label>
              <Select aria-label="Payment mode" value={mode} onChange={(e) => setMode(e.target.value)}>
                <option value="NEFT">NEFT</option>
                <option value="RTGS">RTGS</option>
                <option value="UPI">UPI</option>
                <option value="CHEQUE">Cheque</option>
                <option value="BANK">Bank (other)</option>
              </Select>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={running}>Cancel</Button>
              <Button onClick={submit} disabled={running || selected.size === 0}>
                {running ? "Posting…" : `Run ${formatCurrency(total)}`}
              </Button>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">
            TDS is deducted per row (194C). The bank file lists beneficiaries with their saved account/UPI details —
            fill them on each vendor&rsquo;s record for complete rows.
          </p>
        </div>
      )}
    </Dialog>
  );
}