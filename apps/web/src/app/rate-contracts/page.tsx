import { Suspense } from "react";
import { connection } from "next/server";
import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { RateContractsView } from "@/components/rate-contracts/rate-contracts-view";

export default function RateContractsPage() {
  return (
    <div className="space-y-5">
      <Suspense fallback={<PageLoading label="Loading rate contracts…" variant="default" />}>
        <RcContent />
      </Suspense>
    </div>
  );
}

async function RcContent() {
  await connection();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.PROCUREMENT_VIEW)) {
    return <NoAccess what="rate contracts" />;
  }

  const canCreate = hasPermission(role, PERM.PROCUREMENT_MANAGE);

  return (
    <>
      <PageHeader title="Rate Contracts" stats={[]} />
      <RateContractsView canCreate={canCreate} />
    </>
  );
}
