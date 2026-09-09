import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { MbContent } from "./content";



export default function MeasurementBookPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading measurement book…" variant="default" />}>
        <MbContent />
      </Suspense>
    </div>
  );
}
