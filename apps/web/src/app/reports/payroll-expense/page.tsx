import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { PayrollExpenseReport } from "@/components/reports/payroll-expense-report";

import { NoAccess } from "@/components/no-access";
export default function PayrollExpensePage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading payroll expense…" variant="cards" />}>
        <PayrollExpenseContent />
      </Suspense>
    </div>
  );
}

async function PayrollExpenseContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return (
      <NoAccess what="the labour cost report" />
    );
  }

  // Last 12 months of payroll periods
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - 11, 1);

  const periods = await prisma.payrollPeriod.findMany({
    where: {
      companyId: company.id,
      startDate: { gte: from },
    },
    include: {
      lines: {
        include: {
          employee: { select: { id: true, name: true, trade: true, crewId: true, crew: { select: { name: true } } } },
        },
      },
    },
    orderBy: [{ year: "asc" }, { month: "asc" }],
  });

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  // Monthly totals
  const monthly = periods.map((p) => ({
    label: `${MONTHS[p.month - 1]} ${String(p.year).slice(2)}`,
    gross: toNum(p.totalGross),
    overtime: toNum(p.totalOvertime),
    deductions: toNum(p.totalDeductions),
    net: toNum(p.totalNet),
    employees: p.lines.length,
    status: p.status,
  }));

  // Comparative analysis — by trade (department equivalent)
  const byTrade = new Map<string, { trade: string; gross: number; net: number; employees: Set<string> }>();
  for (const p of periods) {
    for (const line of p.lines) {
      const trade = line.employee.trade ?? "Unassigned";
      if (!byTrade.has(trade)) byTrade.set(trade, { trade, gross: 0, net: 0, employees: new Set() });
      const row = byTrade.get(trade)!;
      row.gross += toNum(line.basicAmount) + toNum(line.overtimeAmount);
      row.net += toNum(line.netPay);
      row.employees.add(line.employee.id);
    }
  }
  const tradeRows = Array.from(byTrade.values())
    .map((r) => ({ trade: r.trade, gross: r.gross, net: r.net, employees: r.employees.size }))
    .sort((a, b) => b.gross - a.gross);

  // By crew
  const byCrew = new Map<string, { crew: string; gross: number; net: number; employees: Set<string> }>();
  for (const p of periods) {
    for (const line of p.lines) {
      const crew = line.employee.crew?.name ?? "No crew";
      if (!byCrew.has(crew)) byCrew.set(crew, { crew, gross: 0, net: 0, employees: new Set() });
      const row = byCrew.get(crew)!;
      row.gross += toNum(line.basicAmount) + toNum(line.overtimeAmount);
      row.net += toNum(line.netPay);
      row.employees.add(line.employee.id);
    }
  }
  const crewRows = Array.from(byCrew.values())
    .map((r) => ({ crew: r.crew, gross: r.gross, net: r.net, employees: r.employees.size }))
    .sort((a, b) => b.gross - a.gross);

  const totalGross = monthly.reduce((s, m) => s + m.gross, 0);
  const totalNet = monthly.reduce((s, m) => s + m.net, 0);
  const totalOvertime = monthly.reduce((s, m) => s + m.overtime, 0);

  return (
    <>
      <PageHeader
        title="Payroll Expense"
        description="Monthly salary spend and comparative analysis by trade and crew — workforce cost over the last 12 months."
        stats={[
          { label: "Gross (12mo)", value: formatCurrency(totalGross) },
          { label: "Net (12mo)", value: formatCurrency(totalNet) },
          { label: "Overtime", value: formatCurrency(totalOvertime) },
          { label: "Periods", value: periods.length },
        ]}
      />
      <PayrollExpenseReport
        monthly={monthly}
        tradeRows={tradeRows}
        crewRows={crewRows}
        totalGross={totalGross}
        totalNet={totalNet}
        totalOvertime={totalOvertime}
      />
    </>
  );
}
