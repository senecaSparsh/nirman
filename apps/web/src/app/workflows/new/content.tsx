import { connection } from "next/server";
import { WorkflowBuilder } from "@/components/workflows/workflow-builder";
import { PermissionGate } from "@/components/permission-gate";
import { PERM } from "@/lib/roles";

export async function NewWorkflowContent() {
  await connection();
  return (
    <PermissionGate perm={PERM.CANVAS_VIEW}>
      <WorkflowBuilder />
    </PermissionGate>
  );
}
