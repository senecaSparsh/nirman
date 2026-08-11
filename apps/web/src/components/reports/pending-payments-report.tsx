"use client";

import { AlertCircle, ArrowDownRight, ArrowUpRight, Clock, SearchX } from "lucide-react";
import { DataTable, type Column } from "@/components/ui/data-table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StatusPill } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { formatCurrency, formatDate, cn } from "@/lib/utils";

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
  poNumber: string;
  supplier: string;
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

export function PendingPaymentsReport({
  overduePOs,
  receivables,
  draftPOs,
  totalPayable,
  totalReceivable,
  totalDraft,
  payableAging,
  receivableAging,
}: {
  overduePOs: OverduePORow[];
  receivables: ReceivableRow[];
  draftPOs: DraftPORow[];
  totalPayable: number;
  totalReceivable: number;
  totalDraft: number;
  payableAging: AgingSummary;
  receivableAging: AgingSummary;
}) {
  const hasData = overduePOs.length > 0 || receivables.length > 0 || draftPOs.length > 0;

  if (!hasData) {
    return (
      <EmptyState
        icon={<AlertCircle className="h-5 w-5" />}
        title="No pending payments"
        description="All POs are on time and all sales are fully collected."
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
      render: (p) => <span className="font-medium text-foreground">{p.supplier}</span>,
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
      render: (p) => <span className={cn("tnum", p.daysOverdue > 30 ? "text-danger font-medium" : "text-warning")}>{p.daysOverdue}d</span>,
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

      <Tabs defaultValue="payables">
        <TabsList>
          <TabsTrigger value="payables" count={overduePOs.length}>Overdue POs</TabsTrigger>
          <TabsTrigger value="receivables" count={receivables.length}>Receivables</TabsTrigger>
          {draftPOs.length > 0 && (
            <TabsTrigger value="drafts" count={draftPOs.length}>Draft POs</TabsTrigger>
          )}
        </TabsList>

        {/* ── Overdue POs (payables) ─────────────────────────────── */}
        <TabsContent value="payables">
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
  const total = buckets.reduce((s, b) => s + summary[b.key], 0);

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
