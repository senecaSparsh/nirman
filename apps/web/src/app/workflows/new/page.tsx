import { Suspense } from "react";
import { connection } from "next/server";
import { PageHeader } from "@/components/page-header";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";
import { PageLoading } from "@/components/page-loading";
import { PermissionGate } from "@/components/permission-gate";
import { PERM } from "@/lib/roles";

export const metadata = { title: "New Workflow · Nirman" };

export default function NewWorkflowPage() {
  return (
    <div className="space-y-3">
      <PageHeader
        title="New Workflow"
        description="Build a chain of events on the canvas — add steps, connect them, and schedule recurring execution."
      />
      <Suspense fallback={<PageLoading label="Loading…" />}>
        <NewWorkflowContent />
      </Suspense>
    </div>
  );
}

export async function NewWorkflowContent() {
  await connection();
  return (
    <PermissionGate perm={PERM.CANVAS_VIEW}>
      <WorkflowBuilder />
    </PermissionGate>
  );
}
