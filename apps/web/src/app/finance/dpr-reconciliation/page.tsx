import { Suspense } from "react";
import { connection } from "next/server";
import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { NoAccess } from "@/components/no-access";
import { PageLoading } from "@/components/page-loading";
import { DprFinanceReconciliationView } from "@/components/dpr/dpr-finance-reconciliation-view";

export default function DprReconciliationPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading reconciliation…" variant="list" />}>
        <DprReconciliationContent />
      </Suspense>
    </div>
  );
}

async function DprReconciliationContent() {
  await connection();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="the DPR-Finance reconciliation" />;
  }

  return (
    <>
      <PageHeader
        title="DPR-Finance Reconciliation"
        description="Compare DPR-recorded costs (material + labor) against GL-posted costs (Material Issues + Project Costs linked via sourceDprId)."
      />
      <DprFinanceReconciliationView />
    </>
  );
}
