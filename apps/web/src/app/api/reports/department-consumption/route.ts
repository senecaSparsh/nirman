import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/reports/department-consumption?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Department-wise material consumption report — a digital version of the
 * "Stock Issue Summary" the client produces by hand. Returns one row per
 * (department × material) with qty and cost, plus per-department and grand
 * totals. Only counts ISSUE_TO_DEPARTMENT movements (department issues).
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const dateFilter: { issueDate?: { gte?: Date; lte?: Date } } = {};
  if (from) dateFilter.issueDate = { ...dateFilter.issueDate, gte: new Date(from) };
  if (to) {
    // inclusive end-of-day
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    dateFilter.issueDate = { ...dateFilter.issueDate, lte: end };
  }

  const issues = await prisma.materialIssue.findMany({
    where: {
      department: { companyId: company.id, deletedAt: null },
      departmentId: { not: null },
      ...dateFilter,
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

  const departments = Array.from(byDepartment.values())
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
    .sort((a, b) => b.total - a.total);

  return json({ from: from ?? null, to: to ?? null, departments, grandTotal });
});
