import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { CheckSquare } from "lucide-react";
import { getCurrentUser, getCompany, getUserRole } from "@/lib/server";
import { PERM, hasPermission, ROLES } from "@/lib/roles";
import { MobileStatCard } from "@/components/mobile/v2/primitives";
import { MobileTaskList } from "@/components/mobile/mobile-task-list";
import { MobileTasksFab } from "./MobileTasksFab";

/** Field → Tasks tab: my assigned tasks with inline status update. */
export default function SiteTasksPage() {
  return (
    <Suspense fallback={<MobileSkeletonList />}>
      <SiteTasksContent />
    </Suspense>
  );
}

async function SiteTasksContent() {
  await connection();
  const user = await getCurrentUser();
  const company = await getCompany();
  const role = await getUserRole();
  const canAssign = hasPermission(role, PERM.TASKS_ASSIGN);

  const [tasks, teamMembers] = await Promise.all([
    prisma.task.findMany({
      where: { assignedToId: user?.id ?? "none", status: { in: ["PENDING", "IN_PROGRESS", "BLOCKED"] } },
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
      take: 30,
      select: {
        id: true,
        title: true,
        status: true,
        priority: true,
        dueDate: true,
        description: true,
      },
    }),
    canAssign
      ? prisma.userCompany.findMany({
          where: { companyId: company.id, user: { active: true } },
          include: { user: { select: { id: true, name: true } } },
          orderBy: { user: { name: "asc" } },
        })
      : [],
  ]);

  const taskItems = tasks.map((t) => ({
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate?.toISOString() ?? null,
    description: t.description,
  }));

  const pending = tasks.filter((t) => t.status === "PENDING").length;
  const inProgress = tasks.filter((t) => t.status === "IN_PROGRESS").length;
  const blocked = tasks.filter((t) => t.status === "BLOCKED").length;

  return (
    <div>
      <div className="grid grid-cols-3 gap-2.5 mb-4">
        <MobileStatCard label="Pending" value={String(pending)} icon={CheckSquare} tone={pending > 0 ? "signal" : "neutral"} />
        <MobileStatCard label="In Progress" value={String(inProgress)} icon={CheckSquare} tone={inProgress > 0 ? "go" : "neutral"} />
        <MobileStatCard label="Blocked" value={String(blocked)} icon={CheckSquare} tone={blocked > 0 ? "stop" : "neutral"} />
      </div>

      <MobileTaskList tasks={taskItems} />

      {canAssign && teamMembers.length > 0 && (
        <MobileTasksFab
          assignees={teamMembers.map((m) => ({
            id: m.user.id,
            name: m.user.name,
            role: ROLES[m.role as keyof typeof ROLES]?.label ?? m.role,
          }))}
        />
      )}
    </div>
  );
}
