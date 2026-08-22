import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { getJobCosting } from "@nirman/services";
import { Calculator, TrendingDown, Wallet, Building2 } from "lucide-react";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
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
 * /m/reports/job-costing — mobile job costing report.
 * Direct vs indirect cost breakdown per project.
 */
export default function MobileJobCostingPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileJobCostingContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileJobCostingContent({
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
    return <MobileEmptyState icon={Calculator} title="No projects" hint="Create a project to see job costing" />;
  }

  const selectedId = projectId ?? projects[0]!.id;
  const selected = projects.find((p) => p.id === selectedId) ?? projects[0]!;
  const jc = await getJobCosting(selected.id);

  const direct = {
    materials: jc.directCosts.materials.toNumber(),
    labour: jc.directCosts.labour.toNumber(),
    subcontractor: jc.directCosts.subcontractor.toNumber(),
    equipment: jc.directCosts.equipment.toNumber(),
    total: jc.directCosts.total.toNumber(),
  };
  const indirect = {
    overhead: jc.indirectCosts.overhead.toNumber(),
    adminAllocated: jc.indirectCosts.adminAllocated.toNumber(),
    total: jc.indirectCosts.total.toNumber(),
  };
  const totalCost = jc.totalCost.toNumber();
  const overheadRate = jc.absorbedOverheadRate.toNumber();

  const csvColumns: MobileColumnSpec[] = [
    { key: "category", label: "Category" },
    { key: "materials", label: "Materials", format: "currency" },
    { key: "labour", label: "Labour", format: "currency" },
    { key: "subcontractor", label: "Subcontractor", format: "currency" },
    { key: "equipment", label: "Equipment", format: "currency" },
    { key: "total", label: "Total", format: "currency" },
  ];

  const csvRows = [
    {
      category: "Direct Costs",
      materials: direct.materials,
      labour: direct.labour,
      subcontractor: direct.subcontractor,
      equipment: direct.equipment,
      total: direct.total,
    },
    {
      category: "Indirect Costs",
      materials: 0,
      labour: 0,
      subcontractor: 0,
      equipment: 0,
      total: indirect.total,
    },
  ];

  return (
    <div>
      <MobileReportHeader
        title="Job Costing"
        subtitle="Direct vs indirect cost breakdown"
        icon={Calculator}
        period={selected.name}
      />

      {/* Project selector */}
      <div className="flex gap-1.5 overflow-x-auto pb-2 mb-2" style={{ scrollbarWidth: "none" }}>
        {projects.map((p) => (
          <a
            key={p.id}
            href={`/m/reports/job-costing?project=${p.id}`}
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

      <MobileReportSummary
        items={[
          { label: "Direct Costs", value: formatCurrency(direct.total) },
          { label: "Indirect Costs", value: formatCurrency(indirect.total) },
          { label: "Total Cost", value: formatCurrency(totalCost) },
          { label: "OH Rate", value: `${overheadRate.toFixed(1)}%` },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Job Costing Report"
          rows={csvRows as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Project: ${selected.name} · Direct: ${formatCurrency(direct.total)} · Indirect: ${formatCurrency(indirect.total)} · Total: ${formatCurrency(totalCost)}`}
        />
      </div>

      {/* Direct vs indirect cost breakdown — bar chart */}
      <MobileSectionTitle>Direct vs Indirect Costs</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={[
            { label: "Materials", value: direct.materials, tone: "signal" as const },
            { label: "Labour", value: direct.labour, tone: "signal" as const },
            { label: "Subcontractor", value: direct.subcontractor, tone: "signal" as const },
            { label: "Equipment", value: direct.equipment, tone: "signal" as const },
            { label: "Overhead", value: indirect.overhead, tone: "stop" as const },
            { label: "Admin Allocated", value: indirect.adminAllocated, tone: "stop" as const },
          ]}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      <MobileSectionTitle>Direct Costs</MobileSectionTitle>
      <div className="flex flex-col gap-2 mb-4">
        <MobileRow icon={Building2} title="Materials" meta={formatCurrency(direct.materials)} tone="danger" />
        <MobileRow icon={Wallet} title="Labour" meta={formatCurrency(direct.labour)} tone="danger" />
        <MobileRow icon={Wallet} title="Subcontractor" meta={formatCurrency(direct.subcontractor)} tone="danger" />
        <MobileRow icon={Wallet} title="Equipment" meta={formatCurrency(direct.equipment)} tone="danger" />
      </div>

      <MobileSectionTitle>Indirect Costs</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        <MobileRow icon={Wallet} title="Overhead" meta={formatCurrency(indirect.overhead)} tone="danger" />
        <MobileRow icon={Wallet} title="Admin Allocated" meta={formatCurrency(indirect.adminAllocated)} tone="danger" />
      </div>
    </div>
  );
}
