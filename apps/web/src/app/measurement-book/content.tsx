import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserScope, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { NoAccess } from "@/components/no-access";
import { MeasurementBookView } from "@/components/measurement-book/mb-view";

export async function MbContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!__effPerms.includes(PERM.MB_VIEW)) {
    return <NoAccess what="measurement book" />;
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

  const canCreate = __effPerms.includes(PERM.MB_VERIFY);
  const canVerify = __effPerms.includes(PERM.MB_VERIFY);
  const canApprove = __effPerms.includes(PERM.MB_APPROVE);

  return (
    <>
      <PageHeader
        title="Measurement Book"
        stats={[
          { label: "Projects", value: projects.length },
        ]}
      />
      <MeasurementBookView projects={projects} canCreate={canCreate} canVerify={canVerify} canApprove={canApprove} />
    </>
  );
}
