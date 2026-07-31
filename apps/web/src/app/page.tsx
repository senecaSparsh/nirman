import { connection } from "next/server";
import { Suspense } from "react";
import Link from "next/link";
import { prisma } from "@nirman/db";
import {
  materialInventoryValue,
  unsoldAssetValue,
} from "@nirman/services";
import {
  Building2,
  Package,
  LandPlot,
  Home,
  TrendingUp,
  AlertTriangle,
  Wallet,
  Truck,
  Wrench,
  ClipboardList,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrency, formatDate, formatNumber } from "@/lib/utils";
import { getCompany, toNum } from "@/lib/server";
import { PageHeader } from "@/components/page-header";
import { MyTasksPanel } from "@/components/tasks/my-tasks-panel";

export default function DashboardPage() {
  return (
    <div className="space-y-5">
      <PageHeader title="Dashboard" description="Construction & real estate inventory at a glance." />
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20 text-meta text-muted-foreground">
            Loading dashboard…
          </div>
        }
      >
        <DashboardContent />
      </Suspense>
    </div>
  );
}

async function DashboardContent() {
  await connection();
  const company = await getCompany();

  // Fetch all KPI data in parallel
  const [
    inventoryVal,
    unsoldAssets,
    activeProjects,
    openPOs,
    lowStockItems,
    recentSales,
    recentMovements,
    openTransfers,
    equipmentCount,
    pendingRequisitions,
    draftPOs,
    overduePOs,
  ] = await Promise.all([
    materialInventoryValue(company.id),
    unsoldAssetValue(company.id),
    prisma.project.count({
      where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
    }),
    prisma.purchaseOrder.count({
      where: { companyId: company.id, status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] } },
    }),
    prisma.material.findMany({
      where: {
        deletedAt: null,
        minStock: { not: null },
      },
      select: {
        id: true, code: true, name: true, unit: true, minStock: true,
        stockItems: { where: { location: { deletedAt: null, companyId: company.id } }, select: { qty: true } },
      },
    }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: { customer: { select: { name: true } } },
    }),
    prisma.stockMovement.findMany({
      where: {
        OR: [
          { fromLocation: { companyId: company.id } },
          { toLocation: { companyId: company.id } },
        ],
      },
      orderBy: { timestamp: "desc" },
      take: 8,
      include: {
        material: { select: { name: true, unit: true } },
        fromLocation: { select: { name: true } },
        toLocation: { select: { name: true } },
      },
    }),
    prisma.stockTransfer.count({
      where: { status: "DRAFT", fromLocation: { companyId: company.id } },
    }),
    prisma.equipment.count({
      where: { companyId: company.id, deletedAt: null, status: { not: "RETIRED" } },
    }),
    // Pending requisitions (SUBMITTED status — awaiting approval)
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: "SUBMITTED" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        project: { select: { name: true } },
        lines: { select: { qtyRequested: true } },
      },
    }),
    // Draft POs (awaiting approval)
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 5,
      include: {
        supplier: { select: { name: true } },
        lines: { select: { qtyOrdered: true } },
      },
    }),
    // Overdue POs (ORDERED/PARTIAL with expectedDate in the past)
    prisma.purchaseOrder.findMany({
      where: {
        companyId: company.id,
        status: { in: ["ORDERED", "PARTIAL"] },
        expectedDate: { lt: new Date() },
      },
      orderBy: { expectedDate: "asc" },
      take: 5,
      include: {
        supplier: { select: { name: true } },
        lines: { select: { qtyOrdered: true, qtyReceived: true } },
      },
    }),
  ]);

  // Compute low stock items
  const lowStock = lowStockItems
    .map((m) => {
      const totalQty = m.stockItems.reduce((s, i) => s + toNum(i.qty), 0);
      const minStock = toNum(m.minStock);
      return { id: m.id, code: m.code, name: m.name, unit: m.unit, totalQty, minStock, shortfall: minStock - totalQty };
    })
    .filter((m) => m.totalQty < m.minStock)
    .sort((a, b) => b.shortfall - a.shortfall)
    .slice(0, 10);

  const totalRevenue = recentSales.reduce((s, sale) => s + toNum(sale.salePrice), 0);
  const unsoldTotal = toNum(unsoldAssets.total);

  // Movement type labels
  const movementLabels: Record<string, string> = {
    PURCHASE_RECEIPT: "Receipt",
    TRANSFER_IN: "Transfer In",
    TRANSFER_OUT: "Transfer Out",
    ISSUE_TO_PROJECT: "Issue",
    RETURN: "Return",
    ADJUSTMENT_IN: "Adjustment +",
    ADJUSTMENT_OUT: "Adjustment −",
    SUPPLIER_RETURN: "Supplier Return",
  };

  return (
    <div className="space-y-5">
      {/* KPI cards */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard
          label="Material Inventory Value"
          value={formatCurrency(toNum(inventoryVal))}
          icon={<Package className="h-[18px] w-[18px]" />}
          accent="primary"
          href="/materials"
        />
        <KpiCard
          label="Unsold Asset Value"
          value={formatCurrency(unsoldTotal)}
          icon={<TrendingUp className="h-[18px] w-[18px]" />}
          accent="success"
          href="/units"
        />
        <KpiCard
          label="Active Projects"
          value={String(activeProjects)}
          icon={<Building2 className="h-[18px] w-[18px]" />}
          accent="warning"
          href="/projects"
        />
        <KpiCard
          label="Open Purchase Orders"
          value={String(openPOs)}
          icon={<Wallet className="h-[18px] w-[18px]" />}
          accent="danger"
          href="/procurement"
        />
      </div>

      {/* My Tasks — tasks assigned to the signed-in user */}
      <MyTasksPanel limit={5} />

      {/* Action Items — pending approvals, overdue deliveries, low stock */}
      {(draftPOs.length > 0 || pendingRequisitions.length > 0 || overduePOs.length > 0 || lowStock.length > 0) && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              Action Items
            </CardTitle>
            <Badge variant="warning">
              {draftPOs.length + pendingRequisitions.length + overduePOs.length + lowStock.length} pending
            </Badge>
          </CardHeader>
          <CardContent className="space-y-3">
            {/* Draft POs awaiting approval */}
            {draftPOs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  POs Awaiting Approval · {draftPOs.length}
                </p>
                {draftPOs.map((po) => {
                  const totalQty = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered), 0);
                  return (
                    <Link
                      key={po.id}
                      href="/procurement"
                      className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-caption font-medium">{po.poNumber}</p>
                        <p className="truncate text-body text-muted-foreground">{po.supplier.name}</p>
                      </div>
                      <div className="ml-3 shrink-0 text-right">
                        <p className="tnum text-body font-semibold">{formatCurrency(toNum(po.total))}</p>
                        <p className="text-caption text-muted-foreground">{formatNumber(totalQty, 0)} units</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Pending requisitions */}
            {pendingRequisitions.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  Requisitions Awaiting Approval · {pendingRequisitions.length}
                </p>
                {pendingRequisitions.map((req) => {
                  const totalQty = req.lines.reduce((s, l) => s + toNum(l.qtyRequested), 0);
                  return (
                    <Link
                      key={req.id}
                      href="/requisitions"
                      className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-caption font-medium">{req.reqNumber}</p>
                        <p className="truncate text-body text-muted-foreground">{req.project.name}</p>
                      </div>
                      <div className="ml-3 shrink-0 text-right">
                        <p className="tnum text-body font-semibold">{formatNumber(totalQty, 0)} units</p>
                        <p className="text-caption text-muted-foreground">{formatDate(req.requestDate)}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Overdue POs */}
            {overduePOs.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-caption font-semibold uppercase tracking-wide text-danger">
                  Overdue Deliveries · {overduePOs.length}
                </p>
                {overduePOs.map((po) => {
                  const totalOrdered = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered), 0);
                  const totalReceived = po.lines.reduce((s, l) => s + toNum(l.qtyReceived), 0);
                  const pct = totalOrdered > 0 ? (totalReceived / totalOrdered) * 100 : 0;
                  const daysLate = Math.floor((Date.now() - po.expectedDate!.getTime()) / 86400000);
                  return (
                    <Link
                      key={po.id}
                      href="/procurement"
                      className="flex items-center justify-between rounded-lg border border-danger/30 px-3 py-2 transition-colors hover:bg-danger/5"
                    >
                      <div className="min-w-0">
                        <p className="font-mono text-caption font-medium">{po.poNumber}</p>
                        <p className="truncate text-body text-muted-foreground">{po.supplier.name}</p>
                      </div>
                      <div className="ml-3 shrink-0 text-right">
                        <p className="tnum text-body font-semibold text-danger">
                          {daysLate}d overdue
                        </p>
                        <p className="text-caption text-muted-foreground">
                          {pct.toFixed(0)}% received
                        </p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}

            {/* Low stock summary (if not already shown in detail below) */}
            {lowStock.length > 0 && (
              <div className="space-y-1.5">
                <p className="text-caption font-semibold uppercase tracking-wide text-muted-foreground">
                  Low Stock Alerts · {lowStock.length}
                </p>
                {lowStock.slice(0, 3).map((item) => (
                  <Link
                    key={item.id}
                    href="/materials"
                    className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium">{item.name}</p>
                      <p className="font-mono text-caption text-muted-foreground">{item.code}</p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <p className="tnum text-body font-semibold text-danger">
                        {formatNumber(item.totalQty, 3)} {item.unit}
                      </p>
                      <p className="tnum text-caption text-muted-foreground">
                        min {formatNumber(item.minStock, 3)}
                      </p>
                    </div>
                  </Link>
                ))}
                {lowStock.length > 3 && (
                  <Link href="/materials" className="block pt-1 text-center text-caption text-primary hover:underline">
                    +{lowStock.length - 3} more low stock items →
                  </Link>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Secondary KPIs */}
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <MiniStat label="Open Transfers" value={String(openTransfers)} href="/procurement" icon={<Truck className="h-4 w-4" />} />
        <MiniStat label="Equipment" value={String(equipmentCount)} href="/equipment" icon={<Wrench className="h-4 w-4" />} />
        <MiniStat label="Recent Revenue" value={formatCurrency(totalRevenue)} href="/sales" icon={<TrendingUp className="h-4 w-4" />} />
        <MiniStat label="Low Stock Items" value={String(lowStock.length)} href="/materials" icon={<AlertTriangle className="h-4 w-4" />} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Quick actions */}
        <Card className="lg:col-span-1">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Quick Actions</CardTitle>
          </CardHeader>
          <CardContent className="grid grid-cols-2 gap-2">
            <QuickAction href="/procurement" label="Purchase Order" icon={<Wallet className="h-4 w-4" />} />
            <QuickAction href="/stock-movements" label="Issue Materials" icon={<Package className="h-4 w-4" />} />
            <QuickAction href="/land" label="Land Purchase" icon={<LandPlot className="h-4 w-4" />} />
            <QuickAction href="/units" label="Add Units" icon={<Home className="h-4 w-4" />} />
            <QuickAction href="/sales" label="Record Sale" icon={<TrendingUp className="h-4 w-4" />} />
            <QuickAction href="/equipment" label="Equipment" icon={<Wrench className="h-4 w-4" />} />
            <QuickAction href="/requisitions" label="Requisition" icon={<ClipboardList className="h-4 w-4" />} />
          </CardContent>
        </Card>

        {/* Low stock alerts */}
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Low Stock Alerts</CardTitle>
            <Badge variant={lowStock.length > 0 ? "danger" : "muted"}>
              {lowStock.length} item{lowStock.length !== 1 ? "s" : ""}
            </Badge>
          </CardHeader>
          <CardContent>
            {lowStock.length === 0 ? (
              <EmptyState
                icon={<AlertTriangle className="h-5 w-5" />}
                title="No low-stock alerts"
                description="Materials dropping below minimum stock will appear here."
              />
            ) : (
              <div className="space-y-1.5">
                {lowStock.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-body font-medium">{item.name}</p>
                      <p className="font-mono text-caption text-muted-foreground">{item.code}</p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <p className="tnum text-body font-semibold text-danger">
                        {formatNumber(item.totalQty, 3)} {item.unit}
                      </p>
                      <p className="tnum text-caption text-muted-foreground">
                        min {formatNumber(item.minStock, 3)} · −{formatNumber(item.shortfall, 3)}
                      </p>
                    </div>
                  </div>
                ))}
                <Link href="/materials" className="block pt-1 text-center text-caption text-primary hover:underline">
                  View all materials →
                </Link>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Recent Sales</CardTitle>
            <Link href="/sales" className="text-caption text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {recentSales.length === 0 ? (
              <EmptyState
                icon={<TrendingUp className="h-5 w-5" />}
                title="No sales yet"
                description="Asset sales (land or built units) will show up here."
              />
            ) : (
              <div className="space-y-1.5">
                {recentSales.map((sale) => (
                  <div
                    key={sale.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="font-mono text-caption font-medium">{sale.saleNumber}</p>
                      <p className="truncate text-body text-muted-foreground">{sale.customer.name}</p>
                    </div>
                    <div className="ml-3 shrink-0 text-right">
                      <p className="tnum text-body font-semibold">{formatCurrency(toNum(sale.salePrice))}</p>
                      <p className="text-caption text-muted-foreground">{formatDate(sale.saleDate)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Recent Stock Movements</CardTitle>
            <Link href="/stock-movements" className="text-caption text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {recentMovements.length === 0 ? (
              <EmptyState
                icon={<Package className="h-5 w-5" />}
                title="No movements yet"
                description="Receipts, transfers and issues will be logged here."
              />
            ) : (
              <div className="space-y-1.5">
                {recentMovements.map((m) => (
                  <div
                    key={m.id}
                    className="flex items-center justify-between rounded-lg border border-border/60 px-3 py-2 transition-colors hover:bg-muted/40"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-body font-medium">{m.material.name}</p>
                      <p className="truncate text-caption text-muted-foreground">
                        {movementLabels[m.movementType] ?? m.movementType}
                        {m.fromLocation ? ` · ${m.fromLocation.name}` : ""}
                        {m.toLocation ? ` → ${m.toLocation.name}` : ""}
                      </p>
                    </div>
                    <div className="ml-2 shrink-0 text-right">
                      <p className="tnum text-body font-semibold">{formatNumber(toNum(m.qty), 3)} {m.material.unit}</p>
                      <p className="text-caption text-muted-foreground">{formatDate(m.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  value,
  icon,
  accent,
  href,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  accent: "primary" | "success" | "warning" | "danger";
  href: string;
}) {
  const accentMap = {
    primary: "bg-primary/10 text-primary",
    success: "bg-success/15 text-success",
    warning: "bg-warning/15 text-warning",
    danger: "bg-danger/15 text-danger",
  };
  return (
    <Link href={href} className="group">
      <Card className="card-interactive">
        <CardContent className="flex items-center justify-between p-4">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-caption font-medium text-muted-foreground">{label}</p>
            <p className="tnum text-xl font-bold tracking-tight">{value}</p>
          </div>
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${accentMap[accent]}`}>
            {icon}
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function MiniStat({ label, value, href, icon }: { label: string; value: string; href: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="group">
      <Card className="card-interactive">
        <CardContent className="flex items-center gap-2.5 p-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-foreground">
            {icon}
          </span>
          <div className="min-w-0">
            <p className="truncate text-caption text-muted-foreground">{label}</p>
            <p className="tnum text-body font-semibold">{value}</p>
          </div>
        </CardContent>
      </Card>
    </Link>
  );
}

function QuickAction({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="flex flex-col items-start gap-1.5 rounded-lg border border-border/60 p-2.5 text-meta font-medium transition-colors hover:border-primary/30 hover:bg-accent"
    >
      <span className="flex h-7 w-7 items-center justify-center rounded-md bg-muted text-muted-foreground">
        {icon}
      </span>
      {label}
    </Link>
  );
}

function EmptyState({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-muted text-muted-foreground/60">
        {icon}
      </div>
      <p className="text-body font-medium">{title}</p>
      <p className="max-w-xs text-meta text-muted-foreground">{description}</p>
    </div>
  );
}
