import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { ChangeOrdersView } from "@/components/change-orders/change-orders-view";

export default function ChangeOrdersPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading change orders…" variant="default" />}>
        <CoContent />
      </Suspense>
    </div>
  );
}

async function CoContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="change orders" />;
  }

  const projectScopeFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const [projects, changeOrders] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null, ...projectScopeFilter },
      orderBy: { name: "asc" },
      select: { id: true, name: true, type: true, status: true },
    }),
    prisma.changeOrder.findMany({
      where: { companyId: company.id },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        project: { select: { id: true, name: true } },
        phase: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
  ]);

  const canManage = hasPermission(role, PERM.WO_MANAGE);

  const serialized = changeOrders.map((c) => ({
    id: c.id,
    changeOrderNo: c.changeOrderNo,
    title: c.title,
    type: c.type,
    reason: c.reason,
    status: c.status,
    projectName: c.project.name,
    phaseName: c.phase?.name ?? null,
    lineCount: c._count.lines,
    costDelta: toNum(c.costDelta),
    scheduleDeltaDays: c.scheduleDeltaDays,
    createdAt: c.createdAt.toISOString(),
  }));

  return (
    <>
      <PageHeader
        title="Change Orders"
        description="Formal modifications to project scope, BOQ, budget, and schedule — with approval workflow and impact analysis."
        stats={[
          { label: "Total", value: serialized.length },
          { label: "Pending", value: serialized.filter((c) => c.status === "SUBMITTED").length },
          { label: "Approved", value: serialized.filter((c) => c.status === "APPROVED" || c.status === "IMPLEMENTED").length },
        ]}
      />
      <ChangeOrdersView
        changeOrders={serialized}
        projects={projects}
        canManage={canManage}
      />
    </>
  );
}
