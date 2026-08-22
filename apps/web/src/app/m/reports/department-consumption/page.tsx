import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import { prisma } from "@nirman/db";
import { Building2, Boxes, Package, ClipboardList, PieChart } from "lucide-react";
import { getCompany, toNum, getUserRole, getUserScope } from "@/lib/server";
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
 * /m/reports/department-consumption — mobile cost-centre consumption report.
 * Department-wise raw-material consumption for the current financial year,
 * with top materials consumed per department. DEPARTMENT-scoped users only see
 * their assigned departments.
 */
export default function MobileDepartmentConsumptionPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileDepartmentConsumptionContent />
    </Suspense>
  );
}

async function MobileDepartmentConsumptionContent() {
  await connection();
  const role = await getUserRole();
  if (!hasPermission(role, PERM.INVENTORY_VIEW)) notFound();
  const company = await getCompany();

  // Current financial year (Apr 1 → now)
  const now = new Date();
  const fromDate = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const toDate = new Date(now);
  toDate.setHours(23, 59, 59, 999);

  // Hierarchical RBAC: a DEPARTMENT-scoped user (Sub-Admin) only sees
  // consumption for their assigned departments.
  const scope = await getUserScope();
  const deptFilter =
    scope.scopeType === "DEPARTMENT" && scope.departmentIds.length > 0
      ? { departmentId: { in: scope.departmentIds } }
      : {};

  const issues = await prisma.materialIssue.findMany({
    where: {
      department: { companyId: company.id, deletedAt: null },
      departmentId: { not: null },
      issueDate: { gte: fromDate, lte: toDate },
      ...deptFilter,
    },
    include: {
      department: { select: { id: true, code: true, name: true } },
      lines: {
        include: {
          material: {
            select: {
              id: true,
              code: true,
              name: true,
              unit: true,
              category: { select: { name: true } },
            },
          },
        },
      },
    },
    orderBy: { issueDate: "asc" },
  });

  // Aggregate by department × material
  type Cell = { qty: number; cost: number };
  const byDepartment = new Map<
    string,
    {
      code: string;
      name: string;
      total: number;
      totalQty: number;
      materials: Map<string, { code: string; name: string; unit: string; categoryName: string; cell: Cell }>;
    }
  >();
  let grandTotal = 0;
  let grandQty = 0;
  const materialIds = new Set<string>();
  let issueCount = 0;

  for (const issue of issues) {
    const dept = issue.department!;
    issueCount += 1;
    if (!byDepartment.has(dept.id)) {
      byDepartment.set(dept.id, { code: dept.code, name: dept.name, total: 0, totalQty: 0, materials: new Map() });
    }
    const deptRow = byDepartment.get(dept.id)!;
    for (const line of issue.lines) {
      const mat = line.material;
      materialIds.add(mat.id);
      if (!deptRow.materials.has(mat.id)) {
        deptRow.materials.set(mat.id, {
          code: mat.code,
          name: mat.name,
          unit: mat.unit,
          categoryName: mat.category.name,
          cell: { qty: 0, cost: 0 },
        });
      }
      const entry = deptRow.materials.get(mat.id)!;
      const lineQty = toNum(line.qty);
      const lineCost = lineQty * toNum(line.unitCost);
      entry.cell.qty += lineQty;
      entry.cell.cost += lineCost;
      deptRow.total += lineCost;
      deptRow.totalQty += lineQty;
      grandTotal += lineCost;
      grandQty += lineQty;
    }
  }

  const departments = Array.from(byDepartment.values())
    .map((d) => ({
      code: d.code,
      name: d.name,
      total: d.total,
      totalQty: d.totalQty,
      materials: Array.from(d.materials.values())
        .map((m) => ({
          code: m.code,
          name: m.name,
          unit: m.unit,
          categoryName: m.categoryName,
          qty: m.cell.qty,
          cost: m.cell.cost,
        }))
        .sort((a, b) => b.cost - a.cost),
    }))
    .sort((a, b) => b.total - a.total);

  if (departments.length === 0) {
    return (
      <MobileEmptyState
        icon={Building2}
        title="No department consumption this year"
        hint="Material issues to cost centres for the current financial year will appear here"
      />
    );
  }

  const chartData = departments.map((d) => ({
    label: `${d.code} — ${d.name}`,
    value: d.total,
    tone: "go" as const,
  }));

  const csvColumns: MobileColumnSpec[] = [
    { key: "department", label: "Department" },
    { key: "totalQty", label: "Total Qty", format: "number" },
    { key: "total", label: "Total Value", format: "currency" },
    { key: "materialCount", label: "Material Count", format: "number" },
    { key: "topMaterial", label: "Top Material" },
  ];

  const csvRows = departments.map((d) => ({
    department: `${d.code} — ${d.name}`,
    totalQty: d.totalQty,
    total: d.total,
    materialCount: d.materials.length,
    topMaterial: d.materials[0] ? `${d.materials[0].name} (${formatCurrency(d.materials[0].cost)})` : "—",
  }));

  return (
    <div>
      <MobileReportHeader
        title="Dept Consumption"
        subtitle="Material usage by cost centre for the current financial year"
        icon={PieChart}
        period="FY 2025-26"
      />

      <MobileReportSummary
        items={[
          { label: "Grand Total", value: formatCurrency(grandTotal), tone: "go" },
          { label: "Departments", value: String(departments.length) },
          { label: "Materials", value: String(materialIds.size), tone: "signal" },
          { label: "Issues", value: String(issueCount) },
        ]}
      />

      <div className="mb-4">
        <MobileExportShareBar
          title="Dept Consumption Report"
          rows={csvRows as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`Total: ${formatCurrency(grandTotal)} · ${departments.length} depts · ${issueCount} issues`}
        />
      </div>

      {/* Consumption value by department — bar chart */}
      <MobileSectionTitle>Consumption by Department</MobileSectionTitle>
      <div className="mb-4">
        <MobileBarChart
          data={chartData}
          formatValue={(v) => formatCurrency(v)}
        />
      </div>

      {/* By department */}
      <MobileSectionTitle>By Department</MobileSectionTitle>
      <div className="flex flex-col gap-2">
        {departments.map((d) => (
          <div key={d.code + d.name} className="flex flex-col gap-1.5">
            <MobileRow
              icon={Building2}
              title={`${d.code} — ${d.name}`}
              subtitle={`${d.materials.length} material${d.materials.length > 1 ? "s" : ""}`}
              meta={formatCurrency(d.total)}
              metaSub="Total cost"
              tone="success"
            />
            {/* Top 3 materials consumed */}
            <div className="flex flex-col gap-1 pl-9">
              {d.materials.slice(0, 3).map((m) => (
                <MobileRow
                  key={m.code + m.name}
                  icon={Package}
                  title={m.name}
                  subtitle={`${m.qty} ${m.unit} · ${m.categoryName}`}
                  meta={formatCurrency(m.cost)}
                  tone="default"
                />
              ))}
              {d.materials.length > 3 && (
                <p className="text-[0.625rem] pl-1" style={{ color: "var(--color-ink-500)" }}>
                  +{d.materials.length - 3} more material{d.materials.length - 3 > 1 ? "s" : ""}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
