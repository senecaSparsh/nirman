import { PageHeader } from "@/components/page-header";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";

export const metadata = { title: "New Workflow · Nirman" };

export default function NewWorkflowPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="New Workflow"
        description="Build a chain of events on the canvas — add steps, connect them, and schedule recurring execution."
      />
      <WorkflowBuilder />
    </div>
  );
}
