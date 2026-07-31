"use client";

import { useMemo, useState } from "react";
import { Plus, Pencil, Trash2, ShoppingCart, Users, ArrowRight, Eye, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
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
      <PageHeader
        title="Customers & Sales"
        description="Manage customers, record asset sales (land or built units), and track payments."
      />

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
          <SalesTab sales={sales} customers={customerOptions} permissions={permissions} />
        </TabsContent>
        <TabsContent value="customers">
          <CustomersTab customers={customers} />
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
}: {
  sales: AssetSaleRow[];
  customers: { id: string; name: string }[];
  permissions?: { canCreateSale?: boolean; canManage?: boolean };
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
            { key: "assetType", label: "Asset Type" },
            { key: "assetLabel", label: "Asset" },
            { key: "customerName", label: "Customer" },
            { key: "projectName", label: "Project" },
            { key: "salePrice", label: "Sale Price", format: (v) => formatCurrency(Number(v)) },
            { key: "totalPaid", label: "Collected", format: (v) => formatCurrency(Number(v)) },
            { key: "status", label: "Status" },
            { key: "paymentStatus", label: "Payment" },
            { key: "createdAt", label: "Date", format: (v) => v ? formatDate(String(v)) : "" },
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
        <span>{filtered.length} sale{filtered.length !== 1 ? "s" : ""}</span>
        <span>·</span>
        <span>Revenue: {formatCurrency(totalRevenue)}</span>
        <span>·</span>
        <span>Collected: {formatCurrency(totalCollected)}</span>
      </div>

      <Card>
        <CardContent className="p-0">
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
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Sale Number</TH>
                  <TH>Asset</TH>
                  <TH>Customer</TH>
                  <TH>Project</TH>
                  <TH className="text-right">Sale Price</TH>
                  <TH className="text-right">Paid</TH>
                  <TH className="text-right">Balance</TH>
                  <TH className="text-right">Profit</TH>
                  <TH>Status</TH>
                  <TH>Payment</TH>
                  <TH>Date</TH>
                  <TH></TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((s) => (
                  <TR key={s.id} className="cursor-pointer" onClick={() => setSelected(s)}>
                    <TD className="font-mono text-caption font-medium">{s.saleNumber}</TD>
                    <TD className="font-medium">
                      {s.assetType === "LAND"
                        ? `Plot ${s.landParcelNumber ?? "—"}`
                        : `Unit ${s.builtUnitNumber ?? "—"}`}
                    </TD>
                    <TD>{s.customerName}</TD>
                    <TD className="text-muted-foreground">{s.projectName}</TD>
                    <TD className="tnum text-right font-medium">{formatCurrency(s.salePrice)}</TD>
                    <TD className="tnum text-right">{formatCurrency(s.totalPaid)}</TD>
                    <TD className="tnum text-right">{s.balanceDue > 0 ? <span className="text-warning">{formatCurrency(s.balanceDue)}</span> : "—"}</TD>
                    <TD className={`tnum text-right font-medium ${s.profit >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(s.profit)}</TD>
                    <TD><Badge variant={SALE_STATUS_VARIANT[s.status] ?? "muted"}>{s.status}</Badge></TD>
                    <TD><Badge variant={PAYMENT_STATUS_VARIANT[s.paymentStatus] ?? "muted"}>{s.paymentStatus}</Badge></TD>
                    <TD className="text-muted-foreground">{formatDate(s.saleDate)}</TD>
                    <TD><ArrowRight className="h-4 w-4 text-muted-foreground" /></TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

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

function CustomersTab({ customers }: { customers: CustomerRow[] }) {
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

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative sm:max-w-xs">
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search customers…" />
        </div>
        <Button onClick={() => { setEditing(null); setFormOpen(true); }}>
          <Plus className="h-4 w-4" /> New Customer
        </Button>
      </div>

      <Card>
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <EmptyState
              icon={<Users className="h-5 w-5" />}
              title={customers.length === 0 ? "No customers yet" : "No customers match the search"}
              description={customers.length === 0 ? "Add customers to record asset sales." : "Try a different search."}
              action={
                customers.length === 0 ? (
                  <Button onClick={() => { setEditing(null); setFormOpen(true); }} size="sm"><Plus className="h-4 w-4" /> New Customer</Button>
                ) : undefined
              }
            />
          ) : (
            <Table>
              <THead>
                <TR className="hover:bg-transparent">
                  <TH>Name</TH>
                  <TH>Phone</TH>
                  <TH>Email</TH>
                  <TH>GSTIN</TH>
                  <TH className="text-right">Active Sales</TH>
                  <TH className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {filtered.map((c) => (
                  <TR key={c.id}>
                    <TD className="font-medium">{c.name}</TD>
                    <TD className="text-muted-foreground">{c.phone ?? "—"}</TD>
                    <TD className="text-muted-foreground">{c.email ?? "—"}</TD>
                    <TD className="font-mono text-caption text-muted-foreground">{c.gstin ?? "—"}</TD>
                    <TD className="tnum text-right">{c.activeSales > 0 ? <Badge variant="default">{c.activeSales}</Badge> : "0"}</TD>
                    <TD className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" onClick={() => { setEditing(c); setFormOpen(true); }} title="Edit">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleting(c)} title="Delete" className="text-muted-foreground hover:text-danger">
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
