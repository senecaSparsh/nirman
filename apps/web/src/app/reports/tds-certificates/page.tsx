import { Suspense } from "react";
import { connection } from "next/server";
import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { PageHeader } from "@/components/page-header";
import { TdsCertificatesView } from "@/components/tds-certificates/tds-certificates-view";

export default function TdsCertificatesPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading TDS certificates…" variant="default" />}>
        <TdsContent />
      </Suspense>
    </div>
  );
}

async function TdsContent() {
  await connection();
  const role = await getUserRole();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="TDS certificates" />;
  }

  return (
    <>
      <PageHeader
        title="TDS Certificates"
        description="Generate and manage Form 16C TDS certificates for subcontractor payments, as required under Section 194C of the Income Tax Act."
      />
      <TdsCertificatesView />
    </>
  );
}
