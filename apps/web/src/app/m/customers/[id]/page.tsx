import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Users, ShoppingCart, Phone, Mail, BadgeCheck, MapPin, IndianRupee, Wallet } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { formatCurrency, formatDate } from "@/lib/utils";
import {
  MobileDetailHeader,
  MobileSectionTitle,
  MobileInfoRow,
  MobileRow,
  MobileEmptyState,
  MobileCta,
  MobileStatCard,
  MobileStatusBadge,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";

/**
 * /m/customers/[id] — customer detail with contact info, active sales,
 * and a "New sale" CTA pre-seeded with this customer.
 */
export default function MobileCustomerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileCustomerDetailContent params={params} />
    </Suspense>
  );
}

async function MobileCustomerDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  const customer = await prisma.customer.findFirst({
    where: { id, deletedAt: null },
    include: {
      assetSales: {
        where: { companyId: company.id },
        orderBy: { createdAt: "desc" },
        include: {
          project: { select: { name: true } },
          payments: { where: { status: "RECEIVED" }, select: { amount: true } },
        },
      },
    },
  });

  if (!customer) {
    return (
      <div>
        <MobileDetailHeader title="Customer" backHref="/m/customers" />
        <MobileEmptyState icon={Users} title="Customer not found" />
      </div>
    );
  }

  const canSell = hasPermission(role, PERM.SALE_CREATE);
  const activeSales = customer.assetSales.filter((s) => s.status === "ACTIVE");
  const totalPaid = customer.assetSales.reduce(
    (s, sale) => s + sale.payments.reduce((ps, p) => ps + toNum(p.amount), 0),
    0,
  );
  const totalSaleValue = customer.assetSales.reduce((s, sale) => s + toNum(sale.salePrice), 0);
  const outstanding = totalSaleValue - totalPaid;

  return (
    <div>
      <MobileDetailHeader
        title={customer.name}
        subtitle={customer.phone ?? "no phone"}
        backHref="/m/customers"
        right={<MobileRefreshButton />}
      />

      <MobileSectionTitle>Contact</MobileSectionTitle>
      <div>
        <MobileInfoRow icon={Phone} title="Phone" value={customer.phone ?? "—"} />
        <MobileInfoRow icon={Mail} title="Email" value={customer.email ?? "—"} />
        <MobileInfoRow icon={BadgeCheck} title="GSTIN" value={customer.gstin ?? "—"} />
        {customer.address && <MobileInfoRow icon={MapPin} title="Address" value={customer.address} />}
      </div>

      <MobileSectionTitle>Sales Summary</MobileSectionTitle>
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Total Sales"
          value={formatCurrency(totalSaleValue)}
          icon={IndianRupee}
        />
        <MobileStatCard
          label="Received"
          value={formatCurrency(totalPaid)}
          icon={Wallet}
          tone="success"
        />
        <MobileStatCard
          label="Outstanding"
          value={formatCurrency(outstanding)}
          icon={Wallet}
          tone={outstanding > 0 ? "warning" : "default"}
        />
        <MobileStatCard
          label="Active Deals"
          value={String(activeSales.length)}
          icon={ShoppingCart}
        />
      </div>

      {canSell && (
        <div className="px-4 pt-3">
          <MobileCta href={`/m/sales/new?customerId=${customer.id}`} icon={ShoppingCart}>
            New sale for this customer
          </MobileCta>
        </div>
      )}

      <MobileSectionTitle>Active Sales</MobileSectionTitle>
      {activeSales.length === 0 ? (
        <MobileEmptyState icon={ShoppingCart} title="No active sales" />
      ) : (
        <div>
          {activeSales.map((s) => {
            const paid = s.payments.reduce((ps, p) => ps + toNum(p.amount), 0);
            const balance = toNum(s.salePrice) - paid;
            return (
              <MobileRow
                key={s.id}
                href={`/m/book/sales`}
                icon={ShoppingCart}
                title={`${s.saleNumber} · ${s.project.name}`}
                subtitle={`${formatDate(s.saleDate)} · ${formatCurrency(toNum(s.salePrice))}`}
                meta={balance > 0 ? formatCurrency(balance) : undefined}
                badge={<MobileStatusBadge status={s.paymentStatus} />}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
