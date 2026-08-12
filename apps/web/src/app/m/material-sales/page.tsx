import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileMaterialSalesList } from "./MobileMaterialSalesList";

/**
 * /m/material-sales — mobile material/scrap sales. Shows recent sales with
 * their profit and payment status. The scrap → cost recovery flow is a key
 * business workflow per the SRS.
 */
export default function MobileMaterialSalesPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileMaterialSalesContent />
    </Suspense>
  );
}

async function MobileMaterialSalesContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.SALE_CREATE);

  const sales = await prisma.materialSale.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 80,
    select: {
      id: true,
      saleNumber: true,
      saleDate: true,
      subtotal: true,
      totalAmount: true,
      totalCost: true,
      grossProfit: true,
      scrapSubtotal: true,
      status: true,
      paymentStatus: true,
      customer: { select: { name: true } },
      project: { select: { name: true } },
      lines: { select: { id: true } },
    },
  });

  const active = sales.filter((s) => s.status === "ACTIVE");
  const pendingPayment = active.filter((s) => s.paymentStatus === "PENDING");
  const totalRevenue = active.reduce((s, sale) => s + toNum(sale.subtotal), 0);
  const totalProfit = active.reduce((s, sale) => s + toNum(sale.grossProfit), 0);

  const serialized = sales.map((s) => ({
    id: s.id,
    saleNumber: s.saleNumber,
    status: s.status,
    paymentStatus: s.paymentStatus,
    saleDate: s.saleDate.toISOString(),
    totalAmount: toNum(s.totalAmount),
    grossProfit: toNum(s.grossProfit),
    scrapSubtotal: toNum(s.scrapSubtotal),
    customerName: s.customer?.name ?? null,
    projectName: s.project?.name ?? null,
    lineCount: s.lines.length,
  }));

  return (
    <MobileMaterialSalesList
      items={serialized}
      totalRevenue={totalRevenue}
      totalProfit={totalProfit}
      pendingCount={pendingPayment.length}
      canCreate={canCreate}
    />
  );
}
