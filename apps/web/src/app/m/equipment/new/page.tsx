import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import MobileNewEquipmentClient from "./MobileNewEquipmentClient";

/**
 * /m/equipment/new — mobile equipment registration.
 * Server wrapper that gates on ASSETS_MANAGE permission.
 */
export default function MobileNewEquipmentPage() {
  return (
    <MobileNewEntityPage perm={PERM.ASSETS_MANAGE} what="register equipment" permission="assets.manage">
      {() => <MobileNewEquipmentClient />}
    </MobileNewEntityPage>
  );
}
