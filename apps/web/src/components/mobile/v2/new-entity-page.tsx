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

   Permission modes:
   • Hard gate (default): If the user lacks the permission, they see
     <MobileNoAccess> and the children function is never called.
   • Soft gate (soft={true}): The children function is always called,
     but receives { canManage: false } so the form can render in a
     read-only / disabled state. Use this when the form should still
     be visible but with limited functionality.
   • No gate (perm omitted): No permission check at all. Children
     receives { canManage: true }. Use for pages that don't need a gate.
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
 * Context passed to the children render function.
 * `canManage` is true when the user has the required permission (or
 * when no permission was requested). In soft mode it may be false —
 * the form should use it to show/hide create buttons.
 */
export interface MobileNewEntityCtx {
  canManage: boolean;
}

/**
 * Full "new entity" page scaffolding: Suspense + connection + permission gate.
 *
 * Usage (hard gate — default):
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
 * Usage (soft gate — form renders but with canManage=false):
 *   export default function Page() {
 *     return (
 *       <MobileNewEntityPage perm={PERM.PROCUREMENT_MANAGE} what="add suppliers" soft>
 *         {async ({ canManage }) => {
 *           const company = await getCompany();
 *           return <MyForm canCreate={canManage} />;
 *         }}
 *       </MobileNewEntityPage>
 *     );
 *   }
 *
 * The children render function is only called if the user has permission
 * (hard gate) or always called with canManage (soft gate).
 */
export async function MobileNewEntityPage({
  perm,
  what,
  permission,
  fields = 5,
  suspense = true,
  soft = false,
  children,
}: {
  /** Permission to gate on. Omit for no gate. */
  perm?: Permission;
  what?: string;
  /** The permission key to display in the NoAccess message. */
  permission?: string;
  fields?: number;
  /** Wrap in Suspense with a form skeleton. Set false if the page is fully static. */
  suspense?: boolean;
  /** If true, don't block — pass canManage to children instead. */
  soft?: boolean;
  children: (ctx: MobileNewEntityCtx) => Promise<ReactNode> | ReactNode;
}) {
  const content = async () => {
    await connection();
    const role = await getUserRole();
    const overrides = await getUserPermissions();
    const canManage = perm ? hasPermission(role, perm, overrides) : true;

    if (!soft && perm && !canManage) {
      return <MobileNoAccess what={what ?? "this page"} permission={permission} />;
    }
    return children({ canManage });
  };

  if (suspense) {
    return <MobileNewEntitySuspense fields={fields}>{content()}</MobileNewEntitySuspense>;
  }
  return content();
}
