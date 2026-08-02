"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ShoppingCart, Users, ArrowRight, Eye, Download, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { DeleteConfirmDialog } from "@/components/delete-confirm-dialog";
import { CustomerFormDialog } from "./customer-form-dialog";
import { SellAssetDialog } from "./sell-asset-dialog";
import { SaleDetailDialog } from "./sale-detail-dialog";
import { formatCurrency, formatDate } from "@/lib/utils";
import { downloadCSV } from "@/lib/export";
import type { AssetSaleRow, CustomerRow } from "@/lib/types";

const SALE_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  ACTIVE: "success",
  CANCELLED: "danger",
};

const PAYMENT_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PENDING: "muted",
  PARTIAL: "warning",
  PAID: "success",
};

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
  const [tab, setTab] = useState(defaultTab);

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
          <SalesTab sales={sales} customers={customerOptions} permissions={permissions} onAddCustomer={() => setTab("customers")} />
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

function SalesTab({
  sales,
  customers,
  permissions,
  onAddCustomer,
}: {
  sales: AssetSaleRow[];
  customers: { id: string; name: string }[];
  permissions?: { canCreateSale?: boolean; canManage?: boolean };
  onAddCustomer?: () => void;
}) {
  const [statusFilter, setStatusFilter] = useState("");
  const [payFilter, setPayFilter] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [selected, setSelected] = useState<AssetSaleRow | null>(null);

  const filtered = useMemo(
    () => sales.filter((s) => {
      if (statusFilter && s.status !== statusFilter) return false;
      if (payFilter && s.paymentStatus !== payFilter) return false;
      return true;
    }),
    [sales, statusFilter, payFilter],
  );

  const totalRevenue = filtered.filter((s) => s.status !== "CANCELLED").reduce((sum, s) => sum + s.salePrice, 0);
  const totalCollected = filtered.filter((s) => s.status !== "CANCELLED").reduce((sum, s) => sum + s.totalPaid, 0);

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-1 flex-col gap-2 sm:flex-row">
          <Select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All statuses</option>
            <option value="ACTIVE">Active</option>
            <option value="CANCELLED">Cancelled</option>
          </Select>
          <Select value={payFilter} onChange={(e) => setPayFilter(e.target.value)} className="sm:max-w-[180px]">
            <option value="">All payments</option>
            <option value="PENDING">Pending</option>
            <option value="PARTIAL">Partial</option>
            <option value="PAID">Paid</option>
          </Select>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => downloadCSV(`sales-${new Date().toISOString().slice(0,10)}.csv`, filtered as unknown as Record<string, unknown>[], [
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
          ])} disabled={filtered.length === 0}>
            <Download className="h-4 w-4" /> Export
          </Button>
          {(permissions?.canCreateSale ?? true) && (
            <Button onClick={() => setFormOpen(true)} disabled={customers.length === 0}>
              <Plus className="h-4 w-4" /> New Sale
            </Button>
          )}
        </div>
      </div>

      <div className="flex items-center gap-3 text-caption text-muted-foreground">
        <span>{filtered.length} sales</span>
        <span>·</span>
        <span>Revenue: {formatCurrency(totalRevenue)}</span>
        <span>·</span>
        <span>Collected: {formatCurrency(totalCollected)}</span>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<ShoppingCart className="h-5 w-5" />}
          title={sales.length === 0 ? "No sales yet" : "No sales match the filters"}
          description={
            sales.length === 0
              ? customers.length === 0
                ? "Create a customer first, then record your first sale."
                : "Record your first asset sale (land or built unit)."
              : "Try a different status or payment filter."
          }
          action={
            sales.length === 0 && customers.length > 0 && (permissions?.canCreateSale ?? true) ? (
              <Button onClick={() => setFormOpen(true)} size="sm"><Plus className="h-4 w-4" /> New Sale</Button>
            ) : sales.length === 0 && customers.length === 0 ? (
              <Button onClick={() => onAddCustomer?.()} size="sm"><Users className="h-4 w-4" /> Add a customer</Button>
            ) : undefined
          }
        />
      ) : (
        /* ── Timeline of sale events ──
           Not a table. Sales are chronological events — you see the
           most recent sale at the top, with a vertical line connecting
           them. Each event shows the asset sold, customer, price, and
           payment progress as a visual bar. This is the temporal nature
           of sales made visual. */
        <div className="relative">
          {/* Vertical timeline line */}
          <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />

          <div className="space-y-1">
            {filtered.map((s) => {
              const payPct = s.salePrice > 0 ? Math.min(100, (s.totalPaid / s.salePrice) * 100) : 0;
              const isCancelled = s.status === "CANCELLED";
              return (
                <button
                  key={s.id}
                  onClick={() => setSelected(s)}
                  className="group relative flex w-full items-start gap-4 rounded-lg p-2.5 pl-0 text-left transition-colors hover:bg-muted/30"
                >
                  {/* Timeline dot */}
                  <span
                    className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background ${
                      isCancelled ? "bg-danger" :
                      s.paymentStatus === "PAID" ? "bg-success" :
                      s.paymentStatus === "PARTIAL" ? "bg-warning" :
                      "bg-muted-foreground/40"
                    }`}
                  />

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <span className="font-mono text-caption font-semibold text-foreground">{s.saleNumber}</span>
                        <span className="ml-2 text-body font-medium text-foreground">
                          {s.assetType === "LAND"
                            ? `Plot ${s.landParcelNumber ?? "—"}`
                            : `Unit ${s.builtUnitNumber ?? "—"}`}
                        </span>
                      </div>
                      <span className="shrink-0 text-body font-semibold tnum text-foreground">{formatCurrency(s.salePrice)}</span>
                    </div>

                    <div className="mt-0.5 flex items-baseline gap-2 text-caption text-muted-foreground">
                      <span className="truncate">{s.customerName}</span>
                      <span>·</span>
                      <span className="truncate">{s.projectName}</span>
                      <span className="ml-auto shrink-0">{formatDate(s.saleDate)}</span>
                    </div>

                    {/* Payment progress bar */}
                    {!isCancelled && s.salePrice > 0 && (
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                          <div
                            className={`h-full ${payPct === 100 ? "bg-success" : payPct > 0 ? "bg-warning" : "bg-muted-foreground/20"}`}
                            style={{ width: `${payPct}%` }}
                          />
                        </div>
                        <span className="text-micro tnum text-muted-foreground">
                          {formatCurrency(s.totalPaid)} / {formatCurrency(s.salePrice)}
                        </span>
                        {s.balanceDue > 0 && (
                          <span className="text-micro font-medium text-warning">{formatCurrency(s.balanceDue)} due</span>
                        )}
                      </div>
                    )}

                    {/* Status badges */}
                    <div className="mt-1.5 flex items-center gap-2">
                      <Badge variant={SALE_STATUS_VARIANT[s.status] ?? "muted"}>{s.status}</Badge>
                      <Badge variant={PAYMENT_STATUS_VARIANT[s.paymentStatus] ?? "muted"}>{s.paymentStatus}</Badge>
                      {s.profit !== 0 && (
                        <span className={`text-micro tnum font-medium ${s.profit >= 0 ? "text-success" : "text-danger"}`}>
                          {s.profit >= 0 ? "+" : ""}{formatCurrency(s.profit)}
                        </span>
                      )}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
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
//  Customers tab
// ───────────────────────────────────────────────────────────

function CustomersTab({ customers, permissions }: { customers: CustomerRow[]; permissions?: { canCreateSale?: boolean; canManage?: boolean } }) {
  const [query, setQuery] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<CustomerRow | null>(null);
  const [deleting, setDeleting] = useState<CustomerRow | null>(null);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return customers;
    return customers.filter((c) =>
      c.name.toLowerCase().includes(q) || (c.phone ?? "").includes(q) || (c.email ?? "").toLowerCase().includes(q) || (c.gstin ?? "").toLowerCase().includes(q),
    );
  }, [customers, query]);

  const initials = (name: string) =>
    name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers…" />
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }} disabled={!(permissions?.canManage ?? true)}>
          <Plus className="h-4 w-4" /> New Customer
        </Button>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Users className="h-5 w-5" />}
          title={customers.length === 0 ? "No customers yet" : "No customers match the search"}
          description={customers.length === 0 ? "Add customers to record asset sales." : "Try a different search."}
          action={
            customers.length === 0 ? (
              <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm" disabled={!(permissions?.canManage ?? true)}><Plus className="h-4 w-4" /> New Customer</Button>
            ) : undefined
          }
        />
      ) : (
        /* ── Contact card grid — matches the standalone Customers page ── */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((c) => (
            <div
              key={c.id}
              className="group relative rounded-lg border border-border bg-card p-4 transition-all hover:border-foreground/20 hover:shadow-sm"
            >
              <div className="flex items-center gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-foreground text-caption font-semibold text-background">
                  {initials(c.name)}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-body font-semibold text-foreground">{c.name}</div>
                  {c.gstin && (
                    <div className="truncate font-mono text-micro text-muted-foreground">{c.gstin}</div>
                  )}
                </div>
              </div>

              <div className="mt-3 space-y-1">
                {c.phone && (
                  <div className="flex items-center gap-2 text-caption text-muted-foreground">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.phone}</span>
                  </div>
                )}
                {c.email && (
                  <div className="flex items-center gap-2 text-caption text-muted-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span className="truncate">{c.email}</span>
                  </div>
                )}
                {!c.phone && !c.email && (
                  <div className="text-caption text-muted-foreground/50">No contact info</div>
                )}
              </div>

              <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2">
                <div className="flex items-center gap-1.5">
                  <span className="text-caption text-muted-foreground">Active sales</span>
                  <span className={`text-body font-semibold tnum ${c.activeSales > 0 ? "text-foreground" : "text-muted-foreground"}`}>
                    {c.activeSales}
                  </span>
                </div>
                <div className="flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                  {(permissions?.canManage ?? true) && (
                    <button
                      onClick={() => { setEditing(c); setFormOpen(true); }}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                      title="Edit"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                  )}
                  {(permissions?.canManage ?? true) && (
                    <button
                      onClick={() => setDeleting(c)}
                      className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-danger"
                      title="Delete"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <CustomerFormDialog open={formOpen} onOpenChange={setFormOpen} customer={editing} />
      <DeleteConfirmDialog
        open={deleting != null}
        onOpenChange={(o) => !o && setDeleting(null)}
        endpoint={deleting ? `/api/customers/${deleting.id}` : ""}
        title="Delete customer?"
        description={deleting ? `“${deleting.name}” will be archived. Customers with active sales cannot be deleted.` : ""}
        successMessage="Customer archived"
      />
    </div>
  );
}
