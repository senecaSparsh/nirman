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
    return <NoAccess what="material reconciliation" />;
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
      <PageHeader title="Material Reconciliation" stats={[{ label: "Projects", value: projects.length }]} />
      <MaterialReconciliationView projects={projects} />
    </>
  );
}
