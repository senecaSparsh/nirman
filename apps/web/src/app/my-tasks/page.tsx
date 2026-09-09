import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { MyTasksContent } from "./content";

export const metadata = { title: "My Tasks · Nirman" };

export default function MyTasksPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="My Tasks"
        description="Tasks assigned to you, with step-by-step guidance. Team leads can also switch to the Team Tasks tab to manage everyone's work."
      />
      <Suspense fallback={<PageLoading label="Loading tasks…" />}>
        <MyTasksContent />
      </Suspense>
    </div>
  );
}
