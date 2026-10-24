import { type NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, ForbiddenError, getCompany, getUserPermissions, json, requireUser, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { parseForm26as, type Form26asRow } from "@/lib/form26as";

/**
 * POST /api/tds-reconciliation/preview — parse pasted Form 26AS text and
 * match each credit row against unreconciled book entries:
 *   - AssetSale.tdsAmount        (194-IA buyer TDS on unit sales)
 *   - MaterialSalePayment.tdsAmount (buyer-side TDS on material sales)
 *
 * Matching is amount-exact (±₹1). A unique candidate auto-matches; multiple
 * same-amount candidates come back in `ambiguous` for the user to pick.
 */

const TOLERANCE = 1;

type Match = {
  rowIndex: number;
  kind: "asset-sale" | "material-sale-payment";
  id: string;
  label: string;
  bookAmount: number;
  row: Form26asRow;
};

export const POST = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const perms = await getUserPermissions();
  if (!perms.includes(PERM.FINANCE_MANAGE)) throw new ForbiddenError("Requires finance.manage");
  const company = await getCompany();

  const body = (await req.json().catch(() => ({}))) as { text?: string };
  const rows = parseForm26as(body.text ?? "");
  if (rows.length === 0) return json({ error: "No TDS rows found. Paste the 26AS Part-A table text." }, { status: 400 });

  const [assetSales, materialPayments] = await Promise.all([
    prisma.assetSale.findMany({
      where: { companyId: company.id, tdsReconciledAt: null, tdsAmount: { gt: 0 } },
      select: { id: true, saleNumber: true, customer: { select: { name: true } }, tdsAmount: true },
      take: 500,
    }),
    prisma.materialSalePayment.findMany({
      where: { sale: { companyId: company.id }, tdsReconciledAt: null, tdsAmount: { gt: 0 }, direction: "IN" },
      select: { id: true, tdsAmount: true, sale: { select: { saleNumber: true, partyName: true, customer: { select: { name: true } } } } },
      take: 1000,
    }),
  ]);

  type Candidate = { kind: Match["kind"]; id: string; label: string; amount: number };
  const candidates: Candidate[] = [
    ...assetSales.map((s) => ({
      kind: "asset-sale" as const,
      id: s.id,
      label: `${s.saleNumber} · ${s.customer.name}`,
      amount: toNum(s.tdsAmount),
    })),
    ...materialPayments.map((p) => ({
      kind: "material-sale-payment" as const,
      id: p.id,
      label: `${p.sale.saleNumber} · ${p.sale.partyName ?? p.sale.customer.name}`,
      amount: toNum(p.tdsAmount),
    })),
  ];

  const usedIds = new Set<string>();
  const matched: Match[] = [];
  const ambiguous: { rowIndex: number; row: Form26asRow; candidates: Candidate[] }[] = [];
  const unmatched: { rowIndex: number; row: Form26asRow }[] = [];

  rows.forEach((row, rowIndex) => {
    const hits = candidates.filter(
      (c) => !usedIds.has(c.id) && Math.abs(c.amount - row.tdsDeposited) <= TOLERANCE,
    );
    if (hits.length === 1) {
      const c = hits[0]!;
      usedIds.add(c.id);
      matched.push({ rowIndex, kind: c.kind, id: c.id, label: c.label, bookAmount: c.amount, row });
    } else if (hits.length > 1) {
      ambiguous.push({ rowIndex, row, candidates: hits });
    } else {
      unmatched.push({ rowIndex, row });
    }
  });

  return json({ matched, ambiguous, unmatched, totalRows: rows.length });
});
