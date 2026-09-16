import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserScope, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { WorkOrdersView } from "@/components/work-orders/work-orders-view";

export async function WoContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!__effPerms.includes(PERM.ASSETS_VIEW)) {
    return <NoAccess what="work orders" />;
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

  const canCreate = __effPerms.includes(PERM.ASSETS_MANAGE);
  const permissions = {
    canManage: __effPerms.includes(PERM.WO_MANAGE),
    canSubmit: __effPerms.includes(PERM.RA_SUBMIT),
    canApprove: __effPerms.includes(PERM.RA_APPROVE),
    canPay: __effPerms.includes(PERM.RA_PAY),
  };

  return (
    <>
      <PageHeader
        title="Work Orders"
        description="Subcontractor work orders, running-account bills, and payment certificates. Track work done, deductions, and certify payments."
        stats={[{ label: "Projects", value: projects.length, hint: "Projects available for subcontractor work orders and running-account billing." }]}
      />
      <WorkOrdersView projects={projects} canCreate={canCreate} permissions={permissions} />
    </>
  );
}
