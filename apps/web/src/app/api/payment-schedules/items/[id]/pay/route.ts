import { NextRequest } from "next/server";
import { recordSchedulePayment } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  amount: z.coerce.number().min(0.01),
  paymentMode: z.string().optional(),
});

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const { id } = await params;
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const item = await recordSchedulePayment(id, parsed.data.amount, parsed.data.paymentMode, user.id);
    return json(item);
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
