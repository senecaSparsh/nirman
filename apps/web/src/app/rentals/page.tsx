import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { RentalsContent } from "./content";



export default function RentalsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading rentals…" variant="list" />}>
      <RentalsContent />
    </Suspense>
  );
}
