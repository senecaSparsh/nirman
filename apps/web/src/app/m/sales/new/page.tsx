import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import MobileNewSaleClient from "./MobileNewSaleClient";

/**
 * /m/sales/new — mobile new-sale form. Replaces every desktop `/sales`
 * "New sale" link from the mobile surface. Pre-seeds builtUnitId /
 * landParcelId / customerId / projectId from the query string (linked
 * from unit, customer, or project detail pages).
 *
 * Delegates to MobileNewSaleClient which fetches its own data client-side
 * via /api/sales/new-options — same component used by the FAB + modal
 * on the sales hub, so the two paths stay in sync.
 */
export default function MobileNewSalePage({
  searchParams,
}: {
  searchParams: Promise<{
    builtUnitId?: string;
    landParcelId?: string;
    customerId?: string;
    project?: string;
  }>;
}) {
  return (
    <MobileNewEntityPage perm={PERM.SALE_CREATE} what="create sales" permission="sale.create" fields={5}>
      {async () => {
        const { builtUnitId, landParcelId, customerId, project } = await searchParams;

        return (
          <MobileNewSaleClient
            initialBuiltUnitId={builtUnitId}
            initialLandParcelId={landParcelId}
            initialCustomerId={customerId}
            initialProjectId={project}
          />
        );
      }}
    </MobileNewEntityPage>
  );
}
