import { Suspense, type ReactNode } from "react";
import { connection } from "next/server";
import { getCompany, getUserRole, getUserPermissions } from "@/lib/server";
import { hasPermission, type Permission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";

/* ═══════════════════════════════════════════════════════════════════════════
   MOBILE PROJECT-SCOPED PAGE — shared scaffolding for /m/{module} pages
   that operate on a selected project (via ?project=<id> search param)

   Project-scoped pages (boq, budget-variance, material-reconciliation,
   measurement-book, project-control, wbs) repeat the same structure:
     1. Suspense boundary with a list skeleton fallback
     2. connection() + getCompany() + getUserRole() + optional permission gate
     3. Extract `project` from searchParams
     4. Fetch projects for the selector
     5. If no project selected → show selector + empty state
     6. If project selected → fetch project-scoped data and render

   This wrapper handles parts 1, 2, and 3 so the page file only contains
   the project fetch + selector + data render.

   Permission handling:
   • perm (view permission): If set and the user lacks it, they see
     <MobileNoAccess> and the children function is never called.
   • Both optional: Omit for pages that don't need a gate.
   ═══════════════════════════════════════════════════════════════════════════ */

/**
 * Context passed to the children render function.
 */
export interface MobileProjectScopedPageCtx {
  /** The current company (from getCompany()). */
  company: Awaited<ReturnType<typeof getCompany>>;
  /** The user's role string (from getUserRole()). */
  role: string;
  /** The selected project ID from ?project=, or null if none selected. */
  projectId: string | null;
}

/**
 * Full project-scoped page scaffolding: Suspense + connection + company +
 * role + optional permission gate + project ID extraction from searchParams.
 * The children function receives company, role, and projectId so it can
 * fetch the project list and render the selector + project data.
 *
 * Usage:
 *   export default function Page({ searchParams }: { searchParams: Promise<{ project?: string }> }) {
 *     return (
 *       <MobileProjectScopedPage searchParams={searchParams} perm={PERM.WBS_VIEW} what="wbs">
 *         {async ({ company, role, projectId }) => {
 *           const projects = await prisma.project.findMany({ ... });
 *           if (!projectId) return <ProjectSelector ... />;
 *           const tree = await getWbsTree(projectId);
 *           return <WbsTree tree={tree} />;
 *         }}
 *       </MobileProjectScopedPage>
 *     );
 *   }
 *
 * The children render function is only called if the user has the view
 * permission (when perm is set).
 */
export async function MobileProjectScopedPage({
  searchParams,
  perm,
  what,
  permission,
  skeletonRows = 8,
  children,
}: {
  searchParams: Promise<{ project?: string }>;
  /** View permission — hard gate. Omit for no gate. */
  perm?: Permission;
  what?: string;
  /** The permission key to display in the NoAccess message. */
  permission?: string;
  /** Number of skeleton rows in the Suspense fallback. */
  skeletonRows?: number;
  children: (ctx: MobileProjectScopedPageCtx) => Promise<ReactNode> | ReactNode;
}) {
  const content = async () => {
    const { project: projectId } = await searchParams;
    await connection();
    const company = await getCompany();
    const role = await getUserRole();
    const overrides = await getUserPermissions();

    if (perm && !hasPermission(role, perm, overrides)) {
      return <MobileNoAccess what={what ?? "this page"} permission={permission} />;
    }

    return children({ company, role, projectId: projectId ?? null });
  };

  return (
    <Suspense fallback={<MobileSkeletonList rows={skeletonRows} />}>
      {content()}
    </Suspense>
  );
}
