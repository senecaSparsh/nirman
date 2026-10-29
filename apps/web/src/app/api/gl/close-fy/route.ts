import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { closeFinancialYear } from "@nirman/services";
import { apiHandler, getCompany, getOwnRole, json, requirePermission } from "@/lib/server";
import { PERM, canDoOwnerOnly } from "@/lib/roles";

/**
 * POST /api/gl/close-fy — close a financial year.
 * Body: { fyEnd: "2026-03-31" } — posts the P&L→retained-earnings closing
 * journal dated fyEnd, then advances the GL period lock to fyEnd. Owner
 * only: closing the books is the one action nobody below the owner should
 * ever perform. Idempotent per fyEnd (a repeat run finds P&L zeroed and
 * no-ops).
 */
export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.FINANCE_MANAGE);
  if (!canDoOwnerOnly(await getOwnRole())) {
    return json({ error: "Only the owner can close a financial year." }, { status: 403 });
  }
  const company = await getCompany();
  const body = await req.json().catch(() => ({}));
  const fyEnd = body?.fyEnd ? new Date(body.fyEnd) : null;
  if (!fyEnd || Number.isNaN(fyEnd.getTime())) {
    return json({ error: "fyEnd is required (e.g. \"2026-03-31\")" }, { status: 400 });
  }

  try {
    const result = await closeFinancialYear({ companyId: company.id, fyEnd });
    revalidatePath("/gl");
    revalidatePath("/settings");
    return json(
      {
        ok: result.closed,
        closed: result.closed,
        reason: result.reason,
        entryNumber: result.entryNumber,
        revenueClosed: result.revenueClosed?.toNumber(),
        expenseClosed: result.expenseClosed?.toNumber(),
        netIncome: result.netIncome?.toNumber(),
        accountsClosed: result.accountsClosed,
        lockedUntil: result.lockedUntil?.toISOString() ?? null,
      },
      { status: result.closed ? 201 : 200 },
    );
  } catch (err: unknown) {
    const status = (err as { status?: number })?.status ?? 400;
    return json({ error: err instanceof Error ? err.message : "Failed to close the financial year" }, { status });
  }
});
