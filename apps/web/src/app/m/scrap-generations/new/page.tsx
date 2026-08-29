import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import MobileNewScrapGenerationClient from "./MobileNewScrapGenerationClient";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";

/**
 * /m/scrap-generations/new — mobile scrap generation form.
 * Server wrapper that gates on INVENTORY_MANAGE permission.
 */
export default async function MobileNewScrapGenerationPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.INVENTORY_MANAGE)) {
    return <MobileNoAccess what="generate scrap" permission="inventory.manage" />;
  }

  return <MobileNewScrapGenerationClient />;
}
