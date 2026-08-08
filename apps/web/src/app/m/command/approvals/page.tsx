import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { MobileApprovals } from "@/components/mobile/mobile-approvals";

export default function CommandApprovalsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <MobileApprovals title="Approvals" />
    </Suspense>
  );
}
