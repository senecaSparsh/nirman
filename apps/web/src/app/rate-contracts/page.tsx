import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { RateContractsView } from "@/components/rate-contracts/rate-contracts-view";

export default function RateContractsPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading rate contracts…" variant="default" />}>
        <RcContent />
      </Suspense>
    </div>
  );
}

async function RcContent() {
  await connection();
  const __effPerms = await getUserPermissions();

  if (!__effPerms.includes(PERM.PROCUREMENT_VIEW)) {
    return <NoAccess what="rate contracts" />;
  }

  const canCreate = __effPerms.includes(PERM.PROCUREMENT_MANAGE);

  const company = await getCompany();
  const categories = await prisma.materialCategory.findMany({
    take: 200,
    where: { companyId: company.id, deletedAt: null },
    select: { id: true, name: true, unit: true },
    orderBy: { name: "asc" },
  });

  return (
    <>
      <PageHeader title="Rate Contracts" stats={[]} />
      <RateContractsView canCreate={canCreate} categories={categories} />
    </>
  );
}
