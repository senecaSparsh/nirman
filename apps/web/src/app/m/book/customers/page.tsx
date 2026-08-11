import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import { Users, UserPlus } from "lucide-react";
import { MobilePageHeader, MobileSectionTitle, MobileRow, MobileEmptyState, MobileCta, MobileRefreshButton, MobileStatusBadge } from "@/components/mobile/mobile-primitives";

/** Sales → Customers tab. */
export default function BookCustomersPage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <BookCustomersContent />
    </Suspense>
  );
}

async function BookCustomersContent() {
  await connection();
  const company = await getCompany();

  const customers = await prisma.customer.findMany({
    where: { deletedAt: null, assetSales: { some: { companyId: company.id } } },
    take: 20,
    orderBy: { createdAt: "desc" },
    include: { assetSales: { where: { companyId: company.id }, select: { salePrice: true, status: true, paymentStatus: true } } },
  });

  return (
    <div>
      <MobilePageHeader title="Customers" subtitle={`${customers.length} with sales`} right={<MobileRefreshButton />} />

      <div className="px-4 pb-2">
        <MobileCta href="/m/customers" icon={Users} variant="outline">
          All customers
        </MobileCta>
      </div>

      <MobileSectionTitle>Recent</MobileSectionTitle>
      {customers.length === 0 ? (
        <MobileEmptyState
          icon={Users}
          title="No customers yet"
          hint="Create a customer to start booking sales."
          action={<MobileCta href="/m/customers/new" icon={UserPlus}>Create Customer</MobileCta>}
        />
      ) : (
        <div>
          {customers.map((c) => {
            const total = c.assetSales.reduce((s, a) => s + toNum(a.salePrice), 0);
            const statuses = c.assetSales.map((a) => a.paymentStatus);
            const worstStatus = statuses.includes("PENDING")
              ? "PENDING"
              : statuses.includes("PARTIAL")
                ? "PARTIAL"
                : statuses.includes("PAID")
                  ? "PAID"
                  : null;
            return (
              <MobileRow
                key={c.id}
                href={`/m/customers/${c.id}`}
                icon={Users}
                title={c.name}
                subtitle={c.phone ?? "no phone"}
                meta={formatCurrency(total)}
                badge={worstStatus ? <MobileStatusBadge status={worstStatus} /> : null}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
