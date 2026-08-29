import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { cancelSupplierReturn, completeSupplierReturn, submitSupplierReturn } from "@nirman/services";
import { PERM } from "@/lib/roles";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";

/** GET /api/supplier-returns/[id] — fetch a single supplier return by ID */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const supplierReturn = await prisma.supplierReturn.findFirst({
    where: { id, companyId: company.id },
    include: {
      supplier: { select: { id: true, name: true, phone: true } },
      location: { select: { id: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
    },
  });
  if (!supplierReturn) return json({ error: "Supplier return not found" }, { status: 404 });
  return json(supplierReturn);
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const action = body?.action as string;

  // Validate the return belongs to the user's company
  const existing = await prisma.supplierReturn.findFirst({
    where: { id, companyId: company.id },
    select: { id: true },
  });
  if (!existing) return json({ error: "Supplier return not found" }, { status: 404 });

  try {
    if (action === "submit") {
      await submitSupplierReturn(id, user.id);
      revalidatePath("/supplier-returns");
      revalidatePath("/m/suppliers");
      return json({ ok: true });
    }
    if (action === "complete") {
      await completeSupplierReturn({
        returnId: id,
        creditNoteNo: body?.creditNoteNo ?? undefined,
        userId: user.id,
      });
      revalidatePath("/supplier-returns");
      revalidatePath("/m/suppliers");
      return json({ ok: true });
    }
    if (action === "cancel") {
      await cancelSupplierReturn(id, user.id);
      revalidatePath("/supplier-returns");
      revalidatePath("/m/suppliers");
      return json({ ok: true });
    }
    return json({ error: "Invalid action. Use submit, complete, or cancel." }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Action failed") }, { status: 400 });
  }
});

/** DELETE /api/supplier-returns/[id] — hard-delete a supplier return (only DRAFT) */
export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.PROCUREMENT_MANAGE);
  const company = await getCompany();
  const { id } = await params;

  const supplierReturn = await prisma.supplierReturn.findFirst({
    where: { id, companyId: company.id },
    select: { id: true, status: true },
  });
  if (!supplierReturn) return json({ error: "Supplier return not found" }, { status: 404 });
  if (supplierReturn.status !== "DRAFT") {
    return json({ error: "Only DRAFT supplier returns can be deleted" }, { status: 400 });
  }

  // Delete lines + return atomically (cascade), so a failure doesn't leave orphaned lines
  await prisma.$transaction([
    prisma.supplierReturnLine.deleteMany({ where: { supplierReturnId: id } }),
    prisma.supplierReturn.delete({ where: { id } }),
  ]);
  revalidatePath("/supplier-returns");
  revalidatePath("/m/suppliers");
  return json({ ok: true });
});
