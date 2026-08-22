import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { projectPnl } from "@nirman/services";
import { getCompany, getUserRole, getUserScope, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ProjectsView } from "@/components/projects/projects-view";

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
    <div className="space-y-6">
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
        select: { status: true, saleId: true },
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

  // Serialize for client component — with health data
  const projectRows = projects.map((p) => {
    const units = p.builtUnits;
    const soldUnits = units.filter((u) => u.saleId != null).length;
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
      reraNumber: p.reraNumber,
      reraRegistrationDate: p.reraRegistrationDate?.toISOString() ?? null,
      reraValidityDate: p.reraValidityDate?.toISOString() ?? null,
      reraWebsiteUrl: p.reraWebsiteUrl,
      phaseCount: p._count.phases,
      unitCount: totalUnits,
      soldUnits,
      availableUnits,
      locationCount: p._count.stockLocations,
      pnl: pnl ?? { totalCost: 0, revenue: 0, profit: 0, margin: 0 },
    };
  });

  return (
    <>
      <PageHeader
        title="Projects"
        description="Every construction and development project — phases, budget, cost-per-sqft, and built units. BOQ, WBS, and site diaries live inside each project."
        stats={[
          { label: "Total", value: projects.length, hint: "All projects in the company, including completed and on-hold." },
          { label: "Active", value: activeCount, hint: "Projects currently in ACTIVE status." },
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
      />
    </>
  );
}
