import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { BoqContent } from "./content";



export default function BoqPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading BOQ…" variant="default" />}>
        <BoqContent />
      </Suspense>
    </div>
  );
}
