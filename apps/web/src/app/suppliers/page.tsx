import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { VendorsContent } from "./content";



export default function VendorsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading vendors…" variant="list" />}>
        <VendorsContent />
      </Suspense>
    </div>
  );
}
