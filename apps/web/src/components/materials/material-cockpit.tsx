"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package, ArrowRight, Plus, TrendingUp, ShoppingCart, ClipboardList,
  AlertTriangle, FileText,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
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

export type MaterialCockpitData = {
  material: {
    id: string;
    code: string;
    name: string;
    unit: string;
    categoryName: string;
    hsnCode: string | null;
    gstRate: number;
    currentCost: number;
    standardCost: number;
    minStock: number | null;
    reorderPoint: number | null;
    economicOrderQty: number | null;
    isScrap: boolean;
    description: string | null;
  };
  stockItems: {
    locationId: string;
    locationName: string;
    locationType: string;
    qty: number;
    movingAvgCost: number;
    totalValue: number;
  }[];
  movements: {
    id: string;
    movementType: string;
    qty: number;
    unitCost: number;
    fromLocationName: string | null;
    toLocationName: string | null;
    timestamp: string;
  }[];
  openPOs: {
    poId: string;
    poNumber: string;
    status: string;
    supplierName: string;
    qtyOrdered: number;
    qtyReceived: number;
    unitCost: number;
    expectedDate: string | null;
  }[];
  openRequisitions: {
    reqId: string;
    reqNumber: string;
    status: string;
    projectName: string | null;
    qty: number;
  }[];
  rateContracts: {
    id: string;
    supplierName: string;
    rate: number;
    validUntil: string;
  }[];
  issues: {
    issueId: string;
    issueNumber: string;
    issueDate: string;
    projectName: string | null;
    fromLocationName: string;
    qty: number;
    unitCost: number;
  }[];
};

const MOVEMENT_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PURCHASE_RECEIPT: "success", TRANSFER_IN: "default", TRANSFER_OUT: "warning",
  ISSUE_TO_PROJECT: "warning", ADJUSTMENT_IN: "success", ADJUSTMENT_OUT: "danger",
  RETURN: "muted", SALE: "default", SCRAP_GENERATED: "default",
  SUPPLIER_RETURN: "danger",
};

const MOVEMENT_LABELS: Record<string, string> = {
  PURCHASE_RECEIPT: "Receipt", TRANSFER_IN: "Transfer In", TRANSFER_OUT: "Transfer Out",
  ISSUE_TO_PROJECT: "Issue", RETURN: "Return", ADJUSTMENT_IN: "Adjustment +",
  ADJUSTMENT_OUT: "Adjustment −", SUPPLIER_RETURN: "Supplier Return", SALE: "Sale",
  SCRAP_GENERATED: "Scrap Gen.",
};

// ───────────────────────────────────────────────────────────
//  Main component
// ───────────────────────────────────────────────────────────

export function MaterialCockpit({ data }: { data: MaterialCockpitData }) {
  const [tab, setTab] = useState("overview");
  const { material } = data;
  const totalQty = data.stockItems.reduce((s, si) => s + si.qty, 0);
  const totalValue = data.stockItems.reduce((s, si) => s + si.totalValue, 0);
  const isLowStock = material.reorderPoint != null && totalQty <= material.reorderPoint;
  const trackRecent = useTrackRecent();

  useEffect(() => {
    trackRecent({ type: "material", id: material.id, label: material.name, href: `/materials/${material.id}` });
  }, [material.id, material.name, trackRecent]);

  return (
    <div className="space-y-5">
      {/* Back link */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/materials">← Materials</Link>
        </Button>
      </div>

      {/* Header */}
      <PageHeader
        title={material.name}
        description={material.description ?? `${material.code} · ${material.categoryName}`}
      />

      {/* Badges + meta */}
      <div className="flex flex-wrap items-center gap-4 text-caption text-muted-foreground">
        <Badge variant="outline">{material.code}</Badge>
        <Badge variant="outline">{material.categoryName}</Badge>
        <span>Unit: {material.unit}</span>
        {material.hsnCode && <span>HSN: {material.hsnCode}</span>}
        <span>GST: {material.gstRate}%</span>
        {material.isScrap && <Badge variant="warning">Scrap</Badge>}
      </div>

      {/* Stats strip */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-border pb-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Total Stock</span>
          <span className="tnum text-body font-semibold text-foreground">{formatNumber(totalQty, 3)} {material.unit}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Stock Value</span>
          <span className="tnum text-body font-semibold text-foreground">{formatCurrency(totalValue)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Current Cost</span>
          <span className="tnum text-body font-semibold text-foreground">{formatCurrency(material.currentCost)}/{material.unit}</span>
        </div>
        {material.reorderPoint != null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-label text-muted-foreground/70">Reorder At</span>
            <span className={`tnum text-body font-semibold ${isLowStock ? "text-danger" : "text-foreground"}`}>{formatNumber(material.reorderPoint, 3)} {material.unit}</span>
          </div>
        )}
        {material.economicOrderQty != null && (
          <div className="flex items-baseline gap-1.5">
            <span className="text-label text-muted-foreground/70">EOQ</span>
            <span className="tnum text-body font-semibold text-foreground">{formatNumber(material.economicOrderQty, 3)} {material.unit}</span>
          </div>
        )}
      </div>

      {/* Low stock alert */}
      {isLowStock && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div>
              <p className="text-body font-medium text-danger">Below reorder point</p>
              <p className="text-caption text-muted-foreground">
                Total stock ({formatNumber(totalQty, 3)} {material.unit}) is at or below the reorder level ({formatNumber(material.reorderPoint, 3)} {material.unit}).
                <Link href="/requisitions" className="ml-1 font-medium text-brand hover:underline">Create a requisition →</Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="stock">Stock <CountBadge n={data.stockItems.length} /></TabsTrigger>
          <TabsTrigger value="movements">Movements <CountBadge n={data.movements.length} /></TabsTrigger>
          <TabsTrigger value="procurement">Procurement <CountBadge n={data.openPOs.length + data.openRequisitions.length} /></TabsTrigger>
          <TabsTrigger value="consumption">Consumption <CountBadge n={data.issues.length} /></TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab data={data} totalQty={totalQty} totalValue={totalValue} isLowStock={isLowStock} /></TabsContent>
        <TabsContent value="stock"><StockTab data={data} /></TabsContent>
        <TabsContent value="movements"><MovementsTab data={data} /></TabsContent>
        <TabsContent value="procurement"><ProcurementTab data={data} /></TabsContent>
        <TabsContent value="consumption"><ConsumptionTab data={data} /></TabsContent>
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

function OverviewTab({ data }: { data: MaterialCockpitData; totalQty: number; totalValue: number; isLowStock: boolean }) {
  const { material } = data;
  return (
    <div className="grid gap-6 lg:grid-cols-3">
      {/* Left: Stock by location */}
      <div className="lg:col-span-2 space-y-5">
        <div>
          <h2 className="mb-3 text-label text-muted-foreground">Stock by Location</h2>
          {data.stockItems.length === 0 ? (
            <EmptyState icon={<Package className="h-5 w-5" />} title="No stock" description="This material isn't stocked at any location yet." />
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {data.stockItems.map((si) => (
                <div key={si.locationId} className="flex items-center gap-4 px-4 py-3 text-body">
                  <div className="min-w-0 flex-1">
                    <span className="font-medium text-foreground">{si.locationName}</span>
                    <Badge variant={si.locationType === "COMPANY_WAREHOUSE" ? "default" : "muted"} className="ml-2">
                      {si.locationType === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"}
                    </Badge>
                  </div>
                  <span className="w-24 shrink-0 text-right tnum font-medium text-foreground">{formatNumber(si.qty, 3)} {material.unit}</span>
                  <span className="w-24 shrink-0 text-right tnum text-muted-foreground">@ {formatCurrency(si.movingAvgCost)}</span>
                  <span className="w-28 shrink-0 text-right tnum font-semibold text-foreground">{formatCurrency(si.totalValue)}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent movements */}
        <div>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-label text-muted-foreground">Recent Movements</h2>
            <Link href="/stock?tab=movements" className="text-caption text-muted-foreground transition-colors hover:text-foreground">View all →</Link>
          </div>
          {data.movements.length === 0 ? (
            <EmptyState icon={<TrendingUp className="h-5 w-5" />} title="No movements" description="Stock movements for this material will appear here." />
          ) : (
            <div className="divide-y divide-border rounded-lg border border-border">
              {data.movements.slice(0, 8).map((m) => {
                const isIn = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN", "SCRAP_GENERATED"].includes(m.movementType);
                return (
                  <div key={m.id} className="flex items-center gap-3 px-4 py-2.5 text-body">
                    <Badge variant={MOVEMENT_VARIANT[m.movementType] ?? "muted"}>{MOVEMENT_LABELS[m.movementType] ?? m.movementType}</Badge>
                    <span className="min-w-0 flex-1 truncate text-muted-foreground">
                      {m.fromLocationName ?? "—"} <ArrowRight className="mx-1 inline h-3 w-3" /> {m.toLocationName ?? "—"}
                    </span>
                    <span className={`shrink-0 tnum font-medium ${isIn ? "text-success" : "text-foreground"}`}>
                      {isIn ? "+" : "−"}{formatNumber(m.qty, 3)} {material.unit}
                    </span>
                    <span className="w-24 shrink-0 text-right text-caption text-muted-foreground tnum">{formatDate(m.timestamp)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Right: Quick actions + alerts */}
      <div className="space-y-5">
        {/* Quick actions */}
        <div>
          <h2 className="mb-3 text-label text-muted-foreground">Quick Actions</h2>
          <div className="space-y-1">
            <ActionLink href="/requisitions" label="Create Requisition" icon={<ClipboardList className="h-3.5 w-3.5" />} />
            <ActionLink href="/procurement" label="Create Purchase Order" icon={<ShoppingCart className="h-3.5 w-3.5" />} />
            <ActionLink href="/stock?tab=issues" label="Issue to Project" icon={<Package className="h-3.5 w-3.5" />} />
            <ActionLink href="/stock?tab=transfers" label="Transfer Stock" icon={<ArrowRight className="h-3.5 w-3.5" />} />
          </div>
        </div>

        {/* Rate contracts */}
        {data.rateContracts.length > 0 && (
          <div>
            <h2 className="mb-3 text-label text-muted-foreground">Active Rate Contracts</h2>
            <div className="space-y-2">
              {data.rateContracts.map((rc) => (
                <div key={rc.id} className="rounded-md border border-border px-3 py-2 text-body">
                  <div className="font-medium text-foreground">{rc.supplierName}</div>
                  <div className="mt-0.5 flex items-baseline justify-between text-caption text-muted-foreground">
                    <span>Rate: {formatCurrency(rc.rate)}/{material.unit}</span>
                    <span>Valid till {formatDate(rc.validUntil)}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Open POs summary */}
        {data.openPOs.length > 0 && (
          <div>
            <h2 className="mb-3 text-label text-muted-foreground">Open Purchase Orders</h2>
            <div className="space-y-2">
              {data.openPOs.slice(0, 5).map((po) => (
                <Link key={po.poId} href={`/procurement/${po.poId}`} className="block rounded-md border border-border px-3 py-2 text-body transition-colors hover:bg-muted/30">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-caption font-medium text-foreground">{po.poNumber}</span>
                    <StatusPill status={po.status} />
                  </div>
                  <div className="mt-0.5 text-caption text-muted-foreground">
                    {po.supplierName} · {formatNumber(po.qtyOrdered, 3)} {material.unit}
                  </div>
                </Link>
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
//  Stock tab
// ───────────────────────────────────────────────────────────

function StockTab({ data }: { data: MaterialCockpitData }) {
  const { material } = data;
  return (
    <div className="space-y-4">
      {data.stockItems.length === 0 ? (
        <EmptyState icon={<Package className="h-5 w-5" />} title="No stock" description="This material isn't stocked at any location." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.stockItems.map((si) => (
            <div key={si.locationId} className="flex items-center gap-4 px-4 py-3 text-body">
              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">{si.locationName}</span>
                <Badge variant={si.locationType === "COMPANY_WAREHOUSE" ? "default" : "muted"} className="ml-2">
                  {si.locationType === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"}
                </Badge>
              </div>
              <span className="w-24 shrink-0 text-right tnum font-medium text-foreground">{formatNumber(si.qty, 3)} {material.unit}</span>
              <span className="w-24 shrink-0 text-right tnum text-muted-foreground">@ {formatCurrency(si.movingAvgCost)}</span>
              <span className="w-28 shrink-0 text-right tnum font-semibold text-foreground">{formatCurrency(si.totalValue)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Movements tab
// ───────────────────────────────────────────────────────────

function MovementsTab({ data }: { data: MaterialCockpitData }) {
  const { material } = data;
  return (
    <div className="space-y-4">
      {data.movements.length === 0 ? (
        <EmptyState icon={<TrendingUp className="h-5 w-5" />} title="No movements" description="Stock movements for this material will appear here." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.movements.map((m) => {
            const isIn = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN", "SCRAP_GENERATED"].includes(m.movementType);
            return (
              <div key={m.id} className="flex items-center gap-3 px-4 py-3 text-body">
                <Badge variant={MOVEMENT_VARIANT[m.movementType] ?? "muted"}>{MOVEMENT_LABELS[m.movementType] ?? m.movementType}</Badge>
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {m.fromLocationName ?? "—"} <ArrowRight className="mx-1 inline h-3 w-3" /> {m.toLocationName ?? "—"}
                </span>
                <span className={`shrink-0 tnum font-medium ${isIn ? "text-success" : "text-foreground"}`}>
                  {isIn ? "+" : "−"}{formatNumber(m.qty, 3)} {material.unit}
                </span>
                {m.unitCost > 0 && <span className="shrink-0 tnum text-caption text-muted-foreground">@ {formatCurrency(m.unitCost)}</span>}
                <span className="w-24 shrink-0 text-right text-caption text-muted-foreground tnum">{formatDate(m.timestamp)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Procurement tab
// ───────────────────────────────────────────────────────────

function ProcurementTab({ data }: { data: MaterialCockpitData }) {
  const { material } = data;
  return (
    <div className="space-y-6">
      {/* Open Requisitions */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-label text-muted-foreground">Open Requisitions</h2>
          <Link href="/requisitions"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New Requisition</Button></Link>
        </div>
        {data.openRequisitions.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No open requisitions" description="Material requisitions requesting this item will appear here." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.openRequisitions.map((r) => (
              <Link key={r.reqId} href="/requisitions" className="flex items-center gap-4 px-4 py-3 text-body transition-colors hover:bg-muted/30">
                <span className="w-28 shrink-0 font-mono text-caption font-medium text-foreground">{r.reqNumber}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{r.projectName ?? "Company"}</span>
                <StatusPill status={r.status} />
                <span className="w-20 shrink-0 text-right tnum text-muted-foreground">{formatNumber(r.qty, 3)} {material.unit}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Open POs */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-label text-muted-foreground">Open Purchase Orders</h2>
          <Link href="/procurement"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New PO</Button></Link>
        </div>
        {data.openPOs.length === 0 ? (
          <EmptyState icon={<ShoppingCart className="h-5 w-5" />} title="No open POs" description="Purchase orders for this material will appear here." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.openPOs.map((po) => (
              <Link key={po.poId} href={`/procurement/${po.poId}`} className="flex items-center gap-4 px-4 py-3 text-body transition-colors hover:bg-muted/30">
                <span className="w-28 shrink-0 font-mono text-caption font-medium text-foreground">{po.poNumber}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{po.supplierName}</span>
                <StatusPill status={po.status} />
                <span className="w-24 shrink-0 text-right tnum text-muted-foreground">{formatNumber(po.qtyOrdered, 3)} {material.unit}</span>
                <span className="w-24 shrink-0 text-right tnum text-caption text-muted-foreground">{po.expectedDate ? formatDate(po.expectedDate) : "—"}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Rate Contracts */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-label text-muted-foreground">Active Rate Contracts</h2>
          <Link href="/rate-contracts"><Button size="sm" variant="outline"><FileText className="h-4 w-4" /> Manage</Button></Link>
        </div>
        {data.rateContracts.length === 0 ? (
          <EmptyState icon={<FileText className="h-5 w-5" />} title="No rate contracts" description="Pre-negotiated rate contracts for this material will appear here." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.rateContracts.map((rc) => (
              <div key={rc.id} className="flex items-center gap-4 px-4 py-3 text-body">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{rc.supplierName}</span>
                <span className="w-28 shrink-0 text-right tnum font-semibold text-foreground">{formatCurrency(rc.rate)}/{material.unit}</span>
                <span className="w-28 shrink-0 text-right text-caption text-muted-foreground">Valid till {formatDate(rc.validUntil)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Consumption tab
// ───────────────────────────────────────────────────────────

function ConsumptionTab({ data }: { data: MaterialCockpitData }) {
  const { material } = data;
  const totalIssued = data.issues.reduce((s, i) => s + i.qty, 0);
  const totalCost = data.issues.reduce((s, i) => s + i.qty * i.unitCost, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-body text-muted-foreground">
          <span>{data.issues.length} issues</span>
          <span>·</span>
          <span>{formatNumber(totalIssued, 3)} {material.unit} issued</span>
          <span>·</span>
          <span>{formatCurrency(totalCost)} cost</span>
        </div>
        <Link href="/stock?tab=issues"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Issue</Button></Link>
      </div>

      {data.issues.length === 0 ? (
        <EmptyState icon={<Package className="h-5 w-5" />} title="No issues" description="Material issues from stock to projects will appear here." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.issues.map((i) => (
            <Link key={i.issueId} href="/stock?tab=issues" className="flex items-center gap-4 px-4 py-3 text-body transition-colors hover:bg-muted/30">
              <span className="w-28 shrink-0 font-mono text-caption font-medium text-foreground">{i.issueNumber}</span>
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">{i.projectName ?? i.fromLocationName}</span>
              <span className="w-24 shrink-0 text-right tnum font-medium text-foreground">{formatNumber(i.qty, 3)} {material.unit}</span>
              <span className="w-24 shrink-0 text-right tnum text-muted-foreground">@ {formatCurrency(i.unitCost)}</span>
              <span className="w-24 shrink-0 text-right text-caption text-muted-foreground">{formatDate(i.issueDate)}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
