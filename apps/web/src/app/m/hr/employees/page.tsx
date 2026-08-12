import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Users } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
} from "@/components/mobile/v2/primitives";
import { MobileEmployeesList } from "./MobileEmployeesList";

/**
 * /m/hr/employees — mobile workforce roster. Managers need to see who's
 * on the books, their trade, wage rate, and current project assignment.
 */
export default function MobileEmployeesPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileEmployeesContent />
    </Suspense>
  );
}

async function MobileEmployeesContent() {
  await connection();
  const company = await getCompany();

  const employees = await prisma.employee.findMany({
    where: { companyId: company.id, active: true },
    orderBy: { name: "asc" },
    take: 100,
    select: {
      id: true,
      name: true,
      trade: true,
      phone: true,
      dailyRate: true,
      wageType: true,
      monthlySalary: true,
      designation: true,
      activeProject: { select: { name: true } },
    },
  });

  const trades = [...new Set(employees.map((e) => e.trade).filter(Boolean))];
  const dailyWorkers = employees.filter((e) => e.wageType === "DAILY");
  const monthlyStaff = employees.filter((e) => e.wageType !== "DAILY");
  const totalMonthlyCost = monthlyStaff.reduce(
    (s, e) => s + toNum(e.monthlySalary ?? 0),
    0,
  );

  // Serialize for the client component (search + filter chips + badges)
  const serialized = employees.map((e) => ({
    id: e.id,
    name: e.name,
    trade: e.trade ?? null,
    designation: e.designation ?? null,
    phone: e.phone ?? null,
    dailyRate: e.dailyRate?.toString() ?? null,
    monthlySalary: e.monthlySalary?.toString() ?? null,
    wageType: e.wageType,
    activeProjectName: e.activeProject?.name ?? null,
  }));

  return (
    <div>
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <MobileStatCard label="Daily Workers" value={String(dailyWorkers.length)} icon={Users} />
        <MobileStatCard label="Monthly Staff" value={String(monthlyStaff.length)} icon={Users} />
        <MobileStatCard
          label="Monthly Cost"
          value={formatCurrency(totalMonthlyCost)}
          icon={Users}
          tone="neutral"
        />
        <MobileStatCard label="Trades" value={String(trades.length)} icon={Users} />
      </div>

      <MobileEmployeesList items={serialized} />

      {employees.length === 0 && (
        <>
          <MobileSectionTitle>By Trade</MobileSectionTitle>
          <MobileEmptyState
            icon={Users}
            title="No employees"
            hint="Add employees from the desktop People section"
          />
        </>
      )}
    </div>
  );
}
