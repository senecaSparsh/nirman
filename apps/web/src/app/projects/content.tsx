import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { projectPnl } from "@nirman/services";
import { getCompany, getUserScope, toNum, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Hint } from "@/components/page";
import { applyCap, LIST_CAP } from "@/lib/list-cap";
import { ProjectsView } from "@/components/projects/projects-view";
import { NoAccess } from "@/components/no-access";
import { DepartmentActivityFeed } from "@/components/department-activity-feed";

const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  WAREHOUSE: "Warehouse",
  MALL: "Mall / Retail",
  LAND: "Land Dev",
  OTHER: "Other",
};
export async function ProjectsContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.PROJECTS_VIEW)) {
    return (
      <NoAccess what="projects" permission={PERM.PROJECTS_VIEW} />
    );
  }

  // Hierarchical RBAC: a PROJECT-scoped user (Sub-Sub-Admin) only sees their
  // assigned projects. COMPANY/DEPARTMENT scopes see all projects in the company.
  const scope = await getUserScope();
  const projectScopeFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const { rows: projects, capped } = applyCap(await prisma.project.findMany({
    take: LIST_CAP + 1,
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
  }));
  const cappedLabels = capped ? ["projects"] : [];

  // Header stats come from a complete aggregate — the projects list is capped.
  const projStatusAgg = await prisma.project.groupBy({
    by: ["status"],
    where: { companyId: company.id, deletedAt: null, ...projectScopeFilter },
    _count: true,
  });
  const totalProjects = projStatusAgg.reduce((s, g) => s + g._count, 0);

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

  const activeCount = projStatusAgg.find((g) => g.status === "ACTIVE")?._count ?? 0;
  const completedCount = projStatusAgg.find((g) => g.status === "COMPLETED")?._count ?? 0;
  const onHoldCount = projStatusAgg.find((g) => g.status === "ON_HOLD")?._count ?? 0;

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
          { label: "Total", value: totalProjects, hint: "All projects in the company, including completed and on-hold." },
          { label: "Active", value: activeCount, hint: "Projects currently in ACTIVE status." },
          { label: "Completed", value: completedCount, hint: "Projects marked as COMPLETED." },
          { label: "On hold", value: onHoldCount, hint: "Projects paused or on hold." },
        ]}
      />
      <DepartmentActivityFeed department="projects" />
      {cappedLabels.length > 0 && (
        <Hint tone="warning">
          {`Showing only the most recent records for ${cappedLabels.join(", ")} — older entries are still in the database but hidden from this page.`}
        </Hint>
      )}
      <ProjectsView
        projects={projectRows}
        typeLabels={TYPE_LABELS}
        permissions={{
          canCreate: __effPerms.includes(PERM.PROJECTS_MANAGE),
          canEdit: __effPerms.includes(PERM.PROJECTS_MANAGE),
          canDelete: __effPerms.includes(PERM.PROJECTS_MANAGE),
        }}
      />
    </>
  );
}
