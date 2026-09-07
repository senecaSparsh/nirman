import { prisma } from "@nirman/db";
import { getCompany, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewPortalListingClient } from "./MobileNewPortalListingClient";

/**
 * /m/portal-listings/new — mobile form for creating a new portal listing.
 * Fetches available built units and renders the client form.
 */
export default function MobileNewPortalListingPage() {
  return (
    <MobileNewEntityPage perm={PERM.SALES_MANAGE} what="create portal listings" permission="sales.manage" fields={4}>
      {async () => {
        const company = await getCompany();

        const units = await prisma.builtUnit.findMany({
          where: {
            project: { companyId: company.id },
            deletedAt: null,
            status: "AVAILABLE",
          },
          orderBy: { unitNumber: "asc" },
          select: {
            id: true,
            unitNumber: true,
            unitType: true,
            area: true,
            areaUnit: true,
            askingPrice: true,
            project: { select: { name: true } },
          },
        });

        const serialized = units.map((u) => ({
          id: u.id,
          unitNumber: u.unitNumber,
          unitType: u.unitType,
          projectName: u.project.name,
          area: toNum(u.area),
          areaUnit: u.areaUnit,
          askingPrice: u.askingPrice ? toNum(u.askingPrice) : null,
        }));

        return <MobileNewPortalListingClient units={serialized} />;
      }}
    </MobileNewEntityPage>
  );
}
