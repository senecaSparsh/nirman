import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { StockLocationsContent } from "./content";

export const metadata = { title: "Stock Locations" };

export default function StockLocationsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading stock locations…" variant="list" />}>
        <StockLocationsContent />
      </Suspense>
    </div>
  );
}
