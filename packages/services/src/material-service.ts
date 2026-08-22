import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { generateMaterialCode } from "./material-code";
import { suggestHsnByMaterial, lookupGstByHsn } from "./hsn-gst";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Auto-fill HSN code + GST rate on a material that's missing them.
 * Uses the government HSN master to suggest the best match based on
 * the material name + category name. If HSN is already set but GST is 0,
 * looks up the GST rate from the HSN master.
 *
 * Called automatically during goods receipt to ensure GST compliance
 * without requiring the user to manually look up HSN codes.
 *
 * Returns the updated HSN/GST values, or null if no suggestion was found.
 */
export async function autoFillHsnGst(materialId: string): Promise<{
  hsnCode: string;
  gstRate: Decimal;
} | null> {
  const material = await prisma.material.findUnique({
    where: { id: materialId },
    include: { category: { select: { name: true } } },
  });
  if (!material) return null;

  let hsnCode = material.hsnCode;
  let gstRate = material.gstRate;

  // Case 1: HSN is set but GST is 0 → look up GST from HSN master
  if (hsnCode && new Decimal(gstRate).eq(0)) {
    const entry = await lookupGstByHsn(hsnCode);
    if (entry) {
      gstRate = entry.gstRate;
      await prisma.material.update({
        where: { id: materialId },
        data: { gstRate },
      });
      return { hsnCode, gstRate };
    }
  }

  // Case 2: Neither HSN nor GST is set → suggest from material name + category
  if (!hsnCode && new Decimal(gstRate).eq(0)) {
    const suggestions = await suggestHsnByMaterial(
      material.name,
      material.category?.name,
    );
    if (suggestions.length > 0) {
      const best = suggestions[0]!;
      hsnCode = best.hsnCode;
      gstRate = best.gstRate;
      await prisma.material.update({
        where: { id: materialId },
        data: { hsnCode, gstRate },
      });
      return { hsnCode, gstRate };
    }
  }

  // Already has HSN + GST, or no suggestion found
  if (hsnCode && !new Decimal(gstRate).eq(0)) {
    return { hsnCode, gstRate };
  }
  return null;
}

/**
 * Quick-create a material with auto-generated code + auto-picked HSN/GST.
 * Used during goods receipt when a material arrives that's not in the system.
 *
 * The caller provides just the name + category + unit (+ optional grade/spec).
 * The system:
 *   1. Auto-generates the material code using generateMaterialCode()
 *      (same format as the Add Material page: {PREFIX}-{GRADE}-{SEQ})
 *   2. Auto-picks HSN/GST from the government master using suggestHsnByMaterial()
 *   3. Creates the material record
 *   4. Logs the action
 *
 * Returns the created material with the auto-generated code + HSN/GST.
 */
export async function quickCreateMaterial(input: {
  name: string;
  categoryId: string;
  unit: string;
  grade?: string | null;
  specification?: string | null;
  standardCost?: Decimal | number | string;
  userId?: string;
  companyId?: string;
}): Promise<{
  id: string;
  code: string;
  name: string;
  hsnCode: string | null;
  gstRate: Decimal;
  unit: string;
}> {
  const category = await prisma.materialCategory.findUnique({
    where: { id: input.categoryId },
  });
  if (!category) throw new ServiceError("Category not found", 404);

  // 1. Auto-generate material code
  const code = await generateMaterialCode(category.name, input.grade ?? null);

  // Check for existing code (shouldn't happen due to sequence, but be safe)
  const existing = await prisma.material.findUnique({ where: { code } });
  if (existing && !existing.deletedAt) {
    throw new ServiceError(`Material with code ${code} already exists`);
  }

  // 2. Auto-pick HSN/GST from government master
  let hsnCode: string | null = null;
  let gstRate = new Decimal(0);
  const suggestions = await suggestHsnByMaterial(input.name, category.name);
  if (suggestions.length > 0) {
    hsnCode = suggestions[0]!.hsnCode;
    gstRate = suggestions[0]!.gstRate;
  }

  // 3. Create the material
  const material = await prisma.$transaction(async (tx) => {
    // Restore if soft-deleted with same code
    if (existing?.deletedAt) {
      const restored = await tx.material.update({
        where: { id: existing.id },
        data: {
          name: input.name,
          categoryId: input.categoryId,
          unit: input.unit,
          grade: input.grade ?? null,
          specification: input.specification ?? null,
          hsnCode,
          gstRate,
          standardCost: input.standardCost ? new Decimal(input.standardCost) : new Decimal(0),
          currentCost: input.standardCost ? new Decimal(input.standardCost) : new Decimal(0),
          deletedAt: null,
        },
      });
      if (input.userId) {
        await logAction(tx, {
          userId: input.userId,
          action: "MATERIAL_QUICK_CREATE_RESTORE",
          entityType: "Material",
          entityId: restored.id,
          after: { code: restored.code, name: restored.name, hsnCode, gstRate: gstRate.toString() },
        });
      }
      return restored;
    }

    const mat = await tx.material.create({
      data: {
        code,
        name: input.name,
        categoryId: input.categoryId,
        unit: input.unit,
        grade: input.grade ?? null,
        specification: input.specification ?? null,
        hsnCode,
        gstRate,
        standardCost: input.standardCost ? new Decimal(input.standardCost) : new Decimal(0),
        currentCost: input.standardCost ? new Decimal(input.standardCost) : new Decimal(0),
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "MATERIAL_QUICK_CREATE",
        entityType: "Material",
        entityId: mat.id,
        after: {
          code: mat.code,
          name: mat.name,
          unit: mat.unit,
          hsnCode,
          gstRate: gstRate.toString(),
          source: "goods_receipt",
        },
      });
    }
    return mat;
  });

  return {
    id: material.id,
    code: material.code,
    name: material.name,
    hsnCode: material.hsnCode,
    gstRate: material.gstRate,
    unit: material.unit,
  };
}
