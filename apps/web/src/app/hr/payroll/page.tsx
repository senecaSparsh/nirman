import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { PageHeader } from "@/components/page-header";
import { PayrollView } from "@/components/hr/payroll-view";

import { NoAccess } from "@/components/no-access";
export default function PayrollPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading payroll…" variant="list" />}>
      <PayrollContent />
    </Suspense>
  );
}

async function PayrollContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.PAYROLL_VIEW)) {
    return (
      <NoAccess what="payroll" permission={PERM.PAYROLL_VIEW} />
    );
  }

  const perms = {
    canManage: __effPerms.includes(PERM.PAYROLL_MANAGE),
  };

  const periods = await prisma.payrollPeriod.findMany({
    take: 500,
    where: {
      companyId: company.id,
      // Same horizon as generatePayroll — far-future drafts from tests/typos
      // must not bury the current period at the top of the list.
      year: { lte: new Date().getFullYear() + 1 },
    },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    include: {
      _count: { select: { lines: true } },
      processedBy: { select: { name: true } },
    },
  });

  const rows = periods.map((p) => ({
    id: p.id,
    month: p.month,
    year: p.year,
    startDate: p.startDate.toISOString(),
    endDate: p.endDate.toISOString(),
    status: p.status,
    totalGross: toNum(p.totalGross),
    totalOvertime: toNum(p.totalOvertime),
    totalDeductions: toNum(p.totalDeductions),
    totalNet: toNum(p.totalNet),
    employeeCount: p._count.lines,
    processedByName: p.processedBy?.name ?? null,
    processedAt: p.processedAt?.toISOString() ?? null,
    paidAt: p.paidAt?.toISOString() ?? null,
  }));

  return (
    <>
      <PageHeader
        title="Payroll"
        description="Process payroll periods, calculate gross/deductions/net, and track payment status."
        stats={[
          { label: "Periods", value: periods.length },
        ]}
      />
      <PayrollView periods={rows} permissions={perms} />
    </>
  );
}
