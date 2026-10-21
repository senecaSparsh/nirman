import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { Hint } from "@/components/page";
import { applyCap, LIST_CAP } from "@/lib/list-cap";
import { VendorsView } from "@/components/vendors/vendors-view";
import { formatCurrency } from "@/lib/utils";
import { NoAccess } from "@/components/no-access";

export async function VendorsContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const company = await getCompany();

  if (!__effPerms.includes(PERM.PROCUREMENT_VIEW)) {
    return (
      <NoAccess what="vendors" permission={PERM.PROCUREMENT_VIEW} />
    );
  }

  const perms = {
    canManage: __effPerms.includes(PERM.PROCUREMENT_MANAGE),
  };

  const OPEN_PO_STATUSES = ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] as const;

  const [suppliers, poAgg, poAgg2] = await Promise.all([
    prisma.supplier.findMany({
      take: LIST_CAP + 1,
      where: { deletedAt: null, companyId: company.id },
      orderBy: { name: "asc" },
      include: {
        purchaseOrders: {
          where: { companyId: company.id },
          orderBy: { createdAt: "desc" },
          take: 10,
          select: {
            id: true,
            poNumber: true,
            status: true,
            orderDate: true,
            total: true,
            gstTotal: true,
          },
        },
        _count: {
          select: {
            purchaseOrders: { where: { companyId: company.id } },
          },
        },
      },
    }),
    // Aggregates for "Total spent" / "Open POs" — the embedded relation is
    // capped at 10 for display, so totals MUST NOT be summed from it.
    prisma.purchaseOrder.groupBy({
      by: ["supplierId", "status"],
      where: { companyId: company.id },
      _count: true,
      _sum: { total: true },
    }),
    // Oldest unpaid invoice per supplier — drives the 43B(h) 45-day flag on
    // MSME vendors (dues unpaid past 45 days lose their deduction).
    prisma.supplierInvoice.groupBy({
      by: ["supplierId"],
      where: { companyId: company.id, status: { in: ["PENDING", "MATCHED", "DISPUTED", "APPROVED"] } },
      _min: { invoiceDate: true },
    }),
  ]);
  const { rows: supplierRows, capped } = applyCap(suppliers);
  const cappedLabels = capped ? ["vendors"] : [];
  const oldestUnpaid = new Map(poAgg2.map((g) => [g.supplierId, g._min.invoiceDate]));

  // status buckets per supplier: { supplierId: { total, openCount } }
  const poAggMap = new Map<string, { total: number; openCount: number }>();
  for (const g of poAgg) {
    const cur = poAggMap.get(g.supplierId) ?? { total: 0, openCount: 0 };
    cur.total += toNum(g._sum.total);
    if (OPEN_PO_STATUSES.includes(g.status as (typeof OPEN_PO_STATUSES)[number])) cur.openCount += g._count;
    poAggMap.set(g.supplierId, cur);
  }

  const vendorRows = supplierRows.map((s) => {
    const pos = s.purchaseOrders;
    const agg = poAggMap.get(s.id);
    const totalSpent = agg?.total ?? 0;
    const openPOs = agg?.openCount ?? 0;
    return {
      id: s.id,
      name: s.name,
      gstin: s.gstin,
      phone: s.phone,
      email: s.email,
      address: s.address,
      balanceOwed: toNum(s.balanceOwed),
      isMsme: s.isMsme,
      udyamNo: s.udyamNo,
      bankName: s.bankName,
      bankAccountNo: s.bankAccountNo,
      bankIfsc: s.bankIfsc,
      upiId: s.upiId,
      // Days since the oldest unpaid invoice — the 43B(h) 45-day clock.
      msmeDaysOutstanding: s.isMsme && oldestUnpaid.get(s.id)
        // eslint-disable-next-line react-hooks/purity -- server component, Date.now() is fine
        ? Math.floor((Date.now() - oldestUnpaid.get(s.id)!.getTime()) / 86400000)
        : null,
      leadTimeDays: s.leadTimeDays,
      totalPOs: s._count.purchaseOrders,
      openPOs,
      poCount: openPOs,
      totalSpent,
      recentPOs: pos.map((p) => ({
        id: p.id,
        poNumber: p.poNumber,
        status: p.status,
        orderDate: p.orderDate.toISOString(),
        total: toNum(p.total),
        gst: toNum(p.gstTotal),
      })),
    };
  });

  const withDues = vendorRows.filter((v) => v.balanceOwed > 0).length;
  const totalOwed = vendorRows.reduce((s, v) => s + toNum(v.balanceOwed), 0);

  return (
    <>
      <PageHeader
        title="Vendors"
        description="Supplier directory, purchase history, outstanding balances — and auto-computed vendor ratings."
        stats={[
          { label: "Total", value: vendorRows.length, hint: "Total vendors in the directory." },
          { label: "With Dues", value: withDues, tone: withDues > 0 ? "warning" : "muted", hint: "Vendors with an unpaid balance for received goods." },
          { label: "Total Owed", value: formatCurrency(totalOwed), tone: totalOwed > 0 ? "danger" : "muted", hint: "Sum of all unpaid balances across vendors. This is money leaving the company." },
        ]}
      />
      {cappedLabels.length > 0 && (
        <Hint tone="warning">
          {`Showing only the most recent records for ${cappedLabels.join(", ")} — older entries are still in the database but hidden from this page.`}
        </Hint>
      )}
      <VendorsView vendors={vendorRows} permissions={perms} />
    </>
  );
}
