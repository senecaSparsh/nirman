import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, departmentSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = departmentSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // If code is changing, ensure uniqueness among non-deleted departments in the same company
  if (parsed.data.code) {
    const dept = await prisma.department.findUnique({ where: { id } });
    if (!dept) return json({ error: "Department not found" }, { status: 404 });
    const clash = await prisma.department.findFirst({
      where: { companyId: dept.companyId, code: parsed.data.code, deletedAt: null, NOT: { id } },
    });
    if (clash) return json({ error: "A department with this code already exists" }, { status: 409 });
  }
  const updated = await prisma.department.update({ where: { id }, data: parsed.data });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  // Guard: don't soft-delete a department that still has its own stock room with stock
  const location = await prisma.stockLocation.findFirst({
    where: { departmentId: id, deletedAt: null },
    include: { stockItems: { select: { qty: true } } },
  });
  if (location && location.stockItems.some((i) => Number(i.qty) > 0)) {
    return json({ error: "Cannot delete department — its stock room still holds stock. Transfer stock out first." }, { status: 400 });
  }
  await prisma.department.update({ where: { id }, data: { deletedAt: new Date() } });
  return json({ ok: true });
});
