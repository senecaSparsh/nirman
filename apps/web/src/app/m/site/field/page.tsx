import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCompanyGroupIds, getUserScope, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PackageCheck } from "lucide-react";
import { FieldReceive } from "@/components/field/field-receive";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

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
      <div className="flex items-center gap-2 mb-3">
        <p className="text-m-section font-bold flex-1" style={{ color: "var(--color-ink-950)" }}>
          Receive
        </p>
        <span
          className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-steel)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <PackageCheck className="size-2.5" />
          Site
        </span>
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
  const __effPerms = await getUserPermissions();
  if (!__effPerms.includes(PERM.PROCUREMENT_VIEW)) {
    return <MobileNoAccess what="receive materials" permission="procurement.view" />;
  }
  const company = await getCompany();
  const groupCompanyIds = await getCompanyGroupIds(company);
  // List only POs the viewer can actually receive — same scope rule as
  // POST /api/goods-receipts (project-scoped receivers take deliveries for
  // their projects, their project stores, or fully company-level POs).
  const scope = await getUserScope();
  const receiveScope =
    scope.scopeType === "PROJECT" && scope.projectIds.length > 0
      ? {
          OR: [
            { projectId: { in: scope.projectIds } },
            { destinationLocation: { projectId: { in: scope.projectIds } } },
            { projectId: null, destinationLocation: { projectId: null } },
          ],
        }
      : {};
  const pos = await prisma.purchaseOrder.findMany({
    where: { companyId: { in: groupCompanyIds }, status: { in: ["ORDERED", "PARTIAL"] }, ...receiveScope },
    orderBy: { createdAt: "desc" },
    take: 50,
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
