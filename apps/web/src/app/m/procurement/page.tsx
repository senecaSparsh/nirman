import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";

import { getCompany, getCompanyGroupIds, toNum, getUserRole } from "@/lib/server";
import { hasPermission, PERM } from "@/lib/roles";
import { MobileExportShareBar } from "@/components/mobile/v2/export-share-bar";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { MobileProcurementList } from "./MobileProcurementList";

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
  const groupCompanyIds = await getCompanyGroupIds(company);
  const role = await getUserRole();
  const canCreate = hasPermission(role, PERM.PROCUREMENT_MANAGE);

  // Show POs from the entire company group — quotation-approved POs may
  // be created in a different company (parent/child) than the user's current.
  const pos = await prisma.purchaseOrder.findMany({
    where: { companyId: { in: groupCompanyIds } },
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      supplier: { select: { name: true } },
      lines: { select: { qtyOrdered: true, qtyReceived: true } },
    },
  });

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
      <MobileExportShareBar
        title="Purchase Orders"
        rows={serialized as unknown as Record<string, unknown>[]}
        columns={[
          { key: "poNumber", label: "PO Number" },
          { key: "supplierName", label: "Supplier" },
          { key: "status", label: "Status" },
          { key: "total", label: "Amount", format: "currency" },
          { key: "createdAt", label: "Created Date", format: "date" },
        ] as MobileColumnSpec[]}
        summary={`${serialized.length} purchase orders`}
      />
      <MobileProcurementList items={serialized} canCreate={canCreate} />
    </div>
  );
}
