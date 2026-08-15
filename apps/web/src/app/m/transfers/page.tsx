import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileTransfersList } from "./MobileTransfersList";

/**
 * /m/transfers — Stock transfers between locations.
 *
 * Shows all transfers (in/out) for the active company. Users with
 * STOCK_TRANSFER permission can create new transfers.
 */
export default function TransfersPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <TransfersContent />
    </Suspense>
  );
}

async function TransfersContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canTransfer = hasPermission(role, PERM.STOCK_TRANSFER);

  const transfers = await prisma.stockTransfer.findMany({
    where: {
      OR: [
        { fromLocation: { companyId: company.id, deletedAt: null } },
        { toLocation: { companyId: company.id, deletedAt: null } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      fromLocation: { select: { id: true, name: true, type: true, company: { select: { name: true } } } },
      toLocation: { select: { id: true, name: true, type: true, company: { select: { name: true } } } },
      lines: { include: { material: { select: { name: true, unit: true } } } },
    },
  });

  const items = transfers.map((t) => ({
    id: t.id,
    fromLocationName: t.fromLocation.name,
    fromLocationType: t.fromLocation.type,
    fromCompanyName: t.fromLocation.company?.name ?? null,
    toLocationName: t.toLocation.name,
    toLocationType: t.toLocation.type,
    toCompanyName: t.toLocation.company?.name ?? null,
    status: t.status,
    transferDate: t.transferDate.toISOString(),
    createdAt: t.createdAt.toISOString(),
    notes: t.notes,
    lineCount: t.lines.length,
    totalQty: t.lines.reduce((s, l) => s + toNum(l.qty), 0),
    materials: t.lines.map((l) => l.material.name),
    isInterCompany: t.isInterCompany,
    transferPriceTotal: t.transferPriceTotal ? toNum(t.transferPriceTotal) : null,
  }));

  return <MobileTransfersList items={items} canCreate={canTransfer} />;
}
