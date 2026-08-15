import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileTransferDetailClient } from "./MobileTransferDetailClient";

/**
 * /m/transfers/[id] — stock transfer detail.
 * Shows the transfer header (from → to), status, line items, and
 * action buttons (complete / cancel) when the transfer is still DRAFT
 * and the user has `stock.transfer` permission.
 */
export default function MobileTransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileTransferDetailContent params={params} />
    </Suspense>
  );
}

async function MobileTransferDetailContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { id } = await params;

  if (!hasPermission(role, PERM.INVENTORY_VIEW)) {
    notFound();
  }

  const transfer = await prisma.stockTransfer.findFirst({
    where: {
      id,
      OR: [
        { fromLocation: { companyId: company.id, deletedAt: null } },
        { toLocation: { companyId: company.id, deletedAt: null } },
      ],
    },
    include: {
      fromLocation: {
        select: { id: true, name: true, type: true, company: { select: { name: true } } },
      },
      toLocation: {
        select: { id: true, name: true, type: true, company: { select: { name: true } } },
      },
      lines: {
        include: { material: { select: { id: true, name: true, code: true, unit: true } } },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  if (!transfer) {
    notFound();
  }

  const canManage = hasPermission(role, PERM.STOCK_TRANSFER);

  const totalQty = transfer.lines.reduce((s, l) => s + toNum(l.qty), 0);

  // Serialize for client component
  const serialized = {
    id: transfer.id,
    status: transfer.status,
    transferDate: transfer.transferDate.toISOString(),
    createdAt: transfer.createdAt.toISOString(),
    notes: transfer.notes,
    isInterCompany: transfer.isInterCompany,
    freight: toNum(transfer.freight),
    handlingFee: toNum(transfer.handlingFee),
    markupPct: toNum(transfer.markupPct),
    transferPriceTotal: transfer.transferPriceTotal ? toNum(transfer.transferPriceTotal) : null,
    fromLocation: {
      id: transfer.fromLocation.id,
      name: transfer.fromLocation.name,
      type: transfer.fromLocation.type,
      companyName: transfer.fromLocation.company?.name ?? null,
    },
    toLocation: {
      id: transfer.toLocation.id,
      name: transfer.toLocation.name,
      type: transfer.toLocation.type,
      companyName: transfer.toLocation.company?.name ?? null,
    },
    totalQty,
    lineCount: transfer.lines.length,
    lines: transfer.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialName: l.material.name,
      materialCode: l.material.code,
      materialUnit: l.material.unit,
      qty: toNum(l.qty),
      unitCostAtSource: l.unitCostAtSource ? toNum(l.unitCostAtSource) : null,
      unitTransferPrice: l.unitTransferPrice ? toNum(l.unitTransferPrice) : null,
      lineTransferTotal: l.lineTransferTotal ? toNum(l.lineTransferTotal) : null,
    })),
  };

  return <MobileTransferDetailClient transfer={serialized} canManage={canManage} />;
}
