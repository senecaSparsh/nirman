import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { apiHandler, brokerSchema, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { logAction } from "@nirman/services";
import { withSerializableTransaction } from "@nirman/services";

/** GET /api/brokers/[id] — fetch a single broker by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const broker = await prisma.broker.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      _count: { select: { assetSales: true } },
    },
  });
  if (!broker) return json({ error: "Broker not found" }, { status: 404 });
  return json(broker);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.broker.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!existing) return json({ error: "Broker not found" }, { status: 404 });

  const body = await req.json();
  const parsed = brokerSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  const updated = await withSerializableTransaction(async (tx) => {
    const broker = await tx.broker.update({
      where: { id },
      data: {
        name: parsed.data.name,
        phone: parsed.data.phone ?? null,
        agency: parsed.data.agency ?? null,
        defaultCommissionPercent: parsed.data.defaultCommissionPercent ?? null,
        notes: parsed.data.notes ?? null,
      },
    });
    await logAction(tx, {
      userId: user.id,
      action: "BROKER_UPDATE",
      entityType: "Broker",
      entityId: broker.id,
      before: { name: existing.name, phone: existing.phone, agency: existing.agency },
      after: { name: broker.name, phone: broker.phone, agency: broker.agency },
    });
    return broker;
  });

  revalidatePath("/brokers");
  revalidatePath("/m/brokers");
  return json({ ok: true, id: updated.id, name: updated.name });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const { id } = await params;

  const existing = await prisma.broker.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
  });
  if (!existing) return json({ error: "Broker not found" }, { status: 404 });

  // Soft delete — don't affect past sales that reference this broker
  await withSerializableTransaction(async (tx) => {
    await tx.broker.update({
      where: { id },
      data: { deletedAt: new Date() },
    });
    await logAction(tx, {
      userId: user.id,
      action: "BROKER_DELETE",
      entityType: "Broker",
      entityId: id,
      before: { name: existing.name },
    });
  });

  revalidatePath("/brokers");
  revalidatePath("/m/brokers");
  return json({ ok: true });
});
