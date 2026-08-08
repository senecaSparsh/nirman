"use client";

import { useMemo, useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
  Plus, Pencil, Trash2, ShoppingCart, Tags, Download,
  Phone, Mail, Printer, RefreshCw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable, type Column } from "@/components/ui/data-table";
import { StatusPill, MetricGrid, Metric } from "@/components/page";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { PurchaseOrderFormDialog } from "./purchase-order-form-dialog";
import { PurchaseOrderDetailPanel } from "./purchase-order-detail-panel";
import { SupplierPaymentFormDialog } from "./supplier-payment-form-dialog";
import { DirectPurchaseFormDialog } from "./direct-purchase-form-dialog";
import { SplitView } from "@/components/ui/split-view";
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
  const [tab, setTab] = useState("purchase-orders");
  const canCreate = permissions?.canCreate ?? true;
  const canApprove = permissions?.canApprove ?? true;
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
  const router = useRouter();

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

  return (
    <div className="space-y-4">
      <MetricGrid cols={4}>
        <Metric label="Total POs" value={purchaseOrders.length} sub={`${openCount} open`} icon={<ShoppingCart />} />
        <Metric label="Draft" value={draftCount} tone="muted" icon={<ShoppingCart />} />
        <Metric label="Ordered" value={orderedCount} tone="success" icon={<ShoppingCart />} />
        <Metric label="Total Value" value={formatCurrency(totalValue)} tone="brand" sub="excl. cancelled" />
      </MetricGrid>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
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
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[160px]">
            <option value="">All statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="APPROVED">Approved</option>
            <option value="ORDERED">Ordered</option>
            <option value="PARTIAL">Partial</option>
            <option value="RECEIVED">Received</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button variant="outline" onClick={() => downloadCSV(`purchase-orders-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
            { key: "poNumber", label: "PO Number" },
            { key: "supplierName", label: "Supplier" },
            { key: "procurementScope", label: "Scope" },
            { key: "status", label: "Status" },
            { key: "total", label: "Total", format: (v) => formatCurrency(Number(v)) },
            { key: "expectedDate", label: "Expected", format: (v) => v ? formatDate(String(v)) : "" },
          ])} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export CSV
          </Button>
          <Button variant="outline" onClick={() => downloadExcel("purchase-trends")} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export Excel
          </Button>
          {canCreate && (
            <Button onClick={() => setFormOpen(true)} disabled={suppliers.length === 0 || locations.length === 0}>
              <Plus className="h-4 w-4" /> New PO
            </Button>
          )}
        </div>
      </div>

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
      ) : (
        /* ── Split View: list on left, detail on right ───────────────
           The default view. Dense, sortable columns, sticky header,
           right-aligned tabular numbers. Click a row to show its
           details in the right panel. Switch to Board for the kanban
           flow view. */
        <div className="rounded-lg border border-border overflow-hidden h-[calc(100vh-20rem)] min-h-[400px]">
          <SplitView
            storageKey="split-view-procurement-pos"
            list={
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
              />
            }
            detail={selected ? (
              <PurchaseOrderDetailPanel
                po={selected}
                canApprove={canApprove}
                suppliers={suppliers}
                canManagePayments={canManagePayments}
              />
            ) : null}
          />
        </div>
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
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [deleting, setDeleting] = useState<SupplierRow | null>(null);
  const [paySupplier, setPaySupplier] = useState<SupplierRow | null>(null);
  const router = useRouter();

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(q) || (s.gstin ?? "").toLowerCase().includes(q) || (s.phone ?? "").includes(q),
    );
  }, [suppliers, query]);

  const totalOwed = suppliers.reduce((s, v) => s + v.balanceOwed, 0);
  const withDues = suppliers.filter((s) => s.balanceOwed > 0).length;

  return (
    <div className="space-y-4">
      <MetricGrid cols={3}>
        <Metric label="Total Suppliers" value={suppliers.length} icon={<Tags />} />
        <Metric label="With Dues" value={withDues} tone={withDues > 0 ? "warning" : "muted"} />
        <Metric label="Total Owed" value={formatCurrency(totalOwed)} tone={totalOwed > 0 ? "danger" : "muted"} />
      </MetricGrid>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search suppliers…" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
            <Plus className="h-4 w-4" /> New Supplier
          </Button>
        </div>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Tags className="h-5 w-5" />}
          title={suppliers.length === 0 ? "No suppliers yet" : "No suppliers match the search"}
          description={suppliers.length === 0 ? "Add suppliers to raise purchase orders." : "Try a different search."}
        />
      ) : (
        /* ── Contact cards ──────────────────────────────────────────
           Each supplier is a contact card: name, GSTIN, phone/email
           with icons, open POs badge, and balance owed. Edit and
           delete buttons appear on hover. */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((s) => (
            <div
              key={s.id}
              className="group relative flex flex-col rounded-lg border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
            >
              {/* Hover actions */}
              <div className="absolute right-3 top-3 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setFormOpen(true); }} title="Edit" className="h-7 w-7">
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" onClick={() => setDeleting(s)} title="Delete" className="h-7 w-7 text-muted-foreground hover:text-danger">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>

              {/* Name */}
              <div className="pr-16 font-semibold text-foreground">{s.name}</div>

              {/* GSTIN */}
              <div className="mt-0.5 font-mono text-caption text-muted-foreground">{s.gstin ?? "—"}</div>

              {/* Phone / Email */}
              <div className="mt-3 space-y-1">
                <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                  <Phone className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.phone ?? "—"}</span>
                </div>
                <div className="flex items-center gap-1.5 text-caption text-muted-foreground">
                  <Mail className="h-3.5 w-3.5 shrink-0" />
                  <span className="truncate">{s.email ?? "—"}</span>
                </div>
              </div>

              {/* Footer: open POs + balance */}
              <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                {s.openPOs > 0 ? (
                  <Badge variant="warning">{s.openPOs} open PO{s.openPOs !== 1 ? "s" : ""}</Badge>
                ) : (
                  <span className="text-caption text-muted-foreground">No open POs</span>
                )}
                <div className="flex items-center gap-2">
                  <span className={`font-mono text-body font-semibold tnum ${s.balanceOwed > 0 ? "text-danger" : "text-muted-foreground"}`}>
                    {s.balanceOwed > 0 ? formatCurrency(s.balanceOwed) : "—"}
                  </span>
                  {canManagePayments && s.balanceOwed > 0 && (
                    <Button size="sm" variant="outline" className="h-6 px-2 text-caption" onClick={() => setPaySupplier(s)}>
                      Pay
                    </Button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <SupplierFormDialog open={formOpen} onOpenChange={setFormOpen} supplier={editing} />
      <DeleteConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        endpoint={deleting ? `/api/suppliers/${deleting.id}` : ""}
        title="Delete supplier?"
        description={deleting ? `“${deleting.name}” will be archived. Suppliers with open POs cannot be deleted.` : ""}
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
  const router = useRouter();
  const totalAmount = directPurchases.reduce((s, p) => s + p.billAmount, 0);

  const supplierOptions = suppliers.map((s) => ({ id: s.id, name: s.name }));

  return (
    <div className="space-y-4">
      <MetricGrid cols={2}>
        <Metric label="Cash Purchases" value={directPurchases.length} icon={<ShoppingCart />} />
        <Metric label="Total Amount" value={formatCurrency(totalAmount)} tone="brand" />
      </MetricGrid>

      <div className="flex items-center justify-between">
        <span className="text-body text-muted-foreground">
          {directPurchases.length} cash purchase{directPurchases.length !== 1 ? "s" : ""} · Total: {formatCurrency(totalAmount)}
        </span>
        <div className="flex gap-2">
          <Button variant="outline" size="icon" onClick={() => router.refresh()} title="Refresh">
            <RefreshCw className="h-4 w-4" />
          </Button>
          {canCreate && (
            <Button onClick={() => setFormOpen(true)} disabled={materials.length === 0 || locations.length === 0}>
              <Plus className="h-4 w-4" /> New Cash Purchase
            </Button>
          )}
        </div>
      </div>

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
