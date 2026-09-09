import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { MaterialsContent } from "./content";



export default function MaterialsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading materials…" variant="cards" />}>
        <MaterialsContent />
      </Suspense>
    </div>
  );
}
