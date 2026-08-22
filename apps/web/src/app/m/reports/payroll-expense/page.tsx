import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { Wallet, TrendingUp, Clock, CalendarDays, Calendar } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/reports/payroll-expense — mobile payroll expense report.
 * Shows monthly salary spend and comparative analysis by trade and crew.
 */
export default function MobilePayrollExpensePage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobilePayrollExpenseContent />
    </Suspense>
  );
}

async function MobilePayrollExpenseContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();

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

  if (periods.length === 0) {
    return (
      <MobileEmptyState
        icon={Wallet}
        title="No payroll in the last 12 months"
        hint="Payroll periods will appear here once processed"
      />
    );
  }

  const monthlyCsvColumns: MobileColumnSpec[] = [
    { key: "label", label: "Month" },
    { key: "gross", label: "Gross", format: "currency" },
    { key: "overtime", label: "Overtime", format: "currency" },
    { key: "deductions", label: "Deductions", format: "currency" },
    { key: "net", label: "Net", format: "currency" },
    { key: "employees", label: "Employees" },
  ];

  const tradeCsvColumns: MobileColumnSpec[] = [
    { key: "trade", label: "Trade" },
    { key: "gross", label: "Gross", format: "currency" },
    { key: "net", label: "Net", format: "currency" },
    { key: "employees", label: "Employees" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Payroll Expense"
        subtitle="Monthly salary spend by trade and crew"
        icon={Calendar}
        period="Last 12 months"
      />

      <MobileReportSummary
        items={[
          { label: "Total Gross", value: formatCurrency(totalGross) },
          { label: "Total Net", value: formatCurrency(totalNet), tone: "go" },
          { label: "Total Overtime", value: formatCurrency(totalOvertime), tone: "signal" },
          { label: "Periods", value: String(periods.length) },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Payroll Expense Report"
          rows={monthly as unknown as Record<string, unknown>[]}
          columns={monthlyCsvColumns}
          summary={`Gross: ${formatCurrency(totalGross)} · Net: ${formatCurrency(totalNet)} · OT: ${formatCurrency(totalOvertime)}`}
        />
      </div>

      {/* Monthly gross payroll — bar chart */}
      <MobileSectionTitle>Monthly Gross Payroll</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={monthly.map((m) => ({
            label: m.label,
            value: m.gross,
            tone: "signal" as const,
          }))}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* Monthly breakdown */}
      <MobileSectionTitle>Monthly Breakdown</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        {monthly.map((m) => (
          <MobileRow
            key={m.label}
            icon={CalendarDays}
            title={m.label}
            subtitle={`${m.employees} employees · Net ${formatCurrency(m.net)}`}
            meta={formatCurrency(m.gross)}
            metaSub={m.overtime > 0 ? `OT ${formatCurrency(m.overtime)}` : undefined}
            tone="default"
          />
        ))}
      </div>

      {/* By Trade */}
      {tradeRows.length > 0 && (
        <>
          <MobileSectionTitle>By Trade</MobileSectionTitle>
          <div className="mb-4">
            <MobileExportShareBar
              title="Payroll By Trade"
              rows={tradeRows as unknown as Record<string, unknown>[]}
              columns={tradeCsvColumns}
              summary={`${tradeRows.length} trades · Gross ${formatCurrency(tradeRows.reduce((s, t) => s + t.gross, 0))}`}
            />
          </div>
          <div className="flex flex-col gap-2 mb-4">
            {tradeRows.map((t) => (
              <MobileRow
                key={t.trade}
                icon={Wallet}
                title={t.trade}
                subtitle={`${t.employees} employee${t.employees > 1 ? "s" : ""} · Net ${formatCurrency(t.net)}`}
                meta={formatCurrency(t.gross)}
                tone="success"
              />
            ))}
          </div>
        </>
      )}

      {/* By Crew */}
      {crewRows.length > 0 && (
        <>
          <MobileSectionTitle>By Crew</MobileSectionTitle>
          <div className="flex flex-col gap-2">
            {crewRows.map((c) => (
              <MobileRow
                key={c.crew}
                icon={Wallet}
                title={c.crew}
                subtitle={`${c.employees} employee${c.employees > 1 ? "s" : ""} · Net ${formatCurrency(c.net)}`}
                meta={formatCurrency(c.gross)}
                tone="default"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
