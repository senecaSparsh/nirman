import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { updatePayrollLineComponents } from "@nirman/services";
import { apiHandler, getCompany, json, payrollLineComponentsSchema, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { prisma } from "@nirman/db";

/**
 * PUT /api/payroll/[id]/lines/[lineId]/components — replace the itemized
 * component breakdown on a DRAFT payroll line. This is where variable
 * quantities get entered (e.g. 420 km on a ₹3/km travel allowance) and
 * one-off ad-hoc earnings/deductions get added. Amounts are recomputed
 * server-side (rate × quantity) and rolled into the line's bucket fields.
 */
export const PUT = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) => {
  const user = await requirePermission(PERM.PAYROLL_MANAGE);
  const company = await getCompany();
  const { lineId } = await params;

  // Scoped pre-fetch — same guard as the PATCH sibling route.
  const existing = await prisma.payrollLine.findFirst({
    where: { id: lineId, employee: { companyId: company.id }, ...await scopeWhere("PayrollLine") },
  });
  if (!existing) return json({ error: "Payroll line not found or out of scope" }, { status: 404 });

  const body = await req.json();
  const parsed = payrollLineComponentsSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    await updatePayrollLineComponents({
      payrollLineId: lineId,
      components: parsed.data.components,
      userId: user.id,
    });
    revalidatePath("/hr/payroll");
    revalidatePath("/m/books/payroll");
    return json({ ok: true });
  } catch (err: unknown) {
    const status = typeof (err as { status?: number })?.status === "number" ? (err as { status: number }).status : 400;
    return json({ error: err instanceof Error ? err.message : "Failed to update components" }, { status });
  }
});
