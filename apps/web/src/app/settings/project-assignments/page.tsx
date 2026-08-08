import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { ProjectAssignmentsView } from "@/components/settings/project-assignments-view";

import { NoAccess } from "@/components/no-access";
export default function ProjectAssignmentsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Project Assignments"
        description="Scope user access to specific projects. Supervisors, sales, and accountants only see projects they're assigned to."
      />
      <Suspense fallback={<PageLoading label="Loading assignments…" variant="list" />}>
        <ProjectAssignmentsContent />
      </Suspense>
    </div>
  );
}

async function ProjectAssignmentsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.USERS_VIEW)) {
    return (
      <NoAccess what="project assignments" />
    );
  }

  const perms = {
    canManage: hasPermission(role, PERM.USERS_MANAGE),
  };

  const [assignments, users, projects] = await Promise.all([
    prisma.projectAssignment.findMany({
      where: { project: { companyId: company.id } },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { assignedAt: "desc" },
    }),
    prisma.user.findMany({
      where: {
        active: true,
        role: { in: ["SUPERVISOR", "SALES", "ACCOUNTANT"] },
        memberships: { some: { companyId: company.id } },
      },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
    prisma.project.findMany({
      where: { companyId: company.id, deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const assignmentRows = assignments.map((a) => ({
    id: a.id,
    userId: a.userId,
    userName: a.user.name,
    userEmail: a.user.email,
    userRole: a.user.role,
    projectId: a.projectId,
    projectName: a.project.name,
    scopedRole: a.scopedRole,
    assignedAt: a.assignedAt.toISOString(),
  }));

  return (
    <ProjectAssignmentsView
      assignments={assignmentRows}
      users={users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role }))}
      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
      permissions={perms}
    />
  );
}
