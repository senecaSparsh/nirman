import { NextRequest } from "next/server";
import { updatePayrollLine } from "@nirman/services";
import { apiHandler, json, payrollLineUpdateSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) => {
  const user = await requirePermission(PERM.PAYROLL_MANAGE);
  const { lineId } = await params;
  const body = await req.json();
  const parsed = payrollLineUpdateSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    await updatePayrollLine({
      payrollLineId: lineId,
      overtimeAmount: parsed.data.overtimeAmount,
      allowance: parsed.data.allowance,
      bonus: parsed.data.bonus,
      pf: parsed.data.pf,
      employerPf: parsed.data.employerPf,
      esi: parsed.data.esi,
      professionTax: parsed.data.professionTax,
      tax: parsed.data.tax,
      deductions: parsed.data.deductions,
      userId: user.id,
    });
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to update payroll line") }, { status: 400 });
  }
});
