import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import MobileNewStockCountClient from "./MobileNewStockCountClient";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

/**
 * /m/stock-counts/new — mobile stock count creation.
 * Server wrapper that gates on INVENTORY_MANAGE permission.
 */
export default async function MobileNewStockCountPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.INVENTORY_MANAGE)) {
    return <MobileNoAccess what="create stock inventories" permission="inventory.manage" />;
  }

  return <MobileNewStockCountClient />;
}
