"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Package, Truck, Home, LandPlot, Wallet, Wrench,
  ArrowRight, TrendingUp, Clock,
  Plus, MapPin, AlertTriangle,
  ClipboardList, HardHat, Ruler, ListChecks, BarChart3,
} from "lucide-react";
import type { ProjectFormValues } from "@/components/projects/project-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { statusColor, StatusPill } from "@/components/page";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import { ProjectDetailActions } from "./project-detail-actions";
import { PhasesSection, type PhaseRow } from "./phases-section";
import type {
  PurchaseOrderRow, TransferRow, BuiltUnitRow, LandParcelRow,
  StockMovementRow, ProjectCostRow, MaterialIssueListRow,
} from "@/lib/types";

// ───────────────────────────────────────────────────────────
//  Types for project hub data
// ───────────────────────────────────────────────────────────

export type ProjectHubData = {
  project: {
    id: string;
    name: string;
    type: string;
    status: string;
    address: string | null;
    description: string | null;
    startDate: string | null;
    endDate: string | null;
    totalBudget: number | null;
    totalProjectCost: number | null;
    costPerSqft: number | null;
    totalSellableArea: number | null;
  };
  stats: {
    builtUnitCount: number;
    availableUnits: number;
    soldUnits: number;
    landParcelCount: number;
    stockLocationCount: number;
    materialIssueCount: number;
    openPOCount: number;
    openRequisitionCount: number;
    equipmentCount: number;
  };
  pnl: {
    totalCost: number;
    revenue: number;
    profit: number;
    margin: number;
  };
  purchaseOrders: PurchaseOrderRow[];
  transfers: TransferRow[];
  builtUnits: BuiltUnitRow[];
  landParcels: LandParcelRow[];
  stockMovements: StockMovementRow[];
  projectCosts: ProjectCostRow[];
  materialIssues: MaterialIssueListRow[];
  phases: PhaseRow[];
  stockLocations: { id: string; name: string; type: string; address: string | null }[];
  equipment: {
    id: string;
    assetTag: string;
    name: string;
    category: string | null;
    status: string;
    currentValue: number;
    assignedAt: string | null;
  }[];
  // ── New: Construction tab data ──────────────────────────────
  boqItems: {
    id: string;
    description: string;
    unit: string;
    qty: number;
    rate: number;
    amount: number;
    category: string | null;
  }[];
  wbsNodes: {
    id: string;
    name: string;
    status: string;
    startDate: string | null;
    endDate: string | null;
    progressPct: number;
    parentNodeName: string | null;
  }[];
  workOrders: {
    id: string;
    woNumber: string;
    subcontractorName: string;
    status: string;
    totalValue: number;
    raBillCount: number;
    startDate: string | null;
  }[];
  mbEntries: {
    id: string;
    mbNumber: string;
    description: string;
    qty: number;
    unit: string;
    status: string;
    date: string;
  }[];
  // ── New: DPRs tab data ──────────────────────────────────────
  dprs: {
    id: string;
    reportDate: string;
    workType: string | null;
    approvalStatus: string;
    labourCount: number;
    notes: string | null;
    submittedByName: string | null;
  }[];
  // ── New: Variance tab data ──────────────────────────────────
  variance: {
    budgetTotal: number;
    actualTotal: number;
    variancePct: number;
    materialIssuesTotal: number;
    labourCostTotal: number;
    workOrderTotal: number;
    otherCostsTotal: number;
    landCostTotal: number;
  };
};

const MOVEMENT_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PURCHASE_RECEIPT: "success", TRANSFER_IN: "default", TRANSFER_OUT: "warning",
  ISSUE_TO_PROJECT: "warning", ADJUSTMENT_IN: "success", ADJUSTMENT_OUT: "danger",
  RETURN: "muted", SALE: "default",
};

const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residential", COMMERCIAL: "Commercial", WAREHOUSE: "Warehouse",
  MALL: "Mall / Retail", LAND: "Land Development", OTHER: "Other",
};

const UNIT_TYPE_LABELS: Record<string, string> = {
  BHK_1: "1 BHK", BHK_2: "2 BHK", BHK_3: "3 BHK", BHK_4: "4 BHK",
  SHOP: "Shop", OFFICE: "Office", WAREHOUSE_UNIT: "Warehouse Unit", OTHER: "Other",
};

export function ProjectHub({
  data,
  editInitial,
}: {
  data: ProjectHubData;
  editInitial: ProjectFormValues;
}) {
  const [tab, setTab] = useState("overview");
  const { project, stats, pnl } = data;

  return (
    <div className="space-y-5">
      {/* Back link */}
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="sm">
          <Link href="/projects">← Projects</Link>
        </Button>
      </div>

      {/* Header */}
      <PageHeader
        title={project.name}
        description={project.description ?? undefined}
        action={<ProjectDetailActions projectId={project.id} initial={editInitial} />}
      />

      {/* Badges + meta */}
      <div className="flex flex-wrap items-center gap-4 text-caption text-muted-foreground">
        <StatusPill status={project.status} />
        <Badge variant="outline">{TYPE_LABELS[project.type] ?? project.type}</Badge>
        {project.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{project.address}</span>}
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(project.startDate)} → {formatDate(project.endDate)}</span>
      </div>

      {/* Stats strip — inline, no cards */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-border pb-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Budget</span>
          <span className="tnum text-body font-semibold text-foreground">{project.totalBudget ? formatCurrency(project.totalBudget) : "—"}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Cost</span>
          <span className="tnum text-body font-semibold text-foreground">{project.totalProjectCost ? formatCurrency(project.totalProjectCost) : "—"}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Cost/Sq.Ft</span>
          <span className="tnum text-body font-semibold text-foreground">{project.costPerSqft ? formatCurrency(project.costPerSqft) : "—"}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Area</span>
          <span className="tnum text-body font-semibold text-foreground">{project.totalSellableArea ? `${formatNumber(project.totalSellableArea, 0)} Sq.Ft` : "—"}</span>
        </div>
        <div className="ml-auto flex items-baseline gap-3">
          <div className="flex items-baseline gap-1.5">
            <span className="text-label text-muted-foreground/70">Revenue</span>
            <span className="tnum text-body font-semibold text-success">{formatCurrency(pnl.revenue)}</span>
          </div>
          <div className="flex items-baseline gap-1.5">
            <span className="text-label text-muted-foreground/70">Profit</span>
            <span className={`tnum text-body font-semibold ${pnl.profit >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(pnl.profit)}</span>
            <Badge variant={pnl.profit >= 0 ? "success" : "danger"}>{pnl.margin.toFixed(1)}%</Badge>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="procurement">Procurement <CountBadge n={stats.openPOCount} /></TabsTrigger>
          <TabsTrigger value="stock">Stock <CountBadge n={data.materialIssues.length} /></TabsTrigger>
          <TabsTrigger value="construction">Construction <CountBadge n={data.boqItems.length + data.workOrders.length} /></TabsTrigger>
          <TabsTrigger value="dprs">DPRs <CountBadge n={data.dprs.length} /></TabsTrigger>
          <TabsTrigger value="units">Units <CountBadge n={stats.builtUnitCount} /></TabsTrigger>
          <TabsTrigger value="land">Land <CountBadge n={stats.landParcelCount} /></TabsTrigger>
          <TabsTrigger value="finance">Finance <CountBadge n={data.projectCosts.length} /></TabsTrigger>
          <TabsTrigger value="variance">Variance</TabsTrigger>
          <TabsTrigger value="equipment">Equipment <CountBadge n={stats.equipmentCount} /></TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab data={data} /></TabsContent>
        <TabsContent value="procurement"><ProcurementTab data={data} /></TabsContent>
        <TabsContent value="stock"><StockTab data={data} /></TabsContent>
        <TabsContent value="construction"><ConstructionTab data={data} /></TabsContent>
        <TabsContent value="dprs"><DprsTab data={data} /></TabsContent>
        <TabsContent value="units"><UnitsTab data={data} /></TabsContent>
        <TabsContent value="land"><LandTab data={data} /></TabsContent>
        <TabsContent value="finance"><FinanceTab data={data} /></TabsContent>
        <TabsContent value="variance"><VarianceTab data={data} /></TabsContent>
        <TabsContent value="equipment"><EquipmentTab data={data} /></TabsContent>
      </Tabs>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Helper components
// ───────────────────────────────────────────────────────────

function CountBadge({ n }: { n: number }) {
  if (n === 0) return null;
  return <span className="ml-1.5 rounded bg-muted px-1.5 py-0.5 text-caption font-medium text-muted-foreground">{n}</span>;
}

function OverviewTab({ data }: { data: ProjectHubData }) {
  const { stats, project, pnl } = data;
  const budget = project.totalBudget ?? 0;
  const actualCost = pnl.totalCost || project.totalProjectCost || 0;
  const budgetBurnPct = budget > 0 ? Math.min(100, (actualCost / budget) * 100) : 0;
  const isOverBudget = budget > 0 && actualCost > budget;
  const salesPct = stats.builtUnitCount > 0 ? (stats.soldUnits / stats.builtUnitCount) * 100 : 0;

  // Timeline progress
  const now = new Date();
  const start = project.startDate ? new Date(project.startDate) : null;
  const end = project.endDate ? new Date(project.endDate) : null;
  let timelinePct = 0;
  if (start && end) {
    const total = end.getTime() - start.getTime();
    const elapsed = now.getTime() - start.getTime();
    timelinePct = Math.max(0, Math.min(100, (elapsed / total) * 100));
  }

  return (
    <div className="space-y-6">
      {/* ── Health bars — the project's vital signs ─────────────── */}
      <div className="grid gap-x-6 gap-y-4 sm:grid-cols-3">
        {/* Budget burn */}
        {budget > 0 && (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-label text-muted-foreground/70">Budget Burn</span>
              <span className={`text-caption tnum ${isOverBudget ? "text-danger font-semibold" : "text-muted-foreground"}`}>
                {budgetBurnPct.toFixed(0)}%
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${isOverBudget ? "bg-danger" : budgetBurnPct > 80 ? "bg-warning" : "bg-success"}`} style={{ width: `${Math.min(100, budgetBurnPct)}%` }} />
            </div>
            <div className="mt-1 text-micro text-muted-foreground tnum">
              {formatCurrency(actualCost)} / {formatCurrency(budget)}
            </div>
          </div>
        )}

        {/* Unit sales */}
        {stats.builtUnitCount > 0 && (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-label text-muted-foreground/70">Units Sold</span>
              <span className="text-caption tnum text-muted-foreground">{salesPct.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className="h-full bg-foreground" style={{ width: `${salesPct}%` }} />
            </div>
            <div className="mt-1 text-micro text-muted-foreground tnum">
              {stats.soldUnits} sold · {stats.availableUnits} available · {stats.builtUnitCount} total
            </div>
          </div>
        )}

        {/* Timeline */}
        {start && end && (
          <div>
            <div className="mb-1 flex items-baseline justify-between">
              <span className="text-label text-muted-foreground/70">Timeline</span>
              <span className="text-caption tnum text-muted-foreground">{timelinePct.toFixed(0)}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div className={`h-full ${timelinePct >= 100 ? "bg-muted-foreground" : "bg-foreground"}`} style={{ width: `${timelinePct}%` }} />
            </div>
            <div className="mt-1 text-micro text-muted-foreground tnum">
              {formatDate(project.startDate)} → {formatDate(project.endDate)}
            </div>
          </div>
        )}
      </div>

      {/* ── Two-column: Activity feed + Context sidebar ─────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Activity feed — recent stock movements as a timeline */}
        <div className="lg:col-span-2">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-label text-muted-foreground">Recent Activity</h2>
            <Link href="/stock?tab=movements" className="text-caption text-muted-foreground transition-colors hover:text-foreground">View all →</Link>
          </div>

          {data.stockMovements.length === 0 ? (
            <EmptyState icon={<Package className="h-5 w-5" />} title="No movements" description="Stock movements for this project will appear here." />
          ) : (
            <div className="relative">
              <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
              <div className="space-y-0.5">
                {data.stockMovements.slice(0, 10).map((m) => {
                  const isIn = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN"].includes(m.movementType);
                  const dotColor =
                    m.movementType === "PURCHASE_RECEIPT" || m.movementType === "ADJUSTMENT_IN" ? "bg-success" :
                    m.movementType === "ADJUSTMENT_OUT" ? "bg-danger" :
                    m.movementType === "ISSUE_TO_PROJECT" || m.movementType === "TRANSFER_OUT" ? "bg-warning" :
                    "bg-foreground/40";
                  return (
                    <div key={m.id} className="relative flex items-start gap-4 rounded-lg p-2.5 pl-0 transition-colors hover:bg-muted/30">
                      <span className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background ${dotColor}`} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline justify-between gap-3">
                          <span className="truncate text-body font-medium text-foreground">{m.materialName}</span>
                          <span className={`shrink-0 text-caption tnum ${isIn ? "text-success" : "text-foreground"}`}>
                            {isIn ? "+" : "−"}{formatNumber(m.qty, 3)} {m.unit}
                          </span>
                        </div>
                        <div className="mt-0.5 flex items-baseline gap-2 text-caption text-muted-foreground">
                          <span>{m.movementLabel}</span>
                          <span>·</span>
                          <span className="truncate">{m.fromLocationName ?? "—"} → {m.toLocationName ?? "—"}</span>
                          <span className="ml-auto shrink-0 tnum">{formatDate(m.timestamp)}</span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Context sidebar — inventory counts + phases + locations + actions */}
        <div className="space-y-5">
          {/* Inventory counts */}
          <div>
            <h2 className="mb-3 text-label text-muted-foreground">Inventory</h2>
            <div className="space-y-2">
              <ContextLink href={`/units?project=${project.id}`} label="Built Units" value={stats.builtUnitCount} sub={`${stats.availableUnits} available · ${stats.soldUnits} sold`} />
              <ContextLink href={`/land?project=${project.id}`} label="Land Parcels" value={stats.landParcelCount} />
              <ContextLink href="/requisitions" label="Pending Requisitions" value={stats.openRequisitionCount} sub={stats.openRequisitionCount > 0 ? "Awaiting approval or conversion" : undefined} />
              <ContextLink href="/procurement" label="Open POs" value={stats.openPOCount} />
              <ContextLink href="/equipment" label="Equipment" value={stats.equipmentCount} />
            </div>
          </div>

          {/* Budget overrun alert */}
          {isOverBudget && (
            <div className="rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
              <div className="flex items-start gap-2">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
                <div className="min-w-0">
                  <p className="text-body font-medium text-danger">Over budget</p>
                  <p className="text-caption text-muted-foreground">
                    {formatCurrency(actualCost - budget)} over the {formatCurrency(budget)} budget.
                  </p>
                  <Link href="/finance" className="mt-1.5 inline-flex items-center gap-1 text-caption font-medium text-brand hover:underline">
                    Review costs <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Stock locations */}
          {data.stockLocations.length > 0 && (
            <div>
              <h2 className="mb-3 text-label text-muted-foreground">Stock Locations</h2>
              <div className="space-y-1.5">
                {data.stockLocations.map((loc) => (
                  <div key={loc.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-body">
                    <div className="min-w-0">
                      <div className="truncate font-medium text-foreground">{loc.name}</div>
                      {loc.address && <div className="truncate text-caption text-muted-foreground">{loc.address}</div>}
                    </div>
                    <Badge variant={loc.type === "COMPANY_WAREHOUSE" ? "default" : "muted"}>
                      {loc.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Phases */}
          {data.phases.length > 0 && (
            <div>
              <h2 className="mb-3 text-label text-muted-foreground">Phases</h2>
              <PhasesSection projectId={project.id} phases={data.phases} />
            </div>
          )}

          {/* Quick actions */}
          <div>
            <h2 className="mb-3 text-label text-muted-foreground">Quick Actions</h2>
            <div className="space-y-1">
              <ActionLink href="/procurement" label="Create Purchase Order" icon={<Truck className="h-3.5 w-3.5" />} />
              <ActionLink href="/stock?tab=issues" label="Issue Materials" icon={<Package className="h-3.5 w-3.5" />} />
              <ActionLink href="/units" label="Add Built Units" icon={<Home className="h-3.5 w-3.5" />} />
              <ActionLink href="/sales" label="Record a Sale" icon={<TrendingUp className="h-3.5 w-3.5" />} />
              <ActionLink href="/finance" label="Add Project Cost" icon={<Wallet className="h-3.5 w-3.5" />} />
              <ActionLink href="/equipment" label="Assign Equipment" icon={<Wrench className="h-3.5 w-3.5" />} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ContextLink({ href, label, value, sub }: { href: string; label: string; value: number; sub?: string }) {
  return (
    <Link href={href} className="group flex items-center justify-between rounded-md border border-border px-3 py-2 transition-colors hover:border-foreground/20 hover:bg-muted/30">
      <div>
        <div className="text-body font-medium text-foreground">{label}</div>
        {sub && <div className="text-caption text-muted-foreground">{sub}</div>}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-body font-semibold tnum text-foreground">{value}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground/40 transition-colors group-hover:text-foreground" />
      </div>
    </Link>
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
//  Procurement tab — POs + Transfers for this project
// ───────────────────────────────────────────────────────────

function ProcurementTab({ data }: { data: ProjectHubData }) {
  const projectPOs = data.purchaseOrders.filter((p) => p.projectId === data.project.id || p.procurementScope === "COMPANY");
  const projectTransfers = data.transfers.filter(
    (t) => t.fromLocationName?.includes(data.project.name) || t.toLocationName?.includes(data.project.name) ||
    data.stockLocations.some((sl) => sl.id === t.fromLocationId || sl.id === t.toLocationId),
  );

  return (
    <div className="space-y-5">
      {/* Purchase Orders */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-label text-muted-foreground">Purchase Orders</h2>
          <Link href="/procurement"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New PO</Button></Link>
        </div>
        {projectPOs.length === 0 ? (
          <EmptyState icon={<Truck className="h-5 w-5" />} title="No purchase orders" description="POs for this project will appear here." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {projectPOs.map((po) => (
              <Link
                key={po.id}
                href={`/procurement/${po.id}`}
                className="flex items-center gap-4 px-4 py-3 text-body transition-colors hover:bg-muted/30"
              >
                <span className="w-28 shrink-0 font-mono text-caption font-medium text-foreground">{po.poNumber}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{po.supplierName}</span>
                <StatusPill status={po.status} />
                <span className="w-28 shrink-0 text-right tnum font-medium text-foreground">{formatCurrency(po.total)}</span>
                <span className="w-24 shrink-0 text-right text-caption text-muted-foreground">{formatDate(po.expectedDate)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Transfers */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-label text-muted-foreground">Transfers Involving This Project</h2>
        </div>
        {projectTransfers.length === 0 ? (
          <EmptyState icon={<ArrowRight className="h-5 w-5" />} title="No transfers" description="Stock transfers to/from this project's locations will appear here." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {projectTransfers.map((t) => (
              <div
                key={t.id}
                className="flex items-center gap-4 px-4 py-3 text-body transition-colors hover:bg-muted/30"
              >
                <span className="min-w-0 flex-1 truncate">
                  <span className="font-medium text-foreground">{t.fromLocationName}</span>
                  <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
                  <span className="font-medium text-foreground">{t.toLocationName}</span>
                </span>
                <StatusPill status={t.status} />
                <span className="w-16 shrink-0 text-right tnum text-muted-foreground">{t.lineCount} lines</span>
                <span className="w-24 shrink-0 text-right text-caption text-muted-foreground">{formatDate(t.transferDate)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Stock tab — movements + material issues
// ───────────────────────────────────────────────────────────

function StockTab({ data }: { data: ProjectHubData }) {
  return (
    <div className="space-y-5">
      {/* Material Issues — timeline feed */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-label text-muted-foreground">Material Issues to Project</h2>
          <Link href="/stock?tab=issues"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Issue Materials</Button></Link>
        </div>
        {data.materialIssues.length === 0 ? (
          <EmptyState icon={<Package className="h-5 w-5" />} title="No material issues" description="Materials issued from stock to this project will appear here." />
        ) : (
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-0.5">
              {data.materialIssues.map((i) => (
                <div key={i.id} className="group relative flex items-start gap-4 rounded-lg p-2.5 pl-0 transition-colors hover:bg-muted/30">
                  <span className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background bg-warning" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-body font-medium text-foreground">{i.fromLocationName}</span>
                      <span className="shrink-0 text-body font-semibold tnum text-danger">−{formatCurrency(i.totalCost)}</span>
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-2 text-caption text-muted-foreground">
                      <span className="tnum">{i.lineCount} lines</span>
                      <span>·</span>
                      <span className="tnum">{formatDate(i.issueDate)}</span>
                      {i.notes && <span className="truncate">· {i.notes}</span>}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Stock Movements — timeline feed */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-label text-muted-foreground">Recent Stock Movements</h2>
        </div>
        {data.stockMovements.length === 0 ? (
          <EmptyState icon={<Package className="h-5 w-5" />} title="No movements" description="Stock movements at this project's locations will appear here." />
        ) : (
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-0.5">
              {data.stockMovements.slice(0, 20).map((m) => {
                const isIn = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN"].includes(m.movementType);
                const isOut = ["TRANSFER_OUT", "ISSUE_TO_PROJECT", "ADJUSTMENT_OUT", "SALE"].includes(m.movementType);
                const dotColor =
                  m.movementType === "PURCHASE_RECEIPT" || m.movementType === "ADJUSTMENT_IN" ? "bg-success" :
                  m.movementType === "ADJUSTMENT_OUT" ? "bg-danger" :
                  m.movementType === "ISSUE_TO_PROJECT" || m.movementType === "TRANSFER_OUT" ? "bg-warning" :
                  "bg-foreground/40";
                return (
                  <div key={m.id} className="group relative flex items-start gap-4 rounded-lg p-2.5 pl-0 transition-colors hover:bg-muted/30">
                    <span className={`relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background ${dotColor}`} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-baseline justify-between gap-3">
                        <div className="min-w-0">
                          <span className="text-body font-medium text-foreground">{m.materialName}</span>
                        </div>
                        <span className={`shrink-0 text-body font-semibold tnum ${isIn ? "text-success" : isOut ? "text-foreground" : "text-muted-foreground"}`}>
                          {isIn ? "+" : isOut ? "−" : ""}{formatNumber(m.qty, 3)} <span className="text-caption font-normal text-muted-foreground">{m.unit}</span>
                        </span>
                      </div>
                      <div className="mt-0.5 flex items-baseline gap-2 text-caption text-muted-foreground">
                        <Badge variant={MOVEMENT_VARIANT[m.movementType] ?? "muted"}>{m.movementLabel}</Badge>
                        <span className="truncate">
                          {m.fromLocationName ?? "—"}
                          <ArrowRight className="mx-1 inline h-3 w-3" />
                          {m.toLocationName ?? "—"}
                        </span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-3 text-micro text-muted-foreground">
                        <span className="tnum">{formatDate(m.timestamp)}</span>
                        {m.unitCost > 0 && <span className="tnum">@ {formatCurrency(m.unitCost)}</span>}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Units tab — built units for this project
// ───────────────────────────────────────────────────────────

function UnitsTab({ data }: { data: ProjectHubData }) {
  const units = data.builtUnits;
  const totalAsking = units.reduce((s, u) => s + (u.askingPrice ?? 0), 0);
  const totalArea = units.reduce((s, u) => s + u.area, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-body text-muted-foreground">
          <span>{units.length} units</span>
          <span>·</span>
          <span>{formatNumber(totalArea, 0)} Sq.Ft total</span>
          <span>·</span>
          <span>Asking: {formatCurrency(totalAsking)}</span>
        </div>
        <Link href="/units"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Add Units</Button></Link>
      </div>

      {units.length === 0 ? (
        <EmptyState icon={<Home className="h-5 w-5" />} title="No built units" description="Add built units (flats, shops, offices) to this project." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {units.map((u) => {
            const sc = statusColor(u.status);
            return (
              <div
                key={u.id}
                className="group relative rounded-lg border border-border bg-card p-3.5 transition-all hover:border-foreground/20 hover:shadow-sm"
                style={{ borderLeft: `3px solid ${sc}` }}
              >
                {/* Header: unit number + type + status dot */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-body font-semibold text-foreground">{u.unitNumber}</div>
                    <div className="text-caption text-muted-foreground">{UNIT_TYPE_LABELS[u.unitType] ?? u.unitType}</div>
                  </div>
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sc }} />
                </div>

                {/* Floor/wing */}
                {(u.floor != null || u.wing) && (
                  <div className="mt-1 text-caption text-muted-foreground">
                    {u.floor != null && `Floor ${u.floor}`}
                    {u.floor != null && u.wing && " · "}
                    {u.wing && `Wing ${u.wing}`}
                  </div>
                )}

                {/* Area + costs */}
                <div className="mt-3 space-y-1">
                  <div className="flex items-baseline justify-between">
                    <span className="text-caption text-muted-foreground">Area</span>
                    <span className="text-body font-semibold tnum text-foreground">{formatNumber(u.area, 0)} <span className="text-caption font-normal text-muted-foreground">{u.areaUnit}</span></span>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <span className="text-caption text-muted-foreground">Prod. Cost</span>
                    <span className="text-body tnum text-foreground">{u.productionCost > 0 ? formatCurrency(u.productionCost) : "—"}</span>
                  </div>
                  {u.askingPrice && (
                    <div className="flex items-baseline justify-between">
                      <span className="text-caption text-muted-foreground">Asking</span>
                      <span className="text-body font-semibold tnum text-foreground">{formatCurrency(u.askingPrice)}</span>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Land tab — land parcels for this project
// ───────────────────────────────────────────────────────────

function LandTab({ data }: { data: ProjectHubData }) {
  const parcels = data.landParcels;
  const totalArea = parcels.reduce((s, p) => s + p.area, 0);
  const availableArea = parcels.filter((p) => p.status === "AVAILABLE").reduce((s, p) => s + p.area, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-body text-muted-foreground">
          <span>{parcels.length} parcels</span>
          <span>·</span>
          <span>{formatNumber(totalArea, 0)} Sq.Ft total</span>
          <span>·</span>
          <span>{formatNumber(availableArea, 0)} Sq.Ft available</span>
        </div>
        <Link href="/land"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Manage Land</Button></Link>
      </div>

      {parcels.length === 0 ? (
        <EmptyState icon={<LandPlot className="h-5 w-5" />} title="No land parcels" description="Land parcels linked to this project will appear here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {parcels.map((p) => {
            const sc = statusColor(p.status);
            return (
              <div
                key={p.id}
                className="group relative rounded-lg border border-border bg-card p-3.5 transition-all hover:border-foreground/20 hover:shadow-sm"
                style={{ borderLeft: `3px solid ${sc}` }}
              >
                {/* Header: number + parent + status dot */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-micro text-muted-foreground">{p.number}</div>
                    {p.parentParcelNumber && (
                      <div className="text-micro text-muted-foreground/60">from {p.parentParcelNumber}</div>
                    )}
                  </div>
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sc }} />
                </div>

                {/* Area — the primary metric */}
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-caption text-muted-foreground">Area</span>
                  <span className="text-body font-semibold tnum text-foreground">
                    {formatNumber(p.area, 0)} <span className="text-caption font-normal text-muted-foreground">{p.areaUnit}</span>
                  </span>
                </div>

                {/* Acquisition cost */}
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-caption text-muted-foreground">Acquisition</span>
                  <span className="text-body tnum text-foreground">{formatCurrency(p.acquisitionCost)}</span>
                </div>

                {/* Valuation */}
                <div className="mt-1 flex items-baseline justify-between">
                  <span className="text-caption text-muted-foreground">Valuation</span>
                  <span className="text-body font-semibold tnum text-foreground">{formatCurrency(p.currentValuation)}</span>
                </div>

                {/* Asking price (if set) */}
                {p.askingPrice && (
                  <div className="mt-1 flex items-baseline justify-between">
                    <span className="text-caption text-muted-foreground">Asking</span>
                    <span className="text-body tnum text-muted-foreground">{formatCurrency(p.askingPrice)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Finance tab — project costs + P&L breakdown
// ───────────────────────────────────────────────────────────

function FinanceTab({ data }: { data: ProjectHubData }) {
  const costs = data.projectCosts;
  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
  const materialIssuesTotal = data.materialIssues.reduce((s, i) => s + i.totalCost, 0);
  const { pnl } = data;

  return (
    <div className="space-y-5">
      {/* Inline stats strip — like the project header stats */}
      <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 border-b border-border pb-3">
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Material Issues</span>
          <span className="tnum text-body font-semibold text-foreground">{formatCurrency(materialIssuesTotal)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Other Costs</span>
          <span className="tnum text-body font-semibold text-foreground">{formatCurrency(totalCosts)}</span>
        </div>
        <div className="flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Revenue</span>
          <span className="tnum text-body font-semibold text-success">{formatCurrency(pnl.revenue)}</span>
        </div>
        <div className="ml-auto flex items-baseline gap-1.5">
          <span className="text-label text-muted-foreground/70">Profit</span>
          <span className={`tnum text-body font-semibold ${pnl.profit >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(pnl.profit)}</span>
          <Badge variant={pnl.profit >= 0 ? "success" : "danger"}>{pnl.margin.toFixed(1)}%</Badge>
        </div>
      </div>

      {/* Project Costs — timeline feed */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-label text-muted-foreground">Project Costs</h2>
          <Link href="/finance"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Add Cost</Button></Link>
        </div>
        {costs.length === 0 ? (
          <EmptyState icon={<Wallet className="h-5 w-5" />} title="No project costs" description="Labour, overhead, equipment, and contractor costs will appear here." />
        ) : (
          <div className="relative">
            <div className="absolute left-[7px] top-2 bottom-2 w-px bg-border" />
            <div className="space-y-0.5">
              {costs.map((c) => (
                <div key={c.id} className="group relative flex items-start gap-4 rounded-lg p-2.5 pl-0 transition-colors hover:bg-muted/30">
                  <span className="relative z-10 mt-1.5 h-3.5 w-3.5 shrink-0 rounded-full border-2 border-background bg-warning" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <div className="min-w-0">
                        <span className="text-body font-medium text-foreground">{c.costType}</span>
                        <span className="ml-2 text-caption text-muted-foreground">Project Cost</span>
                      </div>
                      <span className="shrink-0 text-body font-semibold tnum text-danger">−{formatCurrency(c.amount)}</span>
                    </div>
                    <div className="mt-0.5 flex items-baseline gap-2 text-caption text-muted-foreground">
                      <span className="tnum">{formatDate(c.date)}</span>
                      {c.vendor && <><span>·</span><span className="truncate">{c.vendor}</span></>}
                      {c.notes && <><span>·</span><span className="truncate">{c.notes}</span></>}
                    </div>
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

// ───────────────────────────────────────────────────────────
//  Equipment tab — equipment assigned to this project
// ───────────────────────────────────────────────────────────

function EquipmentTab({ data }: { data: ProjectHubData }) {
  const equipment = data.equipment;
  const totalValue = equipment.reduce((s, e) => s + e.currentValue, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-body text-muted-foreground">
          <span>{equipment.length} items</span>
          <span>·</span>
          <span>Total value: {formatCurrency(totalValue)}</span>
        </div>
        <Link href="/equipment"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Manage Equipment</Button></Link>
      </div>

      {equipment.length === 0 ? (
        <EmptyState icon={<Wrench className="h-5 w-5" />} title="No equipment assigned" description="Equipment assigned to this project's site will appear here." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {equipment.map((e) => {
            const sc = statusColor(e.status);
            return (
              <div
                key={e.id}
                className="group relative rounded-lg border border-border bg-card p-3.5 transition-all hover:border-foreground/20 hover:shadow-sm"
                style={{ borderLeft: `3px solid ${sc}` }}
              >
                {/* Header: asset tag + name + status dot */}
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-mono text-micro text-muted-foreground">{e.assetTag}</div>
                    <div className="mt-0.5 truncate text-body font-medium text-foreground">{e.name}</div>
                  </div>
                  <span className="mt-1 h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: sc }} />
                </div>

                {/* Category */}
                {e.category && (
                  <div className="mt-1 text-caption text-muted-foreground">{e.category}</div>
                )}

                {/* Current value — the primary metric */}
                <div className="mt-3 text-body font-semibold tnum text-foreground">{formatCurrency(e.currentValue)}</div>

                {/* Assigned date */}
                <div className="mt-1 text-caption text-muted-foreground">
                  {e.assignedAt ? `Assigned ${formatDate(e.assignedAt)}` : "Not assigned"}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Construction tab — BOQ + WBS + Work Orders + Measurement Book
// ───────────────────────────────────────────────────────────

function ConstructionTab({ data }: { data: ProjectHubData }) {
  const boqTotal = data.boqItems.reduce((s, i) => s + i.amount, 0);
  const woTotal = data.workOrders.reduce((s, w) => s + w.totalValue, 0);

  return (
    <div className="space-y-6">
      {/* BOQ Summary */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-label text-muted-foreground">
            <ClipboardList className="h-4 w-4" /> Bill of Quantities
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-body font-semibold tnum text-foreground">{formatCurrency(boqTotal)}</span>
            <Link href={`/boq?project=${data.project.id}`}><Button size="sm" variant="outline">View BOQ</Button></Link>
          </div>
        </div>
        {data.boqItems.length === 0 ? (
          <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No BOQ items" description="The bill of quantities for this project will appear here." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.boqItems.slice(0, 10).map((item) => (
              <div key={item.id} className="flex items-center gap-4 px-4 py-2.5 text-body">
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{item.description}</span>
                <span className="w-20 shrink-0 text-right tnum text-muted-foreground">{formatNumber(item.qty, 2)} {item.unit}</span>
                <span className="w-24 shrink-0 text-right tnum text-muted-foreground">@ {formatCurrency(item.rate)}</span>
                <span className="w-28 shrink-0 text-right tnum font-semibold text-foreground">{formatCurrency(item.amount)}</span>
              </div>
            ))}
            {data.boqItems.length > 10 && (
              <div className="px-4 py-2 text-center text-caption text-muted-foreground">
                + {data.boqItems.length - 10} more items
              </div>
            )}
          </div>
        )}
      </div>

      {/* WBS Schedule */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-label text-muted-foreground">
            <ListChecks className="h-4 w-4" /> Schedule (WBS)
          </h2>
          <Link href={`/wbs?project=${data.project.id}`}><Button size="sm" variant="outline">View WBS</Button></Link>
        </div>
        {data.wbsNodes.length === 0 ? (
          <EmptyState icon={<ListChecks className="h-5 w-5" />} title="No schedule" description="Work breakdown structure activities will appear here." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.wbsNodes.slice(0, 10).map((node) => (
              <div key={node.id} className="flex items-center gap-4 px-4 py-2.5 text-body">
                <div className="min-w-0 flex-1">
                  <span className="font-medium text-foreground">{node.name}</span>
                  {node.parentNodeName && (
                    <span className="ml-2 text-caption text-muted-foreground">under {node.parentNodeName}</span>
                  )}
                </div>
                <StatusPill status={node.status} />
                <div className="w-24 shrink-0">
                  <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full bg-foreground" style={{ width: `${Math.min(100, node.progressPct)}%` }} />
                  </div>
                  <div className="mt-0.5 text-micro text-muted-foreground tnum text-right">{node.progressPct.toFixed(0)}%</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Work Orders */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-label text-muted-foreground">
            <HardHat className="h-4 w-4" /> Work Orders
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-body font-semibold tnum text-foreground">{formatCurrency(woTotal)}</span>
            <Link href={`/work-orders?project=${data.project.id}`}><Button size="sm" variant="outline">View All</Button></Link>
          </div>
        </div>
        {data.workOrders.length === 0 ? (
          <EmptyState icon={<HardHat className="h-5 w-5" />} title="No work orders" description="Subcontractor work orders for this project will appear here." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.workOrders.map((wo) => (
              <Link key={wo.id} href={`/work-orders/${wo.id}`} className="flex items-center gap-4 px-4 py-3 text-body transition-colors hover:bg-muted/30">
                <span className="w-28 shrink-0 font-mono text-caption font-medium text-foreground">{wo.woNumber}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{wo.subcontractorName}</span>
                <StatusPill status={wo.status} />
                <span className="w-16 shrink-0 text-right text-caption text-muted-foreground">{wo.raBillCount} RA bills</span>
                <span className="w-28 shrink-0 text-right tnum font-medium text-foreground">{formatCurrency(wo.totalValue)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Measurement Book */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-label text-muted-foreground">
            <Ruler className="h-4 w-4" /> Measurement Book
          </h2>
          <Link href={`/measurement-book?project=${data.project.id}`}><Button size="sm" variant="outline">View MB</Button></Link>
        </div>
        {data.mbEntries.length === 0 ? (
          <EmptyState icon={<Ruler className="h-5 w-5" />} title="No measurements" description="Verified measurement book entries will appear here." />
        ) : (
          <div className="divide-y divide-border rounded-lg border border-border">
            {data.mbEntries.slice(0, 10).map((mb) => (
              <div key={mb.id} className="flex items-center gap-4 px-4 py-2.5 text-body">
                <span className="w-24 shrink-0 font-mono text-caption font-medium text-foreground">{mb.mbNumber}</span>
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">{mb.description}</span>
                <span className="w-20 shrink-0 text-right tnum text-muted-foreground">{formatNumber(mb.qty, 2)} {mb.unit}</span>
                <StatusPill status={mb.status} />
                <span className="w-24 shrink-0 text-right text-caption text-muted-foreground">{formatDate(mb.date)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  DPRs tab — daily progress reports for this project
// ───────────────────────────────────────────────────────────

function DprsTab({ data }: { data: ProjectHubData }) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-body text-muted-foreground">
          <span>{data.dprs.length} reports</span>
        </div>
        <Link href={`/hr/dprs?project=${data.project.id}`}><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New DPR</Button></Link>
      </div>

      {data.dprs.length === 0 ? (
        <EmptyState icon={<ClipboardList className="h-5 w-5" />} title="No DPRs" description="Daily progress reports for this project will appear here." />
      ) : (
        <div className="divide-y divide-border rounded-lg border border-border">
          {data.dprs.map((dpr) => (
            <Link
              key={dpr.id}
              href={`/hr/dprs?id=${dpr.id}`}
              className="flex items-center gap-4 px-4 py-3 text-body transition-colors hover:bg-muted/30"
            >
              <span className="w-24 shrink-0 tnum text-caption text-muted-foreground">{formatDate(dpr.reportDate)}</span>
              <div className="min-w-0 flex-1">
                <span className="font-medium text-foreground">
                  {dpr.workType ?? "General work"}
                </span>
                {dpr.notes && <span className="ml-2 text-caption text-muted-foreground truncate">{dpr.notes}</span>}
              </div>
              <span className="w-20 shrink-0 text-right text-caption text-muted-foreground">{dpr.labourCount} workers</span>
              <StatusPill status={dpr.approvalStatus} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Variance tab — budget vs actual, cost breakdown
// ───────────────────────────────────────────────────────────

function VarianceTab({ data }: { data: ProjectHubData }) {
  const { variance, project, pnl } = data;
  const budget = project.totalBudget ?? 0;
  const actual = variance.actualTotal;
  const isOverBudget = budget > 0 && actual > budget;
  const varianceAmt = actual - budget;
  const variancePct = budget > 0 ? (varianceAmt / budget) * 100 : 0;

  // Cost breakdown for the bar chart
  const costBreakdown = [
    { label: "Material Issues", amount: variance.materialIssuesTotal, color: "bg-warning" },
    { label: "Work Orders", amount: variance.workOrderTotal, color: "bg-brand" },
    { label: "Labour Cost", amount: variance.labourCostTotal, color: "bg-success" },
    { label: "Land Cost", amount: variance.landCostTotal, color: "bg-muted-foreground" },
    { label: "Other Costs", amount: variance.otherCostsTotal, color: "bg-foreground/40" },
  ].filter((c) => c.amount > 0);
  const maxCost = Math.max(...costBreakdown.map((c) => c.amount), 1);

  return (
    <div className="space-y-6">
      {/* Budget vs Actual */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-label text-muted-foreground/70">Budget</div>
          <div className="mt-1 text-section font-semibold tnum text-foreground">{formatCurrency(budget)}</div>
        </div>
        <div className="rounded-lg border border-border bg-card p-4">
          <div className="text-label text-muted-foreground/70">Actual Cost</div>
          <div className={`mt-1 text-section font-semibold tnum ${isOverBudget ? "text-danger" : "text-foreground"}`}>{formatCurrency(actual)}</div>
        </div>
        <div className={`rounded-lg border p-4 ${isOverBudget ? "border-danger/30 bg-danger-soft/40" : "border-border bg-card"}`}>
          <div className="text-label text-muted-foreground/70">Variance</div>
          <div className={`mt-1 text-section font-semibold tnum ${isOverBudget ? "text-danger" : "text-success"}`}>
            {varianceAmt >= 0 ? "+" : ""}{formatCurrency(varianceAmt)}
          </div>
          <div className={`mt-0.5 text-caption tnum ${isOverBudget ? "text-danger" : "text-muted-foreground"}`}>
            {variancePct >= 0 ? "+" : ""}{variancePct.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Over-budget alert */}
      {isOverBudget && (
        <div className="rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-danger" />
            <div>
              <p className="text-body font-medium text-danger">Over budget by {formatCurrency(varianceAmt)}</p>
              <p className="text-caption text-muted-foreground">
                Actual cost is {variancePct.toFixed(1)}% above the {formatCurrency(budget)} budget.
                <Link href="/budget-variance" className="ml-1 font-medium text-brand hover:underline">Review line-by-line →</Link>
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Cost breakdown bars */}
      <div>
        <h2 className="mb-3 text-label text-muted-foreground">Cost Breakdown</h2>
        <div className="space-y-3">
          {costBreakdown.map((c) => (
            <div key={c.label}>
              <div className="mb-1 flex items-baseline justify-between">
                <span className="text-body text-foreground">{c.label}</span>
                <span className="text-body font-semibold tnum text-foreground">{formatCurrency(c.amount)}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-muted">
                <div className={`h-full ${c.color}`} style={{ width: `${(c.amount / maxCost) * 100}%` }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* P&L summary */}
      <div className="rounded-lg border border-border bg-card p-4">
        <h2 className="mb-3 flex items-center gap-2 text-label text-muted-foreground">
          <BarChart3 className="h-4 w-4" /> P&L Summary
        </h2>
        <div className="grid gap-4 sm:grid-cols-4">
          <div>
            <div className="text-label text-muted-foreground/70">Total Cost</div>
            <div className="mt-0.5 text-body font-semibold tnum text-foreground">{formatCurrency(pnl.totalCost)}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground/70">Revenue</div>
            <div className="mt-0.5 text-body font-semibold tnum text-success">{formatCurrency(pnl.revenue)}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground/70">Profit</div>
            <div className={`mt-0.5 text-body font-semibold tnum ${pnl.profit >= 0 ? "text-success" : "text-danger"}`}>{formatCurrency(pnl.profit)}</div>
          </div>
          <div>
            <div className="text-label text-muted-foreground/70">Margin</div>
            <div className={`mt-0.5 text-body font-semibold tnum ${pnl.margin >= 0 ? "text-success" : "text-danger"}`}>{pnl.margin.toFixed(1)}%</div>
          </div>
        </div>
        <div className="mt-3 flex gap-3">
          <Link href="/profit-center" className="text-caption font-medium text-brand hover:underline">Profit Center →</Link>
          <Link href="/project-control" className="text-caption font-medium text-brand hover:underline">EVM Analysis →</Link>
          <Link href="/material-reconciliation" className="text-caption font-medium text-brand hover:underline">Material Reconciliation →</Link>
        </div>
      </div>
    </div>
  );
}
