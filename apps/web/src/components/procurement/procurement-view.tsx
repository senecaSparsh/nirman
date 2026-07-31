"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Plus, Pencil, Trash2, Truck, Package, ArrowRight, ShoppingCart, Tags, Check, X, Download,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { PageHeader } from "@/components/page-header";
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
} from "@/lib/types";

const PO_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  DRAFT: "muted", APPROVED: "default", ORDERED: "warning",
  PARTIAL: "warning", RECEIVED: "success", CANCELLED: "danger",
};

const TRANSFER_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  DRAFT: "muted", IN_TRANSIT: "warning", COMPLETED: "success", CANCELLED: "danger",
};

export function ProcurementView({
  suppliers, purchaseOrders, transfers, issues, materials, locations, projects, permissions,
}: {
  suppliers: SupplierRow[];
  purchaseOrders: PurchaseOrderRow[];
  transfers: TransferRow[];
  issues: MaterialIssueListRow[];
  materials: MaterialRow[];
  locations: StockLocationRow[];
  projects: ProjectOption[];
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
      <PageHeader
        title="Procurement"
        description="Purchase orders, stock transfers, material issues to projects, and supplier management."
      />

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
          <IssuesTab issues={issues} projects={projects} materialOptions={materialOptions} locationOptions={locationOptions} />
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
  const [statusFilter, setStatusFilter] = useState("");
  const [scopeFilter, setScopeFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<PurchaseOrderRow | null>(null);

  const filtered = useMemo(
    () => purchaseOrders.filter((p) => {
      if (statusFilter && p.status !== statusFilter) return false;
      if (scopeFilter && p.procurementScope !== scopeFilter) return false;
      return true;
    }),
    [purchaseOrders, statusFilter, scopeFilter],
  );

  const openCount = filtered.filter((p) => ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"].includes(p.status)).length;
  const totalValue = filtered.filter((p) => p.status !== "CANCELLED").reduce((s, p) => s + p.total, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All statuses</option>
            {["DRAFT", "APPROVED", "ORDERED", "PARTIAL", "RECEIVED", "CANCELLED"].map((s) => (
              <option key={s} value={s}>{s.replace("_", " ")}</option>
            ))}
          </Select>
          <Select value={scopeFilter} onChange={(e) => setScopeFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All scopes</option>
            <option value="COMPANY">Company</option>
            <option value="PROJECT">Project</option>
          </Select>
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
              <Plus className="h-4 w-4" /> New Purchase Order
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-body text-muted-foreground">
        <span>{filtered.length} PO{filtered.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>{openCount} open</span>
        <span>·</span>
        <span>Total value: {formatCurrency(totalValue)}</span>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<ShoppingCart className="h-5 w-5" />}
              title={purchaseOrders.length === 0 ? "No purchase orders yet" : "No POs match the filters"}
              description={
                purchaseOrders.length === 0
                  ? suppliers.length === 0
                    ? "Create a supplier first, then raise a purchase order."
                    : "Raise your first purchase order to procure materials."
                  : "Try a different status or scope filter."
              }
              action={
                purchaseOrders.length === 0 && suppliers.length > 0 && locations.length > 0 && canCreate ? (
                  <Button onClick={() => setFormOpen(true)} size="sm"><Plus className="h-4 w-4" /> New PO</Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>PO Number</TH>
                  <TH>Supplier</TH>
                  <TH>Scope</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Total</TH>
                  <TH>Progress</TH>
                  <TH>Expected</TH>
                  <TH>Age</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((p) => {
                  const orderDate = new Date(p.orderDate);
                  const daysOpen = Math.floor((Date.now() - orderDate.getTime()) / 86400000);
                  const isOverdue = p.expectedDate && new Date(p.expectedDate) < new Date() && p.status !== "RECEIVED" && p.status !== "CANCELLED";
                  return (
                    <TR key={p.id} className="cursor-pointer" onClick={() => setSelected(p)}>
                      <TD className="font-mono text-caption font-medium">{p.poNumber}</TD>
                      <TD className="font-medium">{p.supplierName}</TD>
                      <TD>
                        <Badge variant={p.procurementScope === "COMPANY" ? "default" : "muted"}>
                          {p.procurementScope === "COMPANY" ? "Company" : p.projectName ?? "Project"}
                        </Badge>
                      </TD>
                      <TD><Badge variant={PO_STATUS_VARIANT[p.status] ?? "muted"}>{p.status.replace("_", " ")}</Badge></TD>
                      <TD className="tnum text-right font-medium">{formatCurrency(p.total)}</TD>
                      <TD>
                        <div className="flex items-center gap-2">
                          <div className="h-1.5 w-20 overflow-hidden rounded-full bg-muted">
                            <div className={`h-full ${p.receivedPct === 100 ? "bg-success" : p.receivedPct > 0 ? "bg-warning" : "bg-muted-foreground/30"}`} style={{ width: `${p.receivedPct}%` }} />
                          </div>
                          <span className="text-caption text-muted-foreground">{p.receivedPct}%</span>
                        </div>
                      </TD>
                      <TD className={isOverdue ? "text-danger font-medium" : "text-muted-foreground"}>
                        {formatDate(p.expectedDate)}
                        {isOverdue && <span className="block text-micro text-danger">overdue</span>}
                      </TD>
                      <TD>
                        <span
                          className={`tnum text-caption font-medium ${
                            isOverdue ? "text-danger" : daysOpen > 14 ? "text-warning" : "text-muted-foreground"
                          }`}
                        >
                          {daysOpen}d
                        </span>
                      </TD>
                      <TD><ArrowRight className="h-4 w-4 text-muted-foreground" /></TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Truck className="h-5 w-5" />}
              title={transfers.length === 0 ? "No transfers yet" : "No transfers match the filter"}
              description={transfers.length === 0 ? "Move stock between warehouses and project sites." : "Try a different status filter."}
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>From</TH>
                  <TH></TH>
                  <TH>To</TH>
                  <TH>Status</TH>
                  <TH className="text-right">Lines</TH>
                  <TH>Materials</TH>
                  <TH>Date</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((t) => (
                  <TransferRowItem key={t.id} transfer={t} />
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <TransferFormDialog open={formOpen} onOpenChange={setFormOpen} locations={locations} />
    </div>
  );
}

function TransferRowItem({ transfer }: { transfer: TransferRow }) {
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
    <TR>
      <TD className="font-medium">{transfer.fromLocationName}</TD>
      <TD><ArrowRight className="h-4 w-4 text-muted-foreground" /></TD>
      <TD className="font-medium">{transfer.toLocationName}</TD>
      <TD><Badge variant={TRANSFER_STATUS_VARIANT[transfer.status] ?? "muted"}>{transfer.status.replace("_", " ").toLowerCase()}</Badge></TD>
      <TD className="tnum text-right">{transfer.lineCount}</TD>
      <TD className="max-w-[240px] truncate text-caption text-muted-foreground">{transfer.materials.join(", ")}</TD>
      <TD className="text-muted-foreground">{formatDate(transfer.transferDate)}</TD>
      <TD className="text-right">
        {transfer.status === "DRAFT" && (
          <div className="flex justify-end gap-1">
            <Button variant="ghost" size="sm" onClick={() => doAction("complete")} disabled={acting} className="text-success hover:text-success">
              <Check className="h-4 w-4" /> Complete
            </Button>
            <Button variant="ghost" size="icon" onClick={() => doAction("cancel")} disabled={acting} className="text-muted-foreground hover:text-danger">
              <X className="h-4 w-4" />
            </Button>
          </div>
        )}
      </TD>
    </TR>
  );
}

// ───────────────────────────────────────────────────────────
//  Issues tab
// ───────────────────────────────────────────────────────────

function IssuesTab({
  issues, projects, materialOptions, locationOptions,
}: {
  issues: MaterialIssueListRow[];
  projects: ProjectOption[];
  materialOptions: MaterialOption[];
  locationOptions: StockLocationOption[];
}) {
  const [formOpen, setFormOpen] = useState(false);
  const totalCost = issues.reduce((s, i) => s + i.totalCost, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-body text-muted-foreground">
          {issues.length} issue{issues.length !== 1 ? "s" : ""} · Total WIP cost: {formatCurrency(totalCost)}
        </span>
        <Button onClick={() => setFormOpen(true)} disabled={projects.length === 0 || materialOptions.length === 0}>
          <Plus className="h-4 w-4" /> Issue Materials
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {issues.length === 0 ? (
            <EmptyState
              icon={<Package className="h-5 w-5" />}
              title="No material issues"
              description="Issue materials from stock to a project — cost accumulates as WIP."
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Project</TH>
                  <TH>From Location</TH>
                  <TH className="text-right">Lines</TH>
                  <TH className="text-right">Total Cost</TH>
                  <TH>Date</TH>
                </TR>
              </THead>
              <TBody>
                {issues.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-medium">{i.projectName}</TD>
                    <TD className="text-muted-foreground">{i.fromLocationName}</TD>
                    <TD className="tnum text-right">{i.lineCount}</TD>
                    <TD className="tnum text-right">{formatCurrency(i.totalCost)}</TD>
                    <TD className="text-muted-foreground">{formatDate(i.issueDate)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <IssueFormDialog open={formOpen} onOpenChange={setFormOpen} projects={projects} locations={locationOptions} materials={materialOptions} />
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

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Tags className="h-5 w-5" />}
              title={suppliers.length === 0 ? "No suppliers yet" : "No suppliers match the search"}
              description={suppliers.length === 0 ? "Add suppliers to raise purchase orders." : "Try a different search."}
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH>GSTIN</TH>
                  <TH>Phone</TH>
                  <TH>Email</TH>
                  <TH className="text-right">Open POs</TH>
                  <TH className="text-right">Balance Owed</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => (
                  <TR key={s.id}>
                    <TD className="font-medium">{s.name}</TD>
                    <TD className="font-mono text-caption text-muted-foreground">{s.gstin ?? "—"}</TD>
                    <TD className="text-muted-foreground">{s.phone ?? "—"}</TD>
                    <TD className="text-muted-foreground">{s.email ?? "—"}</TD>
                    <TD className="tnum text-right">{s.openPOs > 0 ? <Badge variant="warning">{s.openPOs}</Badge> : "0"}</TD>
                    <TD className="tnum text-right">{s.balanceOwed > 0 ? formatCurrency(s.balanceOwed) : "—"}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditing(s); setFormOpen(true); }} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(s)} title="Delete" className="text-muted-foreground hover:text-danger">
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

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
