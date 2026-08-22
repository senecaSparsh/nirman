import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete, extractVersion, ConcurrentEditError, logAction } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, supplierSchema } from "@/lib/server";

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  const body = await req.json();
  const expectedVersion = extractVersion(body);
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const existing = await prisma.supplier.findFirst({ where: { id, companyId: company.id, deletedAt: null } });
  if (!existing) return json({ error: "Supplier not found" }, { status: 404 });
  if (expectedVersion !== undefined && existing.version !== expectedVersion) {
    return json({ error: new ConcurrentEditError("Supplier", id, expectedVersion, existing.version).message, code: "CONCURRENT_EDIT" }, { status: 409 });
  }
  const updated = await prisma.$transaction(async (tx) => {
    const sup = await tx.supplier.update({
      where: { id },
      data: { ...parsed.data, version: { increment: 1 } },
    });
    await logAction(tx, {
      userId: user.id,
      action: "SUPPLIER_UPDATE",
      entityType: "Supplier",
      entityId: id,
      after: parsed.data,
    });
    return sup;
  });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const { id } = await ctx.params;
  // Verify company ownership before soft-deleting
  const existing = await prisma.supplier.findFirst({ where: { id, companyId: company.id } });
  if (!existing) return json({ error: "Supplier not found" }, { status: 404 });
  try {
    await softDelete("Supplier", id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete supplier") }, { status: 400 });
  }
});
