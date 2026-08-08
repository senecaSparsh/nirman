import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { WbsView } from "@/components/wbs/wbs-view";

export default function WbsPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading WBS…" variant="default" />}>
        <WbsContent />
      </Suspense>
    </div>
  );
}

async function WbsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="WBS" />;
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

  const canEdit = hasPermission(role, PERM.ASSETS_MANAGE);

  return (
    <>
      <PageHeader title="Work Breakdown Structure" stats={[{ label: "Projects", value: projects.length }]} />
      <WbsView projects={projects} canEdit={canEdit} />
    </>
  );
}
