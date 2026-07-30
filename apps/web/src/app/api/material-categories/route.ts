import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, materialCategorySchema } from "@/lib/server";

export const GET = apiHandler(async () => {
  const categories = await prisma.materialCategory.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { materials: { where: { deletedAt: null } } } } },
  });
  return json(categories);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const body = await req.json();
  const parsed = materialCategorySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const existing = await prisma.materialCategory.findUnique({
    where: { name: parsed.data.name },
  });
  if (existing && existing.deletedAt) {
    const restored = await prisma.materialCategory.update({
      where: { id: existing.id },
      data: { deletedAt: null, unit: parsed.data.unit },
    });
    return json(restored, { status: 201 });
  }
  if (existing) {
    return json({ error: "A category with this name already exists" }, { status: 409 });
  }
  const created = await prisma.materialCategory.create({ data: parsed.data });
  return json(created, { status: 201 });
});
