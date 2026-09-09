import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { ProjectsContent } from "./content";



export default function ProjectsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading projects…" variant="cards" />}>
        <ProjectsContent />
      </Suspense>
    </div>
  );
}
