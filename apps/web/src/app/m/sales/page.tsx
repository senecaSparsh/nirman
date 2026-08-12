import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Wallet } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { MobileSalesCollection } from "./MobileSalesCollection";

/**
 * /m/sales — Sales Collection page.
 *
 * Purpose: a salesperson opens this to collect money. The page is
 * organized around "what's owed to me" — not "list of all sales".
 *
 * The page answers three questions:
 *   1. How much is outstanding across all deals?  → Collection banner
 *   2. Which deals need payment right now?        → Outstanding cards (sorted by amount due)
 *   3. What's already been collected?             → Settled summary
 *
 * Each outstanding card has an inline "Record Payment" action.
 * A "New Sale" button is at the top for starting a new deal.
 */
export default function MobileSalesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <Wallet className="size-5 animate-pulse" style={{ color: "var(--color-ink-300)" }} />
        </div>
      }
    >
      <SalesContent />
    </Suspense>
  );
}

async function SalesContent() {
  await connection();
  const company = await getCompany();

  const sales = await prisma.assetSale.findMany({
    where: { companyId: company.id, status: "ACTIVE" },
    orderBy: { saleDate: "desc" },
    take: 50,
    include: {
      customer: { select: { id: true, name: true, phone: true } },
      builtUnit: { select: { unitNumber: true, unitType: true, project: { select: { name: true } } } },
      project: { select: { name: true } },
      payments: { where: { status: "RECEIVED" }, select: { amount: true } },
    },
  });

  const items = sales.map((s) => {
    const totalPaid = s.payments.reduce((sum, p) => sum + toNum(p.amount), 0);
    const salePrice = toNum(s.salePrice);
    const balance = salePrice - totalPaid;
    const assetLabel = s.builtUnit
      ? `${s.builtUnit.unitNumber} · ${s.builtUnit.project.name}`
      : s.assetType === "LAND"
        ? `Land · ${s.project.name}`
        : s.project.name;
    return {
      id: s.id,
      saleNumber: s.saleNumber,
      customerName: s.customer.name,
      customerId: s.customer.id,
      customerPhone: s.customer.phone,
      assetLabel,
      saleDate: s.saleDate.toISOString(),
      salePrice,
      totalPaid,
      balance,
      paymentStatus: s.paymentStatus,
      saleStage: s.saleStage,
    };
  });

  // Aggregate stats
  const totalValue = items.reduce((s, x) => s + x.salePrice, 0);
  const totalCollected = items.reduce((s, x) => s + x.totalPaid, 0);
  const totalOutstanding = items.reduce((s, x) => s + x.balance, 0);
  const outstandingCount = items.filter((x) => x.balance > 0).length;
  const settledCount = items.filter((x) => x.balance <= 0).length;
  const collectionPct = totalValue > 0 ? Math.round((totalCollected / totalValue) * 100) : 0;

  return (
    <MobileSalesCollection
      items={items}
      stats={{
        totalValue,
        totalCollected,
        totalOutstanding,
        outstandingCount,
        settledCount,
        collectionPct,
      }}
    />
  );
}
