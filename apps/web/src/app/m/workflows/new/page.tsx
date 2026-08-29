import { Suspense } from "react";
import { connection } from "next/server";
import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileNewWorkflowClient } from "./MobileNewWorkflowClient";

/**
 * /m/workflows/new — mobile workflow creation. Uses template-based
 * creation (pick a template → name → schedule) instead of the desktop
 * visual canvas builder, which isn't suitable for touch screens.
 */
export default function MobileNewWorkflowPage() {
  return (
    <Suspense fallback={<MobileSkeletonDetail />}>
      <MobileNewWorkflowContent />
    </Suspense>
  );
}

async function MobileNewWorkflowContent() {
  await connection();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.WORKFLOWS_MANAGE)) {
    return <MobileNoAccess what="workflow creation" permission="WORKFLOWS_MANAGE" />;
  }

  return <MobileNewWorkflowClient />;
}
