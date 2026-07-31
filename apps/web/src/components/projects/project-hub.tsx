"use client";

import { useState } from "react";
import Link from "next/link";
import {
  Package, Truck, Home, LandPlot, Wallet, Wrench, ClipboardList,
  ArrowRight, TrendingUp, TrendingDown, AlertTriangle, Check, Clock,
  Plus, Layers, MapPin,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
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
};

const PO_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  DRAFT: "muted", APPROVED: "default", ORDERED: "warning",
  PARTIAL: "warning", RECEIVED: "success", CANCELLED: "danger",
};

const UNIT_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PLANNED: "muted", UNDER_CONSTRUCTION: "warning",
  AVAILABLE: "success", HOLD: "default", SOLD: "danger",
};

const PARCEL_STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  AVAILABLE: "success", HOLD: "warning", PARTITIONED: "muted", SOLD: "danger",
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

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted"> = {
  PLANNED: "muted", ACTIVE: "success", COMPLETED: "default", ON_HOLD: "warning",
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
  editInitial: any;
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
        <Badge variant={STATUS_VARIANT[project.status] ?? "muted"}>{project.status.replace("_", " ")}</Badge>
        <Badge variant="outline">{TYPE_LABELS[project.type] ?? project.type}</Badge>
        {project.address && <span className="flex items-center gap-1"><MapPin className="h-3.5 w-3.5" />{project.address}</span>}
        <span className="flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatDate(project.startDate)} → {formatDate(project.endDate)}</span>
      </div>

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Budget" value={project.totalBudget ? formatCurrency(project.totalBudget) : "—"} icon={<Wallet className="h-[18px] w-[18px]" />} />
        <KpiCard label="Project Cost" value={project.totalProjectCost ? formatCurrency(project.totalProjectCost) : "—"} icon={<Wallet className="h-[18px] w-[18px]" />} accent="success" />
        <KpiCard label="Cost / Sqft" value={project.costPerSqft ? formatCurrency(project.costPerSqft) : "—"} icon={<Layers className="h-[18px] w-[18px]" />} accent="warning" />
        <KpiCard label="Sellable Area" value={project.totalSellableArea ? `${formatNumber(project.totalSellableArea, 0)} sqft` : "—"} icon={<LandPlot className="h-[18px] w-[18px]" />} />
      </div>

      {/* P&L strip */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div><p className="text-caption text-muted-foreground">Total Cost</p><p className="tnum text-lg font-bold">{formatCurrency(pnl.totalCost)}</p></div>
            <TrendingDown className="h-5 w-5 text-danger" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div><p className="text-caption text-muted-foreground">Revenue</p><p className="tnum text-lg font-bold">{formatCurrency(pnl.revenue)}</p></div>
            <TrendingUp className="h-5 w-5 text-success" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center justify-between p-4">
            <div>
              <p className="text-caption text-muted-foreground">Profit · Margin</p>
              <p className="tnum text-lg font-bold">{formatCurrency(pnl.profit)}</p>
            </div>
            <Badge variant={pnl.profit >= 0 ? "success" : "danger"}>{pnl.margin.toFixed(1)}%</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Tabs */}
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="flex-wrap">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="procurement">Procurement <CountBadge n={stats.openPOCount} /></TabsTrigger>
          <TabsTrigger value="stock">Stock <CountBadge n={data.materialIssues.length} /></TabsTrigger>
          <TabsTrigger value="units">Units <CountBadge n={stats.builtUnitCount} /></TabsTrigger>
          <TabsTrigger value="land">Land <CountBadge n={stats.landParcelCount} /></TabsTrigger>
          <TabsTrigger value="finance">Finance <CountBadge n={data.projectCosts.length} /></TabsTrigger>
          <TabsTrigger value="equipment">Equipment <CountBadge n={stats.equipmentCount} /></TabsTrigger>
        </TabsList>

        <TabsContent value="overview"><OverviewTab data={data} /></TabsContent>
        <TabsContent value="procurement"><ProcurementTab data={data} /></TabsContent>
        <TabsContent value="stock"><StockTab data={data} /></TabsContent>
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

function TabLink({ href, label, icon }: { href: string; label: string; icon: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center justify-between rounded-md border px-3 py-2.5 text-body transition-colors hover:bg-accent">
      <span className="flex items-center gap-3"><span className="text-muted-foreground">{icon}</span>{label}</span>
      <ArrowRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

// ───────────────────────────────────────────────────────────
//  Overview tab — the "at a glance" summary
// ───────────────────────────────────────────────────────────

function OverviewTab({ data }: { data: ProjectHubData }) {
  const { stats, project } = data;
  return (
    <div className="space-y-5">
      {/* Quick stats grid */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <MiniStatCard label="Built Units" value={stats.builtUnitCount} sub={`${stats.availableUnits} available · ${stats.soldUnits} sold`} icon={<Home className="h-4 w-4" />} href={`/units?project=${project.id}`} />
        <MiniStatCard label="Land Parcels" value={stats.landParcelCount} icon={<LandPlot className="h-4 w-4" />} href={`/land?project=${project.id}`} />
        <MiniStatCard label="Open POs" value={stats.openPOCount} icon={<Truck className="h-4 w-4" />} href="/procurement" />
        <MiniStatCard label="Equipment" value={stats.equipmentCount} icon={<Wrench className="h-4 w-4" />} href="/equipment" />
      </div>

      {/* Phases + Stock locations side by side */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Project Phases</CardTitle></CardHeader>
          <CardContent>
            <PhasesSection projectId={project.id} phases={data.phases} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Stock Locations</CardTitle></CardHeader>
          <CardContent>
            {data.stockLocations.length === 0 ? (
              <p className="text-body text-muted-foreground">No site stores linked to this project.</p>
            ) : (
              <ul className="space-y-2">
                {data.stockLocations.map((loc) => (
                  <li key={loc.id} className="flex items-center justify-between rounded-md border px-3 py-2.5 text-body">
                    <div>
                      <p className="font-medium">{loc.name}</p>
                      {loc.address && <p className="text-caption text-muted-foreground">{loc.address}</p>}
                    </div>
                    <Badge variant={loc.type === "COMPANY_WAREHOUSE" ? "default" : "muted"}>
                      {loc.type === "COMPANY_WAREHOUSE" ? "Warehouse" : "Site"}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent activity */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0">
            <CardTitle>Recent Stock Movements</CardTitle>
            <Link href="/stock-movements" className="text-caption text-primary hover:underline">View all</Link>
          </CardHeader>
          <CardContent>
            {data.stockMovements.length === 0 ? (
              <EmptyState icon={<Package className="h-5 w-5" />} title="No movements" description="Stock movements for this project will appear here." />
            ) : (
              <div className="space-y-2">
                {data.stockMovements.slice(0, 6).map((m) => (
                  <div key={m.id} className="flex items-center justify-between rounded-md border px-3 py-2 text-body">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium">{m.materialName}</p>
                      <p className="text-caption text-muted-foreground">{m.movementLabel} · {m.fromLocationName ?? "—"} → {m.toLocationName ?? "—"}</p>
                    </div>
                    <div className="ml-2 text-right">
                      <p className="tnum font-medium">{formatNumber(m.qty, 3)} {m.unit}</p>
                      <p className="text-caption text-muted-foreground">{formatDate(m.timestamp)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Quick Actions</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            <TabLink href="/procurement" label="Create Purchase Order" icon={<Truck className="h-4 w-4" />} />
            <TabLink href="/stock-movements" label="Issue Materials to Project" icon={<Package className="h-4 w-4" />} />
            <TabLink href="/units" label="Add Built Units" icon={<Home className="h-4 w-4" />} />
            <TabLink href="/sales" label="Record a Sale" icon={<TrendingUp className="h-4 w-4" />} />
            <TabLink href="/finance" label="Add Project Cost" icon={<Wallet className="h-4 w-4" />} />
            <TabLink href="/equipment" label="Assign Equipment" icon={<Wrench className="h-4 w-4" />} />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function MiniStatCard({ label, value, sub, icon, href }: { label: string; value: number; sub?: string; icon: React.ReactNode; href: string }) {
  return (
    <Link href={href}>
      <Card className="transition-shadow hover:shadow-md">
        <CardContent className="flex items-center gap-3 p-4">
          <span className="text-muted-foreground">{icon}</span>
          <div>
            <p className="text-caption text-muted-foreground">{label}</p>
            <p className="tnum text-lg font-semibold">{value}</p>
            {sub && <p className="text-caption text-muted-foreground">{sub}</p>}
          </div>
        </CardContent>
      </Card>
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
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Purchase Orders</CardTitle>
          <Link href="/procurement"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> New PO</Button></Link>
        </CardHeader>
        <CardContent className="p-0">
          {projectPOs.length === 0 ? (
            <EmptyState icon={<Truck className="h-5 w-5" />} title="No purchase orders" description="POs for this project will appear here." />
          ) : (
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>PO Number</TH><TH>Supplier</TH><TH>Status</TH><TH className="text-right">Total</TH><TH>Progress</TH><TH>Expected</TH></TR></THead>
              <TBody>
                {projectPOs.map((po) => (
                  <TR key={po.id}>
                    <TD className="font-mono text-caption font-medium">{po.poNumber}</TD>
                    <TD className="font-medium">{po.supplierName}</TD>
                    <TD><Badge variant={PO_STATUS_VARIANT[po.status] ?? "muted"}>{po.status.replace("_", " ")}</Badge></TD>
                    <TD className="tnum text-right font-medium">{formatCurrency(po.total)}</TD>
                    <TD>
                      <div className="flex items-center gap-2">
                        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                          <div className={`h-full ${po.receivedPct === 100 ? "bg-success" : po.receivedPct > 0 ? "bg-warning" : "bg-muted-foreground/30"}`} style={{ width: `${po.receivedPct}%` }} />
                        </div>
                        <span className="text-caption text-muted-foreground">{po.receivedPct}%</span>
                      </div>
                    </TD>
                    <TD className="text-muted-foreground">{formatDate(po.expectedDate)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Transfers Involving This Project</CardTitle></CardHeader>
        <CardContent className="p-0">
          {projectTransfers.length === 0 ? (
            <EmptyState icon={<ArrowRight className="h-5 w-5" />} title="No transfers" description="Stock transfers to/from this project's locations will appear here." />
          ) : (
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>Route</TH><TH>Status</TH><TH className="text-right">Lines</TH><TH>Date</TH></TR></THead>
              <TBody>
                {projectTransfers.map((t) => (
                  <TR key={t.id}>
                    <TD><span className="font-medium">{t.fromLocationName}</span> → <span className="font-medium">{t.toLocationName}</span></TD>
                    <TD><Badge variant={t.status === "COMPLETED" ? "success" : t.status === "CANCELLED" ? "danger" : "muted"}>{t.status.replace("_", " ").toLowerCase()}</Badge></TD>
                    <TD className="tnum text-right">{t.lineCount}</TD>
                    <TD className="text-muted-foreground">{formatDate(t.transferDate)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Stock tab — movements + material issues
// ───────────────────────────────────────────────────────────

function StockTab({ data }: { data: ProjectHubData }) {
  return (
    <div className="space-y-5">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Material Issues to Project</CardTitle>
          <Link href="/stock-movements"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Issue Materials</Button></Link>
        </CardHeader>
        <CardContent className="p-0">
          {data.materialIssues.length === 0 ? (
            <EmptyState icon={<Package className="h-5 w-5" />} title="No material issues" description="Materials issued from stock to this project will appear here." />
          ) : (
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>From Location</TH><TH className="text-right">Lines</TH><TH className="text-right">Total Cost</TH><TH>Date</TH></TR></THead>
              <TBody>
                {data.materialIssues.map((i) => (
                  <TR key={i.id}>
                    <TD className="font-medium">{i.fromLocationName}</TD>
                    <TD className="tnum text-right">{i.lineCount}</TD>
                    <TD className="tnum text-right font-medium">{formatCurrency(i.totalCost)}</TD>
                    <TD className="text-muted-foreground">{formatDate(i.issueDate)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Recent Stock Movements</CardTitle></CardHeader>
        <CardContent className="p-0">
          {data.stockMovements.length === 0 ? (
            <EmptyState icon={<Package className="h-5 w-5" />} title="No movements" description="Stock movements at this project's locations will appear here." />
          ) : (
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>Type</TH><TH>Material</TH><TH>Route</TH><TH className="text-right">Qty</TH><TH className="text-right">Unit Cost</TH><TH>Date</TH></TR></THead>
              <TBody>
                {data.stockMovements.slice(0, 20).map((m) => (
                  <TR key={m.id}>
                    <TD><Badge variant={MOVEMENT_VARIANT[m.movementType] ?? "muted"}>{m.movementLabel}</Badge></TD>
                    <TD className="font-medium">{m.materialName}</TD>
                    <TD className="text-caption text-muted-foreground">{m.fromLocationName ?? "—"} → {m.toLocationName ?? "—"}</TD>
                    <TD className="tnum text-right">{formatNumber(m.qty, 3)} {m.unit}</TD>
                    <TD className="tnum text-right">{m.unitCost > 0 ? formatCurrency(m.unitCost) : "—"}</TD>
                    <TD className="text-muted-foreground">{formatDate(m.timestamp)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
          <span>{formatNumber(totalArea, 0)} sqft total</span>
          <span>·</span>
          <span>Asking: {formatCurrency(totalAsking)}</span>
        </div>
        <Link href="/units"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Add Units</Button></Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {units.length === 0 ? (
            <EmptyState icon={<Home className="h-5 w-5" />} title="No built units" description="Add built units (flats, shops, offices) to this project." />
          ) : (
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>Unit</TH><TH>Type</TH><TH>Floor/Wing</TH><TH className="text-right">Area</TH><TH>Status</TH><TH className="text-right">Prod. Cost</TH><TH className="text-right">Asking</TH></TR></THead>
              <TBody>
                {units.map((u) => (
                  <TR key={u.id}>
                    <TD className="font-mono font-medium">{u.unitNumber}</TD>
                    <TD>{UNIT_TYPE_LABELS[u.unitType] ?? u.unitType}</TD>
                    <TD className="text-muted-foreground">{u.floor != null ? `Floor ${u.floor}` : "—"}{u.wing ? ` · ${u.wing}` : ""}</TD>
                    <TD className="tnum text-right">{formatNumber(u.area, 0)} {u.areaUnit}</TD>
                    <TD><Badge variant={UNIT_STATUS_VARIANT[u.status] ?? "muted"}>{u.status.replace("_", " ")}</Badge></TD>
                    <TD className="tnum text-right">{u.productionCost > 0 ? formatCurrency(u.productionCost) : "—"}</TD>
                    <TD className="tnum text-right">{u.askingPrice ? formatCurrency(u.askingPrice) : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
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
          <span>{formatNumber(totalArea, 0)} sqft total</span>
          <span>·</span>
          <span>{formatNumber(availableArea, 0)} sqft available</span>
        </div>
        <Link href="/land"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Manage Land</Button></Link>
      </div>

      <Card>
        <CardContent className="p-0">
          {parcels.length === 0 ? (
            <EmptyState icon={<LandPlot className="h-5 w-5" />} title="No land parcels" description="Land parcels linked to this project will appear here." />
          ) : (
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>Number</TH><TH>Parent</TH><TH className="text-right">Area</TH><TH>Status</TH><TH className="text-right">Acquisition</TH><TH className="text-right">Asking</TH><TH className="text-right">Valuation</TH></TR></THead>
              <TBody>
                {parcels.map((p) => (
                  <TR key={p.id}>
                    <TD className="font-mono font-medium">{p.number}</TD>
                    <TD className="text-muted-foreground">{p.parentParcelNumber ?? "—"}</TD>
                    <TD className="tnum text-right">{formatNumber(p.area, 0)} {p.areaUnit}</TD>
                    <TD><Badge variant={PARCEL_STATUS_VARIANT[p.status] ?? "muted"}>{p.status.replace("_", " ").toLowerCase()}</Badge></TD>
                    <TD className="tnum text-right">{formatCurrency(p.acquisitionCost)}</TD>
                    <TD className="tnum text-right">{p.askingPrice ? formatCurrency(p.askingPrice) : "—"}</TD>
                    <TD className="tnum text-right">{formatCurrency(p.currentValuation)}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ───────────────────────────────────────────────────────────
//  Finance tab — project costs + P&L breakdown
// ───────────────────────────────────────────────────────────

function FinanceTab({ data }: { data: ProjectHubData }) {
  const costs = data.projectCosts;
  const totalCosts = costs.reduce((s, c) => s + c.amount, 0);
  const { pnl } = data;

  return (
    <div className="space-y-5">
      {/* P&L summary */}
      <div className="grid gap-3 sm:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-caption text-muted-foreground">Material Issues</p><p className="tnum text-lg font-bold">{formatCurrency(data.materialIssues.reduce((s, i) => s + i.totalCost, 0))}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-caption text-muted-foreground">Other Project Costs</p><p className="tnum text-lg font-bold">{formatCurrency(totalCosts)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-caption text-muted-foreground">Revenue</p><p className="tnum text-lg font-bold text-success">{formatCurrency(pnl.revenue)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-caption text-muted-foreground">Profit</p><p className="tnum text-lg font-bold">{formatCurrency(pnl.profit)}</p></CardContent></Card>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0">
          <CardTitle>Project Costs</CardTitle>
          <Link href="/finance"><Button size="sm" variant="outline"><Plus className="h-4 w-4" /> Add Cost</Button></Link>
        </CardHeader>
        <CardContent className="p-0">
          {costs.length === 0 ? (
            <EmptyState icon={<Wallet className="h-5 w-5" />} title="No project costs" description="Labour, overhead, equipment, and contractor costs will appear here." />
          ) : (
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>Type</TH><TH className="text-right">Amount</TH><TH>Date</TH><TH>Vendor</TH><TH>Notes</TH></TR></THead>
              <TBody>
                {costs.map((c) => (
                  <TR key={c.id}>
                    <TD><Badge variant="outline">{c.costType}</Badge></TD>
                    <TD className="tnum text-right font-medium">{formatCurrency(c.amount)}</TD>
                    <TD className="text-muted-foreground">{formatDate(c.date)}</TD>
                    <TD className="text-muted-foreground">{c.vendor ?? "—"}</TD>
                    <TD className="max-w-[200px] truncate text-muted-foreground">{c.notes ?? "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
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

      <Card>
        <CardContent className="p-0">
          {equipment.length === 0 ? (
            <EmptyState icon={<Wrench className="h-5 w-5" />} title="No equipment assigned" description="Equipment assigned to this project's site will appear here." />
          ) : (
            <Table>
              <THead><TR className="hover:bg-transparent"><TH>Asset Tag</TH><TH>Name</TH><TH>Category</TH><TH>Status</TH><TH className="text-right">Current Value</TH><TH>Assigned</TH></TR></THead>
              <TBody>
                {equipment.map((e) => (
                  <TR key={e.id}>
                    <TD className="font-mono text-caption font-medium">{e.assetTag}</TD>
                    <TD className="font-medium">{e.name}</TD>
                    <TD className="text-muted-foreground">{e.category ?? "—"}</TD>
                    <TD><Badge variant={e.status === "AVAILABLE" ? "success" : e.status === "ASSIGNED" ? "default" : e.status === "IN_MAINTENANCE" ? "warning" : "muted"}>{e.status.replace("_", " ")}</Badge></TD>
                    <TD className="tnum text-right">{formatCurrency(e.currentValue)}</TD>
                    <TD className="text-muted-foreground">{e.assignedAt ? formatDate(e.assignedAt) : "—"}</TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
