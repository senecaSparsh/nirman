import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete } from "@nirman/services";
import { apiHandler, json, employeeSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROJECTS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = employeeSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const updated = await prisma.employee.update({
    where: { id },
    data: {
      ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
      ...(parsed.data.trade !== undefined ? { trade: parsed.data.trade ?? null } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone ?? null } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email ?? null } : {}),
      ...(parsed.data.dailyRate !== undefined ? { dailyRate: parsed.data.dailyRate ?? 0 } : {}),
      ...(parsed.data.active !== undefined ? { active: parsed.data.active } : {}),
    },
  });
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROJECTS_MANAGE);
  const { id } = await params;
  try {
    await softDelete("Employee", id);
    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to delete employee" }, { status: 400 });
  }
});
