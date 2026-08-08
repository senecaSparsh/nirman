import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Users, CalendarCheck, Wallet, ClipboardList, UsersRound } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber, formatCurrency } from "@/lib/utils";
import { MobilePageHeader, MobileSectionTitle, MobileInfoRow, MobileEmptyState, MobileStatCard, MobileCta, MobileRefreshButton, MobileStatusBadge } from "@/components/mobile/mobile-primitives";

/** Ops → People tab: workforce overview. */
export default function CommandPeoplePage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <CommandPeopleContent />
    </Suspense>
  );
}

async function CommandPeopleContent() {
  await connection();
  const company = await getCompany();

  const [employeeCount, crews, recentDprs, payrollPeriods] = await Promise.all([
    prisma.employee.count({ where: { companyId: company.id, deletedAt: null } }),
    prisma.crew.findMany({ where: { companyId: company.id, active: true }, select: { id: true, name: true, _count: { select: { members: true } } }, take: 8, orderBy: { name: "asc" } }),
    prisma.dailyProgressReport.findMany({ where: { project: { companyId: company.id } }, orderBy: { date: "desc" }, take: 6, include: { project: { select: { name: true } } } }),
    prisma.payrollPeriod.findMany({ where: { companyId: company.id }, orderBy: [{ year: "desc" }, { month: "desc" }], take: 4, select: { id: true, month: true, year: true, status: true, totalNet: true } }),
  ]);

  const monthName = (m: number) => new Date(2000, m - 1, 1).toLocaleString("en-IN", { month: "short" });

  return (
    <div>
      <MobilePageHeader title="People" subtitle={`${employeeCount} employees`} right={<MobileRefreshButton />} />

      <div className="grid grid-cols-2 gap-2.5 p-4">
        <MobileStatCard label="Employees" value={formatNumber(employeeCount, 0)} icon={Users} />
        <MobileStatCard label="Crews" value={formatNumber(crews.length, 0)} icon={UsersRound} />
        <MobileStatCard label="Recent DPRs" value={formatNumber(recentDprs.length, 0)} icon={ClipboardList} />
        <MobileStatCard label="Payroll Periods" value={formatNumber(payrollPeriods.length, 0)} icon={Wallet} />
      </div>

      <MobileSectionTitle>Crews</MobileSectionTitle>
      {crews.length === 0 ? (
        <MobileEmptyState icon={UsersRound} title="No crews" />
      ) : (
        <div>
          {crews.map((c) => (
            <MobileInfoRow key={c.id} icon={UsersRound} title={c.name} value={`${c._count.members} members`} />
          ))}
        </div>
      )}

      <MobileSectionTitle>Recent DPRs</MobileSectionTitle>
      {recentDprs.length === 0 ? (
        <MobileEmptyState icon={ClipboardList} title="No DPRs submitted" />
      ) : (
        <div>
          {recentDprs.map((d) => (
            <MobileInfoRow key={d.id} icon={ClipboardList} title={d.project.name} subtitle={d.date.toDateString()} value={`${toNum(d.progressPct)}%`} />
          ))}
        </div>
      )}

      <MobileSectionTitle>Payroll</MobileSectionTitle>
      {payrollPeriods.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No payroll periods" />
      ) : (
        <div>
          {payrollPeriods.map((p) => (
            <MobileInfoRow key={p.id} icon={Wallet} title={`${monthName(p.month)} ${p.year}`} value={formatCurrency(toNum(p.totalNet))} badge={<MobileStatusBadge status={p.status} />} />
          ))}
        </div>
      )}

      <div className="px-4 pb-4 pt-2">
        <MobileCta href="/m/attendance" icon={CalendarCheck} variant="outline">
          Attendance
        </MobileCta>
      </div>
    </div>
  );
}
