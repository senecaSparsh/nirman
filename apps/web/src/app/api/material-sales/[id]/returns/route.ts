import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { z } from "zod";
import { createMaterialSaleReturn, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

const returnLineSchema = z.object({
  materialSaleLineId: z.string().min(1),
  qty: z.union([z.number(), z.string()]).transform(Number).pipe(z.number().positive()),
  reason: z.string().optional(),
});

const returnSchema = z.object({
  lines: z.array(returnLineSchema).min(1, "At least one return line is required"),
  creditNoteNo: z.string().optional(),
  reason: z.string().optional(),
  notes: z.string().optional(),
});

/**
 * POST /api/material-sales/[id]/returns — create a sales return (credit note).
 * Stock comes back, revenue is reversed, and a CN- number is generated.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALES_MANAGE);
  const company = await getCompany();
  const { id: saleId } = await params;
  const body = await req.json();
  const parsed = returnSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const result = await createMaterialSaleReturn(saleId, {
      companyId: company.id,
      lines: parsed.data.lines,
      creditNoteNo: parsed.data.creditNoteNo,
      reason: parsed.data.reason,
      notes: parsed.data.notes,
      userId: user.id,
    });
    revalidatePath("/material-sales");
    revalidatePath(`/material-sales/${saleId}`);
    revalidatePath("/m/material-sales");
    revalidatePath(`/m/material-sales/${saleId}`);
    revalidatePath("/m/sales");
    revalidatePath("/stock");
    revalidatePath("/finance");
    revalidatePath("/gl");
    return json({ ok: true, returnNumber: result.returnNumber, id: result.id }, { status: 201 });
  } catch (err: unknown) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    return json({ error: (err instanceof Error ? err.message : "Failed to create return") }, { status: 400 });
  }
});

/**
 * GET /api/material-sales/[id]/returns — list returns for a sale.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.SALES_VIEW);
  const company = await getCompany();
  const { id: saleId } = await params;

  const returns = await prisma.materialSaleReturn.findMany({
    where: { materialSaleId: saleId, companyId: company.id },
    include: {
      lines: {
        include: {
          material: { select: { id: true, code: true, name: true, unit: true } },
        },
      },
    },
    orderBy: { returnDate: "desc" },
  });

  return json(returns.map((r) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    status: r.status,
    returnDate: r.returnDate.toISOString(),
    creditNoteNo: r.creditNoteNo,
    reason: r.reason,
    notes: r.notes,
    subtotal: toNum(r.subtotal),
    gstTotal: toNum(r.gstTotal),
    totalAmount: toNum(r.totalAmount),
    lines: r.lines.map((l) => ({
      id: l.id,
      materialCode: l.material.code,
      materialName: l.material.name,
      materialUnit: l.material.unit,
      qty: toNum(l.qty),
      unitPrice: toNum(l.unitPrice),
      lineTotal: toNum(l.lineTotal),
      reason: l.reason,
    })),
  })));
});
