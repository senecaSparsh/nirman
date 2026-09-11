import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { recordLandPurchasePayment } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, json, requirePermission, getCompany } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const paymentSchema = z.object({
  amount: z.union([z.string(), z.number()]).transform((v) => String(v)).refine((v) => Number(v) > 0, "Amount must be greater than 0"),
  paymentMode: z.string().min(1, "Payment mode is required"),
  referenceNo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  chequeNo: z.string().optional().nullable(),
  chequeDate: z.string().optional().nullable(),
  chequeBank: z.string().optional().nullable(),
  chequePhotoUrl: z.string().optional().nullable(),
});

/**
 * POST /api/land-purchases/[id]/payment — record a payment against a land purchase.
 * Body: { amount, paymentMode, referenceNo?, notes?, chequeNo?, chequeDate?, chequeBank?, chequePhotoUrl? }
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await ctx.params;

  const company = await getCompany();
  const existing = await prisma.landPurchase.findFirst({ where: { id, companyId: company.id }, select: { id: true } });
  if (!existing) return json({ error: "Not found" }, { status: 404 });

  const body = await req.json();

  const parsed = paymentSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const result = await recordLandPurchasePayment({
      landPurchaseId: id,
      amount: parsed.data.amount,
      paymentMode: parsed.data.paymentMode,
      referenceNo: parsed.data.referenceNo ?? undefined,
      notes: parsed.data.notes ?? undefined,
      userId: user.id,
      chequeNo: parsed.data.chequeNo ?? undefined,
      chequeDate: parsed.data.chequeDate ?? undefined,
      chequeBank: parsed.data.chequeBank ?? undefined,
      chequePhotoUrl: parsed.data.chequePhotoUrl ?? undefined,
    });
    revalidatePath("/land");
    revalidatePath("/m/land");
    revalidatePath(`/land/${id}`);
    return json({ ok: true, paymentId: result.payment.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Payment failed") }, { status: 400 });
  }
});
