import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserScope, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { NoAccess } from "@/components/no-access";
import { MaterialReconciliationView } from "@/components/material-reconciliation/reconciliation-view";

export async function ReconContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!__effPerms.includes(PERM.PROJECT_CONTROL_VIEW)) {
    return <NoAccess what="material reconciliation" permission={PERM.PROJECT_CONTROL_VIEW} />;
  }

  const projectScopeFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const projects = await prisma.project.findMany({
    take: 200,
    where: { companyId: company.id, deletedAt: null, ...projectScopeFilter },
    orderBy: [{ boqItems: { _count: "desc" } }, { name: "asc" }],
    select: { id: true, name: true },
  });

  return (
    <>
      <PageHeader
        title="Material Reconciliation"
        description="Compare BOQ required quantities against issued, consumed (Measurement Book), and on-hand stock — with wastage tolerance flags per project."
        stats={[{ label: "Projects", value: projects.length }]}
      />
      <MaterialReconciliationView projects={projects} />
    </>
  );
}
