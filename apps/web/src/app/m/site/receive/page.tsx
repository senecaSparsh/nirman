import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { ScanLine, Truck, AlertTriangle } from "lucide-react";
import { getCompany, toNum } from "@/lib/server";
import { formatNumber } from "@/lib/utils";
import {
  MobilePageHeader,
  MobileSectionTitle,
  MobileEmptyState,
  MobileCta,
  MobileStatCard,
  MobileRefreshButton,
} from "@/components/mobile/mobile-primitives";
import { MobileReceiveList } from "./MobileReceiveList";

/** Field → Receive tab: in-transit POs + jump into barcode receiving. */
export default function SiteReceivePage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <SiteReceiveContent />
    </Suspense>
  );
}

async function SiteReceiveContent() {
  await connection();
  const company = await getCompany();

  const inTransit = await prisma.purchaseOrder.findMany({
    where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] } },
    orderBy: { expectedDate: "asc" },
    take: 30,
    include: { supplier: { select: { name: true } }, lines: { select: { qtyOrdered: true, qtyReceived: true } } },
  });

  const now = new Date();
  const serialized = inTransit.map((po) => {
    const qtyOrdered = po.lines.reduce((s, l) => s + toNum(l.qtyOrdered), 0);
    const qtyReceived = po.lines.reduce(
      (s, l) => s + (l.qtyReceived ? toNum(l.qtyReceived) : 0),
      0,
    );
    const isOverdue =
      po.expectedDate != null && new Date(po.expectedDate) < now;
    return {
      id: po.id,
      poNumber: po.poNumber,
      status: po.status,
      supplierName: po.supplier.name,
      expectedDate: po.expectedDate?.toISOString() ?? null,
      qtyOrdered,
      qtyReceived,
      isOverdue,
    };
  });

  const partial = inTransit.filter((p) => p.status === "PARTIAL").length;
  const overdue = serialized.filter((p) => p.isOverdue).length;

  return (
    <div>
      <MobilePageHeader
        title="Receive"
        subtitle={`${inTransit.length} in transit`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-3 gap-2 p-3">
        <MobileStatCard label="In Transit" value={formatNumber(inTransit.length, 0)} icon={Truck} />
        <MobileStatCard label="Partial" value={formatNumber(partial, 0)} icon={Truck} tone={partial > 0 ? "warning" : "default"} />
        <MobileStatCard label="Overdue" value={formatNumber(overdue, 0)} icon={AlertTriangle} tone={overdue > 0 ? "danger" : "default"} />
      </div>

      <div className="px-4 pb-2">
        <MobileCta href="/m/site/field" icon={ScanLine}>
          Open barcode scanner
        </MobileCta>
        <p className="mt-2 px-2 text-caption text-muted-foreground">
          Scan or manually receive materials against a purchase order. Works offline.
        </p>
      </div>

      <MobileReceiveList items={serialized} />

      {inTransit.length === 0 && (
        <>
          <MobileSectionTitle>Awaiting Receipt</MobileSectionTitle>
          <MobileEmptyState icon={Truck} title="Nothing in transit" hint="Ordered POs appear here" />
        </>
      )}
    </div>
  );
}
