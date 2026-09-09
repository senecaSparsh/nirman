import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { DepartmentsContent } from "./content";

export const dynamic = "force-dynamic";

export default function DepartmentsPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading departments…" variant="list" />}>
      <DepartmentsContent />
    </Suspense>
  );
}
