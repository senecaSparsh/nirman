import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { GatePassesContent } from "./content";

export const metadata = { title: "Gate Passes · Nirman" };

export default function GatePassesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading gate passes…" variant="list" />}>
        <GatePassesContent />
      </Suspense>
    </div>
  );
}
