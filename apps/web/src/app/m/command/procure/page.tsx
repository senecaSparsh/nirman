import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { Truck, ClipboardList, Package, AlertTriangle } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber, formatDate } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileRow,
  MobileEmptyState,
  MobileStatCard,
  MobileRefreshButton,
  MobileStatusBadge,
} from "@/components/mobile/mobile-primitives";

/** Ops → Procure tab: open POs + requisitions. */
export default function CommandProcurePage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <CommandProcureContent />
    </Suspense>
  );
}

async function CommandProcureContent() {
  await connection();
  const company = await getCompany();

  const [draftPOs, orderedPOs, pendingReqs, lowStockItems] = await Promise.all([
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: "DRAFT" },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true, unitCost: true } } },
    }),
    prisma.purchaseOrder.findMany({
      where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] } },
      orderBy: { expectedDate: "asc" },
      take: 10,
      include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true, qtyReceived: true } } },
    }),
    prisma.materialRequisition.findMany({
      where: { project: { companyId: company.id }, status: { in: ["SUBMITTED", "DRAFT"] } },
      orderBy: { createdAt: "desc" },
      take: 10,
      include: { project: { select: { name: true } } },
    }),
    prisma.material.findMany({
      where: { deletedAt: null, minStock: { not: null } },
      select: { id: true, name: true, unit: true, minStock: true, stockItems: { where: { location: { companyId: company.id } }, select: { qty: true } } },
    }),
  ]);

  const lowStock = lowStockItems
    .map((m) => ({ id: m.id, name: m.name, unit: m.unit, totalQty: m.stockItems.reduce((s, i) => s + toNum(i.qty), 0), minStock: toNum(m.minStock) }))
    .filter((m) => m.totalQty < m.minStock)
    .slice(0, 10);

  return (
    <div>
      <MobilePageHeader title="Procure" subtitle={`${draftPOs.length} draft · ${orderedPOs.length} in transit`} right={<MobileRefreshButton />} />

      <div className="grid grid-cols-2 gap-2.5 p-4">
        <MobileStatCard label="Draft POs" value={formatNumber(draftPOs.length, 0)} icon={Truck} tone={draftPOs.length > 0 ? "warning" : "default"} />
        <MobileStatCard label="In Transit" value={formatNumber(orderedPOs.length, 0)} icon={Truck} />
        <MobileStatCard label="Requisitions" value={formatNumber(pendingReqs.length, 0)} icon={ClipboardList} />
        <MobileStatCard label="Low Stock" value={formatNumber(lowStock.length, 0)} icon={AlertTriangle} tone={lowStock.length > 0 ? "danger" : "default"} />
      </div>

      <MobileSectionTitle>Ordered / Partial</MobileSectionTitle>
      {orderedPOs.length === 0 ? (
        <MobileEmptyState icon={Truck} title="Nothing in transit" />
      ) : (
        <div>
          {orderedPOs.map((po) => (
            <MobileRow key={po.id} href={`/m/procurement/${po.id}`} icon={Truck} title={po.supplier.name} subtitle={`PO ${po.poNumber} · ${formatDate(po.expectedDate)}`} badge={<MobileStatusBadge status={po.status} />} />
          ))}
        </div>
      )}

      <MobileSectionTitle>Draft POs</MobileSectionTitle>
      {draftPOs.length === 0 ? (
        <MobileEmptyState icon={Truck} title="No draft POs" />
      ) : (
        <div>
          {draftPOs.map((po) => (
            <MobileRow key={po.id} href={`/m/procurement/${po.id}`} icon={Truck} title={po.supplier.name} subtitle={`PO ${po.poNumber}`} badge={<MobileStatusBadge status="DRAFT" />} />
          ))}
        </div>
      )}

      <MobileSectionTitle>Requisitions</MobileSectionTitle>
      {pendingReqs.length === 0 ? (
        <MobileEmptyState icon={ClipboardList} title="No open requisitions" />
      ) : (
        <div>
          {pendingReqs.map((r) => (
            <MobileRow key={r.id} href={`/m/requisitions/${r.id}`} icon={ClipboardList} title={r.project?.name ?? "N/A"} subtitle={formatDate(r.createdAt)} badge={<MobileStatusBadge status={r.status} />} />
          ))}
        </div>
      )}

      <MobileSectionTitle>Low Stock</MobileSectionTitle>
      {lowStock.length === 0 ? (
        <MobileEmptyState icon={Package} title="All materials above min" />
      ) : (
        <div>
          {lowStock.map((m) => (
            <MobileRow key={m.id} href={`/m/materials/${m.id}`} icon={Package} title={m.name} subtitle={`Min ${formatNumber(m.minStock, 0)} ${m.unit}`} meta={`${formatNumber(m.totalQty, 0)} ${m.unit}`} tone="danger" />
          ))}
        </div>
      )}
    </div>
  );
}
