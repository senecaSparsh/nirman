import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, customerSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const customers = await prisma.customer.findMany({
    take: 200,
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { assetSales: { where: { companyId: company.id, status: "ACTIVE" } } } },
    },
  });
  return json(
    customers.map((c) => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      email: c.email,
      gstin: c.gstin,
      address: c.address,
      activeSales: c._count.assetSales,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const body = await req.json();
  const parsed = customerSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const created = await prisma.$transaction(async (tx) => {
    const company = await getCompany();
    const customer = await tx.customer.create({ data: { ...parsed.data, companyId: company.id } });
    await logAction(tx, {
      userId: user.id,
      action: "CUSTOMER_CREATE",
      entityType: "Customer",
      entityId: customer.id,
      after: { name: customer.name, phone: customer.phone, gstin: customer.gstin },
    });
    return customer;
  });
  return json(created, { status: 201 });
});

// ── Bulk CSV import ─────────────────────────────────────────────
// PUT /api/customers with { items: [...] } creates multiple customers
// in one pass. Skips duplicates (by name + phone) and returns a summary.

export const PUT = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const items: unknown = body.items;
  if (!Array.isArray(items)) {
    return json({ error: "Expected { items: [...] } array" }, { status: 400 });
  }

  const results = { created: 0, skipped: 0, errors: [] as { row: number; error: string }[] };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const parsed = customerSchema.safeParse(item);
    if (!parsed.success) {
      results.errors.push({ row: i + 1, error: parsed.error.issues[0]?.message ?? "Invalid input" });
      continue;
    }
    // Check for existing customer by name (case-insensitive) within the company
    const existing = await prisma.customer.findFirst({
      where: { companyId: company.id, name: { equals: parsed.data.name, mode: "insensitive" }, deletedAt: null },
    });
    if (existing) {
      results.skipped++;
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        const customer = await tx.customer.create({ data: { ...parsed.data, companyId: company.id } });
        await logAction(tx, {
          userId: user.id,
          action: "CUSTOMER_CREATE",
          entityType: "Customer",
          entityId: customer.id,
          after: { name: customer.name, phone: customer.phone, gstin: customer.gstin },
        });
      });
      results.created++;
    } catch (err: unknown) {
      results.errors.push({ row: i + 1, error: err instanceof Error ? err.message : "Failed to create" });
    }
  }

  return json(results);
});
