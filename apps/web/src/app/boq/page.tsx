import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { BoqProjectView } from "@/components/boq/boq-project-view";

export default function BoqPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading BOQ…" variant="default" />}>
        <BoqContent />
      </Suspense>
    </div>
  );
}

async function BoqContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="BOQ" />;
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

  const materials = await prisma.material.findMany({
    where: { deletedAt: null },
    orderBy: { code: "asc" },
    select: { id: true, code: true, name: true, unit: true },
  });

  const canEdit = hasPermission(role, PERM.ASSETS_MANAGE);

  return (
    <>
      <PageHeader
        title="Bill of Quantities"
        stats={[
          { label: "Projects", value: projects.length },
        ]}
      />
      <BoqProjectView projects={projects} materials={materials} canEdit={canEdit} />
    </>
  );
}
