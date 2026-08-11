import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { ProfitCenterView } from "@/components/profit-center/profit-center-view";

export default function ProfitCenterPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading profit center…" variant="default" />}>
        <PcContent />
      </Suspense>
    </div>
  );
}

async function PcContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="profit center" />;
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
      <PageHeader title="Project Profit Center" stats={[{ label: "Projects", value: projects.length }]} />
      <ProfitCenterView projects={projects} />
    </>
  );
}
