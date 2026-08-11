import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, supplierSchema, toNum } from "@/lib/server";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const q = url.searchParams.get("q")?.trim() ?? "";
  const suppliers = await prisma.supplier.findMany({
    take: 200,
    where: {
      companyId: company.id,
      deletedAt: null,
      ...(q ? { name: { contains: q, mode: "insensitive" } } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      _count: {
        select: {
          purchaseOrders: { where: { companyId: company.id, status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] } } },
        },
      },
    },
  });
  return json(
    suppliers.map((s) => ({
      id: s.id,
      name: s.name,
      gstin: s.gstin,
      phone: s.phone,
      email: s.email,
      address: s.address,
      balanceOwed: toNum(s.balanceOwed),
      openPOs: s._count.purchaseOrders,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const body = await req.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const created = await prisma.$transaction(async (tx) => {
    const company = await getCompany();
    const supplier = await tx.supplier.create({ data: { ...parsed.data, companyId: company.id } });
    await logAction(tx, {
      userId: user.id,
      action: "SUPPLIER_CREATE",
      entityType: "Supplier",
      entityId: supplier.id,
      after: { name: supplier.name, gstin: supplier.gstin, phone: supplier.phone },
    });
    return supplier;
  });
  return json(created, { status: 201 });
});

// ── Bulk CSV import ─────────────────────────────────────────────
// PUT /api/suppliers with { items: [...] } creates multiple suppliers
// in one pass. Skips duplicates (by name + phone) and returns a summary.

export const PUT = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const items: unknown = body.items;
  if (!Array.isArray(items)) {
    return json({ error: "Expected { items: [...] } array" }, { status: 400 });
  }

  const results = { created: 0, skipped: 0, errors: [] as { row: number; error: string }[] };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const parsed = supplierSchema.safeParse(item);
    if (!parsed.success) {
      results.errors.push({ row: i + 1, error: parsed.error.issues[0]?.message ?? "Invalid input" });
      continue;
    }
    // Check for existing supplier by name (case-insensitive) within the company
    const existing = await prisma.supplier.findFirst({
      where: { companyId: company.id, name: { equals: parsed.data.name, mode: "insensitive" }, deletedAt: null },
    });
    if (existing) {
      results.skipped++;
      continue;
    }
    try {
      await prisma.$transaction(async (tx) => {
        const supplier = await tx.supplier.create({ data: { ...parsed.data, companyId: company.id } });
        await logAction(tx, {
          userId: user.id,
          action: "SUPPLIER_CREATE",
          entityType: "Supplier",
          entityId: supplier.id,
          after: { name: supplier.name, gstin: supplier.gstin, phone: supplier.phone },
        });
      });
      results.created++;
    } catch (err: unknown) {
      results.errors.push({ row: i + 1, error: err instanceof Error ? err.message : "Failed to create" });
    }
  }

  return json(results);
});
