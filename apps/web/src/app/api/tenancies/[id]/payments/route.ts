import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { recordRentPayment } from "@nirman/services";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, rentPaymentSchema, requirePermission, scopeWhere } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const POST = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.SALE_CREATE);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = rentPaymentSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // Scoped pre-fetch — recordRentPayment only checks company, so without
  // this a project-scoped sales user could post payments onto an
  // out-of-scope tenancy.
  const tenancy = await prisma.tenancy.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("Tenancy") },
    select: { id: true },
  });
  if (!tenancy) return json({ error: "Tenancy not found or out of scope" }, { status: 404 });

  try {
    const payment = await recordRentPayment({
      tenancyId: id,
      companyId: company.id,
      amount: parsed.data.amount,
      paymentDate: parsed.data.paymentDate,
      dueDate: parsed.data.dueDate,
      mode: parsed.data.mode,
      reference: parsed.data.reference ?? undefined,
      tdsAmount: parsed.data.tdsAmount ?? undefined,
      tdsCertificateNo: parsed.data.tdsCertificateNo ?? undefined,
      periodStart: parsed.data.periodStart ?? undefined,
      periodEnd: parsed.data.periodEnd ?? undefined,
      userId: user.id,
    });
    revalidatePath("/rentals");
    revalidatePath("/m/rentals");
    revalidatePath("/m/real-estate?tab=rentals");
    return json({ ok: true, id: payment.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to record rent payment") }, { status: 400 });
  }
});
