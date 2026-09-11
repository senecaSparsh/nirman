import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction, lookupGstByHsn } from "@nirman/services";
import { apiHandler, getCompany, json, materialCategorySchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { withSerializableTransaction } from "@nirman/services";
import Decimal from "decimal.js";

export const GET = apiHandler(async () => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const categories = await prisma.materialCategory.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    include: { _count: { select: { materials: { where: { deletedAt: null } } } } },
  });
  return json(categories);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = materialCategorySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // If HSN is provided but GST is not, auto-fill GST from the HSN master.
  let hsnCode = parsed.data.hsnCode ?? null;
  let gstRate = parsed.data.gstRate != null ? new Decimal(parsed.data.gstRate) : null;
  if (hsnCode && gstRate == null) {
    const hsnEntry = await lookupGstByHsn(hsnCode);
    if (hsnEntry) gstRate = hsnEntry.gstRate;
  }

  const existing = await prisma.materialCategory.findUnique({
    where: { companyId_name: { companyId: company.id, name: parsed.data.name } },
  });
  if (existing && existing.deletedAt) {
    const restored = await withSerializableTransaction(async (tx) => {
      const cat = await tx.materialCategory.update({
        where: { id: existing.id },
        data: {
          deletedAt: null,
          unit: parsed.data.unit,
          hsnCode,
          gstRate,
        },
      });
      await logAction(tx, {
        userId: user.id,
        action: "MATERIAL_CATEGORY_RESTORE",
        entityType: "MaterialCategory",
        entityId: cat.id,
        after: { name: cat.name, unit: cat.unit, hsnCode: cat.hsnCode, gstRate: cat.gstRate },
      });
      return cat;
    });
    return json(restored, { status: 201 });
  }
  if (existing) {
    return json({ error: "A category with this name already exists" }, { status: 409 });
  }
  const created = await withSerializableTransaction(async (tx) => {
    const cat = await tx.materialCategory.create({
      data: {
        ...parsed.data,
        hsnCode,
        gstRate,
        companyId: company.id,
      },
    });
    await logAction(tx, {
      userId: user.id,
      action: "MATERIAL_CATEGORY_CREATE",
      entityType: "MaterialCategory",
      entityId: cat.id,
      after: { name: cat.name, unit: cat.unit, hsnCode: cat.hsnCode, gstRate: cat.gstRate },
    });
    return cat;
  });
  return json(created, { status: 201 });
});
