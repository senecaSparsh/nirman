import { Suspense } from "react";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { SettingsContent } from "./content";



export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        description="Company settings, stock locations, cost centres, people, and application preferences."
      />
      <Suspense fallback={<PageLoading label="Loading settings…" />}>
        <SettingsContent />
      </Suspense>
    </div>
  );
}
