import { prisma } from "@nirman/db";
import { toNum, scopeWhere, getActionPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileLandList } from "./MobileLandList";
import type { MobileColumnSpec } from "@/components/mobile/v2/export-share-bar";
import { formatCurrencyCompact } from "@/lib/utils";

/**
 * /m/land — mobile land portfolio. Shows land purchases with parcel
 * breakdown, valuation, and sale status. Supervisors/owners need to
 * see what land they own, what's available to sell, and what's held.
 */
export default function MobileLandPage() {
  return (
    <MobileListPage perm={PERM.ASSETS_VIEW} what="land parcels" permission="assets.view" managePerm={PERM.ASSETS_MANAGE}>
      {async ({ company, canManage }) => {
        const actions = await getActionPermissions();
        const purchases = await prisma.landPurchase.findMany({
          where: {...await scopeWhere("LandPurchase"),  companyId: company.id, deletedAt: null },
          orderBy: { createdAt: "desc" },
          include: {
            project: { select: { id: true, name: true } },
            parcels: {
              where: { deletedAt: null },
              select: {
                id: true, number: true, status: true, area: true, purpose: true,
                acquisitionCost: true, currentValuation: true,
                askingPrice: true, parentParcelId: true,
                sale: { select: { salePrice: true, saleNumber: true, saleStage: true, status: true } },
                _count: { select: { children: true } },
              },
            },
          },
        });

        // Fetch active projects and sellers for the dropdowns in the create dialog
        const [projects, sellers] = canManage
          ? await Promise.all([
              prisma.project.findMany({
                where: { companyId: company.id, deletedAt: null },
                orderBy: { name: "asc" },
                select: { id: true, name: true },
              }),
              prisma.landSeller.findMany({
                where: { companyId: company.id, deletedAt: null },
                orderBy: { name: "asc" },
                select: { id: true, name: true, phone: true },
              }),
            ])
          : [[], []];

        // Build portfolio stats — a parcel is "sold" if it has a sale record,
        // regardless of whether the DB status field was synced to SOLD.
        const allParcels = purchases.flatMap((p) => p.parcels);
        const sellable = allParcels.filter((p) => p.status !== "PARTITIONED");
        const hasSale = (p: (typeof allParcels)[number]) => p.sale != null && p.sale.status !== "CANCELLED";
        const sold = sellable.filter((p) => p.status === "SOLD" || hasSale(p));
        const available = sellable.filter((p) => p.status === "AVAILABLE" && !hasSale(p));
        const hold = sellable.filter((p) => p.status === "HOLD" && !hasSale(p));
        const partitioned = allParcels.filter((p) => p.status === "PARTITIONED");
        const totalArea = purchases.reduce((s, p) => s + toNum(p.totalArea), 0);
        const unsold = [...available, ...hold];
        const unsoldValue = unsold.reduce((s, p) => s + toNum(p.currentValuation), 0);
        const costBasis = unsold.reduce((s, p) => s + toNum(p.acquisitionCost), 0);
        const availableArea = available.reduce((s, p) => s + toNum(p.area), 0);

        const serialized = purchases.map((lp) => {
          const parcels = lp.parcels;
          const sellableP = parcels.filter((p) => p.status !== "PARTITIONED");
          const hasSaleP = (p: (typeof parcels)[number]) => p.sale != null && p.sale.status !== "CANCELLED";
          const soldP = sellableP.filter((p) => p.status === "SOLD" || hasSaleP(p));
          const availP = sellableP.filter((p) => p.status === "AVAILABLE" && !hasSaleP(p));
          const holdP = sellableP.filter((p) => p.status === "HOLD" && !hasSaleP(p));
          const partP = parcels.filter((p) => p.status === "PARTITIONED");
          const unsoldP = [...availP, ...holdP];
          const unsoldVal = unsoldP.reduce((s, p) => s + toNum(p.currentValuation), 0);
          const costBasis = unsoldP.reduce((s, p) => s + toNum(p.acquisitionCost), 0);

          return {
            id: lp.id,
            sellerName: lp.sellerName,
            sellerContact: lp.sellerContact,
            purchaseDate: lp.purchaseDate.toISOString(),
            totalArea: toNum(lp.totalArea),
            areaUnit: lp.areaUnit,
            totalCost: toNum(lp.totalCost),
            registryNo: lp.registryNo,
            location: lp.location,
            projectId: lp.projectId,
            projectName: lp.project?.name ?? null,
            mode: lp.mode,
            landType: lp.landType,
            purchaseStage: lp.purchaseStage,
            isPossessed: lp.isPossessed,
            parcelCount: sellableP.length,
            availableCount: availP.length,
            holdCount: holdP.length,
            soldCount: soldP.length,
            partitionedCount: partP.length,
            availableArea: availP.reduce((s, p) => s + toNum(p.area), 0),
            unsoldValue: unsoldVal,
            costBasis,
            valuationGain: unsoldVal - costBasis,
            parcels: parcels.map((p) => ({
              id: p.id,
              number: p.number,
              status: p.status,
              purpose: p.purpose,
              area: toNum(p.area),
              currentValuation: toNum(p.currentValuation),
              askingPrice: p.askingPrice ? toNum(p.askingPrice) : null,
              parentParcelId: p.parentParcelId,
              childCount: p._count.children,
            })),
          };
        });

        const csvColumns: MobileColumnSpec[] = [
          { key: "projectName", label: "Project" },
          { key: "sellerName", label: "Seller" },
          { key: "totalArea", label: "Area" },
          { key: "areaUnit", label: "Area Unit" },
          { key: "totalCost", label: "Total Cost", format: "currency" },
          { key: "unsoldValue", label: "Valuation", format: "currency" },
          { key: "parcelCount", label: "Parcels" },
          { key: "availableCount", label: "Available" },
          { key: "purchaseDate", label: "Purchase Date", format: "date" },
        ];

        return (
          <>
            <MobileLandList
              items={serialized}
              exportTitle="Land & Parcels"
              exportRows={serialized as unknown as Record<string, unknown>[]}
              exportColumns={csvColumns}
              exportSummary={`${purchases.length} land purchases · ${sellable.length} parcels · Valuation: ${formatCurrencyCompact(unsoldValue)}`}
              portfolio={{
                purchaseCount: purchases.length,
                totalArea,
                areaUnit: purchases[0]?.areaUnit ?? "SQFT",
                parcelCount: sellable.length,
                availableCount: available.length,
                holdCount: hold.length,
                soldCount: sold.length,
                partitionedCount: partitioned.length,
                availableArea,
                unsoldValue,
                costBasis,
              }}
              canManage={canManage}
              actions={actions}
              projects={projects}
              sellers={sellers.map((s) => ({ id: s.id, name: s.name, phone: s.phone }))}
              company={{ id: company.id, name: company.name }}
            />
          </>
        );
      }}
    </MobileListPage>
  );
}
