import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { WorkflowsContent } from "./content";

export const metadata = { title: "Workflows · Nirman" };

export default function WorkflowsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Workflows"
        description="Automate your work — build chains of events on the canvas, schedule them, and let the system handle the rest."
      />
      <Suspense fallback={<PageLoading label="Loading workflows…" />}>
        <WorkflowsContent />
      </Suspense>
    </div>
  );
}
