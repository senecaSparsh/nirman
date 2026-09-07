"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Truck, ArrowRight, Plus, FileText, Undo2, Package,
  Phone, Mail, MapPin, Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/page";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { useTrackRecent } from "@/lib/use-recently-viewed";

// ───────────────────────────────────────────────────────────
//  Types
// ───────────────────────────────────────────────────────────

export type SupplierCockpitData = {
  supplier: {
    id: string;
    name: string;
    gstin: string | null;
    phone: string | null;
    email: string | null;
    address: string | null;
    balanceOwed: number;
    leadTimeDays: number | null;
  };
  stats: {
    totalPOs: number;
    openPOCount: number;
    totalOrdered: number;
    totalReceived: number;
    totalReturns: number;
    balanceOwed: number;
  };
  purchaseOrders: {
    id: string;
    poNumber: string;
    status: string;
    orderDate: string;
    expectedDate: string | null;
    total: number;
    lineCount: number;
  }[];
  rateContracts: {
    id: string;
    contractNumber: string;
    materialName: string;
    materialCode: string;
    agreedRate: number;
    validFrom: string;
    validTo: string;
    status: string;
  }[];
  supplierReturns: {
    id: string;
    returnNumber: string;
    status: string;
    totalAmount: number;
    date: string;
  }[];
  recentGRNs: {
    id: string;
    grnNumber: string;
    poNumber: string;
    date: string;
    lineCount: number;
  }[];
  invoices: {
    id: string;
    invoiceNumber: string;
    invoiceDate: string;
    dueDate: string | null;
    status: string;
    matchStatus: string | null;
    totalAmount: number;
    totalPaid: number;
    balanceDue: number;
  }[];
  payments: {
    id: string;
    paymentNumber: string;
    paymentDate: string;
    paymentMode: string;
    amount: number;
    tdsAmount: number;
    netPaid: number;
    referenceNo: string | null;
  }[];
  topMaterials: { name: string; qty: number; amount: number }[];
};

// ───────────────────────────────────────────────────────────
//  Main component
// ───────────────────────────────────────────────────────────

export function SupplierCockpit({ data }: { data: SupplierCockpitData }) {
  const [tab, setTab] = useState("overview");
  const { supplier, stats } = data;
  const trackRecent = useTrackRecent();

  useEffect(() => {
    trackRecent({ type: "supplier", id: supplier.id, label: supplier.name, href: `/suppliers/${supplier.id}` });
  }, [supplier.id, supplier.name, trackRecent]);

  return (
    <div className="space-y-5">
      {/* Back link */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/suppliers">← Suppliers</Link>
        </Button>
      </div>

      {/* Header */}
      <PageHeader title={supplier.name} description={supplier.gstin ?? undefined} />

      {/* Contact meta */}
      <div className="flex flex-wrap items-center gap-4 text-caption text-muted-foreground">
        {supplier.phone && <span className="flex items-center gap-1"><Phone className="h-3.5 w-3.5" />{supplier.phone}</span>}
        {supplier.email && <span className="flex items-center gap-1"><Mail className="h-3.5 w-3.5" />{supplier.email}</span>}
        {supplier.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{supplier.address}</span>}
        {supplier.leadTimeDays != null && <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />Lead time: {supplier.leadTimeDays} days</span>}
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-border pb-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Total POs</span>
          <span className="tnum text-body font-semibold text-foreground">{stats.totalPOs}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Open</span>
          <span className="tnum text-body font-semibold text-foreground">{stats.openPOCount}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Total Ordered</span>
          <span className="tnum text-body font-semibold text-foreground">{formatCurrency(stats.totalOrdered)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Received</span>
          <span className="tnum text-body font-semibold text-success">{formatCurrency(stats.totalReceived)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Returns</span>
          <span className="tnum text-body font-semibold text-danger">{formatCurrency(stats.totalReturns)}</span>
        </div>
        <div className="ml-auto flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Balance Owed</span>
          <span className={`tnum text-body font-semibold ${stats.balanceOwed > 0 ? "text-danger" : "text-foreground"}`}>{formatCurrency(stats.balanceOwed)}</span>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="orders">Purchase Orders <CountBadge n={data.purchaseOrders.length} /></TabsTrigger>
          <TabsTrigger value="contracts">Rate Contracts <CountBadge n={data.rateContracts.length} /></TabsTrigger>
          <TabsTrigger value="receipts">Receipts <CountBadge n={data.recentGRNs.length} /></TabsTrigger>
          <TabsTrigger value="returns">Returns <CountBadge n={data.supplierReturns.length} /></TabsTrigger>
          <TabsTrigger value="invoices">Invoices <CountBadge n={data.invoices.length} /></TabsTrigger>
          <TabsTrigger value="payments">Payments <CountBadge n={data.payments.length} /></TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab data={data} /></TabsContent>
        <TabsContent value="orders"><OrdersTab data={data} /></TabsContent>
        <TabsContent value="contracts"><ContractsTab data={data} /></TabsContent>
        <TabsContent value="receipts"><ReceiptsTab data={data} /></TabsContent>
        <TabsContent value="returns"><ReturnsTab data={data} /></TabsContent>
        <TabsContent value="invoices"><InvoicesTab data={data} /></TabsContent>
        <TabsContent value="payments"><PaymentsTab data={data} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Helper
// ───────────────────────────────────────────────────────────

function CountBadge({ n }: { n: number }) {
  if (n === 0) return null;
  return <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground">{n}</span>;
}

// ───────────────────────────────────────────────────────────
//  Overview tab
// ───────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: SupplierCockpitData }) {
  const { stats } = data;
  const fulfilmentPct = stats.totalOrdered > 0 ? (stats.totalReceived / stats.totalOrdered) * 100 : 0;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: Top materials + recent POs */}
      <div className="lg:col-span-2 space-y-5">
        {/* Top materials bought */}
        <div>
          <h2 className="mb-3 text-label text-muted-foreground">Top Materials Bought</h2>
          {data.topMaterials.length === 0 ? (
            <EmptyState icon={<Package className="h-5 w-5" />} title="No purchases yet" description="Materials bought from this supplier will appear here." />
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {data.topMaterials.map((m) => (
                <div key={m.name} className="flex items-center gap-4 px-4 py-2.5 text-body">
                  <span className="min-w-0 flex-1 truncate font-medium text-foreground">{m.name}</span>
                  <span className="w-24 shrink-0 text-right tnum text-muted-foreground">{formatNumber(m.qty, 2)} units</span>
                  <span className="w-28 shrink-0 text-right tnum font-semibold text-foreground">{formatCurrency(m.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent POs */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-label text-muted-foreground">Recent Purchase Orders</h2>
            <Link href="/procurement" className="text-caption text-muted-foreground transition-colors hover:text-foreground">View all →</Link>
          </div>
          {data.purchaseOrders.length === 0 ? (
            <EmptyState icon={<Truck className="h-5 w-5" />} title="No purchase orders" description="POs for this supplier will appear here." />
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {data.purchaseOrders.slice(0, 5).map((po) => (
                <Link key={po.id} href={`/procurement/${po.id}`} className="flex items-center gap-4 px-4 py-3 text-body transition-colors hover:bg-muted/30">
                  <span className="w-28 shrink-0 font-mono text-caption font-medium text-foreground">{po.poNumber}</span>
                  <StatusPill status={po.status} />
                  <span className="min-w-0 flex-1 text-caption text-muted-foreground">{po.lineCount} lines</span>
                  <span className="w-28 shrink-0 text-right tnum font-medium text-foreground">{formatCurrency(po.total)}</span>
                  <span className="w-24 shrink-0 text-right text-caption text-muted-foreground">{formatDate(po.orderDate)}</span>
                </Link>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Right: Stats + actions */}
      <div className="space-y-5">
        {/* Fulfilment rate */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-label text-muted-foreground">Fulfilment Rate</h2>
          <div className="text-section font-semibold tnum text-foreground">{fulfilmentPct.toFixed(1)}%</div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-muted">
            <div className={`h-full ${fulfilmentPct > 80 ? "bg-success" : fulfilmentPct > 50 ? "bg-warning" : "bg-danger"}`} style={{ width: `${Math.min(100, fulfilmentPct)}%` }} />
          </div>
          <div className="mt-1 text-micro text-muted-foreground tnum">
            {formatCurrency(stats.totalReceived)} / {formatCurrency(stats.totalOrdered)}
          </div>
        </div>

        {/* Quick actions */}
        <div>
          <h2 className="mb-3 text-label text-muted-foreground">Quick Actions</h2>
          <div className="space-y-1">
            <ActionLink href="/procurement" label="Create Purchase Order" icon={<Truck className="h-3.5 w-3.5" />} />
            <ActionLink href="/procurement?tab=returns" label="Create Return" icon={<Undo2 className="h-3.5 w-3.5" />} />
            <ActionLink href="/rate-contracts" label="Create Rate Contract" icon={<FileText className="h-3.5 w-3.5" />} />
          </div>
        </div>

        {/* Outstanding invoices summary */}
        {data.invoices.length > 0 && (() => {
          const outstanding = data.invoices.filter((i) => i.balanceDue > 0);
          const totalOutstanding = outstanding.reduce((s, i) => s + i.balanceDue, 0);
          const overdue = outstanding.filter((i) => i.dueDate && new Date(i.dueDate) < new Date());
          return (
            <div className="rounded-lg border border-border bg-card p-4">
              <h2 className="mb-3 text-label text-muted-foreground">Invoice Summary</h2>
              <div className="space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-caption text-muted-foreground">Total Invoiced</span>
                  <span className="tnum text-body font-medium">{formatCurrency(data.invoices.reduce((s, i) => s + i.totalAmount, 0))}</span>
                </div>
                <div className="flex items-baseline justify-between">
                  <span className="text-caption text-muted-foreground">Outstanding</span>
                  <span className={`tnum text-body font-semibold ${totalOutstanding > 0 ? "text-warning" : "text-success"}`}>{formatCurrency(totalOutstanding)}</span>
                </div>
                {overdue.length > 0 && (
                  <div className="flex items-baseline justify-between">
                    <span className="text-caption text-muted-foreground">Overdue</span>
                    <span className="tnum text-body font-semibold text-danger">{overdue.length} invoice{overdue.length > 1 ? "s" : ""}</span>
                  </div>
                )}
                <div className="flex items-baseline justify-between">
                  <span className="text-caption text-muted-foreground">Total Paid (all-time)</span>
                  <span className="tnum text-body font-medium text-success">{formatCurrency(data.payments.reduce((s, p) => s + p.netPaid, 0))}</span>
                </div>
              </div>
            </div>
          );
        })()}

        {/* Active rate contracts */}
        {data.rateContracts.length > 0 && (
          <div>
            <h2 className="mb-3 text-label text-muted-foreground">Active Rate Contracts</h2>
            <div className="space-y-2">
              {data.rateContracts.slice(0, 5).map((rc) => (
                <div key={rc.id} className="rounded-md border border-border px-3 py-2 text-body">
                  <div className="truncate font-medium text-foreground">{rc.materialName}</div>
                  <div className="mt-0.5 flex items-baseline justify-between text-caption text-muted-foreground">
                    <span>{formatCurrency(rc.agreedRate)}/unit</span>
                    <span>Valid till {formatDate(rc.validTo)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ActionLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="group flex items-center gap-2.5 rounded-md px-3 py-2 text-body text-muted-foreground transition-colors hover:bg-muted/30 hover:text-foreground">
      <span className="text-muted-foreground/60 transition-colors group-hover:text-foreground">{icon}</span>
      <span>{label}</span>
      <ArrowRight className="ml-auto h-3 w-3 text-muted-foreground/0 transition-all group-hover:text-muted-foreground" />
    </Link>
  );
}

// ───────────────────────────────────────────────────────────
//  Orders tab
// ───────────────────────────────────────────────────────────

function OrdersTab({ data }: { data: SupplierCockpitData }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">{data.purchaseOrders.length} purchase orders</div>
        <Link href="/procurement"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New PO</Button></Link>
      </div>

      {data.purchaseOrders.length === 0 ? (
        <EmptyState icon={<Truck className="h-5 w-5" />} title="No purchase orders" description="POs for this supplier will appear here." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.purchaseOrders.map((po) => (
            <Link key={po.id} href={`/procurement/${po.id}`} className="flex items-center gap-4 px-4 py-3 text-body transition-colors hover:bg-muted/30">
              <span className="w-28 shrink-0 font-mono text-caption font-medium text-foreground">{po.poNumber}</span>
              <StatusPill status={po.status} />
              <span className="min-w-0 flex-1 text-caption text-muted-foreground">{po.lineCount} lines</span>
              <span className="w-28 shrink-0 text-right tnum font-medium text-foreground">{formatCurrency(po.total)}</span>
              <span className="w-24 shrink-0 text-right text-caption text-muted-foreground">{formatDate(po.orderDate)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Contracts tab
// ───────────────────────────────────────────────────────────

function ContractsTab({ data }: { data: SupplierCockpitData }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">{data.rateContracts.length} active rate contracts</div>
        <Link href="/rate-contracts"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New Contract</Button></Link>
      </div>

      {data.rateContracts.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="No rate contracts" description="Pre-negotiated rate contracts with this supplier will appear here." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.rateContracts.map((rc) => (
            <div key={rc.id} className="flex items-center gap-4 px-4 py-3 text-body">
              <span className="w-32 shrink-0 font-mono text-caption font-medium text-foreground">{rc.contractNumber}</span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">{rc.materialName}</span>
                <span className="ml-2 text-caption text-muted-foreground">{rc.materialCode}</span>
              </div>
              <span className="w-28 shrink-0 text-right tnum font-semibold text-foreground">{formatCurrency(rc.agreedRate)}/unit</span>
              <span className="w-28 shrink-0 text-right text-caption text-muted-foreground">
                {formatDate(rc.validFrom)} → {formatDate(rc.validTo)}
              </span>
              <StatusPill status={rc.status} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Receipts tab
// ───────────────────────────────────────────────────────────

function ReceiptsTab({ data }: { data: SupplierCockpitData }) {
  return (
    <div className="space-y-4">
      {data.recentGRNs.length === 0 ? (
        <EmptyState icon={<Package className="h-5 w-5" />} title="No receipts" description="Goods receipt notes from this supplier will appear here." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.recentGRNs.map((gr) => (
            <div key={gr.id} className="flex items-center gap-4 px-4 py-3 text-body">
              <span className="w-32 shrink-0 font-mono text-caption font-medium text-foreground">{gr.grnNumber}</span>
              <span className="min-w-0 flex-1 text-muted-foreground">for PO {gr.poNumber}</span>
              <span className="w-20 shrink-0 text-right text-caption text-muted-foreground">{gr.lineCount} lines</span>
              <span className="w-24 shrink-0 text-right text-caption text-muted-foreground">{formatDate(gr.date)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Returns tab
// ───────────────────────────────────────────────────────────

function ReturnsTab({ data }: { data: SupplierCockpitData }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="text-body text-muted-foreground">{data.supplierReturns.length} returns</div>
        <Link href="/procurement?tab=returns"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New Return</Button></Link>
      </div>

      {data.supplierReturns.length === 0 ? (
        <EmptyState icon={<Undo2 className="h-5 w-5" />} title="No returns" description="Supplier returns will appear here." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.supplierReturns.map((r) => (
            <Link key={r.id} href="/procurement?tab=returns" className="flex items-center gap-4 px-4 py-3 text-body transition-colors hover:bg-muted/30">
              <span className="w-32 shrink-0 font-mono text-caption font-medium text-foreground">{r.returnNumber}</span>
              <StatusPill status={r.status} />
              <span className="min-w-0 flex-1" />
              <span className="w-28 shrink-0 text-right tnum font-medium text-danger">{formatCurrency(r.totalAmount)}</span>
              <span className="w-24 shrink-0 text-right text-caption text-muted-foreground">{formatDate(r.date)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Invoices tab
// ───────────────────────────────────────────────────────────

function InvoicesTab({ data }: { data: SupplierCockpitData }) {
  const { invoices } = data;
  const totalInv = invoices.reduce((s, i) => s + i.totalAmount, 0);
  const totalOutstanding = invoices.reduce((s, i) => s + i.balanceDue, 0);
  return (
    <div className="space-y-3">
      {invoices.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-border pb-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-label text-muted-foreground/70">Total Invoiced</span>
            <span className="tnum text-body font-semibold">{formatCurrency(totalInv)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-label text-muted-foreground/70">Outstanding</span>
            <span className={`tnum text-body font-semibold ${totalOutstanding > 0 ? "text-warning" : "text-success"}`}>{formatCurrency(totalOutstanding)}</span>
          </div>
        </div>
      )}
      {invoices.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="No invoices" description="Supplier invoices will appear here once goods are received and bills are booked." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-body">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left text-label font-semibold text-muted-foreground">Invoice No.</th>
                <th className="px-3 py-2 text-left text-label font-semibold text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-left text-label font-semibold text-muted-foreground">Due</th>
                <th className="px-3 py-2 text-left text-label font-semibold text-muted-foreground">Status</th>
                <th className="px-3 py-2 text-right text-label font-semibold text-muted-foreground">Total</th>
                <th className="px-3 py-2 text-right text-label font-semibold text-muted-foreground">Paid</th>
                <th className="px-3 py-2 text-right text-label font-semibold text-muted-foreground">Balance</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((inv) => (
                <tr key={inv.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-caption font-medium text-foreground">{inv.invoiceNumber}</td>
                  <td className="px-3 py-2 text-caption text-muted-foreground">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-3 py-2 text-caption text-muted-foreground">{inv.dueDate ? formatDate(inv.dueDate) : "—"}</td>
                  <td className="px-3 py-2">
                    <StatusPill status={inv.status} />
                    {inv.matchStatus && inv.matchStatus !== "THREE_WAY_MATCH" && (
                      <span className="ml-1 text-micro text-warning">{inv.matchStatus.replace(/_/g, " ")}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tnum">{formatCurrency(inv.totalAmount)}</td>
                  <td className="px-3 py-2 text-right tnum text-success">{formatCurrency(inv.totalPaid)}</td>
                  <td className={`px-3 py-2 text-right tnum font-medium ${inv.balanceDue > 0 ? "text-warning" : "text-muted-foreground"}`}>{formatCurrency(inv.balanceDue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Payments tab
// ───────────────────────────────────────────────────────────

function PaymentsTab({ data }: { data: SupplierCockpitData }) {
  const { payments } = data;
  const totalGross = payments.reduce((s, p) => s + p.amount, 0);
  const totalTds = payments.reduce((s, p) => s + p.tdsAmount, 0);
  const totalNet = payments.reduce((s, p) => s + p.netPaid, 0);
  return (
    <div className="space-y-3">
      {payments.length > 0 && (
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-border pb-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-label text-muted-foreground/70">Total Gross</span>
            <span className="tnum text-body font-semibold">{formatCurrency(totalGross)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-label text-muted-foreground/70">TDS Deducted</span>
            <span className="tnum text-body font-semibold text-muted-foreground">{formatCurrency(totalTds)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-label text-muted-foreground/70">Net Paid</span>
            <span className="tnum text-body font-semibold text-success">{formatCurrency(totalNet)}</span>
          </div>
        </div>
      )}
      {payments.length === 0 ? (
        <EmptyState icon={<FileText className="h-5 w-5" />} title="No payments" description="Payments made to this supplier will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-body">
            <thead className="border-b border-border bg-muted/30">
              <tr>
                <th className="px-3 py-2 text-left text-label font-semibold text-muted-foreground">Payment No.</th>
                <th className="px-3 py-2 text-left text-label font-semibold text-muted-foreground">Date</th>
                <th className="px-3 py-2 text-left text-label font-semibold text-muted-foreground">Mode</th>
                <th className="px-3 py-2 text-left text-label font-semibold text-muted-foreground">Ref.</th>
                <th className="px-3 py-2 text-right text-label font-semibold text-muted-foreground">Gross</th>
                <th className="px-3 py-2 text-right text-label font-semibold text-muted-foreground">TDS</th>
                <th className="px-3 py-2 text-right text-label font-semibold text-muted-foreground">Net Paid</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                  <td className="px-3 py-2 font-mono text-caption font-medium text-foreground">{p.paymentNumber}</td>
                  <td className="px-3 py-2 text-caption text-muted-foreground">{formatDate(p.paymentDate)}</td>
                  <td className="px-3 py-2 text-caption text-muted-foreground">{p.paymentMode}</td>
                  <td className="px-3 py-2 font-mono text-caption text-muted-foreground">{p.referenceNo ?? "—"}</td>
                  <td className="px-3 py-2 text-right tnum">{formatCurrency(p.amount)}</td>
                  <td className="px-3 py-2 text-right tnum text-muted-foreground">{p.tdsAmount > 0 ? `−${formatCurrency(p.tdsAmount)}` : "—"}</td>
                  <td className="px-3 py-2 text-right tnum font-medium text-success">{formatCurrency(p.netPaid)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
