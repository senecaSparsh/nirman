"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Truck, Package, ArrowRight, ShoppingCart, Tags, Check, X, Download,
  Phone, Mail,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { SupplierFormDialog } from "./supplier-form-dialog";
import { PurchaseOrderFormDialog } from "./purchase-order-form-dialog";
import { PurchaseOrderDetailDialog } from "./purchase-order-detail-dialog";
import { TransferFormDialog } from "./transfer-form-dialog";
import { IssueFormDialog } from "./issue-form-dialog";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import type {
  SupplierRow, PurchaseOrderRow, TransferRow, MaterialRow, StockLocationRow,
  ProjectOption, MaterialIssueListRow, MaterialOption, StockLocationOption,
  DepartmentOption,
} from "@/lib/types";

const PO_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  DRAFT: "muted", APPROVED: "default", ORDERED: "warning",
  PARTIAL: "warning", RECEIVED: "success", CANCELLED: "danger",
};

const TRANSFER_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  DRAFT: "muted", IN_TRANSIT: "warning", COMPLETED: "success", CANCELLED: "danger",
};

export function ProcurementView({
  suppliers, purchaseOrders, transfers, issues, materials, locations, projects, departments, permissions,
}: {
  suppliers: SupplierRow[];
  purchaseOrders: PurchaseOrderRow[];
  transfers: TransferRow[];
  issues: MaterialIssueListRow[];
  materials: MaterialRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
  departments: DepartmentOption[];
  permissions?: { canCreate?: boolean; canApprove?: boolean };
}) {
  const [tab, setTab] = useState("purchase-orders");
  const canCreate = permissions?.canCreate ?? true;
  const canApprove = permissions?.canApprove ?? true;

  // Derive simplified option types for the IssueFormDialog
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
          <TabsTrigger value="transfers">
            <span className="flex items-center gap-1.5"><Truck className="h-3.5 w-3.5" /> Transfers</span>
          </TabsTrigger>
          <TabsTrigger value="issues">
            <span className="flex items-center gap-1.5"><Package className="h-3.5 w-3.5" /> Issues</span>
          </TabsTrigger>
          <TabsTrigger value="suppliers">
            <span className="flex items-center gap-1.5"><Tags className="h-3.5 w-3.5" /> Suppliers</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="purchase-orders">
          <PurchaseOrdersTab purchaseOrders={purchaseOrders} suppliers={suppliers} materials={materials} locations={locations} projects={projects} canCreate={canCreate} canApprove={canApprove} />
        </TabsContent>
        <TabsContent value="transfers">
          <TransfersTab transfers={transfers} locations={locations} />
        </TabsContent>
        <TabsContent value="issues">
          <IssuesTab issues={issues} projects={projects} departments={departments} materialOptions={materialOptions} locationOptions={locationOptions} />
        </TabsContent>
        <TabsContent value="suppliers">
          <SuppliersTab suppliers={suppliers} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Purchase Orders tab
// ───────────────────────────────────────────────────────────

function PurchaseOrdersTab({
  purchaseOrders, suppliers, materials, locations, projects, canCreate, canApprove,
}: {
  purchaseOrders: PurchaseOrderRow[];
  suppliers: SupplierRow[];
  materials: MaterialRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
  canCreate: boolean;
  canApprove: boolean;
}) {
  const [scopeFilter, setScopeFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrderRow | null>(null);
  const [view, setView] = useState<"board" | "list">("board");

  const filtered = useMemo(
    () => purchaseOrders.filter((p) => {
      if (scopeFilter && p.procurementScope !== scopeFilter) return false;
      return true;
    }),
    [purchaseOrders, scopeFilter],
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 items-center gap-2">
          <Select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="max-w-[160px]">
            <option value="">All scopes</option>
            <option value="COMPANY">Company</option>
            <option value="PROJECT">Project</option>
          </Select>
          <div className="flex items-center gap-1 rounded-md border border-border p-0.5">
            <button
              onClick={() => setView("board")}
              className={`rounded px-2 py-1 text-caption font-medium transition-colors ${view === "board" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              Board
            </button>
            <button
              onClick={() => setView("list")}
              className={`rounded px-2 py-1 text-caption font-medium transition-colors ${view === "list" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}
            >
              List
            </button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCSV(`purchase-orders-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
            { key: "poNumber", label: "PO Number" },
            { key: "supplierName", label: "Supplier" },
            { key: "procurementScope", label: "Scope" },
            { key: "status", label: "Status" },
            { key: "total", label: "Total", format: (v) => formatCurrency(Number(v)) },
            { key: "expectedDate", label: "Expected", format: (v) => v ? formatDate(String(v)) : "" },
          ])} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export
          </Button>
          {canCreate && (
            <Button onClick={() => setFormOpen(true)} disabled={suppliers.length === 0 || locations.length === 0}>
              <Plus className="h-4 w-4" /> New PO
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-body text-muted-foreground">
        <span>{filtered.length} POs</span>
        <span>·</span>
        <span>{openCount} open</span>
        <span>·</span>
        <span className="tnum">{formatCurrency(totalValue)}</span>
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
                      className="group block w-full rounded-lg border border-border bg-card p-3 text-left transition-all hover:border-foreground/20 hover:shadow-sm"
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
        /* ── List view (compact, no card wrapper) ────────────────── */
        <div className="divide-y divide-border rounded-lg border border-border">
          {filtered.map((p) => {
            const orderDate = new Date(p.orderDate);
            const daysOpen = Math.floor((Date.now() - orderDate.getTime()) / 86400000);
            const isOverdue = p.expectedDate && new Date(p.expectedDate) < new Date() && p.status !== "RECEIVED" && p.status !== "CANCELLED";
            return (
              <button
                key={p.id}
                onClick={() => setSelected(p)}
                className="group flex w-full items-center gap-4 px-4 py-2.5 text-left transition-colors hover:bg-muted/30"
              >
                <span className="font-mono text-caption font-semibold text-foreground w-28 shrink-0">{p.poNumber}</span>
                <span className="flex-1 truncate text-body font-medium">{p.supplierName}</span>
                <span className="hidden sm:block w-20 shrink-0">
                  <Badge variant={PO_STATUS_VARIANT[p.status] ?? "muted"}>{p.status.replace("_", " ")}</Badge>
                </span>
                <span className="w-24 shrink-0 text-right text-body font-semibold tnum">{formatCurrency(p.total)}</span>
                <div className="hidden md:flex w-20 items-center gap-2 shrink-0">
                  <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${p.receivedPct === 100 ? "bg-success" : p.receivedPct > 0 ? "bg-warning" : "bg-muted-foreground/30"}`} style={{ width: `${p.receivedPct}%` }} />
                  </div>
                </div>
                <span className={`w-10 shrink-0 text-right text-micro tnum ${isOverdue ? "text-danger font-semibold" : daysOpen > 14 ? "text-warning" : "text-muted-foreground"}`}>
                  {daysOpen}d
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/40 group-hover:text-foreground" />
              </button>
            );
          })}
        </div>
      )}

      {suppliers.length === 0 && (
        <p className="rounded-md border border-dashed p-3 text-body text-muted-foreground">
          You need at least one supplier and one stock location to create a purchase order. Add them in the Suppliers tab and Materials → Locations tab.
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
      <PurchaseOrderDetailDialog open={selected != null} onOpenChange={(o) => !o && setSelected(null)} po={selected} canApprove={canApprove} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Transfers tab
// ───────────────────────────────────────────────────────────

function TransfersTab({ transfers, locations }: { transfers: TransferRow[]; locations: StockLocationRow[] }) {
  const [statusFilter, setStatusFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);

  const filtered = useMemo(
    () => (statusFilter ? transfers.filter((t) => t.status === statusFilter) : transfers),
    [transfers, statusFilter],
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[180px]">
          <option value="">All statuses</option>
          <option value="DRAFT">Draft</option>
          <option value="IN_TRANSIT">In Transit</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Button onClick={() => setFormOpen(true)} disabled={locations.length < 2}>
          <Plus className="h-4 w-4" /> New Transfer
        </Button>
      </div>

      {locations.length < 2 && (
        <p className="rounded-md border border-dashed p-3 text-body text-muted-foreground">
          You need at least two stock locations to create a transfer. Add locations in Materials → Locations.
        </p>
      )}

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Truck className="h-5 w-5" />}
          title={transfers.length === 0 ? "No transfers yet" : "No transfers match the filter"}
          description={transfers.length === 0 ? "Move stock between warehouses and project sites." : "Try a different status filter."}
        />
      ) : (
        /* ── Route cards ────────────────────────────────────────────
           Each transfer is a card showing the route (From → To),
           status, line count, materials, and date. DRAFT transfers
           expose Complete / Cancel actions on the card itself. */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((t) => (
            <TransferCard key={t.id} transfer={t} />
          ))}
        </div>
      )}

      <TransferFormDialog open={formOpen} onOpenChange={setFormOpen} locations={locations} />
    </div>
  );
}

function TransferCard({ transfer }: { transfer: TransferRow }) {
  const router = useRouter();
  const [acting, setActing] = useState(false);

  async function doAction(action: "complete" | "cancel") {
    setActing(true);
    try {
      const res = await fetch(`/api/transfers/${transfer.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Action failed");
      toast.success(`Transfer ${action}d`);
      router.refresh();
    } catch (err: any) {
      toast.error(err.message);
    } finally {
      setActing(false);
    }
  }

  return (
    <div className="flex flex-col rounded-lg border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm">
      {/* Route: From → To */}
      <div className="flex items-center gap-2">
        <span className="font-semibold text-foreground">{transfer.fromLocationName}</span>
        <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        <span className="font-semibold text-foreground">{transfer.toLocationName}</span>
      </div>

      {/* Status badge */}
      <div className="mt-2">
        <Badge variant={TRANSFER_STATUS_VARIANT[transfer.status] ?? "muted"}>
          {transfer.status.replace("_", " ").toLowerCase()}
        </Badge>
      </div>

      {/* Line count + materials (truncated to 1 line) */}
      <div className="mt-3 space-y-1">
        <div className="text-caption text-muted-foreground">
          {transfer.lineCount} line{transfer.lineCount !== 1 ? "s" : ""}
        </div>
        <div className="truncate text-caption text-muted-foreground">{transfer.materials.join(", ") || "—"}</div>
      </div>

      {/* Date */}
      <div className="mt-2 text-micro tnum text-muted-foreground">{formatDate(transfer.transferDate)}</div>

      {/* Actions for DRAFT transfers */}
      {transfer.status === "DRAFT" && (
        <div className="mt-3 flex gap-1 border-t border-border pt-3">
          <Button variant="ghost" size="sm" onClick={() => doAction("complete")} disabled={acting} className="text-success hover:text-success">
            <Check className="h-4 w-4" /> Complete
          </Button>
          <Button variant="ghost" size="icon" onClick={() => doAction("cancel")} disabled={acting} className="ml-auto text-muted-foreground hover:text-danger">
            <X className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Issues tab
// ───────────────────────────────────────────────────────────

function IssuesTab({
  issues, projects, departments, materialOptions, locationOptions,
}: {
  issues: MaterialIssueListRow[];
  projects: ProjectOption[];
  departments: DepartmentOption[];
  materialOptions: MaterialOption[];
  locationOptions: StockLocationOption[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const totalCost = issues.reduce((s, i) => s + i.totalCost, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-body text-muted-foreground">
          {issues.length} issue{issues.length !== 1 ? "s" : ""} · Total cost: {formatCurrency(totalCost)}
        </span>
        <Button onClick={() => setFormOpen(true)} disabled={(projects.length === 0 && departments.length === 0) || materialOptions.length === 0}>
          <Plus className="h-4 w-4" /> Issue Materials
        </Button>
      </div>

      {issues.length === 0 ? (
        <EmptyState
          icon={<Package className="h-5 w-5" />}
          title="No material issues"
          description="Issue materials from stock to a project (WIP) or a cost center (Operating Expenses)."
        />
      ) : (
        /* ── Timeline feed ──────────────────────────────────────────
           A vertical line with amber dots traces the history of
           material issues. Each entry shows the target (project or
           department), source location, line count, total cost
           (red, monospace), and date. */
        <div className="relative pl-6">
          {/* Vertical line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
          <div className="space-y-5">
            {issues.map((i) => (
              <div key={i.id} className="relative">
                {/* Amber dot */}
                <span className="absolute -left-[19px] top-1.5 h-3.5 w-3.5 rounded-full border-2 border-background bg-amber-500" />
                <div className="font-semibold text-foreground">
                  {i.projectName ?? (`${i.departmentCode ?? ""} ${i.departmentName ?? ""}`.trim() || "—")}
                </div>
                <div className="mt-0.5 text-body text-muted-foreground">{i.fromLocationName}</div>
                <div className="mt-1 flex items-center gap-2 text-caption">
                  <span className="tnum text-muted-foreground">{i.lineCount} line{i.lineCount !== 1 ? "s" : ""}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="font-mono font-semibold text-danger">{formatCurrency(i.totalCost)}</span>
                  <span className="text-muted-foreground/40">·</span>
                  <span className="tnum text-muted-foreground">{formatDate(i.issueDate)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <IssueFormDialog open={formOpen} onOpenChange={setFormOpen} projects={projects} locations={locationOptions} materials={materialOptions} departments={departments} />
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Suppliers tab
// ───────────────────────────────────────────────────────────

function SuppliersTab({ suppliers }: { suppliers: SupplierRow[] }) {
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierRow | null>(null);
  const [deleting, setDeleting] = useState<SupplierRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter((s) =>
      s.name.toLowerCase().includes(q) || (s.gstin ?? "").toLowerCase().includes(q) || (s.phone ?? "").includes(q),
    );
  }, [suppliers, query]);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search suppliers…" />
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> New Supplier
        </Button>
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
                <span className={`font-mono text-body font-semibold tnum ${s.balanceOwed > 0 ? "text-danger" : "text-muted-foreground"}`}>
                  {s.balanceOwed > 0 ? formatCurrency(s.balanceOwed) : "—"}
                </span>
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
    </div>
  );
}
