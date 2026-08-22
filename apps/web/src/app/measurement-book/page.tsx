import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { MeasurementBookView } from "@/components/measurement-book/mb-view";

export default function MeasurementBookPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading measurement book…" variant="default" />}>
        <MbContent />
      </Suspense>
    </div>
  );
}

async function MbContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="measurement book" />;
  }

  const projectScopeFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null, ...projectScopeFilter },
    orderBy: { name: "asc" },
    select: { id: true, name: true, type: true, status: true },
  });

  const canCreate = hasPermission(role, PERM.STOCK_ISSUE);

  return (
    <>
      <PageHeader
        title="Measurement Book"
        stats={[
          { label: "Projects", value: projects.length },
        ]}
      />
      <MeasurementBookView projects={projects} canCreate={canCreate} />
    </>
  );
}
