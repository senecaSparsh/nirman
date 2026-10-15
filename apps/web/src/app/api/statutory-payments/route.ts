import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { recordStatutoryPayment, statutoryOutstanding, STATUTORY_KINDS, ServiceError } from "@nirman/services";
import { prisma } from "@nirman/db";
import { PERM } from "@/lib/roles";
import { apiHandler, ForbiddenError, getCompany, getUserPermissions, json, requireUser, scopeWhere, toNum } from "@/lib/server";

/**
 * GET /api/statutory-payments — outstanding balances per kind + history.
 * POST — record a remittance (PF/ESI/TDS drains its payable; GST drains
 *        output tax and offsets ITC). Capped at the outstanding balance.
 */
export const GET = apiHandler(async () => {
  await requireUser();
  const company = await getCompany();
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.FINANCE_VIEW) && !perms.includes(PERM.FINANCE_MANAGE)) {
    throw new ForbiddenError("Missing finance permission");
  }

  const [outstanding, rows] = await Promise.all([
    Promise.all(STATUTORY_KINDS.map(async (k) => ({ kind: k, ...(await statutoryOutstanding(company.id, k)) }))),
    prisma.statutoryPayment.findMany({
      where: { ...await scopeWhere("StatutoryPayment"), companyId: company.id },
      orderBy: { paymentDate: "desc" },
      take: 200,
    }),
  ]);

  return json({
    outstanding: outstanding.map((o) => ({
      kind: o.kind,
      outstanding: o.outstanding.toString(),
      itcAvailable: o.itcAvailable?.toString(),
      outputGst: o.outputGst?.toString(),
    })),
    payments: rows.map((r) => ({
      id: r.id,
      kind: r.kind,
      amount: toNum(r.amount),
      itcUtilized: toNum(r.itcUtilized),
      period: r.period,
      paymentDate: r.paymentDate.toISOString(),
      referenceNo: r.referenceNo,
      notes: r.notes,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    })),
  });
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.FINANCE_MANAGE)) {
    throw new ForbiddenError("Missing finance manage permission");
  }

  const body = await req.json().catch(() => ({}));
  const { kind, amount, paymentDate, period, referenceNo, notes } = body ?? {};
  if (!kind || amount == null) {
    return json({ error: "kind and amount are required" }, { status: 400 });
  }

  try {
    const row = await recordStatutoryPayment({
      companyId: company.id,
      kind,
      amount,
      paymentDate,
      period: period ?? undefined,
      referenceNo: referenceNo ?? undefined,
      notes: notes ?? undefined,
      userId: user.id,
    });
    revalidatePath("/finance");
    revalidatePath("/books");
    return json({ ok: true, id: row.id, itcUtilized: row.itcUtilized.toString() }, { status: 201 });
  } catch (err) {
    if (err instanceof ServiceError) return json({ error: err.message }, { status: err.status ?? 400 });
    throw err;
  }
});
