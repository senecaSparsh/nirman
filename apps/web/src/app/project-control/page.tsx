import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, getUserScope } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { NoAccess } from "@/components/no-access";
import { ProjectControlView } from "@/components/project-control/project-control-view";

export default function ProjectControlPage() {
  return (
    <div className="space-y-6">
      <Suspense fallback={<PageLoading label="Loading project control…" variant="cards" />}>
        <ProjectControlContent />
      </Suspense>
    </div>
  );
}

async function ProjectControlContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();
  const scope = await getUserScope();

  if (!hasPermission(role, PERM.ASSETS_VIEW)) {
    return <NoAccess what="project control" />;
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
        title="Project Control"
        description="Earned Value Management metrics — PV, EV, AC, CV, SV, and CPI per project. Track cost and schedule performance against the baseline."
        stats={[
          { label: "Projects", value: projects.length },
        ]}
      />
      <ProjectControlView projects={projects} />
    </>
  );
}
