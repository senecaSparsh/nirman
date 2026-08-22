import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { WorkOrdersView } from "@/components/work-orders/work-orders-view";

export default function WorkOrdersPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading work orders…" variant="default" />}>
        <WoContent />
      </Suspense>
    </div>
  );
}

async function WoContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="work orders" />;
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

  const canCreate = hasPermission(role, PERM.ASSETS_MANAGE);
  const permissions = {
    canManage: hasPermission(role, PERM.WO_MANAGE),
    canSubmit: hasPermission(role, PERM.RA_SUBMIT),
    canApprove: hasPermission(role, PERM.RA_APPROVE),
    canPay: hasPermission(role, PERM.RA_PAY),
  };

  return (
    <>
      <PageHeader
        title="Work Orders"
        description="Subcontractor work orders, running-account bills, and payment certificates. Track work done, deductions, and certify payments."
        stats={[{ label: "Projects", value: projects.length }]}
      />
      <WorkOrdersView projects={projects} canCreate={canCreate} permissions={permissions} />
    </>
  );
}
