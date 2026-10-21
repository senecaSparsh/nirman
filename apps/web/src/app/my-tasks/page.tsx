import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { MyTasksContent } from "./content";

export const metadata = { title: "My Tasks · Nirman" };

export default function MyTasksPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading tasks…" />}>
        <MyTasksContent />
      </Suspense>
    </div>
  );
}
