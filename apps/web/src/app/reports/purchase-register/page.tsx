import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { PurchaseRegisterReport } from "@/components/reports/purchase-register-report";

import { NoAccess } from "@/components/no-access";

/**
 * Purchase / Purchase Return Register — a digital version of the client's
 * paper register. Lists every purchase bill (P-xxxxx) and supplier return
 * in a period. Matches the paper "Purchase, Purchase Return (EXCLUDE Challan)
 * Register" columns: SrNo, Number, Date, Name, Round, Bill Amt.
 */
export default function PurchaseRegisterPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading purchase register…" variant="list" />}>
        <PurchaseRegisterContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function PurchaseRegisterContent({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  await connection();
  const { from: fromParam, to: toParam } = await searchParams;
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return <NoAccess what="the purchase register" />;
  }

  // Default to current financial year (Apr 1 → Mar 31) if no range given
  const now = new Date();
  const fyStart = new Date(now.getFullYear() - (now.getMonth() < 3 ? 1 : 0), 3, 1);
  const fromDate = fromParam ? new Date(fromParam) : fyStart;
  const toDate = toParam ? new Date(toParam) : now;
  toDate.setHours(23, 59, 59, 999);
  const from = fromDate.toISOString().slice(0, 10);
  const to = toDate.toISOString().slice(0, 10);

  const dateFilter = { billDate: { gte: fromDate, lte: toDate } };
  const returnDateFilter = { returnDate: { gte: fromDate, lte: toDate } };

  const [purchases, returns] = await Promise.all([
    prisma.directPurchase.findMany({
      where: { companyId: company.id, ...dateFilter },
      include: { supplier: { select: { name: true } } },
      orderBy: { billDate: "asc" },
    }),
    prisma.supplierReturn.findMany({
      where: {
        companyId: company.id,
        status: { in: ["SUBMITTED", "COMPLETED"] },
        ...returnDateFilter,
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
      billAmt: -returnAmount,
    });
  }

  rows.sort((a, b) => a.date.localeCompare(b.date));
  rows.forEach((r, i) => (r.srNo = i + 1));

  const totalPurchases = rows.filter((r) => r.type === "PURCHASE").reduce((s, r) => s + r.billAmt, 0);
  const totalReturns = rows.filter((r) => r.type === "RETURN").reduce((s, r) => s + r.billAmt, 0);
  const netTotal = totalPurchases + totalReturns;

  const report = {
    from,
    to,
    rows,
    count: rows.length,
    purchaseCount: rows.filter((r) => r.type === "PURCHASE").length,
    returnCount: rows.filter((r) => r.type === "RETURN").length,
    totalPurchases,
    totalReturns,
    netTotal,
  };

  return (
    <>
      <PageHeader
        title="Purchase Register"
        description="Every purchase bill and purchase return in the period — one row per bill with its number, date, supplier, and amount. A digital version of the paper Purchase and Purchase Return Register."
        stats={[
          { label: "Bills", value: report.count },
          { label: "Purchases", value: formatCurrency(totalPurchases) },
          { label: "Returns", value: formatCurrency(totalReturns) },
          { label: "Net", value: formatCurrency(netTotal) },
        ]}
      />
      <PurchaseRegisterReport report={report} />
    </>
  );
}
