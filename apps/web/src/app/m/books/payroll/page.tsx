import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { CalendarCheck } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobilePayrollList } from "./MobilePayrollList";

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
  const company = await getCompany();

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
      <MobilePageHeader
        title="Payroll"
        subtitle={`${periods.length} periods`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-3 gap-2 p-3">
        <MobileStatCard label="Total Periods" value={formatNumber(periods.length, 0)} icon={CalendarCheck} />
        <MobileStatCard label="Draft" value={formatNumber(draftCount, 0)} icon={CalendarCheck} tone={draftCount > 0 ? "warning" : "default"} />
        <MobileStatCard label="Paid" value={formatNumber(paidCount, 0)} icon={CalendarCheck} tone={paidCount > 0 ? "success" : "default"} />
      </div>

      {periods.length === 0 ? (
        <MobileEmptyState icon={CalendarCheck} title="No payroll periods" hint="Generate payroll from the desktop HR section" />
      ) : (
        <MobilePayrollList items={serialized} />
      )}
    </div>
  );
}
