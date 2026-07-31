import { PageHeader } from "@/components/page-header";
import { MyTasksPanel } from "@/components/tasks/my-tasks-panel";

export const metadata = { title: "My Tasks · Nirman" };

export default function MyTasksPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="My Tasks"
        description="Tasks assigned to you by your manager, with step-by-step guidance on what to do."
      />
      <MyTasksPanel />
    </div>
  );
}
