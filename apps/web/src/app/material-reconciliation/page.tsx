import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { MaterialReconciliationView } from "@/components/material-reconciliation/reconciliation-view";

export default function MaterialReconciliationPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading reconciliation…" variant="default" />}>
        <ReconContent />
      </Suspense>
    </div>
  );
}

async function ReconContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="material reconciliation" />;
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
      <PageHeader title="Material Reconciliation" stats={[{ label: "Projects", value: projects.length }]} />
      <MaterialReconciliationView projects={projects} />
    </>
  );
}
