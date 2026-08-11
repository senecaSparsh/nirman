import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Users, UserPlus } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber, formatCurrency } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
  MobileCta,
} from "@/components/mobile/mobile-primitives";
import { MobileCustomersList, type CustomerListItem } from "./MobileCustomersList";

/**
 * /m/customers — mobile customer list. Replaces every desktop `/customers`
 * link from the mobile surface.
 */
export default function MobileCustomersPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileCustomersContent />
    </Suspense>
  );
}

async function MobileCustomersContent() {
  await connection();
  const company = await getCompany();

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, assetSales: { some: { companyId: company.id } } },
    orderBy: { name: "asc" },
    include: {
      _count: { select: { assetSales: { where: { companyId: company.id, status: "ACTIVE" } } } },
      assetSales: {
        where: { companyId: company.id, status: "ACTIVE" },
        select: { salePrice: true, paymentStatus: true },
      },
    },
    take: 100,
  });

  const rows: CustomerListItem[] = customers.map((c) => {
    const activeSales = c.assetSales;
    const totalValue = activeSales.reduce((s, a) => s + toNum(a.salePrice), 0);
    const dueSales = activeSales.filter((a) => a.paymentStatus !== "PAID");
    // Worst payment status across active sales — drives the row badge.
    const paymentStatus =
      dueSales.some((a) => a.paymentStatus === "PARTIAL")
        ? "PARTIAL"
        : dueSales.some((a) => a.paymentStatus === "PENDING")
          ? "PENDING"
          : "PAID";
    return {
      id: c.id,
      name: c.name,
      phone: c.phone ?? null,
      activeCount: c._count.assetSales,
      totalValue,
      dueCount: dueSales.length,
      paymentStatus,
    };
  });

  const withDue = rows.filter((r) => r.dueCount > 0);

  return (
    <div>
      <MobilePageHeader
        title="Customers"
        subtitle={`${rows.length} total · ${withDue.length} with dues`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Customers" value={formatNumber(rows.length, 0)} icon={Users} />
        <MobileStatCard label="Active Sales" value={formatNumber(rows.reduce((s, r) => s + r.activeCount, 0), 0)} icon={Users} />
        <MobileStatCard label="With Dues" value={formatNumber(withDue.length, 0)} icon={Users} tone={withDue.length > 0 ? "warning" : "default"} />
        <MobileStatCard label="Pipeline Value" value={formatCurrency(rows.reduce((s, r) => s + r.totalValue, 0))} icon={Users} />
      </div>

      {rows.length === 0 ? (
        <MobileEmptyState
          icon={Users}
          title="No customers yet"
          hint="Create a customer to start booking sales."
          action={<MobileCta href="/m/customers/new" icon={UserPlus}>Create Customer</MobileCta>}
        />
      ) : (
        <MobileCustomersList items={rows} />
      )}
    </div>
  );
}
