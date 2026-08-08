import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { FieldReceive } from "@/components/field/field-receive";
import { MobileRefreshButton } from "@/components/mobile/mobile-primitives";

/**
 * Mobile field receiving — the FieldReceive component (barcode scanning,
 * offline queue, qty validation) wrapped in the mobile shell instead of the
 * desktop AppShell. Linked from the Site persona's "Receive" tab and home.
 *
 * The standalone /field route remains for PWA home-screen use; this page is
 * the in-app mobile path so users never leave the tab-bar surface to receive.
 */
export default function MobileFieldReceivePage({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border bg-background px-4 py-3">
        <Link href="/m/site" className="text-muted-foreground hover:text-foreground">
          <ChevronLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-h3 font-semibold text-foreground">Receive</h1>
        <div className="ml-auto">
          <MobileRefreshButton />
        </div>
      </div>
      <Suspense fallback={<MobileSkeletonForm fields={3} />}>
        <MobileFieldReceiveContent searchParams={searchParams} />
      </Suspense>
    </div>
  );
}

async function MobileFieldReceiveContent({
  searchParams,
}: {
  searchParams: Promise<{ po?: string }>;
}) {
  await connection();
  const { po: preselectPoId } = await searchParams;
  const role = await getUserRole();
  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return (
      <div className="p-4 text-meta text-muted-foreground">
        You don&apos;t have permission to receive materials.
      </div>
    );
  }
  const company = await getCompany();
  const pos = await prisma.purchaseOrder.findMany({
    where: { companyId: company.id, status: { in: ["ORDERED", "PARTIAL"] } },
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true } },
      project: { select: { id: true, name: true } },
      destinationLocation: { select: { id: true, name: true, type: true } },
      lines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true, barcode: true } } },
        orderBy: { material: { name: "asc" } },
      },
    },
  });

  const receivablePos = pos.map((po) => ({
    id: po.id,
    poNumber: po.poNumber,
    supplierName: po.supplier.name,
    projectName: po.project?.name ?? null,
    destinationLocationId: po.destinationLocationId,
    destinationLocationName: po.destinationLocation.name,
    status: po.status,
    lines: po.lines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      unit: l.material.unit,
      barcode: l.material.barcode,
      qtyOrdered: Number(l.qtyOrdered),
      qtyReceived: Number(l.qtyReceived),
      unitCost: Number(l.unitCost),
    })),
  }));

  return <FieldReceive purchaseOrders={receivablePos} initialPoId={preselectPoId} />;
}
