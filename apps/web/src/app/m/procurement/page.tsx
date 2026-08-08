import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Truck, AlertTriangle, Plus } from "lucide-react";
import { getCompany, toNum, getUserRole } from "@/lib/server";
import { formatNumber } from "@/lib/utils";
import { hasPermission, PERM } from "@/lib/roles";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
  MobileFab,
} from "@/components/mobile/mobile-primitives";
import { MobileProcurementList } from "./MobileProcurementList";

/**
 * /m/procurement — mobile purchase-order list, grouped by status.
 * Replaces every desktop `/procurement` link from the mobile surface.
 */
export default function MobileProcurementPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={8} />}>
      <MobileProcurementContent />
    </Suspense>
  );
}

async function MobileProcurementContent() {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.PROCUREMENT_MANAGE);

  const pos = await prisma.purchaseOrder.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      supplier: { select: { name: true } },
      lines: { select: { qtyOrdered: true, qtyReceived: true } },
    },
  });

  const byStatus = (s: string) => pos.filter((p) => p.status === s);
  const drafts = byStatus("DRAFT");
  const approved = byStatus("APPROVED");
  const ordered = byStatus("ORDERED");
  const partial = byStatus("PARTIAL");
  const received = byStatus("RECEIVED");
  const cancelled = byStatus("CANCELLED");
  const inTransit = [...ordered, ...partial];

  const overdue = inTransit.filter(
    (p) => p.expectedDate && new Date(p.expectedDate) < new Date(),
  );

  // Serialize for the client component (search + filter chips + badges)
  const serialized = pos.map((p) => {
    const qtyOrdered = p.lines.reduce((s, l) => s + toNum(l.qtyOrdered), 0);
    const qtyReceived = p.lines.reduce(
      (s, l) => s + (l.qtyReceived ? toNum(l.qtyReceived) : 0),
      0,
    );
    const isOverdue =
      (p.status === "ORDERED" || p.status === "PARTIAL") &&
      p.expectedDate != null &&
      new Date(p.expectedDate) < new Date();
    return {
      id: p.id,
      poNumber: p.poNumber,
      status: p.status,
      supplierName: p.supplier.name,
      expectedDate: p.expectedDate?.toISOString() ?? null,
      createdAt: p.createdAt.toISOString(),
      total: toNum(p.total),
      qtyOrdered,
      qtyReceived,
      isOverdue,
    };
  });

  return (
    <div>
      <MobilePageHeader
        title="Purchase Orders"
        subtitle={`${pos.length} total · ${inTransit.length} in transit`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-2 gap-2 p-3">
        <MobileStatCard label="Draft" value={formatNumber(drafts.length, 0)} icon={Truck} tone={drafts.length > 0 ? "warning" : "default"} />
        <MobileStatCard label="In Transit" value={formatNumber(inTransit.length, 0)} icon={Truck} />
        <MobileStatCard label="Overdue" value={formatNumber(overdue.length, 0)} icon={AlertTriangle} tone={overdue.length > 0 ? "danger" : "default"} />
        <MobileStatCard label="Received" value={formatNumber(received.length, 0)} icon={Truck} />
      </div>

      <MobileProcurementList items={serialized} />

      {pos.length === 0 && (
        <>
          <MobileSectionTitle>Recent</MobileSectionTitle>
          <MobileEmptyState
            icon={Truck}
            title="No purchase orders"
            hint="Create POs from the desktop Procure section or approve a requisition"
          />
        </>
      )}

      {canCreate && <MobileFab href="/procurement" icon={Plus} label="New PO" />}
    </div>
  );
}
