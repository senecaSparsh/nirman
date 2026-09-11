import { Suspense } from "react";
import { connection } from "next/server";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { loadCompanyProfileData } from "@/lib/company-profile-data";
import { CompanyProfileClient } from "@/components/companies/company-profile-client";

export const metadata = { title: "Company Profile · Nirman" };

export default function CompanyProfilePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<PageLoading label="Loading company profile…" />}>
      <CompanyProfileContent params={params} />
    </Suspense>
  );
}

async function CompanyProfileContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await connection();
  const { id } = await params;

  const result = await loadCompanyProfileData(id);

  if (!result) {
    return <NoAccess what="this company" />;
  }

  return (
    <CompanyProfileClient
      data={result.data}
      actorRole={result.actorRole}
      permissions={result.permissions}
      roleOptions={result.roleOptions}
      assignableRoles={result.assignableRoles}
    />
  );
}
