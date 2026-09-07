import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import MobileNewScrapGenerationClient from "./MobileNewScrapGenerationClient";

/**
 * /m/scrap-generations/new — mobile scrap generation form.
 * Server wrapper that gates on INVENTORY_MANAGE permission.
 */
export default function MobileNewScrapGenerationPage() {
  return (
    <MobileNewEntityPage perm={PERM.INVENTORY_MANAGE} what="generate scrap" permission="inventory.manage">
      {() => <MobileNewScrapGenerationClient />}
    </MobileNewEntityPage>
  );
}
