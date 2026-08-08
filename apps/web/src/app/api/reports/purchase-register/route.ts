import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * GET /api/reports/purchase-register?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Purchase / Purchase Return Register — a digital version of the client's
 * paper register. Lists one row per purchase bill (P-xxxxx) and one row per
 * supplier return (negative amount), with columns matching the paper format:
 * SrNo, Number, Date, Name (supplier), Round, Bill Amt.
 *
 * "EXCLUDE Challan" in the paper title means we only list bills with amounts,
 * not goods-in-transit challans — which is exactly what DirectPurchase captures.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.PROCUREMENT_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const billDateFilter = (field: string) => {
    const f: Record<string, { gte?: Date; lte?: Date }> = {};
    if (from) f[field] = { gte: new Date(from) };
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      f[field] = { ...f[field], lte: end };
    }
    return f;
  };

  const [purchases, returns] = await Promise.all([
    prisma.directPurchase.findMany({
      where: {
        companyId: company.id,
        ...billDateFilter("billDate"),
      },
      include: {
        supplier: { select: { name: true } },
      },
      orderBy: { billDate: "asc" },
    }),
    prisma.supplierReturn.findMany({
      where: {
        companyId: company.id,
        status: { in: ["SUBMITTED", "COMPLETED"] },
        ...billDateFilter("returnDate"),
      },
      include: {
        supplier: { select: { name: true } },
        lines: { select: { qty: true, unitCost: true } },
      },
      orderBy: { returnDate: "asc" },
    }),
  ]);

  type Row = {
    srNo: number;
    id: string;
    type: "PURCHASE" | "RETURN";
    number: string;
    date: string;
    name: string;
    round: number;
    billAmt: number;
  };

  const rows: Row[] = [];

  for (const p of purchases) {
    rows.push({
      srNo: 0,
      id: p.id,
      type: "PURCHASE",
      number: p.billNumber,
      date: p.billDate.toISOString().slice(0, 10),
      name: p.supplier?.name ?? p.supplierName,
      round: toNum(p.roundOff),
      billAmt: toNum(p.billAmount),
    });
  }

  for (const r of returns) {
    const returnAmount = r.lines.reduce((s, l) => s + toNum(l.qty) * toNum(l.unitCost), 0);
    rows.push({
      srNo: 0,
      id: r.id,
      type: "RETURN",
      number: r.returnNumber,
      date: r.returnDate.toISOString().slice(0, 10),
      name: r.supplier.name,
      round: 0,
      billAmt: -returnAmount, // negative — returns reduce net purchases
    });
  }

  // Sort by date, then assign serial numbers
  rows.sort((a, b) => a.date.localeCompare(b.date));
  rows.forEach((r, i) => (r.srNo = i + 1));

  const totalPurchases = rows.filter((r) => r.type === "PURCHASE").reduce((s, r) => s + r.billAmt, 0);
  const totalReturns = rows.filter((r) => r.type === "RETURN").reduce((s, r) => s + r.billAmt, 0);
  const netTotal = totalPurchases + totalReturns;

  return json({
    from: from ?? null,
    to: to ?? null,
    rows,
    count: rows.length,
    purchaseCount: rows.filter((r) => r.type === "PURCHASE").length,
    returnCount: rows.filter((r) => r.type === "RETURN").length,
    totalPurchases,
    totalReturns,
    netTotal,
  });
});
