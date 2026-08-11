import { Suspense } from "react";
import { connection } from "next/server";
import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { RealEstateInventoryView } from "@/components/reports/real-estate-inventory-view";

export default function RealEstateInventoryPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading real estate inventory…" variant="default" />}>
        <RealEstateInventoryContent />
      </Suspense>
    </div>
  );
}

async function RealEstateInventoryContent() {
  await connection();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="the real estate inventory dashboard" />;
  }

  return (
    <>
      <PageHeader
        title="Real Estate Inventory"
        description="Units sold, remaining, monthly additions, and construction cost per project — the complete real estate inventory picture."
      />
      <RealEstateInventoryView />
    </>
  );
}
