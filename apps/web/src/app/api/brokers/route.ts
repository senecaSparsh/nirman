import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, toNum, brokerSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest) => {
  const user = await requirePermission(PERM.SALES_VIEW);
  const brokers = await prisma.broker.findMany({
    where: { deletedAt: null, companyId: user.companyId ?? undefined },
    orderBy: { name: "asc" },
    select: {
      id: true,
      name: true,
      phone: true,
      agency: true,
      defaultCommissionPercent: true,
      notes: true,
    },
  });
  return json(
    brokers.map((b) => ({
      id: b.id,
      name: b.name,
      phone: b.phone,
      agency: b.agency,
      defaultCommissionPercent: b.defaultCommissionPercent ? toNum(b.defaultCommissionPercent) : null,
      notes: b.notes,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const body = await req.json();
  const parsed = brokerSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const broker = await prisma.broker.create({
    data: {
      name: parsed.data.name,
      phone: parsed.data.phone ?? null,
      agency: parsed.data.agency ?? null,
      defaultCommissionPercent: parsed.data.defaultCommissionPercent ?? null,
      notes: parsed.data.notes ?? null,
      companyId: user.companyId!,
      createdById: user.id,
    },
  });
  return json({ ok: true, id: broker.id, name: broker.name }, { status: 201 });
});
