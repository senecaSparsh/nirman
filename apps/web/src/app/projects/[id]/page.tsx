import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { ProjectDetailContent } from "./content";



export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageLoading label="Loading project…" />}>
      <ProjectDetailContent params={params} />
    </Suspense>
  );
}
