import { Suspense } from "react";
import { MobileSkeletonDetail } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import { MobileProfitCenterClient, type ProjectOption } from "./MobileProfitCenterClient";

/**
 * /m/profit-center — mobile per-project profit center analysis.
 * Shows revenue, cost breakdown, gross profit, and margin per project.
 */
export default function MobileProfitCenterPage() {
  return (
    <Suspense fallback={<MobileSkeletonDetail />}>
      <MobileProfitCenterContent />
    </Suspense>
  );
}

async function MobileProfitCenterContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <MobileNoAccess what="profit center" />;
  }

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
}
