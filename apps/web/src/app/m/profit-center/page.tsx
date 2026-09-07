import { prisma } from "@nirman/db";
import { getUserScope } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { MobileListPage } from "@/components/mobile/v2/list-page";
import { MobileProfitCenterClient, type ProjectOption } from "./MobileProfitCenterClient";

/**
 * /m/profit-center — mobile per-project profit center analysis.
 * Shows revenue, cost breakdown, gross profit, and margin per project.
 */
export default function MobileProfitCenterPage() {
  return (
    <MobileListPage perm={PERM.FINANCE_VIEW} what="profit center" permission="finance.view">
      {async ({ company }) => {
        const scope = await getUserScope();

        const projectScopeFilter =
          scope.scopeType === "PROJECT" && scope.projectIds.length > 0
            ? { id: { in: scope.projectIds } }
            : {};

        const projects = await prisma.project.findMany({
          where: { companyId: company.id, deletedAt: null, ...projectScopeFilter },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        });

        const projectOptions: ProjectOption[] = projects.map((p) => ({
          id: p.id,
          name: p.name,
        }));

        return <MobileProfitCenterClient projects={projectOptions} />;
      }}
    </MobileListPage>
  );
}
