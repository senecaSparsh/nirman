import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { WoContent } from "./content";



export default function WorkOrdersPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading work orders…" variant="default" />}>
        <WoContent />
      </Suspense>
    </div>
  );
}
