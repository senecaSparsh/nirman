import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete } from "@nirman/services";
import { apiHandler, json, materialSchema, toNum } from "@/lib/server";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const parsed = materialSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // If code is changing, ensure uniqueness
  if (parsed.data.code) {
    const clash = await prisma.material.findUnique({ where: { code: parsed.data.code } });
    if (clash && clash.id !== id) {
      return json({ error: "A material with this code already exists" }, { status: 409 });
    }
  }
  const data: any = { ...parsed.data };
  if (parsed.data.standardCost != null) data.currentCost = parsed.data.standardCost;
  const updated = await prisma.material.update({ where: { id }, data });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await softDelete("Material", id);
  return json({ ok: true });
});
