import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import MobileNewEquipmentClient from "./MobileNewEquipmentClient";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

/**
 * /m/equipment/new — mobile equipment registration.
 * Server wrapper that gates on ASSETS_MANAGE permission.
 */
export default async function MobileNewEquipmentPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.ASSETS_MANAGE)) {
    return <MobileNoAccess what="register equipment" permission="assets.manage" />;
  }

  return <MobileNewEquipmentClient />;
}
