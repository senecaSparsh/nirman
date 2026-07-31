import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete } from "@nirman/services";
import { apiHandler, json, customerSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.SALES_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = customerSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const updated = await prisma.customer.update({ where: { id }, data: parsed.data });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.SALES_MANAGE);
  const { id } = await params;
  await softDelete("Customer", id);
  return json({ ok: true });
});
