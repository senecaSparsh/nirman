import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import MobileNewStockCountClient from "./MobileNewStockCountClient";

/**
 * /m/stock-counts/new — mobile stock count creation.
 * Server wrapper that gates on INVENTORY_MANAGE permission.
 */
export default function MobileNewStockCountPage() {
  return (
    <MobileNewEntityPage perm={PERM.INVENTORY_MANAGE} what="create stock inventories" permission="inventory.manage">
      {() => <MobileNewStockCountClient />}
    </MobileNewEntityPage>
  );
}
