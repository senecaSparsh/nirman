import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PackageCheck } from "lucide-react";
import { FieldReceive } from "@/components/field/field-receive";

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
        <p className="text-[0.875rem] font-bold flex-1" style={{ color: "var(--color-ink-950)" }}>
          Receive
        </p>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
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
  const role = await getUserRole();
  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return (
      <div className="flex flex-col items-center text-center px-4 py-7">
        <div className="grid place-items-center size-11 rounded-full mb-2.5" style={{ backgroundColor: "var(--color-concrete)" }}>
          <PackageCheck className="size-5" style={{ color: "var(--color-ink-300)" }} />
        </div>
        <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>No access</p>
        <p className="text-[0.625rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
          You don&apos;t have permission to receive materials.
        </p>
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
