import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { softDelete, lookupGstByHsn } from "@nirman/services";
import { apiHandler, getCompany, json, materialCategorySchema } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";
import Decimal from "decimal.js";

/** GET /api/material-categories/[id] — fetch a single material category by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const category = await prisma.materialCategory.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    include: {
      _count: { select: { materials: true } },
    },
  });
  if (!category) return json({ error: "Material category not found" }, { status: 404 });
  return json(category);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = materialCategorySchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Verify the category belongs to the active company.
  const existing = await prisma.materialCategory.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return json({ error: "Material category not found" }, { status: 404 });
  // If name is changing, ensure uniqueness within the same company.
  if (parsed.data.name) {
    const clash = await prisma.materialCategory.findFirst({
      where: { companyId: company.id, name: parsed.data.name, deletedAt: null, NOT: { id } },
    });
    if (clash) {
      return json({ error: "A category with this name already exists" }, { status: 409 });
    }
  }

  // If HSN is being updated but GST is not provided, auto-fill GST from the HSN master.
  let gstRate: Decimal | null | undefined = undefined;
  if (parsed.data.hsnCode !== undefined) {
    if (parsed.data.gstRate !== undefined) {
      gstRate = parsed.data.gstRate != null ? new Decimal(parsed.data.gstRate) : null;
    } else if (parsed.data.hsnCode) {
      const hsnEntry = await lookupGstByHsn(parsed.data.hsnCode);
      gstRate = hsnEntry ? hsnEntry.gstRate : null;
    } else {
      gstRate = null;
    }
  } else if (parsed.data.gstRate !== undefined) {
    gstRate = parsed.data.gstRate != null ? new Decimal(parsed.data.gstRate) : null;
  }

  // Only write keys the caller actually sent — .partial() still fills the
  // schema's `unit` .default("NOS") for an absent key, so a bare spread would
  // silently reset a custom unit on any partial PATCH.
  const sentData: Record<string, unknown> = {};
  for (const k of Object.keys(parsed.data) as (keyof typeof parsed.data)[]) {
    if (k in body) sentData[k] = parsed.data[k];
  }
  const updated = await prisma.materialCategory.update({
    where: { id },
    data: {
      ...sentData,
      gstRate,
    },
  });
  return json(updated);
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.INVENTORY_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // Verify the category belongs to the active company before soft-deleting.
  const existing = await prisma.materialCategory.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!existing) return json({ error: "Material category not found" }, { status: 404 });
  await softDelete("MaterialCategory", id);
  return json({ ok: true });
});
