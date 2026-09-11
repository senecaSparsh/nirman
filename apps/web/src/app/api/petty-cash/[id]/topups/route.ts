import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { topUpPettyCash, ServiceError } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const topUpSchema = z.object({
  amount: z.coerce.number().positive("Amount must be > 0"),
  paymentMode: z.string().optional().nullable(),
  referenceNo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.FINANCE_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = topUpSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    await topUpPettyCash({
      floatId: id,
      companyId: company.id,
      amount: parsed.data.amount,
      paymentMode: parsed.data.paymentMode ?? null,
      referenceNo: parsed.data.referenceNo ?? null,
      notes: parsed.data.notes ?? null,
      userId: user.id,
    });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status });
    throw err;
  }
  revalidatePath("/petty-cash");
  revalidatePath("/m/petty-cash");
  return json({ ok: true }, { status: 201 });
});
