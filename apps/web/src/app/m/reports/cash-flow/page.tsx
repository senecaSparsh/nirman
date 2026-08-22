import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getCashFlowForecast } from "@nirman/services";
import { TrendingUp, TrendingDown, Wallet, Calendar } from "lucide-react";
import { getCompany, toNum, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
} from "@/components/mobile/v2/primitives";
import { MobileReportHeader, MobileReportSummary, MobileBarChart } from "@/components/mobile/v2/report-ui";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

/**
 * /m/reports/cash-flow — mobile cash flow forecast.
 * Shows inflows vs outflows per project.
 */
export default function MobileCashFlowPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileCashFlowContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileCashFlowContent({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.FINANCE_VIEW)) notFound();
  const company = await getCompany();
  const scope = await getUserScope();
  const { project: projectId } = await searchParams;

  const projectScopeFilter =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? { id: { in: scope.projectIds } }
      : {};

  const projects = await prisma.project.findMany({
    where: { companyId: company.id, deletedAt: null, ...projectScopeFilter },
    orderBy: { name: "asc" },
    select: { id: true, name: true },
  });

  if (projects.length === 0) {
    return <MobileEmptyState icon={Wallet} title="No projects" hint="Create a project to see cash flow forecast" />;
  }

  const selectedId = projectId ?? projects[0]!.id;
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0]!;
  const cf = await getCashFlowForecast(selected.id);

  const totalInflow = cf.inflows.totalInflow.toNumber();
  const totalOutflow = cf.outflows.totalOutflow.toNumber();
  const netCashFlow = cf.netCashFlow.toNumber();
  const scheduledPayments = cf.inflows.scheduledPayments.map((p) => ({ ...p, amount: p.amount.toNumber() }));

  const csvColumns: MobileColumnSpec[] = [
    { key: "customerName", label: "Customer" },
    { key: "unitName", label: "Unit" },
    { key: "amount", label: "Amount", format: "currency" },
    { key: "dueDate", label: "Due Date", format: "date" },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Cash Flow Forecast"
        subtitle={`Inflows vs outflows for ${selected.name}`}
        icon={Wallet}
        period="Current"
      />

      <MobileReportSummary
        items={[
          { label: "Inflows", value: formatCurrency(totalInflow), tone: "go" },
          { label: "Outflows", value: formatCurrency(totalOutflow), tone: "stop" },
          { label: "Net Cash", value: formatCurrency(netCashFlow), tone: netCashFlow >= 0 ? "go" : "stop" },
          { label: "Scheduled", value: String(scheduledPayments.length) },
        ]}
      />

      {/* Project selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2" style={{ scrollbarWidth: "none" }}>
        {projects.map((p) => (
          <a
            key={p.id}
            href={`/m/reports/cash-flow?project=${p.id}`}
            className="shrink-0 rounded-full border px-3 py-1.5 text-[0.625rem] font-semibold press"
            style={{
              borderColor: p.id === selected.id ? "var(--color-ink-950)" : "var(--color-line)",
              backgroundColor: p.id === selected.id ? "var(--color-ink-950)" : "var(--color-paper)",
              color: p.id === selected.id ? "#fff" : "var(--color-ink-700)",
            }}
          >
            {p.name}
          </a>
        ))}
      </div>

      <div className="mb-4">
        <MobileExportShareBar
          title="Cash Flow Forecast"
          rows={scheduledPayments as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Inflows: ${formatCurrency(totalInflow)} · Outflows: ${formatCurrency(totalOutflow)} · Net: ${formatCurrency(netCashFlow)}`}
        />
      </div>

      {/* Inflows vs Outflows — bar chart */}
      <MobileSectionTitle>Inflows vs Outflows</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={[
            { label: "Inflows", value: totalInflow, tone: "go" as const },
            { label: "Outflows", value: totalOutflow, tone: "stop" as const },
            { label: "Net Cash", value: netCashFlow, tone: netCashFlow >= 0 ? ("go" as const) : ("stop" as const) },
          ]}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* Outflow breakdown */}
      <MobileSectionTitle>Outflows</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        <MobileRow icon={TrendingDown} title="Commitments" meta={formatCurrency(cf.outflows.commitments.toNumber())} tone="danger" />
        <MobileRow icon={Calendar} title="Pending RA Bills" meta={formatCurrency(cf.outflows.pendingRaBills.toNumber())} tone="danger" />
        <MobileRow icon={Wallet} title="Payroll Due" meta={formatCurrency(cf.outflows.payrollDue.toNumber())} tone="danger" />
      </div>

      {/* Scheduled payments */}
      {scheduledPayments.length > 0 && (
        <>
          <MobileSectionTitle>Scheduled Payments</MobileSectionTitle>
          <div className="flex flex-col gap-2">
            {scheduledPayments.slice(0, 20).map((p, i) => (
              <MobileRow
                key={`${p.assetSaleId}-${i}`}
                icon={TrendingUp}
                title={p.customerName}
                subtitle={`${p.unitName} · ${formatDate(p.dueDate)}`}
                meta={formatCurrency(p.amount)}
                tone="success"
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
