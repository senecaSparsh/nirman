import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete } from "@nirman/services";
import { apiHandler, json, materialCategorySchema } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = materialCategorySchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // If name is changing, ensure uniqueness among non-deleted categories
  if (parsed.data.name) {
    const clash = await prisma.materialCategory.findFirst({
      where: { name: parsed.data.name, deletedAt: null, NOT: { id } },
    });
    if (clash) {
      return json({ error: "A category with this name already exists" }, { status: 409 });
    }
  }
  const updated = await prisma.materialCategory.update({
    where: { id },
    data: parsed.data,
  });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const { id } = await params;
  await softDelete("MaterialCategory", id);
  return json({ ok: true });
});
