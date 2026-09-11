import { Suspense } from "react";
import { connection } from "next/server";
import { PageLoading } from "@/components/page-loading";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { PageContextProvider } from "@/components/mobile/v2/page-context";
import { loadCompanyProfileData } from "@/lib/company-profile-data";
import { MobileCompanyDetails } from "./MobileCompanyDetails";

/**
 * /m/settings/company — mobile company details & management page.
 *
 * Comprehensive company management: identity, members, hierarchy, locations,
 * policy, procurement, and audit — all in collapsible sections. Uses the
 * same shared data loader as the desktop /companies/[id] page.
 */
export default function MobileCompanyPage() {
  return (
    <Suspense fallback={<PageLoading label="Loading company details…" />}>
      <MobileCompanyContent />
    </Suspense>
  );
}

async function MobileCompanyContent() {
  await connection();

  // Load the current company's profile data using the shared loader.
  // We pass the current company's ID — the loader resolves it from the session.
  const { getCompany } = await import("@/lib/server");
  const company = await getCompany();
  const result = await loadCompanyProfileData(company.id);

  if (!result) {
    return <MobileNoAccess what="company details" />;
  }

  return (
    <PageContextProvider
      value={{
        entityType: "company",
        label: result.data.name,
        subtitle: "Company Details",
        recordId: result.data.id,
      }}
    >
      <MobileCompanyDetails
        data={result.data}
        actorRole={result.actorRole}
        permissions={result.permissions}
        roleOptions={result.roleOptions}
        assignableRoles={result.assignableRoles}
      />
    </PageContextProvider>
  );
}
