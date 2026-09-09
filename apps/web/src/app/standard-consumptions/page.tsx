import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { StandardConsumptionsContent } from "./content";



export default function StandardConsumptionsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading consumption benchmarks…" variant="list" />}>
        <StandardConsumptionsContent />
      </Suspense>
    </div>
  );
}
