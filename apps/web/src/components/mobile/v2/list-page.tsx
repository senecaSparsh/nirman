import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { getCompany, getUserRole, getUserPermissions } from "@/lib/server";
import { hasPermission, type Permission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE LIST PAGE — shared scaffolding for /m/{entity} list/index pages

   Every mobile list page repeats the same 3-part structure:
     1. Suspense boundary with a list skeleton fallback
     2. connection() + getCompany() + getUserRole() + permission gate
     3. Prisma findMany → serialize → <Mobile*List> component

   This wrapper handles parts 1 and 2 so the page file only contains
   the data fetch + list render.

   Permission handling:
   • perm (view permission): If set and the user lacks it, they see
     <MobileNoAccess> and the children function is never called.
   • managePerm (manage permission): If set, computed as `canManage`
     and passed to children. The list component uses it to show/hide
     create/edit buttons.
   • Both optional: Omit both for pages that don't need a gate.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Context passed to the children render function.
 */
export interface MobileListPageCtx {
  /** The current company (from getCompany()). */
  company: Awaited<ReturnType<typeof getCompany>>;
  /** The user's role string (from getUserRole()). */
  role: string;
  /** True if the user has the managePerm (or if no managePerm was requested). */
  canManage: boolean;
}

/**
 * Full list-page scaffolding: Suspense + connection + company + role +
 * permission gate. The children function receives company, role, and
 * canManage so it can fetch data and render the list.
 *
 * Usage:
 *   export default function Page() {
 *     return (
 *       <MobileListPage perm={PERM.INVENTORY_VIEW} managePerm={PERM.INVENTORY_MANAGE} what="departments">
 *         {async ({ company, canManage }) => {
 *           const items = await prisma.department.findMany({
 *             where: { companyId: company.id, deletedAt: null },
 *           });
 *           return <MobileDepartmentsList items={items} canManage={canManage} />;
 *         }}
 *       </MobileListPage>
 *     );
 *   }
 *
 * The children render function is only called if the user has the view
 * permission (when perm is set).
 */
export async function MobileListPage({
  perm,
  managePerm,
  what,
  permission,
  skeletonRows = 6,
  children,
}: {
  /** View permission — hard gate. Omit for no gate. */
  perm?: Permission;
  /** Manage permission — computed as canManage and passed to children. */
  managePerm?: Permission;
  what?: string;
  /** The permission key to display in the NoAccess message. */
  permission?: string;
  /** Number of skeleton rows in the Suspense fallback. */
  skeletonRows?: number;
  children: (ctx: MobileListPageCtx) => Promise<ReactNode> | ReactNode;
}) {
  const content = async () => {
    await connection();
    const company = await getCompany();
    const role = await getUserRole();
    const overrides = await getUserPermissions();

    if (perm && !hasPermission(role, perm, overrides)) {
      return <MobileNoAccess what={what ?? "this page"} permission={permission} />;
    }

    const canManage = managePerm ? hasPermission(role, managePerm, overrides) : true;

    return children({ company, role, canManage });
  };

  return (
    <Suspense fallback={<MobileSkeletonList rows={skeletonRows} />}>
      {content()}
    </Suspense>
  );
}
