import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Landmark } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileSuppliersList, type SupplierListItem } from "./MobileSuppliersList";

/**
 * /m/suppliers — mobile supplier directory. Shows outstanding dues and
 * PO counts so procurement and managers can check who they owe and how
 * active each supplier is.
 */
export default function MobileSuppliersPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileSuppliersContent />
    </Suspense>
  );
}

async function MobileSuppliersContent() {
  await connection();
  const company = await getCompany();

  const suppliers = await prisma.supplier.findMany({
    where: { deletedAt: null, purchaseOrders: { some: { companyId: company.id } } },
    orderBy: { name: "asc" },
    take: 80,
    include: {
      _count: {
        select: {
          purchaseOrders: { where: { companyId: company.id } },
        },
      },
    },
  });

  const rows: SupplierListItem[] = suppliers.map((s) => ({
    id: s.id,
    name: s.name,
    gstin: s.gstin ?? null,
    phone: s.phone ?? null,
    poCount: s._count.purchaseOrders,
    balanceOwed: toNum(s.balanceOwed),
  }));

  const totalOwed = rows.reduce((s, sup) => s + sup.balanceOwed, 0);
  const withDues = rows.filter((s) => s.balanceOwed > 0);

  return (
    <div>
      <MobilePageHeader
        title="Suppliers"
        subtitle={`${rows.length} active · ${withDues.length} with dues`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Total Owed"
          value={formatCurrency(totalOwed)}
          icon={Landmark}
          tone={totalOwed > 0 ? "warning" : "default"}
        />
        <MobileStatCard
          label="Suppliers"
          value={String(rows.length)}
          icon={Landmark}
        />
        <MobileStatCard
          label="With Dues"
          value={String(withDues.length)}
          icon={Landmark}
          tone={withDues.length > 0 ? "warning" : "default"}
        />
        <MobileStatCard
          label="Total POs"
          value={String(rows.reduce((s, r) => s + r.poCount, 0))}
          icon={Landmark}
        />
      </div>

      {rows.length === 0 ? (
        <MobileEmptyState
          icon={Landmark}
          title="No suppliers"
          hint="Add suppliers from the desktop Build → Acquire section"
        />
      ) : (
        <MobileSuppliersList items={rows} />
      )}
    </div>
  );
}
