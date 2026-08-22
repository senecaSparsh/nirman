import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileTransfersList } from "./MobileTransfersList";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";

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
      fromLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { name: true } } } },
      toLocation: { select: { id: true, name: true, type: true, companyId: true, company: { select: { name: true } } } },
      lines: { include: { material: { select: { name: true, unit: true } } } },
    },
  });

  const items = transfers.map((t) => ({
    id: t.id,
    fromLocationName: t.fromLocation.name,
    fromLocationType: t.fromLocation.type,
    fromCompanyName: t.fromLocation.company?.name ?? null,
    fromCompanyId: t.fromLocation.companyId,
    toLocationName: t.toLocation.name,
    toLocationType: t.toLocation.type,
    toCompanyName: t.toLocation.company?.name ?? null,
    toCompanyId: t.toLocation.companyId,
    status: t.status,
    transferDate: t.transferDate.toISOString(),
    createdAt: t.createdAt.toISOString(),
    notes: t.notes,
    lineCount: t.lines.length,
    totalQty: t.lines.reduce((s, l) => s + toNum(l.qty), 0),
    materials: t.lines.map((l) => l.material.name),
    materialsList: t.lines.map((l) => l.material.name).join("; "),
    isInterCompany: t.isInterCompany,
    transferPriceTotal: t.transferPriceTotal ? toNum(t.transferPriceTotal) : null,
  }));

  const csvColumns: MobileColumnSpec[] = [
    { key: "fromLocationName", label: "From Location" },
    { key: "toLocationName", label: "To Location" },
    { key: "status", label: "Status" },
    { key: "transferDate", label: "Date", format: "date" },
    { key: "totalQty", label: "Total Qty" },
    { key: "lineCount", label: "Lines" },
    { key: "materialsList", label: "Materials" },
  ];

  return (
    <>
      <div className="mb-4">
        <MobileExportShareBar
          title="Stock Transfers"
          rows={items as unknown as Record<string, unknown>[]}
          columns={csvColumns}
          summary={`${items.length} transfers`}
        />
      </div>
      <MobileTransfersList items={items} canCreate={canTransfer} currentCompanyId={company.id} />
    </>
  );
}
