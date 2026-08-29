import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileBrokersList, type BrokerListItem } from "./MobileBrokersList";

/**
 * /m/brokers — mobile broker directory. Shows broker name, agency,
 * phone, default commission %, and deal count so sales managers can
 * find and manage brokers on the go.
 */
export default function MobileBrokersPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileBrokersContent />
    </Suspense>
  );
}

async function MobileBrokersContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.SALE_CREATE);
  const canDelete = hasPermission(role, PERM.SALE_CREATE);

  const brokers = await prisma.broker.findMany({
    where: { companyId: company.id, deletedAt: null },
    orderBy: { name: "asc" },
    take: 100,
    include: {
      _count: { select: { assetSales: true } },
    },
  });

  const rows: BrokerListItem[] = brokers.map((b) => ({
    id: b.id,
    name: b.name,
    phone: b.phone ?? null,
    agency: b.agency ?? null,
    defaultCommissionPercent: b.defaultCommissionPercent ? toNum(b.defaultCommissionPercent) : null,
    notes: b.notes ?? null,
    dealCount: b._count.assetSales,
  }));

  return (
    <MobileBrokersList
      items={rows}
      canCreate={canCreate}
      canEdit={canCreate}
      canDelete={canDelete}
    />
  );
}
