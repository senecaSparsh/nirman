import { NextRequest } from "next/server";
import { Prisma, prisma } from "@nirman/db";
import { apiHandler, getCompany, getUserScope, json, requirePermission } from "@/lib/server";
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

  // Aggregate in the database — one GROUP BY over MaterialIssueLine
  // instead of hydrating every issue + lines + material into JS.
  // Same filters as before: company via Department, departmentId set,
  // optional issueDate range, and the viewer's data scope.
  const conditions = [
    Prisma.sql`d."companyId" = ${company.id}`,
    Prisma.sql`d."deletedAt" IS NULL`,
    Prisma.sql`i."departmentId" IS NOT NULL`,
  ];
  if (from) conditions.push(Prisma.sql`i."issueDate" >= ${new Date(from)}`);
  if (to) {
    // inclusive end-of-day
    const end = new Date(to);
    end.setHours(23, 59, 59, 999);
    conditions.push(Prisma.sql`i."issueDate" <= ${end}`);
  }

  // Same scope semantics as scopeWhere("MaterialIssue"):
  // DEPARTMENT → i.departmentId IN, PROJECT → i.projectId IN, COMPANY → none.
  const scope = await getUserScope();
  if (scope.scopeType === "DEPARTMENT" && scope.departmentIds.length > 0) {
    conditions.push(Prisma.sql`i."departmentId" IN (${Prisma.join(scope.departmentIds)})`);
  } else if (scope.scopeType === "PROJECT" && scope.projectIds.length > 0) {
    conditions.push(Prisma.sql`i."projectId" IN (${Prisma.join(scope.projectIds)})`);
  }

  const rows = await prisma.$queryRaw<{
    deptId: string;
    deptCode: string;
    deptName: string;
    materialCode: string;
    materialName: string;
    unit: string;
    categoryName: string;
    qty: number;
    cost: number;
  }[]>`
    SELECT
      d.id AS "deptId", d.code AS "deptCode", d.name AS "deptName",
      m.code AS "materialCode", m.name AS "materialName", m.unit,
      c.name AS "categoryName",
      SUM(l.qty)::float8 AS qty,
      SUM(l.qty * l."unitCost")::float8 AS cost
    FROM "MaterialIssueLine" l
    JOIN "MaterialIssue" i ON i.id = l."materialIssueId"
    JOIN "Department" d ON d.id = i."departmentId"
    JOIN "Material" m ON m.id = l."materialId"
    JOIN "MaterialCategory" c ON c.id = m."categoryId"
    WHERE ${Prisma.join(conditions, " AND ")}
    GROUP BY d.id, d.code, d.name, m.id, m.code, m.name, m.unit, c.name
  `;

  // Fold the aggregated rows into the response shape
  const byDepartment = new Map<string, { code: string; name: string; total: number; materials: { code: string; name: string; unit: string; categoryName: string; qty: number; cost: number }[] }>();
  let grandTotal = 0;

  for (const r of rows) {
    let dept = byDepartment.get(r.deptId);
    if (!dept) {
      dept = { code: r.deptCode, name: r.deptName, total: 0, materials: [] };
      byDepartment.set(r.deptId, dept);
    }
    dept.materials.push({
      code: r.materialCode,
      name: r.materialName,
      unit: r.unit,
      categoryName: r.categoryName,
      qty: r.qty,
      cost: r.cost,
    });
    dept.total += r.cost;
    grandTotal += r.cost;
  }

  const departments = Array.from(byDepartment.values())
    .sort((a, b) => b.total - a.total);

  return json({ from: from ?? null, to: to ?? null, departments, grandTotal });
});
