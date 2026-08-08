import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { projectPnl } from "@nirman/services";
import { getCompany, getUserRole, getUserScope, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ProjectsView } from "@/components/projects/projects-view";
import type { RenovationRow } from "@/components/renovations/renovations-view";

import { NoAccess } from "@/components/no-access";
const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  WAREHOUSE: "Warehouse",
  MALL: "Mall / Retail",
  LAND: "Land Dev",
  OTHER: "Other",
};

export default function ProjectsPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading projects…" variant="cards" />}>
        <ProjectsContent />
      </Suspense>
    </div>
  );
}

async function ProjectsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROJECTS_VIEW)) {
    return (
      <NoAccess what="projects" />
    );
  }

  const canViewRenovations = hasPermission(role, PERM.ASSETS_VIEW);

  // Hierarchical RBAC: a PROJECT-scoped user (Sub-Sub-Admin) only sees their
  // assigned projects. COMPANY/DEPARTMENT scopes see all projects in the company.
  const scope = await getUserScope();
  const projectScopeFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null, ...projectScopeFilter },
    orderBy: { createdAt: "desc" },
    include: {
      builtUnits: {
        where: { deletedAt: null },
        select: { status: true },
      },
      _count: {
        select: {
          stockLocations: { where: { deletedAt: null } },
          phases: true,
        },
      },
    },
  });

  // Compute P&L for each project (parallel)
  const pnlResults = await Promise.all(
    projects.map(async (p) => {
      const pnl = await projectPnl(p.id);
      return {
        projectId: p.id,
        totalCost: toNum(pnl.total),
        revenue: toNum(pnl.revenue),
        profit: toNum(pnl.profit),
        margin: toNum(pnl.margin),
      };
    }),
  );
  const pnlMap = new Map(pnlResults.map((r) => [r.projectId, r]));

  const activeCount = projects.filter((p) => p.status === "ACTIVE").length;
  const totalBudget = projects.reduce((s, p) => s + toNum(p.totalBudget), 0);
  const totalProfit = pnlResults.reduce((s, r) => s + r.profit, 0);

  // Serialize for client component — with health data
  const projectRows = projects.map((p) => {
    const units = p.builtUnits;
    const soldUnits = units.filter((u) => u.status === "SOLD").length;
    const availableUnits = units.filter((u) => u.status === "AVAILABLE").length;
    const totalUnits = units.length;
    const pnl = pnlMap.get(p.id);
    const budget = toNum(p.totalBudget);
    const actualCost = toNum(p.totalProjectCost);
    return {
      id: p.id,
      name: p.name,
      type: p.type,
      status: p.status,
      address: p.address,
      startDate: p.startDate?.toISOString() ?? null,
      endDate: p.endDate?.toISOString() ?? null,
      totalBudget: budget,
      totalProjectCost: actualCost,
      phaseCount: p._count.phases,
      unitCount: totalUnits,
      soldUnits,
      availableUnits,
      locationCount: p._count.stockLocations,
      pnl: pnl ?? { totalCost: 0, revenue: 0, profit: 0, margin: 0 },
    };
  });

  // Fetch renovation data if the user can view assets
  let renovationRows: RenovationRow[] = [];
  let renovationProjects: { id: string; name: string }[] = [];
  let renovationBuiltUnits: { id: string; unitNumber: string; unitType: string; projectId: string }[] = [];
  let renovationLandParcels: { id: string; number: string }[] = [];
  let canManageRenovations = false;
  if (canViewRenovations) {
    canManageRenovations = hasPermission(role, PERM.ASSETS_MANAGE);
    const [renovations, renProjects, renBuiltUnits, renLandParcels] = await Promise.all([
      prisma.renovationProject.findMany({
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        take: 200,
        include: {
          builtUnit: { select: { id: true, unitNumber: true, unitType: true } },
          landParcel: { select: { id: true, number: true } },
          project: { select: { id: true, name: true } },
          costs: { orderBy: { createdAt: "desc" }, take: 50 },
          _count: { select: { costs: true } },
        },
      }),
      prisma.project.findMany({
        where: { companyId: company.id, deletedAt: null },
        select: { id: true, name: true },
        orderBy: { name: "asc" },
      }),
      prisma.builtUnit.findMany({
        where: { project: { companyId: company.id }, deletedAt: null, status: { in: ["AVAILABLE", "HOLD", "UNDER_CONSTRUCTION", "RENTED"] } },
        select: { id: true, unitNumber: true, unitType: true, projectId: true, currentValuation: true },
        orderBy: { unitNumber: "asc" },
      }),
      prisma.landParcel.findMany({
        where: { deletedAt: null, status: { in: ["AVAILABLE", "HOLD", "RENTED"] } },
        select: { id: true, number: true, currentValuation: true },
        orderBy: { number: "asc" },
      }),
    ]);
    renovationRows = renovations.map((r) => ({
      id: r.id,
      renovationNumber: r.renovationNumber,
      type: r.type,
      status: r.status,
      title: r.title,
      description: r.description,
      builtUnitId: r.builtUnitId,
      builtUnitNumber: r.builtUnit?.unitNumber ?? null,
      builtUnitType: r.builtUnit?.unitType ?? null,
      landParcelId: r.landParcelId,
      landParcelNumber: r.landParcel?.number ?? null,
      projectId: r.projectId,
      projectName: r.project?.name ?? null,
      budget: toNum(r.budget),
      actualCost: toNum(r.actualCost),
      originalValuation: toNum(r.originalValuation),
      newValuation: r.newValuation ? toNum(r.newValuation) : null,
      startDate: r.startDate?.toISOString() ?? null,
      completedAt: r.completedAt?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      costCount: r._count.costs,
      costs: r.costs.map((c) => ({
        id: c.id,
        costType: c.costType,
        amount: toNum(c.amount),
        vendor: c.vendor,
        notes: c.notes,
        date: c.date.toISOString(),
      })),
    }));
    renovationProjects = renProjects.map((p) => ({ id: p.id, name: p.name }));
    renovationBuiltUnits = renBuiltUnits.map((u) => ({ id: u.id, unitNumber: u.unitNumber, unitType: u.unitType, projectId: u.projectId }));
    renovationLandParcels = renLandParcels.map((p) => ({ id: p.id, number: p.number }));
  }

  return (
    <>
      <PageHeader
        title="Projects"
        stats={[
          { label: "Total", value: projects.length },
          { label: "Active", value: activeCount },
          { label: "Budget", value: formatCurrency(totalBudget) },
          { label: "Profit", value: formatCurrency(totalProfit) },
        ]}
      />
      <ProjectsView
        projects={projectRows}
        typeLabels={TYPE_LABELS}
        permissions={{
          canCreate: hasPermission(role, PERM.PROJECTS_MANAGE),
          canEdit: hasPermission(role, PERM.PROJECTS_MANAGE),
          canDelete: hasPermission(role, PERM.PROJECTS_MANAGE),
        }}
        renovationRows={renovationRows}
        renovationProjects={renovationProjects}
        renovationBuiltUnits={renovationBuiltUnits}
        renovationLandParcels={renovationLandParcels}
        canManageRenovations={canManageRenovations}
        canViewRenovations={canViewRenovations}
      />
    </>
  );
}
