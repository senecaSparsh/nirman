import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Wallet } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileReceiptsList } from "./MobileReceiptsList";

/** Finance → Receipts tab: recent payments received. */
export default function BooksReceiptsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <BooksReceiptsContent />
    </Suspense>
  );
}

async function BooksReceiptsContent() {
  await connection();
  const company = await getCompany();

  const receipts = await prisma.assetSalePayment.findMany({
    where: { assetSale: { companyId: company.id }, status: "RECEIVED" },
    orderBy: { paymentDate: "desc" },
    take: 25,
    include: { assetSale: { select: { customer: { select: { name: true } }, saleNumber: true } } },
  });

  const total = receipts.reduce((s, r) => s + toNum(r.amount), 0);
  const avg = receipts.length > 0 ? total / receipts.length : 0;

  // Serialize for the client component (search by customer name, mode)
  const serialized = receipts.map((r) => ({
    id: r.id,
    customerName: r.assetSale.customer.name,
    saleNumber: r.assetSale.saleNumber,
    mode: r.mode,
    amount: toNum(r.amount),
    paymentDate: r.paymentDate.toISOString(),
  }));

  return (
    <div>
      <MobilePageHeader
        title="Receipts"
        subtitle={`${formatCurrency(total)} received`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-3 gap-2 p-3">
        <MobileStatCard label="Total Received" value={formatCurrency(total)} icon={Wallet} tone="success" />
        <MobileStatCard label="Count" value={formatNumber(receipts.length, 0)} icon={Wallet} />
        <MobileStatCard label="Average" value={formatCurrency(avg)} icon={Wallet} />
      </div>

      {receipts.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No payments received" hint="Record payments from the desktop Sales section" />
      ) : (
        <MobileReceiptsList items={serialized} />
      )}
    </div>
  );
}
