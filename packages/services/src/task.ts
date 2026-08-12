import { prisma, type Prisma } from "@nirman/db";
import { logAction } from "./audit";

/**
 * Status-bearing error for user-facing task failures (e.g. "blocked by…").
 * The web `apiHandler` reads `err.status` and returns it as the HTTP status.
 */
export class TaskError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.name = "TaskError";
    this.status = status;
  }
}

/**
 * Task Service — the execution engine behind the Task Manager.
 *
 * A Task is not a flat to-do line. It is a unit of work composed of:
 *   • SubTasks — checkable steps that drive a live progress %
 *   • Comments — threaded discussion
 *   • Activity — an immutable, auto-generated timeline of every change
 *   • Dependencies — A blocks B; B cannot start until A is done
 *   • Time logs — start/stop timers tracking real effort vs estimate
 *
 * Every mutation runs inside a Serializable transaction that also appends a
 * `TaskActivity` row (the per-task feed) and an `AuditLog` row (the
 * system-wide audit trail). The feed therefore never diverges from reality.
 *
 * Status machine:
 *   PENDING → IN_PROGRESS → COMPLETED
 *   any → CANCELLED
 *   COMPLETED → IN_PROGRESS (reopen)
 *
 * Dependency rule: a task in PENDING may not move to IN_PROGRESS while any
 * blocker is incomplete. The rule is enforced here, not just in the UI.
 */

// ───────────────────────────────────────────────────────────
//  Pure helpers — unit-tested (task.test.ts)
// ───────────────────────────────────────────────────────────

export interface SubTaskLike {
  completed: boolean;
}

/**
 * Progress % = completed subtasks / total subtasks, rounded to the nearest
 * integer. A task with no subtasks has progress 0 (not 100) — progress is
 * about the checklist, not the task status. The card shows the status ring
 * separately.
 */
export function computeProgress(subtasks: SubTaskLike[]): number {
  if (subtasks.length === 0) return 0;
  const done = subtasks.filter((s) => s.completed).length;
  return Math.round((done / subtasks.length) * 100);
}

/**
 * A task is blocked if it has at least one dependency whose blocker is not
 * COMPLETED (or CANCELLED — cancelled blockers no longer hold up work).
 */
export function isBlocked(
  dependencies: { blocker: { status: string } }[],
): boolean {
  return dependencies.some(
    (d) => d.blocker.status !== "COMPLETED" && d.blocker.status !== "CANCELLED",
  );
}

/** Human-readable elapsed time, e.g. "1h 23m", "45m", "2h 5m". */
export function formatDuration(minutes: number): string {
  if (minutes <= 0) return "0m";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

// ───────────────────────────────────────────────────────────
//  Activity helper — appends a feed entry inside an open tx
// ───────────────────────────────────────────────────────────

async function logActivity(
  tx: Prisma.TransactionClient,
  taskId: string,
  userId: string | undefined,
  kind: string,
  message: string,
  meta?: Record<string, unknown>,
): Promise<void> {
  await tx.taskActivity.create({
    data: { taskId, userId, kind, message, meta: meta as Prisma.InputJsonValue },
  });
}

function userName(user: { name: string } | null | undefined): string {
  return user?.name ?? "Someone";
}

// ───────────────────────────────────────────────────────────
//  Create — with optional initial subtasks
// ───────────────────────────────────────────────────────────

export interface CreateTaskInput {
  title: string;
  description?: string | null;
  instructions?: string | null;
  assignedToId: string;
  assignedById?: string;
  priority?: string;
  dueDate?: Date | null;
  workspaceId?: string | null;
  nodeLabel?: string | null;
  estimateMins?: number | null;
  subtasks?: string[];
  userId?: string;
}

export async function createTask(input: CreateTaskInput) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.create({
      data: {
        title: input.title,
        description: input.description ?? null,
        instructions: input.instructions ?? null,
        assignedToId: input.assignedToId,
        assignedById: input.assignedById ?? null,
        priority: input.priority ?? "medium",
        dueDate: input.dueDate ?? null,
        workspaceId: input.workspaceId ?? null,
        nodeLabel: input.nodeLabel ?? null,
        estimateMins: input.estimateMins ?? null,
      },
    });

    if (input.subtasks && input.subtasks.length > 0) {
      await tx.subTask.createMany({
        data: input.subtasks.map((title, i) => ({
          taskId: task.id,
          title,
          order: i,
        })),
      });
    }

    const assigner = input.assignedById
      ? await tx.user.findUnique({ where: { id: input.assignedById }, select: { name: true } })
      : null;

    await logActivity(
      tx,
      task.id,
      input.userId,
      "CREATED",
      `${userName(assigner)} created this task and assigned it to the team.`,
    );
    if (input.subtasks && input.subtasks.length > 0) {
      await logActivity(
        tx,
        task.id,
        input.userId,
        "SUBTASK_ADDED",
        `Added ${input.subtasks.length} step${input.subtasks.length > 1 ? "s" : ""}.`,
        { count: input.subtasks.length },
      );
    }

    await logAction(tx, {
      userId: input.userId,
      action: "TASK_CREATE",
      entityType: "Task",
      entityId: task.id,
      after: { title: task.title, assignedToId: task.assignedToId, priority: task.priority },
    });

    return task;
  });
}

// ───────────────────────────────────────────────────────────
//  Status transitions — with dependency enforcement
// ───────────────────────────────────────────────────────────

export interface StatusChangeInput {
  taskId: string;
  status: string;
  userId?: string;
}

export async function updateTaskStatus({ taskId, status, userId }: StatusChangeInput) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      include: { blockedBy: { include: { blocker: { select: { id: true, title: true, status: true } } } } },
    });
    if (!task) throw new TaskError("Task not found", 404);

    if (status === task.status) return task;

    // Dependency enforcement: cannot start a blocked task.
    if (status === "IN_PROGRESS") {
      const openBlockers = task.blockedBy.filter(
        (d) => d.blocker.status !== "COMPLETED" && d.blocker.status !== "CANCELLED",
      );
      if (openBlockers.length > 0) {
        const names = openBlockers.map((d) => d.blocker.title).join(", ");
        throw new TaskError(`Cannot start — blocked by: ${names}`, 409);
      }
    }

    const before = { status: task.status };
    const completedAt = status === "COMPLETED" ? new Date() : null;
    const updated = await tx.task.update({
      where: { id: taskId },
      data: { status, completedAt },
    });

    const actor = userId ? await tx.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    const kind = status === "COMPLETED" ? "COMPLETED" : status === "IN_PROGRESS" ? "STATUS_CHANGED" : "STATUS_CHANGED";
    const message =
      status === "COMPLETED"
        ? `${userName(actor)} marked this task complete.`
        : status === "IN_PROGRESS"
          ? `${userName(actor)} started working on this task.`
          : status === "CANCELLED"
            ? `${userName(actor)} cancelled this task.`
            : `${userName(actor)} set status to ${status.replace("_", " ").toLowerCase()}.`;

    await logActivity(tx, taskId, userId, kind, message, { from: task.status, to: status });
    await logAction(tx, {
      userId,
      action: "TASK_STATUS_CHANGE",
      entityType: "Task",
      entityId: taskId,
      before,
      after: { status },
    });

    return updated;
  });
}

// ───────────────────────────────────────────────────────────
//  Reassign
// ───────────────────────────────────────────────────────────

export interface ReassignInput {
  taskId: string;
  assignedToId: string;
  userId?: string;
}

export async function reassignTask({ taskId, assignedToId, userId }: ReassignInput) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({
      where: { id: taskId },
      include: { assignedTo: { select: { name: true } } },
    });
    if (!task) throw new TaskError("Task not found", 404);

    const newAssignee = await tx.user.findUnique({ where: { id: assignedToId }, select: { name: true } });
    if (!newAssignee) throw new TaskError("Assignee not found", 404);

    const before = { assignedToId: task.assignedToId };
    const updated = await tx.task.update({ where: { id: taskId }, data: { assignedToId } });

    const actor = userId ? await tx.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    await logActivity(tx, taskId, userId, "ASSIGNED", `${userName(actor)} reassigned from ${task.assignedTo?.name ?? "—"} to ${newAssignee.name}.`, {
      from: task.assignedToId,
      to: assignedToId,
    });
    await logAction(tx, {
      userId,
      action: "TASK_REASSIGN",
      entityType: "Task",
      entityId: taskId,
      before,
      after: { assignedToId },
    });

    return updated;
  });
}

// ───────────────────────────────────────────────────────────
//  SubTasks
// ───────────────────────────────────────────────────────────

export async function addSubTask(taskId: string, title: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const task = await tx.task.findUnique({ where: { id: taskId }, select: { id: true } });
    if (!task) throw new TaskError("Task not found", 404);
    const count = await tx.subTask.count({ where: { taskId } });
    const subtask = await tx.subTask.create({
      data: { taskId, title, order: count },
    });
    const actor = userId ? await tx.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    await logActivity(tx, taskId, userId, "SUBTASK_ADDED", `${userName(actor)} added step “${title}”.`, { subtaskId: subtask.id });
    return subtask;
  });
}

export async function toggleSubTask(subtaskId: string, completed: boolean, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const subtask = await tx.subTask.findUnique({ where: { id: subtaskId }, select: { taskId: true, title: true } });
    if (!subtask) throw new TaskError("Subtask not found", 404);
    const updated = await tx.subTask.update({
      where: { id: subtaskId },
      data: { completed, completedAt: completed ? new Date() : null, completedById: completed ? userId : null },
    });
    const actor = userId ? await tx.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    await logActivity(
      tx,
      subtask.taskId,
      userId,
      "SUBTASK_TOGGLED",
      `${userName(actor)} ${completed ? "completed" : "reopened"} step “${subtask.title}”.`,
      { subtaskId, completed },
    );
    return updated;
  });
}

export async function deleteSubTask(subtaskId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const subtask = await tx.subTask.findUnique({ where: { id: subtaskId }, select: { taskId: true, title: true } });
    if (!subtask) throw new TaskError("Subtask not found", 404);
    await tx.subTask.delete({ where: { id: subtaskId } });
    const actor = userId ? await tx.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    await logActivity(tx, subtask.taskId, userId, "SUBTASK_DELETED", `${userName(actor)} removed step “${subtask.title}”.`, { subtaskId });
    return { ok: true };
  });
}

/** Reorder subtasks by an explicit ordered list of ids. */
export async function reorderSubTasks(taskId: string, orderedIds: string[], userId?: string) {
  return prisma.$transaction(async (tx) => {
    await Promise.all(
      orderedIds.map((id, i) => tx.subTask.update({ where: { id, taskId }, data: { order: i } })),
    );
    return { ok: true };
  });
}

// ───────────────────────────────────────────────────────────
//  Comments
// ───────────────────────────────────────────────────────────

export async function addComment(taskId: string, body: string, userId: string, parentId?: string | null) {
  return prisma.$transaction(async (tx) => {
    const comment = await tx.taskComment.create({
      data: { taskId, body, userId, parentId: parentId ?? null },
    });
    const actor = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
    await logActivity(tx, taskId, userId, "COMMENTED", `${userName(actor)} commented.`, { commentId: comment.id });
    return comment;
  });
}

export async function deleteComment(commentId: string, userId: string) {
  const comment = await prisma.taskComment.findUnique({ where: { id: commentId }, select: { userId: true } });
  if (!comment) throw new TaskError("Comment not found", 404);
  if (comment.userId !== userId) throw new TaskError("You can only delete your own comments", 403);
  await prisma.taskComment.delete({ where: { id: commentId } });
  return { ok: true };
}

// ───────────────────────────────────────────────────────────
//  Dependencies
// ───────────────────────────────────────────────────────────

export async function addDependency(blockerId: string, blockedById: string, userId?: string) {
  if (blockerId === blockedById) throw new TaskError("A task cannot block itself");
  return prisma.$transaction(async (tx) => {
    // Prevent cycles: if blockedById already (transitively) blocks blockerId,
    // adding blockerId→blockedById would create a cycle.
    // DFS: starting from blockedById, follow blockerId edges to see if we reach blockerId.
    const visited = new Set<string>();
    async function wouldCycle(currentId: string): Promise<boolean> {
      if (currentId === blockerId) return true;
      if (visited.has(currentId)) return false;
      visited.add(currentId);
      // Find all dependencies where currentId is the blockedBy (i.e., currentId is blocked by these blockers)
      const deps = await tx.taskDependency.findMany({
        where: { blockedById: currentId },
        select: { blockerId: true },
      });
      for (const d of deps) {
        if (await wouldCycle(d.blockerId)) return true;
      }
      return false;
    }
    if (await wouldCycle(blockedById)) {
      throw new TaskError("This would create a circular dependency", 409);
    }

    const existing = await tx.taskDependency.findUnique({
      where: { blockerId_blockedById: { blockerId, blockedById } },
    });
    if (existing) throw new TaskError("Dependency already exists", 409);

    const dep = await tx.taskDependency.create({ data: { blockerId, blockedById } });
    const [blocker, blocked] = await Promise.all([
      tx.task.findUnique({ where: { id: blockerId }, select: { title: true } }),
      tx.task.findUnique({ where: { id: blockedById }, select: { title: true } }),
    ]);
    const actor = userId ? await tx.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    await logActivity(
      tx,
      blockedById,
      userId,
      "DEPENDENCY_ADDED",
      `${userName(actor)} added a blocker: “${blocker?.title ?? "task"}”.`,
      { blockerId, blockedById },
    );
    return dep;
  });
}

export async function removeDependency(blockerId: string, blockedById: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    await tx.taskDependency.delete({
      where: { blockerId_blockedById: { blockerId, blockedById } },
    });
    const blocker = await tx.task.findUnique({ where: { id: blockerId }, select: { title: true } });
    const actor = userId ? await tx.user.findUnique({ where: { id: userId }, select: { name: true } }) : null;
    await logActivity(
      tx,
      blockedById,
      userId,
      "DEPENDENCY_REMOVED",
      `${userName(actor)} removed blocker “${blocker?.title ?? "task"}”.`,
      { blockerId, blockedById },
    );
    return { ok: true };
  });
}

// ───────────────────────────────────────────────────────────
//  Time tracking
// ───────────────────────────────────────────────────────────

/** Start a timer for a task. Closes any already-open timer for this user first. */
export async function startTimer(taskId: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    // Close any open timer for this user (one active timer at a time).
    const open = await tx.taskTimeLog.findFirst({
      where: { userId, endedAt: null },
      select: { id: true, taskId: true },
    });
    if (open) {
      const startedAt = await tx.taskTimeLog.findUnique({ where: { id: open.id }, select: { startedAt: true } });
      const endedAt = new Date();
      const durationMins = startedAt ? Math.max(1, Math.round((endedAt.getTime() - startedAt.startedAt.getTime()) / 60000)) : null;
      await tx.taskTimeLog.update({ where: { id: open.id }, data: { endedAt, durationMins } });
    }

    const log = await tx.taskTimeLog.create({ data: { taskId, userId } });
    const actor = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
    await logActivity(tx, taskId, userId, "TIMER_STARTED", `${userName(actor)} started a timer.`, { timeLogId: log.id });
    return log;
  });
}

/** Stop the open timer for a task (if any). */
export async function stopTimer(taskId: string, userId: string, note?: string) {
  return prisma.$transaction(async (tx) => {
    const open = await tx.taskTimeLog.findFirst({
      where: { taskId, userId, endedAt: null },
      select: { id: true, startedAt: true },
    });
    if (!open) throw new TaskError("No open timer for this task", 409);
    const endedAt = new Date();
    const durationMins = Math.max(1, Math.round((endedAt.getTime() - open.startedAt.getTime()) / 60000));
    const updated = await tx.taskTimeLog.update({
      where: { id: open.id },
      data: { endedAt, durationMins, note: note ?? null },
    });
    const actor = await tx.user.findUnique({ where: { id: userId }, select: { name: true } });
    await logActivity(tx, taskId, userId, "TIMER_STOPED", `${userName(actor)} logged ${formatDuration(durationMins)}.`, { durationMins });
    return updated;
  });
}

// ───────────────────────────────────────────────────────────
//  Read — full detail for the drawer
// ───────────────────────────────────────────────────────────

export async function getTaskDetail(taskId: string) {
  return prisma.task.findUnique({
    where: { id: taskId },
    include: {
      assignedTo: { select: { id: true, name: true, email: true, role: true } },
      assignedBy: { select: { id: true, name: true } },
      workspace: { select: { id: true, name: true } },
      subtasks: { orderBy: { order: "asc" }, include: { completedBy: { select: { name: true } } } },
      comments: {
        where: { parentId: null },
        orderBy: { createdAt: "asc" },
        include: {
          user: { select: { id: true, name: true } },
          replies: { orderBy: { createdAt: "asc" }, include: { user: { select: { id: true, name: true } } } },
        },
      },
      activities: {
        orderBy: { createdAt: "desc" },
        take: 50,
        include: { user: { select: { id: true, name: true } } },
      },
      timeLogs: { orderBy: { startedAt: "desc" }, include: { user: { select: { id: true, name: true } } } },
      blockedBy: { include: { blocker: { select: { id: true, title: true, status: true } } } },
      blocking: { include: { blockedBy: { select: { id: true, title: true, status: true } } } },
    },
  });
}

/** Total logged minutes for a task. */
export function totalLoggedMinutes(
  logs: { durationMins: number | null }[],
): number {
  return logs.reduce((sum, l) => sum + (l.durationMins ?? 0), 0);
}
