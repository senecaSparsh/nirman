import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { BudgetVarianceView } from "@/components/budget-variance/budget-variance-view";
import { ProjectControlView } from "@/components/project-control/project-control-view";
import { ProfitCenterView } from "@/components/profit-center/profit-center-view";
import { CostControlTabs } from "@/components/cost-control/cost-control-tabs";

export const metadata = { title: "Cost Control · Nirman" };

export default function CostControlPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading cost control…" variant="cards" />}>
        <CostControlContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function CostControlContent({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  await connection();
  await searchParams; // URL tab state is read client-side via useTabParam
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  // Cost control requires either finance or project-control permission
  const canSeeFinance = hasPermission(role, PERM.FINANCE_VIEW);
  const canSeeProjectControl = hasPermission(role, PERM.PROJECT_CONTROL_VIEW);
  if (!canSeeFinance && !canSeeProjectControl) {
    return <NoAccess what="cost control" />;
  }

  const projectScopeFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const projects = await prisma.project.findMany({
    take: 200,
    where: { companyId: company.id, deletedAt: null, ...projectScopeFilter },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <>
      <PageHeader
        title="Cost Control"
        description="Project control (EVM), budget variance, and profit center analysis — all in one place."
        stats={[{ label: "Projects", value: projects.length, hint: "Projects available for cost analysis." }]}
      />
      <CostControlTabs
        projectControl={canSeeProjectControl ? <ProjectControlView projects={projects} /> : <NoAccess what="project control" />}
        budgetVariance={canSeeFinance ? <BudgetVarianceView projects={projects} /> : <NoAccess what="budget variance" />}
        profitCenter={canSeeFinance ? <ProfitCenterView projects={projects} /> : <NoAccess what="profit center" />}
      />
    </>
  );
}
