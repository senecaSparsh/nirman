import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete } from "@nirman/services";
import { apiHandler, json, materialSchema, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = materialSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // If code is changing, ensure uniqueness among non-deleted materials
  if (parsed.data.code) {
    const clash = await prisma.material.findFirst({
      where: { code: parsed.data.code, deletedAt: null, NOT: { id } },
    });
    if (clash) {
      return json({ error: "A material with this code already exists" }, { status: 409 });
    }
  }
  const data: any = { ...parsed.data };
  if (parsed.data.standardCost != null) data.currentCost = parsed.data.standardCost;
  const updated = await prisma.material.update({ where: { id }, data });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  await softDelete("Material", id);
  return json({ ok: true });
});
