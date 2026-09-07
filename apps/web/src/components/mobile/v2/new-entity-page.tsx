import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { getUserRole, getUserPermissions } from "@/lib/server";
import { hasPermission, type Permission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileSkeletonForm } from "@/components/mobile/mobile-skeleton";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE NEW ENTITY PAGE — shared scaffolding for /m/{entity}/new pages

   Every mobile "create" page repeats the same 3-part structure:
     1. Suspense boundary with a form skeleton fallback
     2. connection() + permission gate (→ MobileNoAccess if blocked)
     3. The actual form component (with any data it needs)

   This wrapper handles parts 1 and 2 so the page file only contains
   the data fetch + form render. Two flavours:

   • <MobileNewEntityPage>           — async server component, gates
     on a single permission, calls connection() automatically, then
     renders your <Content> function with the role result.

   • <MobileNewEntitySuspense>       — just the Suspense + skeleton
     wrapper, for pages that need more control over the gate logic.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Suspense wrapper with a form skeleton fallback. Use this around your
 * async content component when the page does data fetching.
 */
export function MobileNewEntitySuspense({
  children,
  fields = 5,
}: {
  children: ReactNode;
  fields?: number;
}) {
  return <Suspense fallback={<MobileSkeletonForm fields={fields} />}>{children}</Suspense>;
}

/**
 * Full "new entity" page scaffolding: Suspense + connection + permission gate.
 *
 * Usage:
 *   export default function Page() {
 *     return (
 *       <MobileNewEntityPage perm={PERM.SALES_MANAGE} what="create customers">
 *         {async () => {
 *           const company = await getCompany();
 *           const data = await fetchData(company.id);
 *           return <MyForm data={data} />;
 *         }}
 *       </MobileNewEntityPage>
 *     );
 *   }
 *
 * The children render function is only called if the user has permission.
 */
export async function MobileNewEntityPage({
  perm,
  what,
  permission,
  fields = 5,
  suspense = true,
  children,
}: {
  perm: Permission;
  what?: string;
  /** The permission key to display in the NoAccess message. */
  permission?: string;
  fields?: number;
  /** Wrap in Suspense with a form skeleton. Set false if the page is fully static. */
  suspense?: boolean;
  children: () => Promise<ReactNode> | ReactNode;
}) {
  const content = async () => {
    await connection();
    const role = await getUserRole();
    const overrides = await getUserPermissions();
    if (!hasPermission(role, perm, overrides)) {
      return <MobileNoAccess what={what ?? "this page"} permission={permission} />;
    }
    return children();
  };

  if (suspense) {
    return <MobileNewEntitySuspense fields={fields}>{content()}</MobileNewEntitySuspense>;
  }
  return content();
}
