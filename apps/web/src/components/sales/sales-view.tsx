"use client";

import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Plus, ShoppingCart, Users, Download, FileSpreadsheet, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTabParam } from "@/lib/use-tab-param";
import { EmptyState } from "@/components/empty-state";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { CustomersView } from "./customers-view";
import { SellAssetDialog } from "./sell-asset-dialog";
import { SaleDetailDialog } from "./sale-detail-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV, downloadExcel } from "@/lib/export";
import type { AssetSaleRow, CustomerRow } from "@/lib/types";

export function SalesView({
  sales,
  customers,
  defaultTab = "sales",
  permissions,
}: {
  sales: AssetSaleRow[];
  customers: CustomerRow[];
  defaultTab?: string;
  permissions?: { canCreateSale?: boolean; canManage?: boolean };
}) {
  const [tab, setTab] = useTabParam(
    ["sales", "customers"] as const,
    (defaultTab === "customers" ? "customers" : "sales") as "sales" | "customers",
  );
  const searchParams = useSearchParams();
  const autoOpenSaleId = searchParams.get("sale");

  const customerOptions = useMemo(
    () => customers.map((c) => ({ id: c.id, name: c.name })),
    [customers],
  );

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="sales">
            <span className="flex items-center gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /> Sales</span>
          </TabsTrigger>
          <TabsTrigger value="customers">
            <span className="flex items-center gap-1.5"><Users className="h-3.5 w-3.5" /> Customers</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="sales">
          <SalesTab sales={sales} customers={customerOptions} permissions={permissions} onAddCustomer={() => setTab("customers")} autoOpenSaleId={autoOpenSaleId} />
        </TabsContent>
        <TabsContent value="customers">
          <CustomersTab customers={customers} permissions={permissions} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Sales tab
// ───────────────────────────────────────────────────────────

/** Column definitions for the Sales DataTable — mirrors the visual
 *  language of the Procurement Orders table (mono numbers, StatusPill,
 *  inline progress bars) so the two hub pages read as one product. */
const saleColumns: Column<AssetSaleRow>[] = [
  {
    key: "saleNumber",
    label: "Sale No.",
    sortable: true,
    render: (s) => (
      <span className="font-mono text-caption font-semibold text-foreground">{s.saleNumber}</span>
    ),
  },
  {
    key: "asset",
    label: "Asset",
    sortable: true,
    sortValue: (s) => s.assetType === "LAND" ? (s.landParcelNumber ?? "") : (s.builtUnitNumber ?? ""),
    render: (s) => (
      <span className="font-medium text-foreground">
        {s.assetType === "LAND" ? `Plot ${s.landParcelNumber ?? "—"}` : `Unit ${s.builtUnitNumber ?? "—"}`}
      </span>
    ),
  },
  {
    key: "customerName",
    label: "Customer",
    sortable: true,
    render: (s) => <span className="text-foreground">{s.customerName}</span>,
  },
  {
    key: "projectName",
    label: "Project",
    sortable: true,
    render: (s) => <span className="text-muted-foreground">{s.projectName}</span>,
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (s) => <StatusPill status={s.status} />,
  },
  {
    key: "paymentStatus",
    label: "Payment",
    sortable: true,
    render: (s) => <StatusPill status={s.paymentStatus} />,
  },
  {
    key: "salePrice",
    label: "Sale Price",
    align: "right",
    sortable: true,
    render: (s) => <span className="font-semibold text-foreground">{formatCurrency(s.salePrice)}</span>,
  },
  {
    key: "totalPaid",
    label: "Collected",
    align: "right",
    sortable: true,
    render: (s) => {
      const payPct = s.salePrice > 0 ? Math.min(100, (s.totalPaid / s.salePrice) * 100) : 0;
      if (s.status === "CANCELLED") return <span className="text-muted-foreground">—</span>;
      return (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${payPct === 100 ? "bg-success" : payPct > 0 ? "bg-warning" : "bg-muted-foreground/30"}`}
              style={{ width: `${payPct}%` }}
            />
          </div>
          <span className="text-micro tnum text-muted-foreground w-8">{Math.round(payPct)}%</span>
        </div>
      );
    },
  },
  {
    key: "profit",
    label: "Profit",
    align: "right",
    sortable: true,
    render: (s) =>
      s.profit === 0 ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <span className={`font-semibold tnum ${s.profit >= 0 ? "text-success" : "text-danger"}`}>
          {s.profit >= 0 ? "+" : ""}{formatCurrency(s.profit)}
        </span>
      ),
  },
  {
    key: "saleDate",
    label: "Date",
    sortable: true,
    sortValue: (s) => new Date(s.saleDate),
    render: (s) => <span className="text-muted-foreground">{formatDate(s.saleDate)}</span>,
  },
];

function SalesTab({
  sales,
  customers,
  permissions,
  onAddCustomer,
  autoOpenSaleId,
}: {
  sales: AssetSaleRow[];
  customers: { id: string; name: string }[];
  permissions?: { canCreateSale?: boolean; canManage?: boolean };
  onAddCustomer?: () => void;
  autoOpenSaleId?: string | null;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<AssetSaleRow | null>(null);

  // Auto-open sale detail when navigated with ?sale={id}
  useEffect(() => {
    if (autoOpenSaleId && sales.length > 0) {
      const sale = sales.find((s) => s.id === autoOpenSaleId);
      if (sale) setSelected(sale);
    }
  }, [autoOpenSaleId, sales]);

  const filtered = useMemo(
    () => sales.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (stageFilter && s.saleStage !== stageFilter) return false;
      if (payFilter && s.paymentStatus !== payFilter) return false;
      return true;
    }),
    [sales, statusFilter, stageFilter, payFilter],
  );

  // ── Toolbar controls — same visual language as Procurement's PO table:
  //    inline appearance-none <select> with a floating chevron, and
  //    icon-only export buttons with a hover tooltip. ─────────────────
  const filterSelect = (
    value: string,
    onChange: (v: string) => void,
    width: number,
    options: { value: string; label: string }[],
  ) => (
    <div className="relative shrink-0" style={{ width }}>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        style={{ width }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );

  const trailingButtons = (
    <>
      <div className="group relative">
        <button
          onClick={() => downloadCSV(`sales-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
            { key: "saleNumber", label: "Sale No." },
            { key: "assetType", label: "Asset Type" },
            { key: "landParcelNumber", label: "Land Parcel" },
            { key: "builtUnitNumber", label: "Built Unit" },
            { key: "customerName", label: "Customer" },
            { key: "projectName", label: "Project" },
            { key: "salePrice", label: "Sale Price", format: (v) => formatCurrency(Number(v)) },
            { key: "totalPaid", label: "Collected", format: (v) => formatCurrency(Number(v)) },
            { key: "status", label: "Status" },
            { key: "paymentStatus", label: "Payment" },
            { key: "saleDate", label: "Date", format: (v) => v ? formatDate(String(v)) : "" },
          ])}
          disabled={filtered.length === 0}
          className="inline-flex h-7 items-center justify-center rounded-md border border-input bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <Download className="size-3.5" />
        </button>
        <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100 z-50">
          Export CSV
        </span>
      </div>
      <div className="group relative">
        <button
          onClick={() => downloadExcel("sales-revenue")}
          disabled={filtered.length === 0}
          className="inline-flex h-7 items-center justify-center rounded-md border border-input bg-card px-2 text-caption font-medium text-muted-foreground transition-colors hover:border-border-strong hover:text-foreground disabled:pointer-events-none disabled:opacity-40"
        >
          <FileSpreadsheet className="size-3.5" />
        </button>
        <span className="pointer-events-none absolute top-full left-1/2 mt-1 -translate-x-1/2 whitespace-nowrap rounded-md bg-foreground px-2 py-1 text-[11px] text-background opacity-0 transition-opacity group-hover:opacity-100 z-50">
          Export Excel
        </span>
      </div>
    </>
  );

  return (
    <div className="space-y-4">
      {sales.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5" />}
          title="No sales yet"
          description={
            customers.length === 0
              ? "Create a customer first, then record your first sale."
              : "Record your first asset sale (land or built unit)."
          }
          action={
            customers.length > 0 && (permissions?.canCreateSale ?? false) ? (
              <Button onClick={() => setFormOpen(true)} size="sm"><Plus className="h-4 w-4" /> New Sale</Button>
            ) : customers.length === 0 ? (
              <Button onClick={() => onAddCustomer?.()} size="sm"><Users className="h-4 w-4" /> Add a customer</Button>
            ) : undefined
          }
        />
      ) : (
        /* ── Data Table view (enterprise-grade) ────────────────────
           Dense, sortable columns — the same shape as the Procurement
           Orders table so Sales stops feeling like a different app. */
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={filtered}
            onRowClick={(s) => setSelected(s)}
            initialSort={{ key: "saleDate", direction: "desc" }}
            columns={saleColumns}
            searchable
            searchPlaceholder="Search by sale no, customer, project…"
            showTotals
            sumColumns={["salePrice", "totalPaid", "profit"]}
            totalFormat={(_key, sum) => formatCurrency(sum)}
            hideable
            pageSize={50}
            storageKey="sales"
            onAddRow={(permissions?.canCreateSale ?? false) && customers.length > 0 ? () => setFormOpen(true) : undefined}
            addRowLabel="New Sale"
            toolbarLeading={
              <div className="flex w-fit shrink-0 items-center gap-2">
                {filterSelect(statusFilter, setStatusFilter, 120, [
                  { value: "", label: "All statuses" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "CANCELLED", label: "Cancelled" },
                ])}
                {filterSelect(stageFilter, setStageFilter, 150, [
                  { value: "", label: "All stages" },
                  { value: "PENDING", label: "Pending" },
                  { value: "DEPOSIT_RECEIVED", label: "Deposit Received" },
                  { value: "COMPLETED", label: "Completed" },
                  { value: "CANCELLED", label: "Cancelled" },
                ])}
                {filterSelect(payFilter, setPayFilter, 130, [
                  { value: "", label: "All payments" },
                  { value: "PENDING", label: "Pending" },
                  { value: "PARTIAL", label: "Partial" },
                  { value: "PAID", label: "Paid" },
                ])}
              </div>
            }
            toolbarTrailing={trailingButtons}
          />
        </div>
      )}

      {customers.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-body text-muted-foreground">
          You need at least one customer to create a sale. Add one in the Customers tab.
        </p>
      )}

      <SellAssetDialog open={formOpen} onOpenChange={setFormOpen} customers={customers} />
      <SaleDetailDialog open={selected != null} onOpenChange={(o) => !o && setSelected(null)} sale={selected} permissions={permissions} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Customers tab — delegates to the shared CustomersView
// ───────────────────────────────────────────────────────────

function CustomersTab({ customers, permissions }: { customers: CustomerRow[]; permissions?: { canCreateSale?: boolean; canManage?: boolean } }) {
  const canManage = permissions?.canManage ?? false;
  return (
    <CustomersView
      customers={customers}
      permissions={{ canCreate: canManage, canEdit: canManage, canDelete: canManage }}
    />
  );
}
