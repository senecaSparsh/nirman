import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { PageHeader } from "@/components/page-header";
import { PageLoading } from "@/components/page-loading";
import { TasksManager } from "@/components/tasks/tasks-manager";
import { formatDate } from "@/lib/utils";
import { getUserRole } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";

export const metadata = { title: "Task Management · Nirman" };

export default function TasksPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Task Management"
        description="See all tasks across the team. Filter by status or assignee, reassign, and track progress."
      />
      <Suspense fallback={<PageLoading label="Loading tasks…" />}>
        <TasksContent />
      </Suspense>
    </div>
  );
}

async function TasksContent() {
  await connection();
  const role = await getUserRole();

  const [tasks, users] = await Promise.all([
    prisma.task.findMany({
      orderBy: [{ status: "asc" }, { dueDate: "asc" }, { createdAt: "desc" }],
      include: {
        assignedTo: { select: { id: true, name: true, email: true, role: true } },
        assignedBy: { select: { id: true, name: true } },
        workspace: { select: { id: true, name: true } },
      },
    }),
    prisma.user.findMany({
      where: { active: true },
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return (
    <TasksManager
      tasks={tasks.map((t) => ({
        id: t.id,
        title: t.title,
        description: t.description,
        instructions: t.instructions,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate ? formatDate(t.dueDate) : null,
        dueDateRaw: t.dueDate?.toISOString() ?? null,
        assignedTo: t.assignedTo,
        assignedBy: t.assignedBy,
        workspace: t.workspace,
        nodeLabel: t.nodeLabel,
        completedAt: t.completedAt ? formatDate(t.completedAt) : null,
        createdAt: formatDate(t.createdAt),
      }))}
      users={users}
      canAssign={hasPermission(role, PERM.TASKS_ASSIGN)}
    />
  );
}
