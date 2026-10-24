import { type NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, ForbiddenError, getCompany, getUserPermissions, json, requireUser } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/tds-reconciliation/apply — mark confirmed 26AS matches as
 * reconciled (sets tdsReconciledAt). Flag-only field: the receivable stays
 * a tax asset on the books until the ITR adjustment entry; the flag just
 * records that the credit appeared in the govt statement.
 */

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.FINANCE_MANAGE)) throw new ForbiddenError("Requires finance.manage");
  const company = await getCompany();

  const body = (await req.json().catch(() => ({}))) as {
    matches?: { kind: "asset-sale" | "material-sale-payment"; id: string }[];
  };
  const matches = (body.matches ?? []).filter(
    (m) => (m.kind === "asset-sale" || m.kind === "material-sale-payment") && typeof m.id === "string",
  );
  if (matches.length === 0) return json({ error: "No matches to apply." }, { status: 400 });
  if (matches.length > 500) return json({ error: "Too many matches in one batch (max 500)." }, { status: 400 });

  const now = new Date();
  let applied = 0;
  await prisma.$transaction(async (tx) => {
    for (const m of matches) {
      if (m.kind === "asset-sale") {
        const r = await tx.assetSale.updateMany({
          where: { id: m.id, companyId: company.id, tdsReconciledAt: null },
          data: { tdsReconciledAt: now },
        });
        applied += r.count;
      } else {
        const r = await tx.materialSalePayment.updateMany({
          where: { id: m.id, sale: { companyId: company.id }, tdsReconciledAt: null },
          data: { tdsReconciledAt: now },
        });
        applied += r.count;
      }
    }
  });

  return json({ ok: true, applied });
});
