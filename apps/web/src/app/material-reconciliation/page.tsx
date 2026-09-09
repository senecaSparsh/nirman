import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { ReconContent } from "./content";



export default function MaterialReconciliationPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading reconciliation…" variant="default" />}>
        <ReconContent />
      </Suspense>
    </div>
  );
}
