import { PERM } from "@/lib/roles";
import { MobileNewEntityPage } from "@/components/mobile/v2/new-entity-page";
import { MobileNewWorkflowClient } from "./MobileNewWorkflowClient";

/**
 * /m/workflows/new — mobile workflow creation. Uses template-based
 * creation (pick a template → name → schedule) instead of the desktop
 * visual canvas builder, which isn't suitable for touch screens.
 */
export default function MobileNewWorkflowPage() {
  return (
    <MobileNewEntityPage perm={PERM.WORKFLOWS_MANAGE} what="workflow creation" permission="WORKFLOWS_MANAGE" fields={4}>
      {() => <MobileNewWorkflowClient />}
    </MobileNewEntityPage>
  );
}
