"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import {
  Plus, Pencil, Trash2, ShoppingCart, Tags, Download,
  Printer, FileSpreadsheet, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTabParam } from "@/lib/use-tab-param";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { Dialog } from "@/components/ui/dialog";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { PurchaseOrderFormDialog } from "./purchase-order-form-dialog";
import { PurchaseOrderDetailPanel } from "./purchase-order-detail-panel";
import { SupplierPaymentFormDialog } from "./supplier-payment-form-dialog";
import { DirectPurchaseFormDialog } from "./direct-purchase-form-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV, downloadExcel } from "@/lib/export";
import type {
  SupplierRow, PurchaseOrderRow, MaterialRow, StockLocationRow,
  ProjectOption, MaterialOption, StockLocationOption, DirectPurchaseRow,
} from "@/lib/types";

export function ProcurementView({
  suppliers, purchaseOrders, materials, locations, projects, directPurchases, permissions,
}: {
  suppliers: SupplierRow[];
  purchaseOrders: PurchaseOrderRow[];
  materials: MaterialRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
  directPurchases: DirectPurchaseRow[];
  permissions?: { canCreate?: boolean; canApprove?: boolean; canManagePayments?: boolean };
}) {
  const [tab, setTab] = useTabParam(
    ["purchase-orders", "suppliers", "direct-purchases"] as const,
    "purchase-orders",
  );
  const canCreate = permissions?.canCreate ?? false;
  const canApprove = permissions?.canApprove ?? false;
  const canManagePayments = permissions?.canManagePayments ?? false;

  // Derive simplified option types for the cash-purchase dialog
  const materialOptions: MaterialOption[] = materials.map((m) => ({
    id: m.id, code: m.code, name: m.name, unit: m.unit,
    standardCost: m.standardCost, gstRate: m.gstRate,
  }));
  const locationOptions: StockLocationOption[] = locations.map((l) => ({
    id: l.id, type: l.type, name: l.name,
    projectId: l.projectId, projectName: l.projectName,
  }));

  return (
    <div className="space-y-5">
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="purchase-orders">
            <span className="flex items-center gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /> Purchase Orders</span>
          </TabsTrigger>
          <TabsTrigger value="suppliers">
            <span className="flex items-center gap-1.5"><Tags className="h-3.5 w-3.5" /> Suppliers</span>
          </TabsTrigger>
          <TabsTrigger value="direct-purchases">
            <span className="flex items-center gap-1.5"><ShoppingCart className="h-3.5 w-3.5" /> Cash Purchases</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="purchase-orders">
          <PurchaseOrdersTab purchaseOrders={purchaseOrders} suppliers={suppliers} materials={materials} locations={locations} projects={projects} canCreate={canCreate} canApprove={canApprove} canManagePayments={canManagePayments} />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersTab suppliers={suppliers} canManagePayments={canManagePayments} />
        </TabsContent>
        <TabsContent value="direct-purchases">
          <DirectPurchasesTab directPurchases={directPurchases} suppliers={suppliers} locations={locationOptions} materials={materialOptions} canCreate={canCreate} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Purchase Orders tab
// ───────────────────────────────────────────────────────────

/** Column definitions for the PO DataTable. Defined outside the
 *  component so they're stable across renders. */
const poColumns: Column<PurchaseOrderRow>[] = [
  {
    key: "poNumber",
    label: "PO Number",
    sortable: true,
    render: (po) => (
      <span className="font-mono text-caption font-semibold text-foreground">{po.poNumber}</span>
    ),
  },
  {
    key: "supplierName",
    label: "Supplier",
    sortable: true,
    render: (po) => (
      <span className="font-medium text-foreground">{po.supplierName}</span>
    ),
  },
  {
    key: "procurementScope",
    label: "Scope",
    sortable: true,
    render: (po) => (
      <span className={po.procurementScope === "COMPANY" ? "text-muted-foreground" : "text-foreground"}>
        {po.procurementScope === "COMPANY" ? "Company" : "Project"}
      </span>
    ),
  },
  {
    key: "status",
    label: "Status",
    sortable: true,
    render: (po) => <StatusPill status={po.status} />,
  },
  {
    key: "total",
    label: "Total",
    align: "right",
    sortable: true,
    render: (po) => (
      <span className="font-semibold text-foreground">{formatCurrency(po.total)}</span>
    ),
  },
  {
    key: "receivedPct",
    label: "Received",
    align: "right",
    sortable: true,
    render: (po) =>
      po.status === "CANCELLED" || po.status === "DRAFT" ? (
        <span className="text-muted-foreground">—</span>
      ) : (
        <div className="flex items-center justify-end gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full ${po.receivedPct === 100 ? "bg-success" : po.receivedPct > 0 ? "bg-warning" : "bg-muted-foreground/30"}`}
              style={{ width: `${po.receivedPct}%` }}
            />
          </div>
          <span className="text-micro tnum text-muted-foreground w-8">{po.receivedPct}%</span>
        </div>
      ),
  },
  {
    key: "expectedDate",
    label: "Expected",
    sortable: true,
    sortValue: (po) => (po.expectedDate ? new Date(po.expectedDate) : new Date(0)),
    render: (po) => {
      if (!po.expectedDate) return <span className="text-muted-foreground">—</span>;
      const isOverdue =
        new Date(po.expectedDate) < new Date() &&
        po.status !== "RECEIVED" &&
        po.status !== "CANCELLED";
      return (
        <span className={isOverdue ? "text-danger font-medium" : "text-muted-foreground"}>
          {formatDate(po.expectedDate)}
        </span>
      );
    },
  },
  {
    key: "createdAt",
    label: "Age",
    align: "right",
    sortable: true,
    sortValue: (po) => new Date(po.createdAt),
    render: (po) => {
      const daysOpen = Math.floor((Date.now() - new Date(po.orderDate).getTime()) / 86400000);
      const isOverdue =
        po.expectedDate &&
        new Date(po.expectedDate) < new Date() &&
        po.status !== "RECEIVED" &&
        po.status !== "CANCELLED";
      return (
        <span
          className={`tnum ${
            isOverdue ? "text-danger font-semibold" : daysOpen > 14 ? "text-warning" : "text-muted-foreground"
          }`}
        >
          {daysOpen}d
        </span>
      );
    },
  },
];

/** Column definitions for the Direct Purchases DataTable. */
const directPurchaseColumns: Column<DirectPurchaseRow>[] = [
  {
    key: "billNumber",
    label: "Bill No",
    sortable: true,
    render: (p) => <span className="font-mono text-caption font-semibold text-foreground">{p.billNumber}</span>,
  },
  {
    key: "billDate",
    label: "Date",
    sortable: true,
    sortValue: (p) => new Date(p.billDate),
    render: (p) => <span className="tnum text-muted-foreground">{formatDate(p.billDate)}</span>,
  },
  {
    key: "supplierName",
    label: "Supplier",
    sortable: true,
    render: (p) => <span className="font-medium text-foreground">{p.supplierName}</span>,
  },
  {
    key: "locationName",
    label: "Location",
    sortable: true,
    render: (p) => <span className="text-muted-foreground">{p.locationName}</span>,
  },
  {
    key: "lineCount",
    label: "Lines",
    align: "right",
    sortable: true,
    render: (p) => <span className="tnum text-muted-foreground">{p.lineCount}</span>,
  },
  {
    key: "billAmount",
    label: "Amount",
    align: "right",
    sortable: true,
    render: (p) => <span className="tnum font-semibold text-foreground">{formatCurrency(p.billAmount)}</span>,
  },
  {
    key: "print",
    label: "",
    align: "right",
    render: (p) => (
      <a
        href={`/print/direct-purchase/${p.id}`}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center text-muted-foreground hover:text-foreground"
        title="Print voucher"
        onClick={(e) => e.stopPropagation()}
      >
        <Printer className="h-3.5 w-3.5" />
      </a>
    ),
  },
];

function PurchaseOrdersTab({
  purchaseOrders, suppliers, materials, locations, projects, canCreate, canApprove, canManagePayments,
}: {
  purchaseOrders: PurchaseOrderRow[];
  suppliers: SupplierRow[];
  materials: MaterialRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
  canCreate: boolean;
  canApprove: boolean;
  canManagePayments: boolean;
}) {
  const [scopeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrderRow | null>(null);
  const [view, setView] = useState<"list" | "board">("list");
  const searchParams = useSearchParams();

  // Auto-open PO detail when navigated with ?po=<id> (e.g. from requisition "View PO")
  useEffect(() => {
    const poId = searchParams.get("po");
    if (poId) {
      const po = purchaseOrders.find((p) => p.id === poId);
      if (po) setSelected(po);
    }
  }, [searchParams, purchaseOrders]);

  const filtered = useMemo(
    () => purchaseOrders.filter((p) => {
      if (scopeFilter && p.procurementScope !== scopeFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    }),
    [purchaseOrders, scopeFilter, statusFilter],
  );

  // Group by status for the kanban board
  const columns: { status: string; label: string; color: string; items: PurchaseOrderRow[] }[] = [
    { status: "DRAFT", label: "Draft", color: "var(--color-stage-system)", items: filtered.filter((p) => p.status === "DRAFT") },
    { status: "APPROVED", label: "Approved", color: "var(--color-stage-manage)", items: filtered.filter((p) => p.status === "APPROVED") },
    { status: "ORDERED", label: "Ordered", color: "var(--color-stage-procure)", items: filtered.filter((p) => p.status === "ORDERED") },
    { status: "PARTIAL", label: "Partial", color: "var(--color-stage-build)", items: filtered.filter((p) => p.status === "PARTIAL") },
    { status: "RECEIVED", label: "Received", color: "var(--color-stage-sell)", items: filtered.filter((p) => p.status === "RECEIVED") },
    { status: "CANCELLED", label: "Cancelled", color: "var(--color-danger)", items: filtered.filter((p) => p.status === "CANCELLED") },
  ];

  const openCount = filtered.filter((p) => ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"].includes(p.status)).length;
  const totalValue = filtered.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + p.total, 0);
  const draftCount = purchaseOrders.filter((p) => p.status === "DRAFT").length;
  const orderedCount = purchaseOrders.filter((p) => p.status === "ORDERED").length;

  // Extract the List/Board toggle + status filter + trailing buttons so they
  // can be reused in both list and board views without TypeScript narrowing.
  const viewToggle = (
    <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
      <button
        onClick={() => setView("list")}
        className={`rounded px-2 py-1 text-caption font-medium transition-colors ${view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
      >
        List
      </button>
      <button
        onClick={() => setView("board")}
        className={`rounded px-2 py-1 text-caption font-medium transition-colors ${view === "board" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
      >
        Board
      </button>
    </div>
  );
  const statusSelect = (
    <div className="relative shrink-0" style={{ width: 130 }}>
      <select
        value={statusFilter}
        onChange={(e) => setStatusFilter(e.target.value)}
        style={{ width: 130 }}
        className="h-8 shrink-0 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[13px] text-foreground transition-[border-color,box-shadow] hover:border-border-strong focus-visible:border-brand focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-brand/20"
      >
        <option value="">All statuses</option>
        <option value="DRAFT">Draft</option>
        <option value="APPROVED">Approved</option>
        <option value="ORDERED">Ordered</option>
        <option value="PARTIAL">Partial</option>
        <option value="RECEIVED">Received</option>
        <option value="CANCELLED">Cancelled</option>
      </select>
      <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-faint" />
    </div>
  );
  const trailingButtons = (
    <>
      {/* Export CSV (icon-only) */}
      <div className="group relative">
        <button
          onClick={() => downloadCSV(`purchase-orders-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
            { key: "poNumber", label: "PO Number" },
            { key: "supplierName", label: "Supplier" },
            { key: "procurementScope", label: "Scope" },
            { key: "status", label: "Status" },
            { key: "total", label: "Total", format: (v) => formatCurrency(Number(v)) },
            { key: "expectedDate", label: "Expected", format: (v) => v ? formatDate(String(v)) : "" },
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
      {/* Export Excel (icon-only) */}
      <div className="group relative">
        <button
          onClick={() => downloadExcel("purchase-trends")}
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
      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5" />}
          title={purchaseOrders.length === 0 ? "No purchase orders yet" : "No POs match the filters"}
          description={
            purchaseOrders.length === 0
              ? suppliers.length === 0
                ? "Create a supplier first, then raise a purchase order."
                : "Raise your first purchase order to procure materials."
              : "Try a different scope filter."
          }
          action={
            purchaseOrders.length === 0 && suppliers.length > 0 && locations.length > 0 && canCreate ? (
              <Button onClick={() => setFormOpen(true)} size="sm"><Plus className="h-4 w-4" /> New PO</Button>
            ) : undefined
          }
        />
      ) : view === "board" ? (
        /* ── Kanban Board ──────────────────────────────────────────
           POs flow through status columns. Each card shows the key
           info: PO number, supplier, total, progress bar, age.
           This is fundamentally different from a table — you see
           the flow of procurement at a glance. */
        <>
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            {viewToggle}
            {statusSelect}
          </div>
          <div className="flex items-center gap-1.5">
            {trailingButtons}
            {canCreate && (
              <Button onClick={() => setFormOpen(true)} disabled={suppliers.length === 0 || locations.length === 0}>
                <Plus className="h-4 w-4" /> New PO
              </Button>
            )}
          </div>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-2">
          {columns.map((col) => (
            <div key={col.status} className="flex w-64 shrink-0 flex-col">
              {/* Column header */}
              <div className="mb-2 flex items-center gap-2 px-1">
                <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: col.color }} />
                <span className="text-label text-muted-foreground">{col.label}</span>
                <span className="ml-auto text-caption font-semibold tnum text-muted-foreground">{col.items.length}</span>
              </div>

              {/* Column body */}
              <div className="flex-1 space-y-2">
                {col.items.length === 0 && (
                  <div className="rounded-md border border-dashed border-border/60 py-6 text-center text-micro text-muted-foreground/50">
                    empty
                  </div>
                )}
                {col.items.map((po) => {
                  const orderDate = new Date(po.orderDate);
                  const daysOpen = Math.floor((Date.now() - orderDate.getTime()) / 86400000);
                  const isOverdue = po.expectedDate && new Date(po.expectedDate) < new Date() && po.status !== "RECEIVED" && po.status !== "CANCELLED";
                  return (
                    <button
                      key={po.id}
                      onClick={() => setSelected(po)}
                      className={`group block w-full rounded-lg border p-3 text-left transition-all hover:border-foreground/20 hover:shadow-sm ${
                        selected?.id === po.id ? "border-foreground/30 bg-muted/30 ring-1 ring-foreground/10" : "border-border bg-card"
                      }`}
                    >
                      {/* PO number + scope */}
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono text-caption font-semibold text-foreground">{po.poNumber}</span>
                        <span className={`text-micro ${po.procurementScope === "COMPANY" ? "text-muted-foreground" : "text-foreground"}`}>
                          {po.procurementScope === "COMPANY" ? "CO" : "PR"}
                        </span>
                      </div>

                      {/* Supplier */}
                      <div className="mt-1 truncate text-body font-medium text-foreground">{po.supplierName}</div>

                      {/* Total */}
                      <div className="mt-1 text-body font-semibold tnum text-foreground">{formatCurrency(po.total)}</div>

                      {/* Progress bar */}
                      {po.status !== "CANCELLED" && po.status !== "DRAFT" && (
                        <div className="mt-2 flex items-center gap-2">
                          <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                            <div
                              className={`h-full ${po.receivedPct === 100 ? "bg-success" : po.receivedPct > 0 ? "bg-warning" : "bg-muted-foreground/20"}`}
                              style={{ width: `${po.receivedPct}%` }}
                            />
                          </div>
                          <span className="text-micro tnum text-muted-foreground">{po.receivedPct}%</span>
                        </div>
                      )}

                      {/* Footer: age + overdue */}
                      <div className="mt-2 flex items-center justify-between">
                        <span className={`text-micro tnum ${isOverdue ? "text-danger font-semibold" : daysOpen > 14 ? "text-warning" : "text-muted-foreground"}`}>
                          {daysOpen}d
                        </span>
                        {isOverdue && <span className="text-micro font-semibold text-danger">overdue</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        </>
      ) : (
        /* ── Data Table view (default, enterprise-grade) ──────────
           Dense, sortable columns. Click a row to open the detail
           dialog. Switch to Board for the kanban flow view. */
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={filtered}
            onRowClick={(po) => setSelected(po)}
            initialSort={{ key: "createdAt", direction: "desc" }}
            columns={poColumns}
            searchable
            searchPlaceholder="Search POs by number, supplier, project…"
            showTotals
            sumColumns={["totalValue"]}
            totalFormat={(_k, sum) => formatCurrency(sum)}
            hideable
            pageSize={50}
            onAddRow={canCreate && suppliers.length > 0 && locations.length > 0 ? () => setFormOpen(true) : undefined}
            addRowLabel="New PO"
            toolbarLeading={
              <div className="flex w-fit shrink-0 items-center gap-2">
                {viewToggle}
                {statusSelect}
              </div>
            }
            toolbarTrailing={trailingButtons}
          />
        </div>
      )}

      {selected && (
        <Dialog
          open={!!selected}
          onOpenChange={(o) => { if (!o) setSelected(null); }}
          title={selected.poNumber}
          description={selected.supplierName}
          size="full"
        >
          <PurchaseOrderDetailPanel
            po={selected}
            canApprove={canApprove}
            suppliers={suppliers}
            canManagePayments={canManagePayments}
          />
        </Dialog>
      )}

      {suppliers.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-body text-muted-foreground">
          You need at least one supplier and one stock location to create a purchase order. Add them in the Suppliers tab here and locations in Settings → Locations.
        </p>
      )}

      <PurchaseOrderFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        suppliers={suppliers}
        materials={materials}
        locations={locations}
        projects={projects}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Suppliers tab
// ───────────────────────────────────────────────────────────

function SuppliersTab({ suppliers, canManagePayments }: { suppliers: SupplierRow[]; canManagePayments: boolean }) {
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [deleting, setDeleting] = useState<SupplierRow | null>(null);
  const [paySupplier, setPaySupplier] = useState<SupplierRow | null>(null);

  const totalOwed = suppliers.reduce((s, v) => s + v.balanceOwed, 0);
  const withDues = suppliers.filter((s) => s.balanceOwed > 0).length;

  const columns: Column<SupplierRow>[] = [
    {
      key: "name",
      label: "Supplier",
      sortable: true,
      render: (s) => (
        <div>
          <div className="font-medium text-foreground">{s.name}</div>
          {s.gstin && <div className="font-mono text-micro text-muted-foreground">{s.gstin}</div>}
        </div>
      ),
    },
    {
      key: "phone",
      label: "Phone",
      sortable: true,
      render: (s) =>
        s.phone ? <span className="text-muted-foreground">{s.phone}</span> : <span className="text-muted-foreground/40">—</span>,
    },
    {
      key: "openPOs",
      label: "Open POs",
      align: "right",
      sortable: true,
      render: (s) =>
        s.openPOs > 0 ? (
          <span className="tnum font-medium text-warning">{s.openPOs}</span>
        ) : (
          <span className="tnum text-muted-foreground/40">0</span>
        ),
    },
    {
      key: "balanceOwed",
      label: "Balance Owed",
      align: "right",
      sortable: true,
      render: (s) =>
        s.balanceOwed > 0 ? (
          <span className="tnum font-semibold text-danger">{formatCurrency(s.balanceOwed)}</span>
        ) : (
          <span className="tnum text-muted-foreground/40">—</span>
        ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (s) => (
        <div className="flex items-center justify-end gap-1" onClick={(e) => e.stopPropagation()}>
          {canManagePayments && s.balanceOwed > 0 && (
            <Button size="sm" variant="outline" className="h-7 px-2 text-caption" onClick={() => setPaySupplier(s)}>
              Pay
            </Button>
          )}
          <Button variant="ghost" size="icon-sm" title="Edit" onClick={() => { setEditing(s); setFormOpen(true); }}>
            <Pencil className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" title="Delete" onClick={() => setDeleting(s)}>
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-4">
      {suppliers.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-5 w-5" />}
          title="No suppliers yet"
          description="Add suppliers to raise purchase orders. Each supplier tracks GSTIN, contact details, and outstanding payables."
          action={
            <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm">
              <Plus className="h-4 w-4" /> New Supplier
            </Button>
          }
        />
      ) : (
        /*
         * A supplier directory inside procurement is a payables list, not
         * a set of contact cards. Cards hid the two numbers that determine
         * what to do next — open POs and balance owed — one click deep.
         * As rows, "who do we owe the most" is the first sort, not a scroll.
         */
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={suppliers}
            columns={columns}
            storageKey="procurement-suppliers"
            searchable
            searchPlaceholder="Search name, GSTIN, phone…"
            hideable
            initialSort={{ key: "balanceOwed", direction: "desc" }}
            showTotals
            sumColumns={["openPOs", "balanceOwed"]}
            totalFormat={(key, sum) =>
              key === "openPOs" ? sum.toLocaleString("en-IN") : formatCurrency(sum)
            }
            rowTone={(s) => (s.balanceOwed > 0 ? "warning" : null)}
            onAddRow={() => { setEditing(null); setFormOpen(true); }}
            addRowLabel="New Supplier"
          />
        </div>
      )}

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
      <DeleteConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        endpoint={deleting ? `/api/suppliers/${deleting.id}` : ""}
        title="Delete supplier?"
        description={deleting ? `"${deleting.name}" will be archived. Suppliers with open POs cannot be deleted.` : ""}
        successMessage="Supplier archived"
      />
      <SupplierPaymentFormDialog
        open={paySupplier != null}
        onOpenChange={(o) => !o && setPaySupplier(null)}
        suppliers={paySupplier ? [paySupplier] : suppliers}
        defaultSupplierId={paySupplier?.id}
        defaultAmount={paySupplier?.balanceOwed}
      />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Direct Purchases tab — simplified purchase register (P-XXXXX)
//  Matches the client's paper "Purchase Register": supplier name,
//  bill date, bill amount. Optional line items receive stock.
// ───────────────────────────────────────────────────────────

function DirectPurchasesTab({
  directPurchases,
  suppliers,
  locations,
  materials,
  canCreate,
}: {
  directPurchases: DirectPurchaseRow[];
  suppliers: SupplierRow[];
  locations: StockLocationOption[];
  materials: MaterialOption[];
  canCreate: boolean;
}) {
  const [formOpen, setFormOpen] = useState(false);
  const totalAmount = directPurchases.reduce((s, p) => s + p.billAmount, 0);

  const supplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="space-y-4">
      {directPurchases.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5" />}
          title="No cash purchases"
          description="Log small or local purchases without a formal PO. Stock is received automatically if line items are added."
          action={
            <Button onClick={() => setFormOpen(true)} disabled={materials.length === 0 || locations.length === 0}>
              <Plus className="h-4 w-4" /> New Cash Purchase
            </Button>
          }
        />
      ) : (
        <div className="rounded-lg border border-border overflow-hidden">
          <DataTable
            data={directPurchases}
            initialSort={{ key: "billDate", direction: "desc" }}
            columns={directPurchaseColumns}
            searchable
            searchPlaceholder="Search by bill no, supplier, location…"
            showTotals
            sumColumns={["amount"]}
            totalFormat={(_k, sum) => formatCurrency(sum)}
            hideable
            pageSize={50}
            onAddRow={canCreate && materials.length > 0 && locations.length > 0 ? () => setFormOpen(true) : undefined}
            addRowLabel="New Cash Purchase"
          />
        </div>
      )}

      <DirectPurchaseFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        suppliers={supplierOptions}
        locations={locations}
        materials={materials}
      />
    </div>
  );
}
