import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, departmentSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const departments = await prisma.department.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { code: "asc" },
    include: {
      stockLocation: { select: { id: true, name: true } },
      _count: { select: { materialIssues: { where: { department: { deletedAt: null } } } } },
    },
  });
  return json(
    departments.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      description: d.description,
      active: d.active,
      stockLocationId: d.stockLocation?.id ?? null,
      stockLocationName: d.stockLocation?.name ?? null,
      issueCount: d._count.materialIssues,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = departmentSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Code must be unique within the company (among non-deleted departments)
  const clash = await prisma.department.findFirst({
    where: { companyId: company.id, code: parsed.data.code, deletedAt: null },
  });
  if (clash) {
    return json({ error: "A department with this code already exists" }, { status: 409 });
  }
  const created = await prisma.department.create({
    data: {
      companyId: company.id,
      code: parsed.data.code,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      active: parsed.data.active ?? true,
    },
  });
  return json({ ok: true, id: created.id }, { status: 201 });
});
