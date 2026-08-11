import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { CashFlowView } from "@/components/reports/cash-flow-view";

export default function CashFlowPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading cash flow forecast…" variant="default" />}>
        <CashFlowContent />
      </Suspense>
    </div>
  );
}

async function CashFlowContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.FINANCE_VIEW)) {
    return <NoAccess what="the cash flow forecast" />;
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

  return (
    <>
      <PageHeader
        title="Cash Flow Forecast"
        description="Projected inflows vs outflows per project — scheduled payments, open commitments, pending RA bills, and payroll due."
        stats={[{ label: "Projects", value: projects.length }]}
      />
      <CashFlowView projects={projects} />
    </>
  );
}
