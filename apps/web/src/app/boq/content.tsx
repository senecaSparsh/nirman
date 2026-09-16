import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserScope, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { BoqProjectView } from "@/components/boq/boq-project-view";

export async function BoqContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!__effPerms.includes(PERM.BOQ_VIEW)) {
    return <NoAccess what="BOQ" />;
  }

  const projectScopeFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const projects = await prisma.project.findMany({
    take: 200,
    where: { companyId: company.id, deletedAt: null, ...projectScopeFilter },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, status: true },
  });

  const materials = await prisma.material.findMany({
    take: 200,
    where: { companyId: company.id, deletedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, unit: true },
  });

  const canEdit = __effPerms.includes(PERM.BOQ_MANAGE);

  return (
    <>
      <PageHeader
        title="Bill of Quantities"
        description="Itemized material, labour, and cost estimates per project. Build a hierarchical BOQ with sections, subsections, and line items."
        stats={[
          { label: "Projects", value: projects.length },
          { label: "Materials", value: materials.length },
        ]}
      />
      <BoqProjectView projects={projects} materials={materials} canEdit={canEdit} />
    </>
  );
}
