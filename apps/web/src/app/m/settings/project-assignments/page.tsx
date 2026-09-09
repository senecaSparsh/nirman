import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getUserRole, scopeWhere } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";
import { MobileNoAccess } from "@/components/mobile/v2/primitives";
import {
  MobileProjectAssignmentsClient,
  type AssignmentRow,
  type UserOption,
  type ProjectOption,
} from "./MobileProjectAssignmentsClient";

/**
 * /m/settings/project-assignments — mobile project assignment management.
 * Scope user access to specific projects. Supervisors, sales, and
 * accountants only see projects they're assigned to.
 */
export default function MobileProjectAssignmentsPage() {
  return (
    <Suspense fallback={<MobileSkeletonList rows={6} />}>
      <MobileProjectAssignmentsContent />
    </Suspense>
  );
}

async function MobileProjectAssignmentsContent() {
  await connection();
  const role = await getUserRole();
  const company = await getCompany();

  if (!hasPermission(role, PERM.USERS_VIEW)) {
    return <MobileNoAccess what="project assignments" />;
  }

  const canManage = hasPermission(role, PERM.USERS_MANAGE);

  const [assignments, users, projects] = await Promise.all([
    prisma.projectAssignment.findMany({
      where: {...await scopeWhere("ProjectAssignment"),  project: { companyId: company.id } },
      include: {
        user: { select: { id: true, name: true, email: true, role: true } },
        project: { select: { id: true, name: true } },
      },
      orderBy: { assignedAt: "desc" },
    }),
    prisma.user.findMany({
      where: {
        active: true,
        role: { in: ["SUPERVISOR", "QAQC_ENGINEER", "SALES_MANAGER", "ACCOUNTANT", "SITE_ENGINEER", "STORE_KEEPER"] },
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

  const assignmentRows: AssignmentRow[] = assignments.map((a) => ({
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

  const userOptions: UserOption[] = users.map((u) => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role,
  }));

  const projectOptions: ProjectOption[] = projects.map((p) => ({
    id: p.id,
    name: p.name,
  }));

  return (
    <MobileProjectAssignmentsClient
      assignments={assignmentRows}
      users={userOptions}
      projects={projectOptions}
      canManage={canManage}
    />
  );
}
