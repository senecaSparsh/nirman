import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { LandDetailContent } from "./content";



export default function LandDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading land purchase…" />}>
      <LandDetailContent params={params} />
    </Suspense>
  );
}
