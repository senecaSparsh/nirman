import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { getCompany, getUserRole, getUserPermissions } from "@/lib/server";
import { hasPermission, type Permission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileSkeletonHome } from "@/components/mobile/mobile-skeleton";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE HUB PAGE — shared scaffolding for /m/{module} hub/dashboard pages

   Hub pages (accounts, construction, crm, hr, inventory, procurement,
   real-estate, reports, stock) repeat the same structure:
     1. Suspense boundary with a home/dashboard skeleton fallback
     2. connection() + getCompany() + getUserRole() + optional permission gate
     3. Heavy data fetching (Promise.all of many queries) — unique per hub
     4. Tab-based or dashboard rendering via a HubTabs component

   This wrapper handles parts 1 and 2 so the page file only contains
   the data fetch + tab/dashboard render.

   Permission handling:
   • perm (view permission): If set and the user lacks it, they see
     <MobileNoAccess> and the children function is never called.
   • Both optional: Omit for hubs that don't need a gate.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Context passed to the children render function.
 */
export interface MobileHubPageCtx {
  /** The current company (from getCompany()). */
  company: Awaited<ReturnType<typeof getCompany>>;
  /** The user's role string (from getUserRole()). */
  role: string;
}

/**
 * Full hub-page scaffolding: Suspense + connection + company + role +
 * optional permission gate. The children function receives company and
 * role so it can fetch hub data and render the dashboard/tabs.
 *
 * Usage:
 *   export default function Page() {
 *     return (
 *       <MobileHubPage perm={PERM.FINANCE_VIEW} what="accounts">
 *         {async ({ company, role }) => {
 *           const data = await prisma.expense.findMany({ ... });
 *           return <MobileAccountsHubTabs items={data} />;
 *         }}
 *       </MobileHubPage>
 *     );
 *   }
 *
 * The children render function is only called if the user has the view
 * permission (when perm is set).
 */
export async function MobileHubPage({
  perm,
  what,
  permission,
  skeleton,
  children,
}: {
  /** View permission — hard gate. Omit for no gate. */
  perm?: Permission;
  what?: string;
  /** The permission key to display in the NoAccess message. */
  permission?: string;
  /** Custom skeleton fallback. Defaults to <MobileSkeletonHome />. */
  skeleton?: ReactNode;
  children: (ctx: MobileHubPageCtx) => Promise<ReactNode> | ReactNode;
}) {
  const content = async () => {
    await connection();
    const company = await getCompany();
    const role = await getUserRole();
    const overrides = await getUserPermissions();

    if (perm && !hasPermission(role, perm, overrides)) {
      return <MobileNoAccess what={what ?? "this page"} permission={permission} />;
    }

    return children({ company, role });
  };

  return (
    <Suspense fallback={skeleton ?? <MobileSkeletonHome />}>
      {content()}
    </Suspense>
  );
}
