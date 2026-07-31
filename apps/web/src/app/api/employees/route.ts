import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, employeeSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.PROJECTS_VIEW);
  const company = await getCompany();
  const employees = await prisma.employee.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
  });
  return json(
    employees.map((e) => ({
      id: e.id,
      name: e.name,
      trade: e.trade,
      phone: e.phone,
      email: e.email,
      dailyRate: toNum(e.dailyRate),
      active: e.active,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROJECTS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = employeeSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const created = await prisma.employee.create({
    data: {
      name: parsed.data.name,
      trade: parsed.data.trade ?? null,
      phone: parsed.data.phone ?? null,
      email: parsed.data.email ?? null,
      dailyRate: parsed.data.dailyRate ?? 0,
      active: parsed.data.active ?? true,
      companyId: company.id,
    },
  });
  return json({ ok: true, id: created.id }, { status: 201 });
});
