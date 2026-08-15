import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { ShoppingCart } from "lucide-react";
import { MobileNewSaleForm } from "@/components/mobile/mobile-new-sale-form";
import { MobileNoCustomersState } from "./MobileNoCustomersState";
import { MobileBackButton } from "@/components/mobile/v2/mobile-back-button";

/**
 * /m/sales/new — mobile new-sale form. Replaces every desktop `/sales`
 * "New sale" link from the mobile surface. Pre-seeds builtUnitId /
 * customerId from the query string (linked from unit or customer detail).
 */
export default function MobileNewSalePage({
  searchParams,
}: {
  searchParams: Promise<{ builtUnitId?: string; landParcelId?: string; customerId?: string }>;
}) {
  return (
    <Suspense fallback={<MobileSkeletonForm fields={5} />}>
      <MobileNewSaleContent searchParams={searchParams} />
    </Suspense>
  );
}

async function MobileNewSaleContent({
  searchParams,
}: {
  searchParams: Promise<{ builtUnitId?: string; landParcelId?: string; customerId?: string }>;
}) {
  await connection();
  const company = await getCompany();
  const role = await getUserRole();
  const { builtUnitId, landParcelId, customerId } = await searchParams;

  if (!hasPermission(role, PERM.SALE_CREATE)) {
    return (
      <div className="pb-32">
        <div className="flex items-center gap-2 mb-3">
          <MobileBackButton fallback="/m/sales" style={{ color: "var(--color-ink-700)" }} />
          <p className="text-[0.875rem] font-bold flex-1" style={{ color: "var(--color-ink-950)" }}>
            New Sale
          </p>
        </div>
        <div className="flex flex-col items-center text-center px-4 py-7">
          <div className="grid place-items-center size-11 rounded-full mb-2.5" style={{ backgroundColor: "var(--color-concrete)" }}>
            <ShoppingCart className="size-5" style={{ color: "var(--color-ink-300)" }} />
          </div>
          <p className="text-[0.875rem] font-semibold" style={{ color: "var(--color-ink-950)" }}>No access</p>
          <p className="text-[0.625rem] mt-1" style={{ color: "var(--color-ink-500)" }}>
            You don&apos;t have permission to create sales.
          </p>
        </div>
      </div>
    );
  }

  const [units, parcels, customers, projects] = await Promise.all([
    prisma.builtUnit.findMany({
      where: {
        deletedAt: null,
        status: "AVAILABLE",
        project: { companyId: company.id, deletedAt: null },
      },
      orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
      take: 200,
      include: { project: { select: { id: true, name: true } } },
    }),
    prisma.landParcel.findMany({
      where: { deletedAt: null, status: "AVAILABLE", landPurchase: { companyId: company.id } },
      orderBy: { number: "asc" },
      take: 200,
      include: { landPurchase: { select: { id: true, sellerName: true, location: true } } },
    }),
    prisma.customer.findMany({
      where: { deletedAt: null },
      orderBy: { name: "asc" },
      select: { id: true, name: true, phone: true },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const unitItems = units.map((u) => ({
    id: u.id,
    label: `${u.unitNumber} · ${u.unitType.replace(/_/g, " ")} · ${u.project.name}`,
    projectId: u.projectId,
    askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
    area: toNum(u.area),
    areaUnit: u.areaUnit,
  }));

  const parcelItems = parcels.map((p) => ({
    id: p.id,
    label: `Parcel ${p.number} · ${p.landPurchase.location ?? p.landPurchase.sellerName}`,
    projectId: null,
    askingPrice: null,
    area: toNum(p.area),
    areaUnit: p.areaUnit,
  }));

  const customerItems = customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
  const existingPhones = customers.map((c) => c.phone).filter(Boolean) as string[];

  return (
    <div className="pb-32">
      <div className="flex items-center gap-2 mb-3">
        <MobileBackButton fallback="/m/sales" style={{ color: "var(--color-ink-700)" }} />
        <div className="flex-1 min-w-0">
          <p className="text-[0.875rem] font-bold" style={{ color: "var(--color-ink-950)" }}>
            New Sale
          </p>
        </div>
        <span
          className="flex items-center gap-0.5 text-[0.5rem] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
          style={{ color: "var(--color-steel)", backgroundColor: "color-mix(in srgb, var(--color-steel) 12%, transparent)" }}
        >
          <ShoppingCart className="size-2.5" />
          Booking
        </span>
      </div>
      {customers.length === 0 ? (
        <MobileNoCustomersState existingPhones={existingPhones} />
      ) : (
        <MobileNewSaleForm
          units={unitItems}
          parcels={parcelItems}
          customers={customerItems}
          projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          initialBuiltUnitId={builtUnitId}
          initialLandParcelId={landParcelId}
          initialCustomerId={customerId}
          existingPhones={existingPhones}
        />
      )}
    </div>
  );
}
