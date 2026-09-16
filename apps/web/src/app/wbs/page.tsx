import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserScope, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { WbsView } from "@/components/wbs/wbs-view";

export default function WbsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading WBS…" variant="default" />}>
        <WbsContent />
      </Suspense>
    </div>
  );
}

async function WbsContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!__effPerms.includes(PERM.WBS_VIEW)) {
    return <NoAccess what="WBS" />;
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

  const canEdit = __effPerms.includes(PERM.WBS_MANAGE);

  return (
    <>
      <PageHeader
        title="Work Breakdown Structure"
        description="Decompose project scope into phases, deliverables, and work packages. Track progress and dependencies."
        stats={[{ label: "Projects", value: projects.length, hint: "Projects with a work breakdown structure available for decomposition into phases and work packages." }]}
      />
      <WbsView projects={projects} canEdit={canEdit} />
    </>
  );
}
