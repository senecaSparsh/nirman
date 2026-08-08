import { Suspense } from "react";
import { MobileSkeletonList } from "@/components/mobile/mobile-skeleton";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { CheckSquare } from "lucide-react";
import { getCurrentUser } from "@/lib/server";
import { MobilePageHeader, MobileRefreshButton, MobileStatCard } from "@/components/mobile/mobile-primitives";
import { MobileTaskList } from "@/components/mobile/mobile-task-list";

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

  const tasks = await prisma.task.findMany({
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
  });

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
      <MobilePageHeader
        title="My Tasks"
        subtitle={`${tasks.length} open`}
        right={<MobileRefreshButton />}
      />

      <div className="grid grid-cols-3 gap-2 p-3">
        <MobileStatCard label="Pending" value={String(pending)} icon={CheckSquare} tone={pending > 0 ? "warning" : "default"} />
        <MobileStatCard label="In Progress" value={String(inProgress)} icon={CheckSquare} tone={inProgress > 0 ? "success" : "default"} />
        <MobileStatCard label="Blocked" value={String(blocked)} icon={CheckSquare} tone={blocked > 0 ? "danger" : "default"} />
      </div>

      <MobileTaskList tasks={taskItems} />
    </div>
  );
}
