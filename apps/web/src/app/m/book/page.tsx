import { Suspense } from "react";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Home, Users, ShoppingCart, Wallet, Building2, TrendingUp } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency, formatNumber, formatDate } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileStatCard,
  MobileRow,
  MobileInfoRow,
  MobileEmptyState,
  MobileCta,
  MobileRefreshButton,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";

/**
 * Sales persona home — "Book".
 * SALES. Close on the road: availability + payments in one tap.
 */
export default function BookPage() {
  return (
    <Suspense fallback={<MobileSkeletonHome />}>
      <BookContent />
    </Suspense>
  );
}

async function BookContent() {
  await connection();
  const company = await getCompany();

  const [availableUnits, recentSales, paymentDueCustomers, landParcels] = await Promise.all([
    prisma.builtUnit.findMany({
      where: { deletedAt: null, status: "AVAILABLE", project: { companyId: company.id, deletedAt: null } },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { project: { select: { name: true } } },
    }),
    prisma.assetSale.findMany({
      where: { companyId: company.id, status: "ACTIVE" },
      orderBy: { createdAt: "desc" },
      take: 6,
      include: { customer: { select: { name: true, phone: true } } },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null, assetSales: { some: { companyId: company.id, status: "ACTIVE", paymentStatus: { in: ["PENDING", "PARTIAL"] } } } },
      take: 6,
      include: { assetSales: { where: { companyId: company.id, status: "ACTIVE" }, select: { salePrice: true, paymentStatus: true } } },
    }),
    prisma.landParcel.findMany({
      where: { deletedAt: null, status: "AVAILABLE", landPurchase: { companyId: company.id } },
      take: 5,
      select: { id: true, number: true, area: true, areaUnit: true, status: true },
    }),
  ]);

  const totalAvailableValue = availableUnits.reduce((s, u) => s + toNum(u.askingPrice ?? u.currentValuation), 0);

  return (
    <div>
      <MobilePageHeader title="Book" subtitle={`${availableUnits.length} units available`} right={<MobileRefreshButton />} />

      {/* ── Quick stats ──────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Available Units" value={formatNumber(availableUnits.length, 0)} hint={formatCurrency(totalAvailableValue)} icon={Home} />
        <MobileStatCard label="Active Sales" value={formatNumber(recentSales.length, 0)} hint="deals in progress" icon={ShoppingCart} />
        <MobileStatCard label="Land Parcels" value={formatNumber(landParcels.length, 0)} hint="available" icon={Building2} />
        <MobileStatCard label="Payments Due" value={formatNumber(paymentDueCustomers.length, 0)} hint="customers" icon={Wallet} tone={paymentDueCustomers.length > 0 ? "warning" : "default"} />
      </div>

      <div className="px-4">
        <MobileCta href="/m/sales/new" icon={ShoppingCart}>
          New sale
        </MobileCta>
      </div>

      {/* ── Available units ───────────────────────────────── */}
      <MobileSectionTitle>Available Units</MobileSectionTitle>
      {availableUnits.length === 0 ? (
        <MobileEmptyState icon={Home} title="No available units" hint="Units show here once marked AVAILABLE" />
      ) : (
        <div>
          {availableUnits.map((u) => (
            <MobileRow
              key={u.id}
              href={`/m/units/${u.id}`}
              icon={Home}
              title={`${u.unitNumber} · ${u.unitType.replace("_", " ")}`}
              subtitle={`${u.project.name} · ${formatNumber(toNum(u.area), 0)} ${u.areaUnit}`}
              meta={u.askingPrice ? formatCurrency(toNum(u.askingPrice)) : "—"}
              tone="success"
            />
          ))}
        </div>
      )}

      {/* ── Active sales ──────────────────────────────────── */}
      <MobileSectionTitle>Active Sales</MobileSectionTitle>
      {recentSales.length === 0 ? (
        <MobileEmptyState icon={TrendingUp} title="No active sales" />
      ) : (
        <div>
          {recentSales.map((s) => (
            <MobileInfoRow
              key={s.id}
              icon={ShoppingCart}
              title={s.customer.name}
              subtitle={formatDate(s.saleDate)}
              value={formatCurrency(toNum(s.salePrice))}
              badge={<MobileStatusBadge status={s.paymentStatus} />}
            />
          ))}
        </div>
      )}

      {/* ── Customers with payments due ───────────────────── */}
      <MobileSectionTitle>Payments Due</MobileSectionTitle>
      {paymentDueCustomers.length === 0 ? (
        <MobileEmptyState icon={Wallet} title="No pending payments" />
      ) : (
        <div>
          {paymentDueCustomers.map((c) => {
            const total = c.assetSales.reduce((s, a) => s + toNum(a.salePrice), 0);
            return (
              <MobileRow key={c.id} href={`/m/customers/${c.id}`} icon={Users} title={c.name} subtitle={c.phone ?? "no phone"} meta={formatCurrency(total)} tone="warning" />
            );
          })}
        </div>
      )}

      <div className="px-4 pb-4 pt-2">
        <MobileCta href="/m/book/customers" icon={Users} variant="outline">
          All customers
        </MobileCta>
      </div>
    </div>
  );
}
