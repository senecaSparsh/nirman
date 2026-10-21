import { NextRequest } from "next/server";
import { z } from "zod";
import { apiHandler, getCompany, json, requireEffectivePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { createPaymentRun } from "@nirman/services";

/**
 * POST /api/payment-runs — batch AP disbursement. Each item posts a real
 * SupplierPayment (with its own GL entry); the response carries a bank-file
 * CSV for the treasurer's upload.
 */
const runSchema = z.object({
  paymentMode: z.enum(["BANK", "NEFT", "RTGS", "UPI", "CHEQUE"]),
  paymentDate: z.string().optional(),
  items: z.array(z.object({
    supplierId: z.string().min(1),
    amount: z.coerce.number().positive(),
    tdsAmount: z.coerce.number().min(0).optional(),
    tdsSection: z.string().optional(),
    invoiceId: z.string().optional(),
    purchaseOrderId: z.string().optional(),
    referenceNo: z.string().optional(),
    notes: z.string().optional(),
  })).min(1).max(100),
});

export const POST = apiHandler(async (req: NextRequest) => {
  await requireEffectivePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = runSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });

  const run = await createPaymentRun({
    companyId: company.id,
    paymentMode: parsed.data.paymentMode,
    paymentDate: parsed.data.paymentDate ? new Date(parsed.data.paymentDate) : undefined,
    items: parsed.data.items,
  });
  return json({ ok: run.failed === 0, ...run });
});
