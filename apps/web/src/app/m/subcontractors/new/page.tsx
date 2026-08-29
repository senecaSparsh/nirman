import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileNewSubcontractorClient } from "./MobileNewSubcontractorClient";

/**
 * /m/subcontractors/new — mobile subcontractor creation.
 * Server wrapper that gates on PROCUREMENT_MANAGE permission.
 */
export default async function MobileNewSubcontractorPage() {
  const role = await getUserRole();

  if (!hasPermission(role, PERM.PROCUREMENT_MANAGE)) {
    return <MobileNoAccess what="create subcontractors" permission="procurement.manage" />;
  }

  return <MobileNewSubcontractorClient />;
}
