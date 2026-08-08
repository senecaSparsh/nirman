import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, json, requirePermission, subcontractorSchema } from "@/lib/server";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const subs = await prisma.subcontractor.findMany({
    where: { deletedAt: null },
    orderBy: { name: "asc" },
  });
  return json(
    subs.map((s) => ({
      id: s.id,
      name: s.name,
      gstin: s.gstin,
      phone: s.phone,
      email: s.email,
      address: s.address,
      trade: s.trade,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const body = await req.json();
  const parsed = subcontractorSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const created = await prisma.$transaction(async (tx) => {
    const sub = await tx.subcontractor.create({
      data: {
        name: parsed.data.name,
        gstin: parsed.data.gstin ?? null,
        phone: parsed.data.phone ?? null,
        email: parsed.data.email ?? null,
        address: parsed.data.address ?? null,
        trade: parsed.data.trade ?? null,
      },
    });
    await logAction(tx, {
      userId: user.id,
      action: "SUBCONTRACTOR_CREATE",
      entityType: "Subcontractor",
      entityId: sub.id,
      after: { name: sub.name, trade: sub.trade, phone: sub.phone },
    });
    return sub;
  });
  return json({ ok: true, id: created.id }, { status: 201 });
});
