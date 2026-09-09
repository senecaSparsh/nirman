import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { WorkflowLoader } from "./content";

export const metadata = { title: "Edit Workflow · Nirman" };

export default function WorkflowEditorPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <div className="space-y-3">
      <PageHeader
        title="Edit Workflow"
        description="Modify the steps, connections, and schedule of this workflow."
      />
      <Suspense fallback={<PageLoading label="Loading workflow…" />}>
        <WorkflowLoader params={params} />
      </Suspense>
    </div>
  );
}
