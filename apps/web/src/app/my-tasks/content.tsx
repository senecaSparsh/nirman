import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { PageHeader } from "@/components/page-header";
import { MyTasksHub } from "@/components/tasks/my-tasks-hub";
import { formatDate } from "@/lib/utils";
import { getCurrentUser, getCompany, getUserPermissions } from "@/lib/server";
import { PERM } from "@/lib/roles";

export async function MyTasksContent() {
  await connection();
  const __effPerms = await getUserPermissions();
  const currentUser = await getCurrentUser();
  const company = await getCompany();
  const canViewTeam = __effPerms.includes(PERM.TASKS_ASSIGN);

  const [teamTasks, users] = await Promise.all([
    prisma.task.findMany({
      take: 500,
      where: { assignedTo: { memberships: { some: { companyId: company.id } } } },
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        assignedTo: { select: { id: true, name: true, email: true, role: true, employees: { select: { id: true }, take: 1 } } },
        assignedBy: { select: { id: true, name: true } }}}),
    prisma.user.findMany({
      take: 200,
      where: { active: true, memberships: { some: { companyId: company.id } }, isHidden: { not: true } },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" }}),
  ]);

  const myTasks = teamTasks.filter((t) => t.assignedToId === currentUser?.id);
  const myActiveCount = myTasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
  const teamActiveCount = teamTasks.filter((t) => t.status === "PENDING" || t.status === "IN_PROGRESS").length;
  const completedCount = teamTasks.filter((t) => t.status === "COMPLETED").length;

  return (
    <>
      <PageHeader
        title="My Tasks"
        description="Tasks assigned to you, with step-by-step guidance. Team leads can also switch to the Team Tasks tab to manage everyone's work."
        stats={[
          { label: "My Active", value: myActiveCount, tone: myActiveCount > 0 ? "warning" : "muted" },
          ...(canViewTeam ? [{ label: "Team Active", value: teamActiveCount }] : []),
          { label: "Completed", value: completedCount, tone: "success" as const },
        ]}
      />
      <MyTasksHub
        teamTasks={teamTasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          instructions: t.instructions,
          status: t.status,
          priority: t.priority,
          dueDate: t.dueDate ? formatDate(t.dueDate) : null,
          dueDateRaw: t.dueDate?.toISOString() ?? null,
          assignedTo: {
            ...t.assignedTo,
            employeeId: t.assignedTo.employees?.[0]?.id ?? null},
          assignedBy: t.assignedBy,
          completedAt: t.completedAt ? formatDate(t.completedAt) : null,
          createdAt: formatDate(t.createdAt)}))}
        users={users}
        canAssign={canViewTeam}
        canManage={canViewTeam}
        currentUserId={currentUser?.id ?? ""}
        canViewTeam={canViewTeam}
      />
    </>
  );
}
