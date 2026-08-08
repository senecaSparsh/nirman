import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { ShoppingCart } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { MobilePageHeader, MobileCta, MobileRefreshButton } from "@/components/mobile/mobile-primitives";
import { MobileSalesList } from "@/components/mobile/mobile-sales-list";

/** Sales → Sales tab: all sales with inline payment recording. */
export default function BookSalesPage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <BookSalesContent />
    </Suspense>
  );
}

async function BookSalesContent() {
  await connection();
  const company = await getCompany();

  const sales = await prisma.assetSale.findMany({
    where: { companyId: company.id, status: "ACTIVE" },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: {
      customer: { select: { name: true } },
      payments: { where: { status: "RECEIVED" }, select: { amount: true } },
    },
  });

  const saleItems = sales.map((s) => {
    const totalPaid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    const salePrice = toNum(s.salePrice);
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      customerName: s.customer.name,
      saleDate: s.saleDate.toISOString(),
      salePrice,
      totalPaid,
      balance: salePrice - totalPaid,
      paymentStatus: s.paymentStatus,
      status: s.status,
    };
  });

  const totalDue = saleItems
    .filter((s) => s.paymentStatus !== "PAID")
    .reduce((sum, s) => sum + s.balance, 0);

  return (
    <div>
      <MobilePageHeader title="Sales" subtitle={`${saleItems.length} active · ${formatCurrency(totalDue)} due`} right={<MobileRefreshButton />} />

      <div className="px-4 pb-2">
        <MobileCta href="/m/sales/new" icon={ShoppingCart}>
          New sale
        </MobileCta>
      </div>

      <MobileSalesList sales={saleItems} />
    </div>
  );
}
