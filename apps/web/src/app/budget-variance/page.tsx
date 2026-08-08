import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { BudgetVarianceView } from "@/components/budget-variance/budget-variance-view";

export default function BudgetVariancePage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading budget variance…" variant="default" />}>
        <BvContent />
      </Suspense>
    </div>
  );
}

async function BvContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="budget variance" />;
  }

  const projectScopeFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null, ...projectScopeFilter },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  return (
    <>
      <PageHeader title="Budget Variance" stats={[{ label: "Projects", value: projects.length }]} />
      <BudgetVarianceView projects={projects} />
    </>
  );
}
