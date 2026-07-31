import { Suspense } from "react";
import { connection } from "next/server";
import { Building2, Layers, Boxes } from "lucide-react";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { KpiCard } from "@/components/kpi-card";
import { PageLoading } from "@/components/page-loading";
import { ProjectsView } from "@/components/projects/projects-view";

const TYPE_LABELS: Record<string, string> = {
  RESIDENTIAL: "Residential",
  COMMERCIAL: "Commercial",
  WAREHOUSE: "Warehouse",
  MALL: "Mall / Retail",
  LAND: "Land Dev",
  OTHER: "Other",
};

const STATUS_VARIANT: Record<string, "default" | "success" | "warning" | "muted" | "danger"> = {
  PLANNED: "muted",
  ACTIVE: "success",
  COMPLETED: "default",
  ON_HOLD: "warning",
};

export default function ProjectsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Projects"
        description="Residential, commercial, warehouse, mall and land projects — with P&L, units and material consumption."
      />
      <Suspense fallback={<PageLoading label="Loading projects…" />}>
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
      <div className="rounded-xl border border-border bg-card p-6 text-meta text-muted-foreground">
        You don't have permission to view this module.
      </div>
    );
  }

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { createdAt: "desc" },
    include: {
      _count: {
        select: {
          builtUnits: { where: { deletedAt: null } },
          stockLocations: { where: { deletedAt: null } },
          phases: true,
        },
      },
    },
  });

  const activeCount = projects.filter((p) => p.status === "ACTIVE").length;
  const plannedCount = projects.filter((p) => p.status === "PLANNED").length;
  const completedCount = projects.filter((p) => p.status === "COMPLETED").length;
  const totalBudget = projects.reduce((s, p) => s + toNum(p.totalBudget), 0);

  // Serialize for client component
  const projectRows = projects.map((p) => ({
    id: p.id,
    name: p.name,
    type: p.type,
    status: p.status,
    address: p.address,
    startDate: p.startDate?.toISOString() ?? null,
    totalBudget: toNum(p.totalBudget),
    phaseCount: p._count.phases,
    unitCount: p._count.builtUnits,
    locationCount: p._count.stockLocations,
  }));

  return (
    <>
      {/* KPI summary */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard label="Total Projects" value={String(projects.length)} icon={<Building2 className="h-[18px] w-[18px]" />} />
        <KpiCard label="Active" value={String(activeCount)} icon={<Layers className="h-[18px] w-[18px]" />} accent="success" />
        <KpiCard label="Planned" value={String(plannedCount)} icon={<Boxes className="h-[18px] w-[18px]" />} accent="warning" />
        <KpiCard label="Combined Budget" value={formatCurrency(totalBudget)} icon={<Building2 className="h-[18px] w-[18px]" />} accent="muted" />
      </div>

      <ProjectsView
        projects={projectRows}
        typeLabels={TYPE_LABELS}
        statusVariant={STATUS_VARIANT}
        permissions={{
          canCreate: hasPermission(role, PERM.PROJECTS_MANAGE),
          canEdit: hasPermission(role, PERM.PROJECTS_MANAGE),
          canDelete: hasPermission(role, PERM.PROJECTS_MANAGE),
        }}
      />
    </>
  );
}
