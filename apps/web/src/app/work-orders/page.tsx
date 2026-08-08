import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { WorkOrdersView } from "@/components/work-orders/work-orders-view";

export default function WorkOrdersPage() {
  return (
    <div className="space-y-5">
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

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="work orders" />;
  }

  const workOrders = await prisma.subcontractorWorkOrder.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    include: {
      subcontractor: { select: { name: true, trade: true } },
      project: { select: { name: true } },
      _count: { select: { raBills: true, lines: true } },
    },
  });

  const canCreate = hasPermission(role, PERM.ASSETS_MANAGE);

  const rows = workOrders.map((wo) => ({
    id: wo.id,
    workOrderNumber: wo.workOrderNumber,
    workTitle: wo.workTitle,
    status: wo.status,
    retentionPct: toNum(wo.retentionPct),
    tdsPct: toNum(wo.tdsPct),
    tdsCategory: wo.tdsCategory,
    advanceAmount: toNum(wo.advanceAmount),
    advanceRecoveryPct: toNum(wo.advanceRecoveryPct),
    totalWorkDone: toNum(wo.totalWorkDone),
    totalDeductions: toNum(wo.totalDeductions),
    totalPaid: toNum(wo.totalPaid),
    retentionBalance: toNum(wo.retentionBalance),
    startDate: wo.startDate?.toISOString() ?? null,
    endDate: wo.endDate?.toISOString() ?? null,
    subcontractor: wo.subcontractor,
    project: wo.project,
    _count: wo._count,
  }));

  return (
    <>
      <PageHeader
        title="Subcontractor Work Orders"
        stats={[
          { label: "Total", value: workOrders.length },
          { label: "Active", value: workOrders.filter((w) => w.status === "ACTIVE").length },
          { label: "Retention Held", value: formatCurrency(workOrders.reduce((s, w) => s + Number(w.retentionBalance), 0)) },
        ]}
      />
      <WorkOrdersView workOrders={rows} canCreate={canCreate} />
    </>
  );
}
