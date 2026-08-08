import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, departmentSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = departmentSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // If code is changing, ensure uniqueness among non-deleted departments in the same company
  if (parsed.data.code) {
    const clash = await prisma.department.findFirst({
      where: { companyId: company.id, code: parsed.data.code, deletedAt: null, NOT: { id } },
    });
    if (clash) return json({ error: "A department with this code already exists" }, { status: 409 });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const existing = await tx.department.findFirst({ where: { id, companyId: company.id } });
    if (!existing) throw new Error("Department not found in this company");
    const dept = await tx.department.update({ where: { id }, data: parsed.data });
    await logAction(tx, {
      userId: user.id,
      action: "DEPARTMENT_UPDATE",
      entityType: "Department",
      entityId: id,
      before: { name: existing.name, code: existing.code },
      after: { name: dept.name, code: dept.code },
    });
    return dept;
  });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // Validate the department belongs to the user's company
  const dept = await prisma.department.findFirst({ where: { id, companyId: company.id } });
  if (!dept) return json({ error: "Department not found" }, { status: 404 });
  // Guard: don't soft-delete a department that still has its own stock room with stock
  const location = await prisma.stockLocation.findFirst({
    where: { departmentId: id, deletedAt: null },
    include: { stockItems: { select: { qty: true } } },
  });
  if (location && location.stockItems.some((i) => Number(i.qty) > 0)) {
    return json({ error: "Cannot delete department — its stock room still holds stock. Transfer stock out first." }, { status: 400 });
  }
  await prisma.$transaction(async (tx) => {
    await tx.department.update({ where: { id }, data: { deletedAt: new Date() } });
    await logAction(tx, {
      userId: user.id,
      action: "DEPARTMENT_DELETE",
      entityType: "Department",
      entityId: id,
      before: { name: dept.name, code: dept.code },
    });
  });
  return json({ ok: true });
});
