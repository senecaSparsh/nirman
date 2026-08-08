import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { KeyRound } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatCurrency } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileRentalsList, type RentalListItem } from "./MobileRentalsList";

/**
 * /m/rentals — mobile rental/tenancy tracking. Sales users need to see
 * active tenancies, monthly rent, and upcoming lease expirations on the go.
 * Tenancy has builtUnitId/landParcelId but no relation — we fetch the
 * names separately and build a lookup map.
 */
export default function MobileRentalsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileRentalsContent />
    </Suspense>
  );
}

async function MobileRentalsContent() {
  await connection();
  const company = await getCompany();

  const [tenancies, units, parcels, overduePayments] = await Promise.all([
    prisma.tenancy.findMany({
      where: { companyId: company.id, status: { in: ["ACTIVE", "PENDING"] } },
      orderBy: { startDate: "desc" },
      take: 50,
      include: {
        payments: {
          where: { status: { in: ["PENDING", "OVERDUE"] } },
          select: { amount: true, dueDate: true, status: true },
          orderBy: { dueDate: "asc" },
          take: 1,
        },
      },
    }),
    prisma.builtUnit.findMany({
      where: { project: { companyId: company.id }, deletedAt: null },
      select: { id: true, unitNumber: true, project: { select: { name: true } } },
    }),
    prisma.landParcel.findMany({
      where: { deletedAt: null, landPurchase: { companyId: company.id } },
      select: { id: true, number: true, landPurchase: { select: { sellerName: true } } },
    }),
    prisma.rentalPayment.findMany({
      where: { status: "OVERDUE", tenancy: { companyId: company.id } },
      select: { tenancyId: true },
    }),
  ]);

  const unitMap = new Map(units.map((u) => [u.id, `${u.unitNumber} · ${u.project.name}`]));
  const parcelMap = new Map(parcels.map((p) => [p.id, `Parcel ${p.number} · ${p.landPurchase.sellerName}`]));
  const overdueSet = new Set(overduePayments.map((p) => p.tenancyId));

  const rows: RentalListItem[] = tenancies.map((t) => {
    const assetLabel = t.builtUnitId
      ? unitMap.get(t.builtUnitId) ?? "Unit"
      : t.landParcelId
        ? parcelMap.get(t.landParcelId) ?? "Parcel"
        : "—";
    return {
      id: t.id,
      tenantName: t.tenantName,
      status: t.status,
      assetLabel,
      startDate: t.startDate.toISOString(),
      endDate: t.endDate.toISOString(),
      monthlyRent: toNum(t.monthlyRent),
      hasOverdue: overdueSet.has(t.id),
    };
  });

  const active = rows.filter((t) => t.status === "ACTIVE");
  const pending = rows.filter((t) => t.status === "PENDING");
  const totalMonthlyRent = active.reduce((s, t) => s + t.monthlyRent, 0);
  const overdueCount = rows.filter((t) => t.hasOverdue).length;

  return (
    <div>
      <MobilePageHeader
        title="Rentals"
        subtitle={`${active.length} active · ${pending.length} pending`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard
          label="Monthly Rent"
          value={formatCurrency(totalMonthlyRent)}
          icon={KeyRound}
          tone="success"
        />
        <MobileStatCard
          label="Overdue"
          value={String(overdueCount)}
          icon={KeyRound}
          tone={overdueCount > 0 ? "danger" : "default"}
        />
        <MobileStatCard
          label="Active"
          value={String(active.length)}
          icon={KeyRound}
          tone="success"
        />
        <MobileStatCard
          label="Pending"
          value={String(pending.length)}
          icon={KeyRound}
          tone={pending.length > 0 ? "warning" : "default"}
        />
      </div>

      {rows.length === 0 ? (
        <MobileEmptyState
          icon={KeyRound}
          title="No rentals"
          hint="Create tenancies from the desktop Sell → Rentals section"
        />
      ) : (
        <MobileRentalsList items={rows} />
      )}
    </div>
  );
}
