import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { getCompany, getUserRole, getUserPermissions } from "@/lib/server";
import { hasPermission, type Permission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE DETAIL PAGE — shared scaffolding for /m/{entity}/[id] pages

   Every mobile detail page repeats the same 4-part structure:
     1. Suspense boundary with a detail skeleton fallback
     2. connection() + getCompany() + getUserRole() + permission gate
     3. Extract id from params → fetch entity → handle not-found
     4. Wrap in PageContextProvider + RecordRecentItem + detail client

   This wrapper handles parts 1 and 2 so the page file only contains
   the entity fetch + context + client render.

   Permission handling:
   • perm (view permission): If set and the user lacks it, they see
     <MobileNoAccess> and the children function is never called.
   • managePerm (manage permission): If set, computed as `canManage`
     and passed to children. The detail client uses it to show/hide
     action buttons.
   • Both optional: Omit both for pages that don't need a gate.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Context passed to the children render function.
 */
export interface MobileDetailPageCtx {
  /** The entity ID extracted from the route params. */
  id: string;
  /** The current company (from getCompany()). */
  company: Awaited<ReturnType<typeof getCompany>>;
  /** The user's role string (from getUserRole()). */
  role: string;
  /** True if the user has the managePerm (or if no managePerm was requested). */
  canManage: boolean;
}

/**
 * Full detail-page scaffolding: Suspense + connection + company + role +
 * permission gate + id extraction. The children function receives id,
 * company, role, and canManage so it can fetch the entity and render
 * the detail client.
 *
 * Usage:
 *   export default function Page({ params }: { params: Promise<{ id: string }> }) {
 *     return (
 *       <MobileDetailPage params={params} perm={PERM.ASSETS_VIEW} managePerm={PERM.ASSETS_MANAGE} what="equipment">
 *         {async ({ id, company, canManage }) => {
 *           const equipment = await prisma.equipment.findFirst({
 *             where: { id, companyId: company.id, deletedAt: null },
 *           });
 *           if (!equipment) return <MobileEmptyState title="Not found" />;
 *           return (
 *             <PageContextProvider value={{ entityType: "equipment", ... }}>
 *               <RecordRecentItem type="equipment" ... />
 *               <MobileEquipmentDetailClient equipment={...} canManage={canManage} />
 *             </PageContextProvider>
 *           );
 *         }}
 *       </MobileDetailPage>
 *     );
 *   }
 *
 * The children render function is only called if the user has the view
 * permission (when perm is set).
 */
export async function MobileDetailPage({
  params,
  perm,
  managePerm,
  what,
  permission,
  skeletonSections,
  children,
}: {
  params: Promise<{ id: string }>;
  /** View permission — hard gate. Omit for no gate. */
  perm?: Permission;
  /** Manage permission — computed as canManage and passed to children. */
  managePerm?: Permission;
  what?: string;
  /** The permission key to display in the NoAccess message. */
  permission?: string;
  /** Number of skeleton sections in the Suspense fallback. */
  skeletonSections?: number;
  children: (ctx: MobileDetailPageCtx) => Promise<ReactNode> | ReactNode;
}) {
  const content = async () => {
    const { id } = await params;
    await connection();
    const company = await getCompany();
    const role = await getUserRole();
    const overrides = await getUserPermissions();

    if (perm && !hasPermission(role, perm, overrides)) {
      return <MobileNoAccess what={what ?? "this page"} permission={permission} />;
    }

    const canManage = managePerm ? hasPermission(role, managePerm, overrides) : true;

    return children({ id, company, role, canManage });
  };

  return (
    <Suspense fallback={<MobileSkeletonDetail sections={skeletonSections} />}>
      {content()}
    </Suspense>
  );
}
