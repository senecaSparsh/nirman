import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { CalendarCheck } from "lucide-react";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatNumber } from "@/lib/utils";
import { MobileEmptyState, MobileStatCard } from "@/components/mobile/v2/primitives";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobilePayrollList } from "./MobilePayrollList";
import { MobilePayrollFab } from "./MobileGeneratePayrollDialog";

/** Finance → Payroll tab: payroll periods. */
export default function BooksPayrollPage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <BooksPayrollContent />
    </Suspense>
  );
}

async function BooksPayrollContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.PAYROLL_VIEW)) notFound();
  const company = await getCompany();
  const canManage = hasPermission(role, PERM.PAYROLL_MANAGE);

  const periods = await prisma.payrollPeriod.findMany({
    where: { companyId: company.id },
    orderBy: [{ year: "desc" }, { month: "desc" }],
    take: 25,
    select: { id: true, month: true, year: true, status: true, totalNet: true, totalGross: true },
  });

  const draftCount = periods.filter((p) => p.status === "DRAFT").length;
  const paidCount = periods.filter((p) => p.status === "PAID").length;

  // Serialize for the client component (search by month/year + filter chips)
  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString("en-IN", { month: "short" });
  const serialized = periods.map((p) => ({
    id: p.id,
    month: p.month,
    year: p.year,
    monthLabel: `${monthName(p.month)} ${p.year}`,
    status: p.status,
    totalNet: toNum(p.totalNet),
    totalGross: toNum(p.totalGross),
  }));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2 mb-3">
        <MobileStatCard label="Draft" value={formatNumber(draftCount, 0)} icon={CalendarCheck} tone={draftCount > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="Paid" value={formatNumber(paidCount, 0)} icon={CalendarCheck} tone={paidCount > 0 ? "go" : "neutral"} />
      </div>

      <div className="mb-3">
        <MobileExportShareBar
          title="Payroll"
          rows={serialized as unknown as Record<string, unknown>[]}
          columns={[
            { key: "monthLabel", label: "Month" },
            { key: "status", label: "Status" },
            { key: "totalGross", label: "Gross", format: "currency" },
            { key: "totalNet", label: "Net", format: "currency" },
          ] as MobileColumnSpec[]}
          summary={`${serialized.length} payroll periods · ${paidCount} paid`}
        />
      </div>

      {periods.length === 0 ? (
        <MobileEmptyState
          icon={CalendarCheck}
          title="No payroll periods"
          hint={canManage ? "Tap + to generate payroll for a month" : "Payroll periods will appear here once generated"}
        />
      ) : (
        <MobilePayrollList items={serialized} />
      )}

      {canManage && <MobilePayrollFab />}
    </div>
  );
}
