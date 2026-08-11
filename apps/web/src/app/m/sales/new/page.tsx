import { Suspense } from "react";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileDetailHeader, MobileEmptyState } from "@/components/mobile/mobile-primitives";
import { MobileNewSaleForm } from "@/components/mobile/mobile-new-sale-form";
import { MobileCreateCustomerButton } from "@/components/mobile/mobile-customer-form";
import { UserPlus } from "lucide-react";

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
      <div>
        <MobileDetailHeader title="New Sale" backHref="/m/book" />
        <div className="p-4 text-meta text-muted-foreground">
          You don&apos;t have permission to create sales.
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
    <div>
      <MobileDetailHeader title="New Sale" backHref="/m/book" />
      {customers.length === 0 ? (
        <MobileEmptyState
          icon={UserPlus}
          title="No customers yet"
          hint="Sales require a customer. Create one now to get started."
          action={
            <MobileCreateCustomerButton
              existingPhones={existingPhones}
              onCreated={() => {
                // Refresh the page to load the new customer into the list
                window.location.reload();
              }}
            />
          }
        />
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
