"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  Package, Truck, Home, LandPlot, Wallet, Wrench,
  ArrowRight, TrendingUp, Clock,
  Plus, MapPin, AlertTriangle,
  ClipboardList, HardHat, Ruler, ListChecks,
} from "lucide-react";
import type { ProjectFormValues } from "@/components/projects/project-form-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { statusColor, StatusPill } from "@/components/page";
import { formatCurrency, formatNumber, formatDate, cn } from "@/lib/utils";
import { ProjectDetailActions } from "./project-detail-actions";
import { PhasesSection, type PhaseRow } from "./phases-section";
import { useTabParam } from "@/lib/use-tab-param";
import { useTrackRecent } from "@/lib/use-recently-viewed";
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
  const [tab, setTab] = useTabParam(
    ["overview","procurement","stock","construction","units","land","finance","equipment"] as const,
    "overview",
  );
  const { project, stats, pnl } = data;
  const trackRecent = useTrackRecent();

  useEffect(() => {
    trackRecent({ type: "project", id: project.id, label: project.name, href: `/projects/${project.id}` });
  }, [project.id, project.name, trackRecent]);

  return (
    <div className="space-y-5">
      {/* Back link + action buttons on the same row */}
      <div className="flex items-center justify-between">
        <Button asChild variant="ghost" size="sm">
          <Link href="/projects">← Projects</Link>
        </Button>
        <div className="flex items-center gap-2">
          <QuickActionsMenu />
          <ProjectDetailActions projectId={project.id} initial={editInitial} />
        </div>
      </div>

      {/* Header — badges + meta sit in the description slot, right under the title */}
      <PageHeader
        title={project.name}
        description={
          <div className="flex flex-wrap items-center gap-4 text-caption text-muted-foreground">
            <StatusPill status={project.status} />
            <Badge variant="outline">{TYPE_LABELS[project.type] ?? project.type}</Badge>
            {project.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{project.address}</span>}
            <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(project.startDate)} → {formatDate(project.endDate)}</span>
          </div>
        }
        stats={[
          { label: "Budget", value: project.totalBudget ? formatCurrency(project.totalBudget) : "—", hint: "Total approved budget for this project." },
          { label: "Cost", value: project.totalProjectCost ? formatCurrency(project.totalProjectCost) : "—", hint: "Actual cost incurred to date (land + material + labour + overhead)." },
          { label: "Cost/Sq.Ft", value: project.costPerSqft ? formatCurrency(project.costPerSqft) : "—", hint: "Cost per square foot of sellable area." },
          { label: "Area", value: project.totalSellableArea ? `${formatNumber(project.totalSellableArea, 0)} Sq.Ft` : "—", hint: "Total sellable area across all built units." },
          { label: "Revenue", value: formatCurrency(pnl.revenue), tone: "success", hint: "Revenue from unit sales and other income." },
          { label: "Profit", value: formatCurrency(pnl.profit), tone: pnl.profit >= 0 ? "success" : "danger", hint: `Net profit — ${pnl.margin.toFixed(1)}% margin.` },
        ]}
      />

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="procurement">Procurement <CountBadge n={stats.openPOCount} /></TabsTrigger>
          <TabsTrigger value="stock">Stock <CountBadge n={data.materialIssues.length} /></TabsTrigger>
          <TabsTrigger value="construction">Construction <CountBadge n={data.boqItems.length + data.workOrders.length + data.dprs.length} /></TabsTrigger>
          <TabsTrigger value="units">Units <CountBadge n={stats.builtUnitCount} /></TabsTrigger>
          <TabsTrigger value="land">Land <CountBadge n={stats.landParcelCount} /></TabsTrigger>
          <TabsTrigger value="finance">Analytics <CountBadge n={data.projectCosts.length} /></TabsTrigger>
          <TabsTrigger value="equipment">Equipment <CountBadge n={stats.equipmentCount} /></TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab data={data} /></TabsContent>
        <TabsContent value="procurement"><ProcurementTab data={data} /></TabsContent>
        <TabsContent value="stock"><StockTab data={data} /></TabsContent>
        <TabsContent value="construction"><ConstructionTab data={data} /></TabsContent>
        <TabsContent value="units"><UnitsTab data={data} /></TabsContent>
        <TabsContent value="land"><LandTab data={data} /></TabsContent>
        <TabsContent value="finance"><FinanceTab data={data} /></TabsContent>
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

const QUICK_ACTIONS = [
  { href: "/procurement", label: "New Purchase Order", icon: Truck },
  { href: "/stock?tab=issues", label: "Issue Materials", icon: Package },
  { href: "/units", label: "Add Built Units", icon: Home },
  { href: "/sales", label: "Record a Sale", icon: TrendingUp },
  { href: "/finance", label: "Add Project Cost", icon: Wallet },
  { href: "/equipment", label: "Assign Equipment", icon: Wrench },
] as const;

function QuickActionsMenu() {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative shrink-0">
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1.5"
        onClick={() => setOpen((v) => !v)}
      >
        <Plus className="size-4" /> Quick Actions
      </Button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="overlay-in absolute right-0 top-full z-50 mt-1 min-w-52 rounded-lg border border-border bg-elevated p-1 shadow-overlay">
            {QUICK_ACTIONS.map((a) => {
              const Icon = a.icon;
              return (
                <Link
                  key={a.href}
                  href={a.href}
                  className="flex items-center gap-2.5 rounded-md px-3 py-2 text-body text-foreground transition-colors hover:bg-muted/60"
                >
                  <Icon className="size-4 text-muted-foreground" />
                  {a.label}
                </Link>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function OverviewTab({ data }: { data: ProjectHubData }) {
  const { stats, project, pnl } = data;
  const budget = project.totalBudget ?? 0;
  const actualCost = pnl.totalCost || project.totalProjectCost || 0;
  const isOverBudget = budget > 0 && actualCost > budget;

  return (
    <div className="space-y-6">
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

        {/* Context sidebar — single card with divided sections */}
        <div className="space-y-4">
          {/* Inventory */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-raised">
            <h2 className="mb-3 text-label text-muted-foreground">Inventory</h2>
            <div className="divide-y divide-border">
              <ContextLink href={`/units?project=${project.id}`} label="Built Units" value={stats.builtUnitCount} />
              <ContextLink href={`/land?project=${project.id}`} label="Land Parcels" value={stats.landParcelCount} />
              <ContextLink href="/requisitions" label="Requisitions" value={stats.openRequisitionCount} />
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
                  <Link href="/finance" className="mt-1 inline-flex items-center gap-1 text-caption font-medium text-brand hover:underline">
                    Review costs <ArrowRight className="h-3 w-3" />
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Stock locations */}
          {data.stockLocations.length > 0 && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-raised">
              <h2 className="mb-3 text-label text-muted-foreground">Stock Locations</h2>
              <div className="divide-y divide-border">
                {data.stockLocations.map((loc) => (
                  <div key={loc.id} className="flex items-center justify-between py-2">
                    <span className="truncate text-body text-foreground">{loc.name}</span>
                    <Badge variant={loc.type === "COMPANY_WAREHOUSE" ? "default" : "muted"}>
                      {loc.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"}
                    </Badge>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Phases — full width below the two-column area */}
        {data.phases.length > 0 && (
          <div className="lg:col-span-3">
            <PhasesSection projectId={project.id} phases={data.phases} />
          </div>
        )}
      </div>
    </div>
  );
}

function ContextLink({ href, label, value }: { href: string; label: string; value: number }) {
  return (
    <Link href={href} className="group flex items-center justify-between py-2 transition-colors hover:bg-muted/40 -mx-4 px-4">
      <span className="text-body text-foreground">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-body font-semibold tnum text-foreground">{value}</span>
        <ArrowRight className="h-3 w-3 text-muted-foreground/30 transition-colors group-hover:text-foreground" />
      </div>
    </Link>
  );
}

// ───────────────────────────────────────────────────────────
//  Procurement tab — POs + Transfers for this project
// ───────────────────────────────────────────────────────────

function ProcurementTab({ data }: { data: ProjectHubData }) {
  const projectPOs = data.purchaseOrders.filter((p) => p.projectId === data.project.id || p.procurementScope === "COMPANY");
  const projectTransfers = data.transfers;
  const [view, setView] = useState<"pos" | "transfers">("pos");

  const toggle = (
    <div className="inline-flex shrink-0 rounded-md border border-border bg-card p-0.5">
      <button
        onClick={() => setView("pos")}
        className={`rounded px-2.5 py-1 text-caption font-medium transition-colors ${
          view === "pos" ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        POs <span className="tnum">({projectPOs.length})</span>
      </button>
      <button
        onClick={() => setView("transfers")}
        className={`rounded px-2.5 py-1 text-caption font-medium transition-colors ${
          view === "transfers" ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Transfers <span className="tnum">({projectTransfers.length})</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {view === "pos" ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={projectPOs}
            storageKey="project-pos"
            searchable
            searchPlaceholder="Search POs…"
            hideable
            exportFileName="project-pos"
            initialSort={{ key: "createdAt", direction: "desc" }}
            onRowClick={(po) => window.open(`/procurement/${po.id}`, "_self")}
            showTotals
            sumColumns={["total"]}
            totalFormat={(_k, sum) => formatCurrency(sum)}
            toolbarLeading={toggle}
            toolbarTrailing={
              <Link href="/procurement">
                <Button size="sm" className="h-7 gap-1.5">
                  <Plus className="size-3.5" /> New PO
                </Button>
              </Link>
            }
            columns={[
                {
                  key: "poNumber",
                  label: "PO #",
                  sortable: true,
                  render: (po) => <span className="font-mono text-caption font-medium text-foreground">{po.poNumber}</span>,
                },
                {
                  key: "supplierName",
                  label: "Supplier",
                  sortable: true,
                  render: (po) => <span className="font-medium text-foreground">{po.supplierName}</span>,
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
                  render: (po) => <span className="tnum font-medium text-foreground">{formatCurrency(po.total)}</span>,
                  exportValue: (po) => po.total,
                },
                {
                  key: "expectedDate",
                  label: "Expected",
                  sortable: true,
                  render: (po) => <span className="text-caption text-muted-foreground">{formatDate(po.expectedDate)}</span>,
                },
              ]}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={projectTransfers}
            storageKey="project-transfers"
            searchable
            searchPlaceholder="Search transfers…"
            hideable
            initialSort={{ key: "transferDate", direction: "desc" }}
            toolbarLeading={toggle}
            columns={[
                {
                  key: "route",
                  label: "Route",
                  sortable: false,
                  render: (t) => (
                    <span className="min-w-0 truncate">
                      <span className="font-medium text-foreground">{t.fromLocationName}</span>
                      <ArrowRight className="mx-1.5 inline h-3.5 w-3.5 text-muted-foreground" />
                      <span className="font-medium text-foreground">{t.toLocationName}</span>
                    </span>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  sortable: true,
                  render: (t) => <StatusPill status={t.status} />,
                },
                {
                  key: "lineCount",
                  label: "Lines",
                  align: "right",
                  sortable: true,
                  render: (t) => <span className="tnum text-muted-foreground">{t.lineCount}</span>,
                },
                {
                  key: "transferDate",
                  label: "Date",
                  sortable: true,
                  render: (t) => <span className="text-caption text-muted-foreground">{formatDate(t.transferDate)}</span>,
                },
              ]}
          />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Stock tab — movements + material issues
// ───────────────────────────────────────────────────────────

function StockTab({ data }: { data: ProjectHubData }) {
  const [view, setView] = useState<"issues" | "movements">("issues");

  const toggle = (
    <div className="inline-flex shrink-0 rounded-md border border-border bg-card p-0.5">
      <button
        onClick={() => setView("issues")}
        className={`rounded px-2.5 py-1 text-caption font-medium transition-colors ${
          view === "issues" ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Issues <span className="tnum">({data.materialIssues.length})</span>
      </button>
      <button
        onClick={() => setView("movements")}
        className={`rounded px-2.5 py-1 text-caption font-medium transition-colors ${
          view === "movements" ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Movements <span className="tnum">({data.stockMovements.length})</span>
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {view === "issues" ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={data.materialIssues}
            storageKey="project-issues"
            searchable
            searchPlaceholder="Search issues…"
            hideable
            exportFileName="project-issues"
            initialSort={{ key: "issueDate", direction: "desc" }}
            showTotals
            sumColumns={["totalCost"]}
            totalFormat={(_k, sum) => formatCurrency(sum)}
            toolbarLeading={toggle}
            toolbarTrailing={
              <Link href="/stock?tab=issues">
                <Button size="sm" className="h-7 gap-1.5">
                  <Plus className="size-3.5" /> Issue Materials
                </Button>
              </Link>
            }
            columns={[
              {
                key: "issueNumber",
                label: "Issue #",
                sortable: true,
                render: (i) => <span className="font-mono text-caption font-medium text-foreground">{i.issueNumber || "—"}</span>,
              },
              {
                key: "fromLocationName",
                label: "From Location",
                sortable: true,
                render: (i) => <span className="font-medium text-foreground">{i.fromLocationName}</span>,
              },
              {
                key: "lineCount",
                label: "Lines",
                align: "right",
                sortable: true,
                render: (i) => <span className="tnum text-muted-foreground">{i.lineCount}</span>,
              },
              {
                key: "totalCost",
                label: "Cost",
                align: "right",
                sortable: true,
                render: (i) => <span className="tnum font-medium text-danger">−{formatCurrency(i.totalCost)}</span>,
                exportValue: (i) => i.totalCost,
              },
              {
                key: "issueDate",
                label: "Date",
                sortable: true,
                render: (i) => <span className="text-caption text-muted-foreground">{formatDate(i.issueDate)}</span>,
              },
              {
                key: "notes",
                label: "Notes",
                sortable: false,
                render: (i) => <span className="text-caption text-muted-foreground truncate">{i.notes ?? "—"}</span>,
                defaultHidden: true,
              },
            ]}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={data.stockMovements}
            storageKey="project-movements"
            searchable
            searchPlaceholder="Search movements…"
            hideable
            exportFileName="project-movements"
            initialSort={{ key: "timestamp", direction: "desc" }}
            toolbarLeading={toggle}
            columns={[
              {
                key: "materialName",
                label: "Material",
                sortable: true,
                render: (m) => <span className="font-medium text-foreground">{m.materialName}</span>,
              },
              {
                key: "movementLabel",
                label: "Type",
                sortable: true,
                render: (m) => <Badge variant={MOVEMENT_VARIANT[m.movementType] ?? "muted"}>{m.movementLabel}</Badge>,
              },
              {
                key: "route",
                label: "Route",
                sortable: false,
                render: (m) => (
                  <span className="truncate text-caption text-muted-foreground">
                    {m.fromLocationName ?? "—"}
                    <ArrowRight className="mx-1 inline h-3 w-3" />
                    {m.toLocationName ?? "—"}
                  </span>
                ),
              },
              {
                key: "qty",
                label: "Qty",
                align: "right",
                sortable: true,
                render: (m) => {
                  const isIn = ["PURCHASE_RECEIPT", "TRANSFER_IN", "ADJUSTMENT_IN", "RETURN"].includes(m.movementType);
                  const isOut = ["TRANSFER_OUT", "ISSUE_TO_PROJECT", "ADJUSTMENT_OUT", "SALE"].includes(m.movementType);
                  return (
                    <span className={`tnum font-medium ${isIn ? "text-success" : isOut ? "text-foreground" : "text-muted-foreground"}`}>
                      {isIn ? "+" : isOut ? "−" : ""}{formatNumber(m.qty, 3)} <span className="text-caption font-normal text-muted-foreground">{m.unit}</span>
                    </span>
                  );
                },
                exportValue: (m) => m.qty,
              },
              {
                key: "unitCost",
                label: "Unit Cost",
                align: "right",
                sortable: true,
                render: (m) => <span className="tnum text-muted-foreground">{m.unitCost > 0 ? formatCurrency(m.unitCost) : "—"}</span>,
                exportValue: (m) => m.unitCost,
                defaultHidden: true,
              },
              {
                key: "timestamp",
                label: "Date",
                sortable: true,
                render: (m) => <span className="text-caption text-muted-foreground">{formatDate(m.timestamp)}</span>,
              },
            ]}
          />
        </div>
      )}
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Units tab — built units for this project
// ───────────────────────────────────────────────────────────

function UnitsTab({ data }: { data: ProjectHubData }) {
  const units = data.builtUnits;

  return (
    <div className="space-y-4">
      {units.length === 0 ? (
        <EmptyState icon={<Home className="h-5 w-5" />} title="No built units" description="Add built units (flats, shops, offices) to this project." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={units}
            storageKey="project-units"
            searchable
            searchPlaceholder="Search units…"
            hideable
            exportFileName="project-units"
            initialSort={{ key: "unitNumber", direction: "asc" }}
            onRowClick={(u) => window.open(`/units?unit=${u.id}`, "_self")}
            toolbarTrailing={
              <Link href="/units">
                <Button size="sm" className="h-7 gap-1.5">
                  <Plus className="size-3.5" /> Add Units
                </Button>
              </Link>
            }
            columns={[
              {
                key: "unitNumber",
                label: "Unit #",
                sortable: true,
                render: (u) => <span className="font-semibold text-foreground">{u.unitNumber}</span>,
              },
              {
                key: "unitType",
                label: "Type",
                sortable: true,
                render: (u) => <span className="text-muted-foreground">{UNIT_TYPE_LABELS[u.unitType] ?? u.unitType}</span>,
              },
              {
                key: "floor",
                label: "Floor",
                align: "right",
                sortable: true,
                render: (u) => <span className="tnum text-muted-foreground">{u.floor ?? "—"}</span>,
              },
              {
                key: "wing",
                label: "Wing",
                sortable: true,
                render: (u) => <span className="text-muted-foreground">{u.wing ?? "—"}</span>,
                defaultHidden: true,
              },
              {
                key: "phaseName",
                label: "Phase",
                sortable: true,
                render: (u) => <span className="text-caption text-muted-foreground">{u.phaseName ?? "—"}</span>,
                defaultHidden: true,
              },
              {
                key: "status",
                label: "Status",
                sortable: true,
                render: (u) => <StatusPill status={u.status} />,
              },
              {
                key: "area",
                label: "Area",
                align: "right",
                sortable: true,
                render: (u) => <span className="tnum text-muted-foreground">{formatNumber(u.area, 0)} <span className="text-caption font-normal text-muted-foreground">{u.areaUnit}</span></span>,
                exportValue: (u) => u.area,
              },
              {
                key: "productionCost",
                label: "Prod. Cost",
                align: "right",
                sortable: true,
                render: (u) => <span className="tnum text-muted-foreground">{u.productionCost > 0 ? formatCurrency(u.productionCost) : "—"}</span>,
                exportValue: (u) => u.productionCost,
                defaultHidden: true,
              },
              {
                key: "askingPrice",
                label: "Asking",
                align: "right",
                sortable: true,
                render: (u) => <span className="tnum font-medium text-foreground">{u.askingPrice ? formatCurrency(u.askingPrice) : "—"}</span>,
                exportValue: (u) => u.askingPrice ?? 0,
              },
              {
                key: "salePrice",
                label: "Sold Price",
                align: "right",
                sortable: true,
                sortValue: (u) => u.salePrice ?? 0,
                render: (u) =>
                  u.salePrice != null ? (
                    <span className="tnum font-medium text-foreground">{formatCurrency(u.salePrice)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
                exportValue: (u) => u.salePrice ?? "",
              },
              {
                key: "saleProfit",
                label: "Profit",
                align: "right",
                sortable: true,
                sortValue: (u) => u.saleProfit ?? 0,
                render: (u) =>
                  u.saleProfit != null ? (
                    <span className={cn("tnum font-medium", u.saleProfit >= 0 ? "text-success" : "text-danger")}>
                      {u.saleProfit >= 0 ? "+" : ""}{formatCurrency(u.saleProfit)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
                exportValue: (u) => u.saleProfit ?? "",
              },
              {
                key: "customerName",
                label: "Buyer",
                render: (u) =>
                  u.customerName ? (
                    <span className="text-foreground">{u.customerName}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
                exportValue: (u) => u.customerName ?? "",
              },
              {
                key: "saleDate",
                label: "Sale Date",
                sortable: true,
                sortValue: (u) => (u.saleDate ? new Date(u.saleDate).getTime() : 0),
                render: (u) =>
                  u.saleDate ? (
                    <span className="tnum text-muted-foreground">{formatDate(u.saleDate)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
                exportValue: (u) => (u.saleDate ? formatDate(u.saleDate) : ""),
              },
            ]}
          />
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

  return (
    <div className="space-y-4">
      {parcels.length === 0 ? (
        <EmptyState icon={<LandPlot className="h-5 w-5" />} title="No land parcels" description="Land parcels linked to this project will appear here." />
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={parcels}
            storageKey="project-land"
            searchable
            searchPlaceholder="Search parcels…"
            hideable
            exportFileName="project-land"
            initialSort={{ key: "number", direction: "asc" }}
            onRowClick={(p) => window.open(`/land/${p.id}`, "_self")}
            toolbarTrailing={
              <Link href="/land">
                <Button size="sm" className="h-7 gap-1.5">
                  <Plus className="size-3.5" /> Manage Land
                </Button>
              </Link>
            }
            columns={[
              {
                key: "number",
                label: "Parcel #",
                sortable: true,
                render: (p) => (
                  <div className="min-w-0">
                    <span className="font-mono text-caption font-medium text-foreground">{p.number}</span>
                    {p.parentParcelNumber && (
                      <span className="ml-2 text-micro text-muted-foreground/60">from {p.parentParcelNumber}</span>
                    )}
                  </div>
                ),
              },
              {
                key: "status",
                label: "Status",
                sortable: true,
                render: (p) => <StatusPill status={p.status} />,
              },
              {
                key: "area",
                label: "Area",
                align: "right",
                sortable: true,
                render: (p) => <span className="tnum text-muted-foreground">{formatNumber(p.area, 0)} <span className="text-caption font-normal text-muted-foreground">{p.areaUnit}</span></span>,
                exportValue: (p) => p.area,
              },
              {
                key: "acquisitionCost",
                label: "Acquisition",
                align: "right",
                sortable: true,
                render: (p) => <span className="tnum text-muted-foreground">{formatCurrency(p.acquisitionCost)}</span>,
                exportValue: (p) => p.acquisitionCost,
              },
              {
                key: "currentValuation",
                label: "Valuation",
                align: "right",
                sortable: true,
                render: (p) => <span className="tnum font-medium text-foreground">{formatCurrency(p.currentValuation)}</span>,
                exportValue: (p) => p.currentValuation,
              },
              {
                key: "askingPrice",
                label: "Asking",
                align: "right",
                sortable: true,
                render: (p) => <span className="tnum text-muted-foreground">{p.askingPrice ? formatCurrency(p.askingPrice) : "—"}</span>,
                exportValue: (p) => p.askingPrice ?? 0,
                defaultHidden: true,
              },
              {
                key: "childCount",
                label: "Sub-parcels",
                align: "right",
                sortable: true,
                render: (p) => <span className="tnum text-muted-foreground">{p.childCount > 0 ? p.childCount : "—"}</span>,
                defaultHidden: true,
              },
              {
                key: "salePrice",
                label: "Sold Price",
                align: "right",
                sortable: true,
                sortValue: (p) => p.salePrice ?? 0,
                render: (p) =>
                  p.salePrice != null ? (
                    <span className="tnum font-medium text-foreground">{formatCurrency(p.salePrice)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
                exportValue: (p) => p.salePrice ?? "",
              },
              {
                key: "saleProfit",
                label: "Profit",
                align: "right",
                sortable: true,
                sortValue: (p) => p.saleProfit ?? 0,
                render: (p) =>
                  p.saleProfit != null ? (
                    <span className={cn("tnum font-medium", p.saleProfit >= 0 ? "text-success" : "text-danger")}>
                      {p.saleProfit >= 0 ? "+" : ""}{formatCurrency(p.saleProfit)}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
                exportValue: (p) => p.saleProfit ?? "",
              },
              {
                key: "customerName",
                label: "Buyer",
                render: (p) =>
                  p.customerName ? (
                    <span className="text-foreground">{p.customerName}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
                exportValue: (p) => p.customerName ?? "",
              },
              {
                key: "saleDate",
                label: "Sale Date",
                sortable: true,
                sortValue: (p) => (p.saleDate ? new Date(p.saleDate).getTime() : 0),
                render: (p) =>
                  p.saleDate ? (
                    <span className="tnum text-muted-foreground">{formatDate(p.saleDate)}</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  ),
                exportValue: (p) => (p.saleDate ? formatDate(p.saleDate) : ""),
              },
            ]}
          />
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
  const { variance, project, pnl } = data;
  const budget = project.totalBudget ?? 0;
  const actual = variance.actualTotal;
  const isOverBudget = budget > 0 && actual > budget;
  const varianceAmt = actual - budget;
  const variancePct = budget > 0 ? (varianceAmt / budget) * 100 : 0;
  const [view, setView] = useState<"costs" | "breakdown">("costs");

  // ── Cost breakdown bars (unique — header only shows total) ──
  const costBreakdown = [
    { label: "Material Issues", amount: variance.materialIssuesTotal, color: "bg-warning" },
    { label: "Work Orders", amount: variance.workOrderTotal, color: "bg-brand" },
    { label: "Labour Cost", amount: variance.labourCostTotal, color: "bg-success" },
    { label: "Land Cost", amount: variance.landCostTotal, color: "bg-muted-foreground" },
    { label: "Other Costs", amount: variance.otherCostsTotal, color: "bg-foreground/40" },
  ].filter((c) => c.amount > 0);
  const maxCost = Math.max(...costBreakdown.map((c) => c.amount), 1);

  // ── Unit sales snapshot (unique — Units tab only lists, doesn't summarize) ──
  const units = data.builtUnits;
  // "Sold" = has an active sale (unit may be RESERVED during staged sale flow)
  const soldUnits = units.filter((u) => u.saleId != null);
  const availableUnits = units.filter((u) => u.status === "AVAILABLE");
  const soldPct = units.length > 0 ? (soldUnits.length / units.length) * 100 : 0;
  const avgSalePrice = soldUnits.length > 0 ? soldUnits.reduce((s, u) => s + (u.askingPrice ?? 0), 0) / soldUnits.length : 0;
  const soldArea = soldUnits.reduce((s, u) => s + u.area, 0);
  const revPerSqft = soldArea > 0 ? pnl.revenue / soldArea : 0;

  // ── Procurement spend (unique — Procurement tab only lists POs) ──
  const pos = data.purchaseOrders.filter((p) => p.projectId === project.id || p.procurementScope === "COMPANY");
  const poTotal = pos.reduce((s, p) => s + p.total, 0);
  const openPOs = pos.filter((p) => ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"].includes(p.status));
  const receivedPOs = pos.filter((p) => p.status === "RECEIVED");
  // Top supplier by total spend
  const supplierTotals = new Map<string, number>();
  for (const p of pos) supplierTotals.set(p.supplierName, (supplierTotals.get(p.supplierName) ?? 0) + p.total);
  const topSupplier = [...supplierTotals.entries()].sort((a, b) => b[1] - a[1])[0];

  // ── Work order health (unique — Construction tab only lists WOs) ──
  const wos = data.workOrders;
  const woTotal = wos.reduce((s, w) => s + w.totalValue, 0);
  const completedWOs = wos.filter((w) => w.status === "COMPLETED" || w.status === "CLOSED");
  const activeWOs = wos.filter((w) => ["DRAFT", "APPROVED", "IN_PROGRESS"].includes(w.status));
  const totalRABills = wos.reduce((s, w) => s + w.raBillCount, 0);

  const toggle = (
    <div className="inline-flex shrink-0 rounded-md border border-border bg-card p-0.5">
      <button
        onClick={() => setView("costs")}
        className={`rounded px-2.5 py-1 text-caption font-medium transition-colors ${
          view === "costs" ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Costs <span className="tnum">({costs.length})</span>
      </button>
      <button
        onClick={() => setView("breakdown")}
        className={`rounded px-2.5 py-1 text-caption font-medium transition-colors ${
          view === "breakdown" ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        Breakdown
      </button>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Over-budget alert — only unique variance info not in the header */}
      {isOverBudget && (
        <div className="flex items-center gap-2 rounded-lg border border-danger/30 bg-danger-soft/40 p-3">
          <AlertTriangle className="h-4 w-4 shrink-0 text-danger" />
          <p className="text-body text-foreground">
            <span className="font-medium text-danger">{formatCurrency(varianceAmt)} over budget</span>
            <span className="text-muted-foreground"> — actual is {variancePct.toFixed(1)}% above the {formatCurrency(budget)} budget.</span>
            <Link href="/budget-variance" className="ml-2 font-medium text-brand hover:underline">Review line-by-line →</Link>
          </p>
        </div>
      )}

      {/* Insight cards — 2×2 grid, equal height */}
      <div className="grid auto-rows-fr gap-4 sm:grid-cols-2">
        {/* Cost Breakdown — how total cost splits (header only shows the total) */}
        <div className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-raised">
          <div className="flex items-center justify-between">
            <h2 className="text-label text-muted-foreground">Cost Breakdown</h2>
            <Link href="/budget-variance" className="text-caption font-medium text-brand hover:underline">Variance Detail →</Link>
          </div>
          <div className="mt-4 flex flex-1 flex-col justify-center space-y-2.5">
            {costBreakdown.length === 0 ? (
              <p className="text-caption text-muted-foreground">No cost data yet.</p>
            ) : (
              costBreakdown.map((c) => (
                <div key={c.label}>
                  <div className="mb-1 flex items-baseline justify-between">
                    <span className="text-body text-foreground">{c.label}</span>
                    <span className="text-body font-semibold tnum text-foreground">{formatCurrency(c.amount)}</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-muted">
                    <div className={`h-full ${c.color}`} style={{ width: `${(c.amount / maxCost) * 100}%` }} />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Unit Sales Snapshot — Units tab only lists, this summarizes */}
        <div className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-raised">
          <div className="flex items-center justify-between">
            <h2 className="text-label text-muted-foreground">Unit Sales</h2>
            <Link href={`/units?project=${project.id}`} className="text-caption font-medium text-brand hover:underline">View Units →</Link>
          </div>
          <div className="mt-4 grid flex-1 grid-cols-3 content-center gap-4">
            <div className="text-center">
              <div className="text-label text-muted-foreground/70">Sold</div>
              <div className="text-section font-semibold tnum text-foreground">{soldUnits.length}</div>
              <div className="text-caption tnum text-muted-foreground">{soldPct.toFixed(0)}% of {units.length}</div>
            </div>
            <div className="text-center">
              <div className="text-label text-muted-foreground/70">Available</div>
              <div className="text-section font-semibold tnum text-foreground">{availableUnits.length}</div>
              <div className="text-caption tnum text-muted-foreground">&nbsp;</div>
            </div>
            <div className="text-center">
              <div className="text-label text-muted-foreground/70">Avg Sale</div>
              <div className="text-section font-semibold tnum text-success">{avgSalePrice > 0 ? formatCurrency(avgSalePrice) : "—"}</div>
              <div className="text-caption tnum text-muted-foreground">{revPerSqft > 0 ? `${formatCurrency(revPerSqft)}/sq.ft` : "\u00a0"}</div>
            </div>
          </div>
        </div>

        {/* Procurement Spend — Procurement tab only lists POs */}
        <div className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-raised">
          <div className="flex items-center justify-between">
            <h2 className="text-label text-muted-foreground">Procurement Spend</h2>
            <Link href={`/procurement?project=${project.id}`} className="text-caption font-medium text-brand hover:underline">View POs →</Link>
          </div>
          <div className="mt-4 grid flex-1 grid-cols-3 content-center gap-4">
            <div className="text-center">
              <div className="text-label text-muted-foreground/70">Total POs</div>
              <div className="text-section font-semibold tnum text-foreground">{formatCurrency(poTotal)}</div>
              <div className="text-caption tnum text-muted-foreground">{pos.length} orders</div>
            </div>
            <div className="text-center">
              <div className="text-label text-muted-foreground/70">Open</div>
              <div className="text-section font-semibold tnum text-warning">{openPOs.length}</div>
              <div className="text-caption tnum text-muted-foreground">{receivedPOs.length} received</div>
            </div>
            <div className="text-center">
              <div className="text-label text-muted-foreground/70">Top Supplier</div>
              <div className="text-body font-semibold text-foreground truncate">{topSupplier ? topSupplier[0] : "—"}</div>
              <div className="text-caption tnum text-muted-foreground">{topSupplier ? formatCurrency(topSupplier[1]) : "\u00a0"}</div>
            </div>
          </div>
        </div>

        {/* Work Order Health — Construction tab only lists WOs */}
        <div className="flex flex-col rounded-lg border border-border bg-card p-4 shadow-raised">
          <div className="flex items-center justify-between">
            <h2 className="text-label text-muted-foreground">Work Order Health</h2>
            <Link href={`/work-orders?project=${project.id}`} className="text-caption font-medium text-brand hover:underline">View WOs →</Link>
          </div>
          <div className="mt-4 grid flex-1 grid-cols-3 content-center gap-4">
            <div className="text-center">
              <div className="text-label text-muted-foreground/70">Total Value</div>
              <div className="text-section font-semibold tnum text-foreground">{formatCurrency(woTotal)}</div>
              <div className="text-caption tnum text-muted-foreground">{wos.length} orders</div>
            </div>
            <div className="text-center">
              <div className="text-label text-muted-foreground/70">Active</div>
              <div className="text-section font-semibold tnum text-warning">{activeWOs.length}</div>
              <div className="text-caption tnum text-muted-foreground">{completedWOs.length} completed</div>
            </div>
            <div className="text-center">
              <div className="text-label text-muted-foreground/70">RA Bills</div>
              <div className="text-section font-semibold tnum text-foreground">{totalRABills}</div>
              <div className="text-caption tnum text-muted-foreground">&nbsp;</div>
            </div>
          </div>
        </div>
      </div>

      {/* Analysis links */}
      <div className="flex justify-center gap-4">
        <Link href="/profit-center" className="text-caption font-medium text-brand hover:underline">Profit Center →</Link>
        <Link href="/project-control" className="text-caption font-medium text-brand hover:underline">EVM Analysis →</Link>
        <Link href="/material-reconciliation" className="text-caption font-medium text-brand hover:underline">Material Reconciliation →</Link>
      </div>

      {/* Toggle: Costs table | Breakdown detail */}
      {view === "costs" ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={costs}
            storageKey="project-costs"
            searchable
            searchPlaceholder="Search costs…"
            hideable
            exportFileName="project-costs"
            initialSort={{ key: "date", direction: "desc" }}
            showTotals
            sumColumns={["amount"]}
            totalFormat={(_k, sum) => formatCurrency(sum)}
            toolbarLeading={toggle}
            toolbarTrailing={
              <Link href="/finance">
                <Button size="sm" className="h-7 gap-1.5">
                  <Plus className="size-3.5" /> Add Cost
                </Button>
              </Link>
            }
            columns={[
              {
                key: "costType",
                label: "Type",
                sortable: true,
                render: (c) => <span className="font-medium text-foreground">{c.costType}</span>,
              },
              {
                key: "amount",
                label: "Amount",
                align: "right",
                sortable: true,
                render: (c) => <span className="tnum font-medium text-danger">−{formatCurrency(c.amount)}</span>,
                exportValue: (c) => c.amount,
              },
              {
                key: "date",
                label: "Date",
                sortable: true,
                render: (c) => <span className="text-caption text-muted-foreground">{formatDate(c.date)}</span>,
              },
              {
                key: "vendor",
                label: "Vendor",
                sortable: true,
                render: (c) => <span className="text-caption text-muted-foreground">{c.vendor ?? "—"}</span>,
              },
              {
                key: "subcontractorName",
                label: "Subcontractor",
                sortable: true,
                render: (c) => <span className="text-caption text-muted-foreground">{c.subcontractorName ?? "—"}</span>,
                defaultHidden: true,
              },
              {
                key: "notes",
                label: "Notes",
                sortable: false,
                render: (c) => <span className="text-caption text-muted-foreground truncate">{c.notes ?? "—"}</span>,
                defaultHidden: true,
              },
            ]}
          />
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={costBreakdown}
            storageKey="project-cost-breakdown"
            exportFileName="project-cost-breakdown"
            toolbarLeading={toggle}
            columns={[
              {
                key: "label",
                label: "Cost Category",
                sortable: true,
                render: (c) => <span className="font-medium text-foreground">{c.label}</span>,
              },
              {
                key: "amount",
                label: "Amount",
                align: "right",
                sortable: true,
                render: (c) => <span className="tnum font-semibold text-foreground">{formatCurrency(c.amount)}</span>,
                exportValue: (c) => c.amount,
              },
              {
                key: "pct",
                label: "% of Total",
                align: "right",
                sortable: true,
                render: (c) => <span className="tnum text-muted-foreground">{actual > 0 ? ((c.amount / actual) * 100).toFixed(1) : "—"}%</span>,
                exportValue: (c) => actual > 0 ? ((c.amount / actual) * 100) : 0,
              },
            ]}
          />
        </div>
      )}
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
  const [view, setView] = useState<"boq" | "wbs" | "wos" | "mb" | "dprs">("boq");

  const segments = [
    { key: "boq" as const, label: "BOQ", count: data.boqItems.length },
    { key: "wbs" as const, label: "WBS", count: data.wbsNodes.length },
    { key: "wos" as const, label: "Work Orders", count: data.workOrders.length },
    { key: "mb" as const, label: "MB", count: data.mbEntries.length },
    { key: "dprs" as const, label: "DPRs", count: data.dprs.length },
  ];

  const toggle = (
    <div className="inline-flex shrink-0 rounded-md border border-border bg-card p-0.5">
      {segments.map((s) => (
        <button
          key={s.key}
          onClick={() => setView(s.key)}
          className={`rounded px-2.5 py-1 text-caption font-medium transition-colors ${
            view === s.key ? "bg-brand-soft text-brand-strong" : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {s.label} <span className="tnum">({s.count})</span>
        </button>
      ))}
    </div>
  );

  return (
    <div className="space-y-4">
      {view === "boq" && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={data.boqItems}
              storageKey="project-boq"
              searchable
              searchPlaceholder="Search BOQ…"
              hideable
              exportFileName="project-boq"
              showTotals
              sumColumns={["amount"]}
              totalFormat={(_k, sum) => formatCurrency(sum)}
              toolbarLeading={toggle}
              toolbarTrailing={
                <Link href={`/boq?project=${data.project.id}`}>
                  <Button size="sm" variant="outline" className="h-7">View BOQ</Button>
                </Link>
              }
              columns={[
                {
                  key: "description",
                  label: "Description",
                  sortable: true,
                  render: (item) => <span className="font-medium text-foreground">{item.description}</span>,
                },
                {
                  key: "qty",
                  label: "Qty",
                  align: "right",
                  sortable: true,
                  render: (item) => <span className="tnum text-muted-foreground">{formatNumber(item.qty, 2)} {item.unit}</span>,
                  exportValue: (item) => item.qty,
                },
                {
                  key: "rate",
                  label: "Rate",
                  align: "right",
                  sortable: true,
                  render: (item) => <span className="tnum text-muted-foreground">@ {formatCurrency(item.rate)}</span>,
                  exportValue: (item) => item.rate,
                },
                {
                  key: "amount",
                  label: "Amount",
                  align: "right",
                  sortable: true,
                  render: (item) => <span className="tnum font-semibold text-foreground">{formatCurrency(item.amount)}</span>,
                  exportValue: (item) => item.amount,
                },
              ]}
          />
        </div>
      )}

      {view === "wbs" && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={data.wbsNodes}
              storageKey="project-wbs"
              searchable
              searchPlaceholder="Search WBS…"
              hideable
              exportFileName="project-wbs"
              toolbarLeading={toggle}
              toolbarTrailing={
                <Link href={`/wbs?project=${data.project.id}`}>
                  <Button size="sm" variant="outline" className="h-7">View WBS</Button>
                </Link>
              }
              columns={[
                {
                  key: "name",
                  label: "Activity",
                  sortable: true,
                  render: (node) => (
                    <div className="min-w-0">
                      <span className="font-medium text-foreground">{node.name}</span>
                      {node.parentNodeName && (
                        <span className="ml-2 text-caption text-muted-foreground">under {node.parentNodeName}</span>
                      )}
                    </div>
                  ),
                },
                {
                  key: "status",
                  label: "Status",
                  sortable: true,
                  render: (node) => <StatusPill status={node.status} />,
                },
                {
                  key: "progressPct",
                  label: "Progress",
                  align: "right",
                  sortable: true,
                  render: (node) => (
                    <div className="w-24 shrink-0">
                      <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full bg-foreground" style={{ width: `${Math.min(100, node.progressPct)}%` }} />
                      </div>
                      <div className="mt-0.5 text-micro text-muted-foreground tnum text-right">{node.progressPct.toFixed(0)}%</div>
                    </div>
                  ),
                  exportValue: (node) => node.progressPct,
                },
              ]}
          />
        </div>
      )}

      {view === "wos" && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={data.workOrders}
              storageKey="project-work-orders"
              searchable
              searchPlaceholder="Search work orders…"
              hideable
              exportFileName="project-work-orders"
              showTotals
              sumColumns={["totalValue"]}
              totalFormat={(_k, sum) => formatCurrency(sum)}
              onRowClick={(wo) => window.open(`/work-orders/${wo.id}`, "_self")}
              toolbarLeading={toggle}
              toolbarTrailing={
                <Link href={`/work-orders?project=${data.project.id}`}>
                  <Button size="sm" variant="outline" className="h-7">View All</Button>
                </Link>
              }
              columns={[
                {
                  key: "woNumber",
                  label: "WO #",
                  sortable: true,
                  render: (wo) => <span className="font-mono text-caption font-medium text-foreground">{wo.woNumber}</span>,
                },
                {
                  key: "subcontractorName",
                  label: "Subcontractor",
                  sortable: true,
                  render: (wo) => <span className="font-medium text-foreground">{wo.subcontractorName}</span>,
                },
                {
                  key: "status",
                  label: "Status",
                  sortable: true,
                  render: (wo) => <StatusPill status={wo.status} />,
                },
                {
                  key: "raBillCount",
                  label: "RA Bills",
                  align: "right",
                  sortable: true,
                  render: (wo) => <span className="tnum text-muted-foreground">{wo.raBillCount}</span>,
                },
                {
                  key: "totalValue",
                  label: "Value",
                  align: "right",
                  sortable: true,
                  render: (wo) => <span className="tnum font-medium text-foreground">{formatCurrency(wo.totalValue)}</span>,
                  exportValue: (wo) => wo.totalValue,
                },
              ]}
          />
        </div>
      )}

      {view === "mb" && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={data.mbEntries}
              storageKey="project-mb"
              searchable
              searchPlaceholder="Search MB entries…"
              hideable
              exportFileName="project-mb"
              initialSort={{ key: "date", direction: "desc" }}
              toolbarLeading={toggle}
              toolbarTrailing={
                <Link href={`/measurement-book?project=${data.project.id}`}>
                  <Button size="sm" variant="outline" className="h-7">View MB</Button>
                </Link>
              }
              columns={[
                {
                  key: "mbNumber",
                  label: "MB #",
                  sortable: true,
                  render: (mb) => <span className="font-mono text-caption font-medium text-foreground">{mb.mbNumber}</span>,
                },
                {
                  key: "description",
                  label: "Description",
                  sortable: true,
                  render: (mb) => <span className="font-medium text-foreground">{mb.description}</span>,
                },
                {
                  key: "qty",
                  label: "Qty",
                  align: "right",
                  sortable: true,
                  render: (mb) => <span className="tnum text-muted-foreground">{formatNumber(mb.qty, 2)} {mb.unit}</span>,
                  exportValue: (mb) => mb.qty,
                },
                {
                  key: "status",
                  label: "Status",
                  sortable: true,
                  render: (mb) => <StatusPill status={mb.status} />,
                },
                {
                  key: "date",
                  label: "Date",
                  sortable: true,
                  render: (mb) => <span className="text-caption text-muted-foreground">{formatDate(mb.date)}</span>,
                },
              ]}
          />
        </div>
      )}

      {view === "dprs" && (
        <div className="overflow-hidden rounded-lg border border-border bg-card shadow-raised">
          <DataTable
            data={data.dprs}
            storageKey="project-dprs"
            searchable
              searchPlaceholder="Search DPRs…"
              hideable
              exportFileName="project-dprs"
              initialSort={{ key: "reportDate", direction: "desc" }}
              onRowClick={(dpr) => window.open(`/hr/dprs?id=${dpr.id}`, "_self")}
              toolbarLeading={toggle}
              toolbarTrailing={
                <Link href={`/hr/dprs?project=${data.project.id}`}>
                  <Button size="sm" className="h-7 gap-1.5">
                    <Plus className="size-3.5" /> New DPR
                  </Button>
                </Link>
              }
              columns={[
                {
                  key: "reportDate",
                  label: "Date",
                  sortable: true,
                  render: (dpr) => <span className="tnum text-caption text-muted-foreground">{formatDate(dpr.reportDate)}</span>,
                },
                {
                  key: "workType",
                  label: "Work Type",
                  sortable: true,
                  render: (dpr) => <span className="font-medium text-foreground">{dpr.workType ?? "General work"}</span>,
                },
                {
                  key: "labourCount",
                  label: "Workers",
                  align: "right",
                  sortable: true,
                  render: (dpr) => <span className="tnum text-muted-foreground">{dpr.labourCount}</span>,
                },
                {
                  key: "approvalStatus",
                  label: "Approval",
                  sortable: true,
                  render: (dpr) => <StatusPill status={dpr.approvalStatus} />,
                },
                {
                  key: "submittedByName",
                  label: "Submitted By",
                  sortable: true,
                  render: (dpr) => <span className="text-caption text-muted-foreground">{dpr.submittedByName ?? "—"}</span>,
                  defaultHidden: true,
                },
                {
                  key: "notes",
                  label: "Summary",
                  sortable: false,
                  render: (dpr) => <span className="text-caption text-muted-foreground truncate">{dpr.notes ?? "—"}</span>,
                  defaultHidden: true,
                },
              ]}
          />
        </div>
      )}
    </div>
  );
}

