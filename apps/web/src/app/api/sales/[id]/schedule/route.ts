import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { createSalePaymentSchedule, autoGenerateScheduleItems } from "@nirman/services";
import { apiHandler, json, paymentScheduleSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const autoGenSchema = z.object({
  autoGenerate: z.literal(true),
  salePrice: z.coerce.number().positive("salePrice must be greater than 0"),
  gstAmount: z.coerce.number().min(0).optional(),
  advanceAmount: z.coerce.number().min(0).optional(),
  dealMaturityMonths: z.coerce.number().int().positive("dealMaturityMonths must be a positive integer"),
  scheduleType: z.enum(["CLP", "TLP", "DPP"]).optional(),
});

/**
 * POST /api/sales/[id]/schedule — create or replace a payment schedule.
 * Body: { type: "CLP"|"TLP"|"DPP", items: [...] }
 * Or: { autoGenerate: true, advanceAmount, dealMaturityMonths } to auto-generate.
 */
export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const { id } = await params;
  const body = await req.json();

  try {
    if (body.autoGenerate) {
      const parsed = autoGenSchema.safeParse(body);
      if (!parsed.success) {
        return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
      }
      const { salePrice, gstAmount, advanceAmount, dealMaturityMonths, scheduleType } = parsed.data;
      const items = autoGenerateScheduleItems(
        salePrice,
        gstAmount ?? 0,
        advanceAmount ?? 0,
        dealMaturityMonths,
      );
      if (items.length === 0) {
        return json({ error: "No schedule items to generate (fully paid or no maturity months)" }, { status: 400 });
      }
      const schedule = await createSalePaymentSchedule(
        id,
        { type: scheduleType ?? "TLP", items },
        user.id,
      );
      revalidatePath("/sales");
      return json({ ok: true, schedule }, { status: 201 });
    }

    const parsed = paymentScheduleSchema.safeParse(body);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
    }
    const schedule = await createSalePaymentSchedule(id, parsed.data, user.id);
    revalidatePath("/sales");
    return json({ ok: true, schedule }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create schedule") }, { status: 400 });
  }
});
