import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { logAction, ServiceError, postJournalEntry, ACCT } from "@nirman/services";
import { Prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission, requireEffectivePermission, supplierSchema, toNum } from "@/lib/server";
import { withSerializableTransaction } from "@nirman/services";
import type { z } from "zod";

type SupplierInput = z.infer<typeof supplierSchema>;

/**
 * Create a supplier, carrying a go-live payable when `openingBalance` is
 * set. Posts Dr Opening Equity (3100) / Cr Accounts Payable (2000) in the
 * same transaction — the supplier ledger and the GL can never diverge, and
 * later unlinked payments settle balanceOwed through the normal flow.
 */
async function createSupplier(
  tx: Prisma.TransactionClient,
  data: SupplierInput,
  companyId: string,
  userId: string,
) {
  const { openingBalance, ...rest } = data;
  const opening = openingBalance && openingBalance > 0 ? openingBalance : 0;
  const supplier = await tx.supplier.create({
    data: { ...rest, companyId, balanceOwed: opening },
  });
  if (opening > 0) {
    await postJournalEntry(tx, {
      companyId,
      sourceType: "OPENING",
      sourceId: supplier.id,
      memo: `Opening payable — ${supplier.name}`,
      postedById: userId,
      lines: [
        { accountCode: ACCT.OPENING_EQUITY, debit: opening, credit: 0 },
        { accountCode: ACCT.AP, debit: 0, credit: opening, entityType: "Supplier", entityId: supplier.id },
      ],
    });
  }
  await logAction(tx, {
    userId,
    companyId,
    action: "SUPPLIER_CREATE",
    entityType: "Supplier",
    entityId: supplier.id,
    after: { name: supplier.name, gstin: supplier.gstin, phone: supplier.phone, openingBalance: opening || undefined },
  });
  return supplier;
}

export const GET = apiHandler(async (req: NextRequest) => {
  await requireEffectivePermission(PERM.PROCUREMENT_VIEW);
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
      leadTimeDays: s.leadTimeDays,
      isMsme: s.isMsme,
      udyamNo: s.udyamNo,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireEffectivePermission(PERM.PROCUREMENT_MANAGE);
  const body = await req.json();
  const parsed = supplierSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const created = await withSerializableTransaction(async (tx) => {
    const company = await getCompany();
    const existing = await tx.supplier.findFirst({
      where: { companyId: company.id, name: { equals: parsed.data.name, mode: "insensitive" }, deletedAt: null },
      select: { id: true, name: true },
    });
    if (existing) {
      throw new ServiceError(`Supplier "${existing.name}" already exists`, 409);
    }
    return createSupplier(tx, parsed.data, company.id, user.id);
  });
  revalidatePath("/suppliers");
  revalidatePath("/m/suppliers");
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
      await withSerializableTransaction(async (tx) => {
        await createSupplier(tx, parsed.data, company.id, user.id);
      });
      results.created++;
    } catch (err: unknown) {
      results.errors.push({ row: i + 1, error: err instanceof Error ? err.message : "Failed to create" });
    }
  }

  revalidatePath("/suppliers");
  revalidatePath("/m/suppliers");
  return json(results);
});
