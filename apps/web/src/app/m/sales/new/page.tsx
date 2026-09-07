import { prisma } from "@nirman/db";
import { getCompany, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { ShoppingCart } from "lucide-react";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewSaleForm } from "@/components/mobile/mobile-new-sale-form";
import { MobileNoCustomersState } from "./MobileNoCustomersState";

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
    <MobileNewEntityPage perm={PERM.SALE_CREATE} what="create sales" permission="sale.create" fields={5}>
      {async () => {
        const company = await getCompany();
        const { builtUnitId, landParcelId, customerId } = await searchParams;

        const [units, parcels, customers, projects, allProjectsForSale, brokers] = await Promise.all([
          prisma.builtUnit.findMany({
            where: {
              deletedAt: null,
              status: "AVAILABLE",
              project: { companyId: company.id, deletedAt: null },
            },
            orderBy: [{ project: { name: "asc" } }, { unitNumber: "asc" }],
            take: 200,
            include: { project: { select: { id: true, name: true, reraNumber: true } } },
          }),
          prisma.landParcel.findMany({
            where: { deletedAt: null, status: "AVAILABLE", landPurchase: { companyId: company.id } },
            orderBy: { number: "asc" },
            take: 200,
            include: { landPurchase: { select: { id: true, sellerName: true, location: true } }, project: { select: { id: true, name: true, reraNumber: true } } },
          }),
          prisma.customer.findMany({
            where: { companyId: company.id, deletedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true, phone: true },
          }),
          prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null },
            select: { id: true, name: true },
            orderBy: { name: "asc" },
          }),
          // Sellable projects: PLANNED/ACTIVE, all units AVAILABLE/HOLD with no sale
          prisma.project.findMany({
            where: { companyId: company.id, deletedAt: null, status: { in: ["PLANNED", "ACTIVE"] } },
            select: {
              id: true,
              name: true,
              builtUnits: { where: { deletedAt: null }, select: { id: true, status: true, saleId: true } },
            },
            orderBy: { name: "asc" },
          }),
          prisma.broker.findMany({
            where: { companyId: company.id, deletedAt: null },
            orderBy: { name: "asc" },
            select: { id: true, name: true, phone: true, agency: true, defaultCommissionPercent: true },
          }),
        ]);

        // Filter to only projects where ALL units are sellable (AVAILABLE/HOLD, no sale)
        const sellableProjects = allProjectsForSale
          .filter((p) => {
            const unitList = p.builtUnits;
            if (unitList.length === 0) return false;
            return unitList.every((u) =>
              (u.status === "AVAILABLE" || u.status === "HOLD") && u.saleId === null,
            );
          })
          .map((p) => ({ id: p.id, name: p.name }));

        const unitItems = units.map((u) => ({
          id: u.id,
          label: `${u.unitNumber} · ${u.unitType.replace(/_/g, " ")} · ${u.project.name}`,
          projectId: u.projectId,
          projectReraNumber: u.project.reraNumber ?? null,
          askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
          area: toNum(u.area),
          areaUnit: u.areaUnit,
        }));

        const parcelItems = parcels.map((p) => ({
          id: p.id,
          label: `Parcel ${p.number} · ${p.landPurchase.location ?? p.landPurchase.sellerName}`,
          projectId: p.projectId,
          projectReraNumber: p.project?.reraNumber ?? null,
          askingPrice: null,
          area: toNum(p.area),
          areaUnit: p.areaUnit,
        }));

        const customerItems = customers.map((c) => ({ id: c.id, name: c.name, phone: c.phone }));
        const existingPhones = customers.map((c) => c.phone).filter(Boolean) as string[];

        return (
          <div className="pb-32">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex-1 min-w-0">
                <p className="text-m-section font-bold" style={{ color: "var(--color-ink-950)" }}>
                  New Sale
                </p>
              </div>
              <span
                className="flex items-center gap-0.5 text-m-caption font-bold uppercase tracking-wide px-2 py-0.5 rounded-full shrink-0"
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
                sellableProjects={sellableProjects}
                brokers={brokers.map((b) => ({ id: b.id, name: b.name, phone: b.phone ?? "", agency: b.agency ?? "", defaultCommissionPercent: b.defaultCommissionPercent ? toNum(b.defaultCommissionPercent) : null }))}
                initialBuiltUnitId={builtUnitId}
                initialLandParcelId={landParcelId}
                initialCustomerId={customerId}
                existingPhones={existingPhones}
              />
            )}
          </div>
        );
      }}
    </MobileNewEntityPage>
  );
}
