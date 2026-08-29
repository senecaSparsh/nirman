import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import MobileNewMaterialSaleClient from "./MobileNewMaterialSaleClient";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

/**
 * /m/material-sales/new — mobile material sale creation.
 * Server wrapper that gates on SALE_CREATE permission.
 */
export default async function MobileNewMaterialSalePage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.SALE_CREATE)) {
    return <MobileNoAccess what="create sales" permission="sale.create" />;
  }

  return <MobileNewMaterialSaleClient />;
}
