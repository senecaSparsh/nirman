import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission, subcontractorSchema } from "@/lib/server";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = subcontractorSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const updated = await prisma.subcontractor.update({
    where: { id },
    data: {
      ...(parsed.data.name ? { name: parsed.data.name } : {}),
      ...(parsed.data.gstin !== undefined ? { gstin: parsed.data.gstin ?? null } : {}),
      ...(parsed.data.phone !== undefined ? { phone: parsed.data.phone ?? null } : {}),
      ...(parsed.data.email !== undefined ? { email: parsed.data.email ?? null } : {}),
      ...(parsed.data.address !== undefined ? { address: parsed.data.address ?? null } : {}),
      ...(parsed.data.trade !== undefined ? { trade: parsed.data.trade ?? null } : {}),
    },
  });
  return json({ ok: true, id: updated.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  try {
    await softDelete("Subcontractor", id);
    return json({ ok: true });
  } catch (err: any) {
    return json({ error: err?.message ?? "Failed to delete subcontractor" }, { status: 400 });
  }
});
