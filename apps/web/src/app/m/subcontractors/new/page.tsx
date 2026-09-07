import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewSubcontractorClient } from "./MobileNewSubcontractorClient";

/**
 * /m/subcontractors/new — mobile subcontractor creation.
 * Server wrapper that gates on PROCUREMENT_MANAGE permission.
 */
export default function MobileNewSubcontractorPage() {
  return (
    <MobileNewEntityPage perm={PERM.PROCUREMENT_MANAGE} what="create subcontractors" permission="procurement.manage">
      {() => <MobileNewSubcontractorClient />}
    </MobileNewEntityPage>
  );
}
