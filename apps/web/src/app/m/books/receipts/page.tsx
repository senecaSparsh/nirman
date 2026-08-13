import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Wallet } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber } from "@/lib/utils";
import { MobileEmptyState, MobileStatCard } from "@/components/mobile/v2/primitives";
import { MobileReceiptsList, type ReceiptListItem } from "./MobileReceiptsList";

/** Finance → Receipts tab: recent payments received (asset sales + material sales). */
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

  const [assetPayments, materialPayments] = await Promise.all([
    prisma.assetSalePayment.findMany({
      where: { assetSale: { companyId: company.id }, status: "RECEIVED" },
      orderBy: { paymentDate: "desc" },
      take: 50,
      include: { assetSale: { select: { customer: { select: { name: true } }, saleNumber: true } } },
    }).catch(() => []),
    prisma.materialSalePayment.findMany({
      where: { sale: { companyId: company.id } },
      orderBy: { paymentDate: "desc" },
      take: 50,
      include: { sale: { select: { customer: { select: { name: true } }, saleNumber: true, partyName: true } } },
    }).catch(() => []),
  ]);

  // Merge into a unified list tagged by kind.
  const items: ReceiptListItem[] = [
    ...assetPayments.map((r) => ({
      id: r.id,
      kind: "ASSET" as const,
      customerName: r.assetSale.customer.name,
      saleNumber: r.assetSale.saleNumber,
      mode: r.mode,
      amount: toNum(r.amount),
      paymentDate: r.paymentDate.toISOString(),
    })),
    ...materialPayments.map((r) => ({
      id: r.id,
      kind: "MATERIAL" as const,
      customerName: r.sale.partyName ?? r.sale.customer.name,
      saleNumber: r.sale.saleNumber,
      mode: r.paymentMode,
      amount: toNum(r.amount),
      paymentDate: r.paymentDate.toISOString(),
    })),
  ].sort((a, b) => +new Date(b.paymentDate) - +new Date(a.paymentDate));

  const total = items.reduce((s, r) => s + r.amount, 0);
  const avg = items.length > 0 ? total / items.length : 0;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <MobileStatCard label="Total Received" value={formatCurrency(total)} icon={Wallet} tone="go" />
        <MobileStatCard label="Count" value={formatNumber(items.length, 0)} icon={Wallet} />
        <MobileStatCard label="Average" value={formatCurrency(avg)} icon={Wallet} />
      </div>

      {items.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No payments received" hint="Record payments from the Sales section" />
      ) : (
        <MobileReceiptsList items={items} />
      )}
    </div>
  );
}
