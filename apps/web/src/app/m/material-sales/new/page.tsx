import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import MobileNewMaterialSaleClient from "./MobileNewMaterialSaleClient";

/**
 * /m/material-sales/new — mobile material sale creation.
 * Server wrapper that gates on SALE_CREATE permission.
 */
export default function MobileNewMaterialSalePage() {
  return (
    <MobileNewEntityPage perm={PERM.SALE_CREATE} what="create sales" permission="sale.create">
      {() => <MobileNewMaterialSaleClient />}
    </MobileNewEntityPage>
  );
}
