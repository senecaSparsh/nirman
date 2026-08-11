import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete, logAction, extractVersion, ConcurrentEditError } from "@nirman/services";
import { apiHandler, getCompany, json, customerSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const expectedVersion = extractVersion(body);
  const parsed = customerSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const updated = await prisma.$transaction(async (tx) => {
      const existing = await tx.customer.findFirst({ where: { id, companyId: company.id } });
      if (!existing) throw new Error("Customer not found");
      if (expectedVersion !== undefined && existing.version !== expectedVersion) {
        throw new ConcurrentEditError("Customer", id, expectedVersion, existing.version);
      }
      const cust = await tx.customer.update({
        where: { id },
        data: { ...parsed.data, version: { increment: 1 } },
      });
      await logAction(tx, {
        userId: user.id,
        action: "CUSTOMER_UPDATE",
        entityType: "Customer",
        entityId: id,
        before: { name: existing.name, phone: existing.phone },
        after: { name: cust.name, phone: cust.phone },
      });
      return cust;
    });
    return json(updated);
  } catch (err) {
    if (err instanceof ConcurrentEditError) {
      return json({ error: err.message, code: "CONCURRENT_EDIT" }, { status: 409 });
    }
    throw err;
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const existing = await prisma.customer.findFirst({ where: { id, companyId: company.id } });
  if (!existing) return json({ error: "Customer not found" }, { status: 404 });
  await softDelete("Customer", id);
  return json({ ok: true });
});
