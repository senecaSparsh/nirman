import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole, getUserScope } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { DepartmentConsumptionReport } from "@/components/reports/department-consumption-report";

import { NoAccess } from "@/components/no-access";
export default function DepartmentConsumptionPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading consumption report…" variant="list" />}>
        <ReportContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function ReportContent({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const { from: fromParam, to: toParam } = await searchParams;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    return (
      <NoAccess what="the cost centres report" />
    );
  }

  // Default to current financial year (Apr 1 → Mar 31) if no range given
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1); // Apr 1
  const fromDate = fromParam ? new Date(fromParam) : fyStart;
  const toDate = toParam ? new Date(toParam) : now;
  toDate.setHours(23, 59, 59, 999);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  const dateFilter = {
    issueDate: { gte: fromDate, lte: toDate },
  };

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
      ...dateFilter,
      ...deptFilter,
    },
    include: {
      department: { select: { id: true, code: true, name: true } },
      lines: {
        include: {
          material: {
            select: { id: true, code: true, name: true, unit: true, category: { select: { name: true } } },
          },
        },
      },
    },
    orderBy: { issueDate: "asc" },
  });

  // Aggregate by department × material
  type Cell = { qty: number; cost: number };
  const byDepartment = new Map<string, { code: string; name: string; total: number; materials: Map<string, { code: string; name: string; unit: string; categoryName: string; cell: Cell }> }>();
  let grandTotal = 0;

  for (const issue of issues) {
    const dept = issue.department!;
    if (!byDepartment.has(dept.id)) {
      byDepartment.set(dept.id, { code: dept.code, name: dept.name, total: 0, materials: new Map() });
    }
    const deptRow = byDepartment.get(dept.id)!;
    for (const line of issue.lines) {
      const mat = line.material;
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
      entry.cell.qty += toNum(line.qty);
      entry.cell.cost += toNum(line.qty) * toNum(line.unitCost);
      deptRow.total += toNum(line.qty) * toNum(line.unitCost);
      grandTotal += toNum(line.qty) * toNum(line.unitCost);
    }
  }

  const report = {
    from,
    to,
    departments: Array.from(byDepartment.values())
      .map((d) => ({
        code: d.code,
        name: d.name,
        total: d.total,
        materials: Array.from(d.materials.values()).map((m) => ({
          code: m.code,
          name: m.name,
          unit: m.unit,
          categoryName: m.categoryName,
          qty: m.cell.qty,
          cost: m.cell.cost,
        })),
      }))
      .sort((a, b) => b.total - a.total),
    grandTotal,
  };

  return (
    <>
      <PageHeader
        title="Cost-Centre Consumption"
        description="Department-wise raw-material consumption — a digital version of the Stock Issue Summary. Materials issued to cost centres hit operating expenses."
        stats={[
          { label: "Cost centers", value: report.departments.length },
          { label: "Grand total", value: formatCurrency(grandTotal) },
        ]}
      />
      <DepartmentConsumptionReport report={report} />
    </>
  );
}
