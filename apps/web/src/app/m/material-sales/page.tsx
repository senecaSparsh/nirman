import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Recycle } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
  MobileFab,
} from "@/components/mobile/mobile-primitives";
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
    },
  });

  const active = sales.filter((s) => s.status === "ACTIVE");
  const pendingPayment = active.filter((s) => s.paymentStatus === "PENDING");
  const totalRevenue = active.reduce((s, sale) => s + toNum(sale.subtotal), 0);
  const totalProfit = active.reduce((s, sale) => s + toNum(sale.grossProfit), 0);
  const scrapRecovery = active.reduce((s, sale) => s + toNum(sale.scrapSubtotal), 0);

  // Serialize for client component
  const serialized = sales.map((s) => ({
    id: s.id,
    saleNumber: s.saleNumber,
    status: s.status,
    paymentStatus: s.paymentStatus,
    saleDate: s.saleDate.toISOString(),
    totalAmount: toNum(s.totalAmount),
    grossProfit: toNum(s.grossProfit),
    customerName: s.customer?.name ?? null,
    projectName: s.project?.name ?? null,
  }));

  return (
    <div>
      <MobilePageHeader
        title="Material Sales"
        subtitle={`${active.length} active · ${pendingPayment.length} pending payment`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Revenue"
          value={formatCurrency(totalRevenue)}
          icon={Recycle}
          tone="success"
        />
        <MobileStatCard
          label="Profit"
          value={formatCurrency(totalProfit)}
          icon={Recycle}
          tone="success"
        />
        {scrapRecovery > 0 && (
          <MobileStatCard
            label="Scrap Recovery"
            value={formatCurrency(scrapRecovery)}
            icon={Recycle}
            hint="Cost recovered from scrap sales"
          />
        )}
        <MobileStatCard
          label="Unpaid"
          value={String(pendingPayment.length)}
          icon={Recycle}
          tone={pendingPayment.length > 0 ? "warning" : "default"}
        />
      </div>

      <MobileMaterialSalesList items={serialized} />

      {sales.length === 0 && (
        <>
          <MobileSectionTitle>Recent Sales</MobileSectionTitle>
          <MobileEmptyState
            icon={Recycle}
            title="No material sales"
            hint="Sell surplus or scrap material from the desktop Sell section"
          />
        </>
      )}

      <MobileFab href="/material-sales" label="New material sale" />
    </div>
  );
}
