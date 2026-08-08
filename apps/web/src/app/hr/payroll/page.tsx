import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
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
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PAYROLL_VIEW)) {
    return (
      <NoAccess what="payroll" />
    );
  }

  const perms = {
    canManage: hasPermission(role, PERM.PAYROLL_MANAGE),
  };

  const periods = await prisma.payrollPeriod.findMany({
    where: { companyId: company.id },
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

  return <PayrollView periods={rows} permissions={perms} />;
}
