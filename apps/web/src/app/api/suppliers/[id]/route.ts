import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission, supplierSchema } from "@/lib/server";

export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const existing = await prisma.supplier.findFirst({ where: { id, deletedAt: null } });
  if (!existing) return json({ error: "Supplier not found" }, { status: 404 });
  const updated = await prisma.supplier.update({ where: { id }, data: parsed.data });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  try {
    await softDelete("Supplier", id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete supplier") }, { status: 400 });
  }
});
