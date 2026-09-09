import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ProjectAssignmentsContent } from "./content";



export default function ProjectAssignmentsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Project Assignments"
        description="Scope user access to specific projects. Supervisors, sales, and accountants only see projects they're assigned to."
      />
      <Suspense fallback={<PageLoading label="Loading assignments…" variant="list" />}>
        <ProjectAssignmentsContent />
      </Suspense>
    </div>
  );
}
