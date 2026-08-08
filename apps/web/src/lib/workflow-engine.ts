/**
 * Workflow execution engine.
 *
 * A workflow graph is a JSON object stored in Workflow.graphJson:
 *   {
 *     steps: WorkflowStep[],
 *     edges: WorkflowEdge[],
 *     startStepId: string
 *   }
 *
 * Each step has an action type and config. The engine walks the
 * graph from the start step, executing each action and recording
 * results in the WorkflowRun.
 *
 * Condition steps branch by evaluating a predicate against live DB
 * data (e.g. "low stock count > 0") and following the edge whose
 * `condition` field matches the result ("true" or "false").
 */

import { prisma } from "@nirman/db";
import type { Prisma, ProjectCostType } from "@nirman/db";
import { lowStockAlerts } from "@nirman/services";
import { generateAutoRequisition } from "@nirman/services";

export interface WorkflowStep {
  id: string;
  type: StepType;
  label: string;
  config: Record<string, unknown>;
}

export type StepType =
  | "create_task"        // assign a task to a user
  | "create_record"      // create a DB record (material, PO, etc.)
  | "send_notification"  // create an in-app notification (stored as a task)
  | "wait"               // wait N minutes/hours
  | "condition"          // branch based on a condition
  | "update_status"      // update a record's status
  | "auto_requisition"   // generate a draft requisition for low-stock materials
  ;

export interface WorkflowEdge {
  from: string;
  to: string;
  /** For condition steps: "true" or "false". Undefined for non-condition edges. */
  condition?: string;
}

export interface WorkflowGraph {
  steps: WorkflowStep[];
  edges: WorkflowEdge[];
  startStepId: string;
}

interface RunResult {
  stepId: string;
  status: "success" | "failed" | "skipped";
  message?: string;
  /** For condition steps: which branch was taken */
  branch?: string;
}

/**
 * Execute a workflow by ID. Creates a WorkflowRun, walks the graph,
 * executes each step, and records results.
 */
export async function executeWorkflow(
  workflowId: string,
  triggeredBy: "manual" | "schedule" = "manual",
) {
  const workflow = await prisma.workflow.findUnique({ where: { id: workflowId } });
  if (!workflow || workflow.deletedAt) {
    throw new Error("Workflow not found");
  }

  const graph = workflow.graphJson as unknown as WorkflowGraph;
  if (!graph?.steps || !graph?.startStepId) {
    throw new Error("Invalid workflow graph — missing steps or startStepId");
  }

  // Create the run record
  const run = await prisma.workflowRun.create({
    data: {
      workflowId,
      status: "RUNNING",
      startedAt: new Date(),
      triggeredBy,
    },
  });

  const results: RunResult[] = [];
  let currentStepId: string | null = graph.startStepId;
  let stepIndex = 0;
  const visited = new Set<string>(); // cycle guard
  const MAX_STEPS = 100;

  try {
    while (currentStepId) {
      if (visited.has(currentStepId)) {
        results.push({ stepId: currentStepId, status: "failed", message: "Cycle detected — step already visited" });
        break;
      }
      visited.add(currentStepId);
      if (stepIndex >= MAX_STEPS) {
        results.push({ stepId: currentStepId, status: "failed", message: "Max step count exceeded (100) — possible infinite loop" });
        break;
      }

      const step = graph.steps.find((s) => s.id === currentStepId);
      if (!step) {
        results.push({ stepId: currentStepId, status: "failed", message: "Step not found in graph" });
        break;
      }

      // Update current step index
      await prisma.workflowRun.update({
        where: { id: run.id },
        data: { currentStep: stepIndex },
      });

      try {
        const result = await executeStep(step);

        // For condition steps, resolve the branch to pick the right edge
        if (step.type === "condition") {
          const branchValue = result.branch ?? "false";
          const branchEdge = graph.edges.find(
            (e) => e.from === currentStepId && e.condition === branchValue,
          );
          const fallbackEdge = graph.edges.find((e) => e.from === currentStepId && !e.condition);
          const outEdge = branchEdge ?? fallbackEdge;
          results.push(result);
          currentStepId = outEdge?.to ?? null;
          stepIndex++;
          continue;
        }

        results.push(result);

        if (result.status === "failed") {
          await prisma.workflowRun.update({
            where: { id: run.id },
            data: { status: "FAILED", error: `Step "${step.label}" failed: ${result.message}`, completedAt: new Date(), result: results as unknown as Prisma.InputJsonValue },
          });
          return { ...run, status: "FAILED" as const };
        }

        // Find the next step via edges (first outgoing edge)
        const outEdge = graph.edges.find((e) => e.from === currentStepId);
        currentStepId = outEdge?.to ?? null;
        stepIndex++;
      } catch (err: unknown) {
        results.push({ stepId: currentStepId ?? "unknown", status: "failed", message: (err instanceof Error ? err.message : "Unknown error") });
        await prisma.workflowRun.update({
          where: { id: run.id },
          data: { status: "FAILED", error: (err instanceof Error ? err.message : "Step execution error"), completedAt: new Date(), result: results as unknown as Prisma.InputJsonValue },
        });
        return { ...run, status: "FAILED" as const };
      }
    }

    // All steps completed
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "COMPLETED", completedAt: new Date(), result: results as unknown as Prisma.InputJsonValue },
    });

    return { ...run, status: "COMPLETED" as const };
  } catch (err: unknown) {
    await prisma.workflowRun.update({
      where: { id: run.id },
      data: { status: "FAILED", error: (err instanceof Error ? err.message : "Workflow execution error"), completedAt: new Date(), result: results as unknown as Prisma.InputJsonValue },
    });
    return { ...run, status: "FAILED" as const };
  }
}

/**
 * Execute a single workflow step based on its type.
 */
async function executeStep(step: WorkflowStep): Promise<RunResult> {
  const cfg = step.config;

  switch (step.type) {
    case "create_task": {
      const title = String(cfg.title ?? "Untitled task");
      const assignedToId = String(cfg.assignedToId ?? "");
      const instructions = cfg.instructions ? String(cfg.instructions) : null;
      const priority = String(cfg.priority ?? "medium");
      const dueDate = cfg.dueDate ? new Date(String(cfg.dueDate)) : null;

      if (!assignedToId) {
        return { stepId: step.id, status: "failed", message: "No assignee specified" };
      }

      const task = await prisma.task.create({
        data: { title, assignedToId, instructions, priority, dueDate },
      });

      return { stepId: step.id, status: "success", message: `Created task "${title}" (id: ${task.id})` };
    }

    case "send_notification": {
      // Notifications are implemented as tasks with status PENDING
      const title = String(cfg.title ?? "Notification");
      const assignedToId = String(cfg.assignedToId ?? "");
      const message = cfg.message ? String(cfg.message) : null;

      if (!assignedToId) {
        return { stepId: step.id, status: "failed", message: "No recipient specified" };
      }

      await prisma.task.create({
        data: { title, assignedToId, instructions: message, priority: "low" },
      });

      return { stepId: step.id, status: "success", message: `Sent notification to user ${assignedToId}` };
    }

    case "wait": {
      const minutes = Number(cfg.minutes ?? 0);
      if (minutes > 0) {
        // In a real system this would pause execution. For now we just
        // record it — the scheduler handles timing between steps.
        return { stepId: step.id, status: "success", message: `Waited ${minutes} minutes (simulated)` };
      }
      return { stepId: step.id, status: "success", message: "No wait specified" };
    }

    case "condition": {
      // ── Real condition evaluation ──
      // Supports several predicate types:
      //   "low_stock"       → true if any material is below reorderPoint
      //   "overdue_pos"     → true if any PO is past its expectedDate
      //   "pending_approvals" → true if any DRAFT POs or SUBMITTED requisitions exist
      //   "task_count"      → true if open task count > threshold
      //   "custom_field"    → evaluate a field on a record against a value
      const predicate = String(cfg.predicate ?? "low_stock");
      const companyId = cfg.companyId ? String(cfg.companyId) : null;

      let conditionMet = false;

      try {
        switch (predicate) {
          case "low_stock": {
            if (!companyId) {
              return { stepId: step.id, status: "failed", message: "low_stock predicate requires companyId in config" };
            }
            const alerts = await lowStockAlerts(companyId);
            conditionMet = alerts.length > 0;
            break;
          }

          case "overdue_pos": {
            if (!companyId) {
              return { stepId: step.id, status: "failed", message: "overdue_pos predicate requires companyId in config" };
            }
            const count = await prisma.purchaseOrder.count({
              where: {
                companyId,
                status: { in: ["ORDERED", "PARTIAL"] },
                expectedDate: { lt: new Date() },
              },
            });
            conditionMet = count > 0;
            break;
          }

          case "pending_approvals": {
            if (!companyId) {
              return { stepId: step.id, status: "failed", message: "pending_approvals predicate requires companyId in config" };
            }
            const [draftPOs, submittedReqs] = await Promise.all([
              prisma.purchaseOrder.count({ where: { companyId, status: "DRAFT" } }),
              prisma.materialRequisition.count({
                where: { project: { companyId }, status: "SUBMITTED" },
              }),
            ]);
            conditionMet = draftPOs + submittedReqs > 0;
            break;
          }

          case "task_count": {
            const threshold = Number(cfg.threshold ?? 0);
            const assignedToId = cfg.assignedToId ? String(cfg.assignedToId) : undefined;
            const count = await prisma.task.count({
              where: {
                status: { in: ["PENDING", "IN_PROGRESS"] },
                ...(assignedToId ? { assignedToId } : {}),
              },
            });
            conditionMet = count > threshold;
            break;
          }

          case "custom_field": {
            // Evaluate a field on a record: { entityType, entityId, field, operator, value }
            const entityType = String(cfg.entityType ?? "");
            const entityId = String(cfg.entityId ?? "");
            const field = String(cfg.field ?? "status");
            const operator = String(cfg.operator ?? "eq"); // eq, ne, gt, lt, contains
            const value = String(cfg.value ?? "");

            if (!entityType || !entityId) {
              return { stepId: step.id, status: "failed", message: "custom_field predicate requires entityType and entityId" };
            }

            const modelMap: Record<string, "project" | "purchaseOrder" | "materialRequisition" | "task"> = {
              Project: "project",
              PurchaseOrder: "purchaseOrder",
              MaterialRequisition: "materialRequisition",
              Task: "task",
            };
            const modelName = modelMap[entityType];
            if (!modelName) {
              return { stepId: step.id, status: "failed", message: `Unsupported entity type: ${entityType}` };
            }

            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const record: any = await (prisma[modelName] as any).findUnique({ where: { id: entityId } });
            if (!record) {
              return { stepId: step.id, status: "failed", message: `${entityType} ${entityId} not found` };
            }

            const fieldValue = String(record[field] ?? "");
            switch (operator) {
              case "eq": conditionMet = fieldValue === value; break;
              case "ne": conditionMet = fieldValue !== value; break;
              case "gt": conditionMet = Number(fieldValue) > Number(value); break;
              case "lt": conditionMet = Number(fieldValue) < Number(value); break;
              case "contains": conditionMet = fieldValue.includes(value); break;
              default: conditionMet = false;
            }
            break;
          }

          default:
            return { stepId: step.id, status: "failed", message: `Unknown predicate: ${predicate}` };
        }
      } catch (err: unknown) {
        return { stepId: step.id, status: "failed", message: `Condition evaluation error: ${err instanceof Error ? err.message : "Unknown"}` };
      }

      return {
        stepId: step.id,
        status: "success",
        message: `Condition "${predicate}" evaluated: ${conditionMet}`,
        branch: conditionMet ? "true" : "false",
      };
    }

    case "update_status": {
      const entityType = String(cfg.entityType ?? "");
      const entityId = String(cfg.entityId ?? "");
      const newStatus = String(cfg.newStatus ?? "");

      if (!entityType || !entityId || !newStatus) {
        return { stepId: step.id, status: "failed", message: "Missing entityType, entityId, or newStatus" };
      }

      // Generic status update — map entity type to Prisma model
      const modelMap: Record<string, string> = {
        Project: "project",
        PurchaseOrder: "purchaseOrder",
        MaterialRequisition: "materialRequisition",
        StockTransfer: "stockTransfer",
        Task: "task",
      };

      const modelName = modelMap[entityType];
      if (!modelName) {
        return { stepId: step.id, status: "failed", message: `Unsupported entity type: ${entityType}` };
      }

      // Use raw SQL for generic update to avoid type complexity
      await prisma.$executeRaw`UPDATE "${entityType.toLowerCase()}" SET status = ${newStatus}, "updatedAt" = NOW() WHERE id = ${entityId}`;

      return { stepId: step.id, status: "success", message: `Updated ${entityType} ${entityId} status to ${newStatus}` };
    }

    case "create_record": {
      // ── Real record creation ──
      // Supports creating tasks, notifications, and simple material categories.
      // For complex records (POs, requisitions), use the dedicated step types.
      const recordType = String(cfg.recordType ?? "");

      switch (recordType) {
        case "task": {
          const title = String(cfg.title ?? "Untitled task");
          const assignedToId = String(cfg.assignedToId ?? "");
          if (!assignedToId) {
            return { stepId: step.id, status: "failed", message: "create_record task requires assignedToId" };
          }
          const task = await prisma.task.create({
            data: {
              title,
              assignedToId,
              instructions: cfg.instructions ? String(cfg.instructions) : null,
              priority: String(cfg.priority ?? "medium"),
              dueDate: cfg.dueDate ? new Date(String(cfg.dueDate)) : null,
            },
          });
          return { stepId: step.id, status: "success", message: `Created task "${title}" (id: ${task.id})` };
        }

        case "project_cost": {
          // Add a cost line to an existing project
          const projectId = String(cfg.projectId ?? "");
          const notes = cfg.notes ? String(cfg.notes) : null;
          const amount = Number(cfg.amount ?? 0);
          if (!projectId || !amount) {
            return { stepId: step.id, status: "failed", message: "create_record project_cost requires projectId and amount" };
          }
          const validCostTypes: ProjectCostType[] = ["LABOUR", "OVERHEAD", "EQUIPMENT", "CONTRACTOR", "PERMIT", "OTHER"];
          const costTypeStr = String(cfg.costType ?? "OTHER");
          const costType = validCostTypes.includes(costTypeStr as ProjectCostType)
            ? (costTypeStr as ProjectCostType)
            : "OTHER";
          const cost = await prisma.projectCost.create({
            data: {
              projectId,
              amount,
              costType,
              notes,
              vendor: cfg.vendor ? String(cfg.vendor) : null,
            },
          });
          return { stepId: step.id, status: "success", message: `Added project cost (id: ${cost.id})` };
        }

        case "expense": {
          // Record a company expense
          const companyId = String(cfg.companyId ?? "");
          const notes = cfg.notes ? String(cfg.notes) : null;
          const amount = Number(cfg.amount ?? 0);
          if (!companyId || !amount) {
            return { stepId: step.id, status: "failed", message: "create_record expense requires companyId and amount" };
          }
          const expense = await prisma.expense.create({
            data: {
              companyId,
              amount,
              category: String(cfg.category ?? "general"),
              notes,
              date: new Date(),
            },
          });
          return { stepId: step.id, status: "success", message: `Created expense (id: ${expense.id})` };
        }

        default:
          return { stepId: step.id, status: "failed", message: `Unsupported record type: ${recordType}` };
      }
    }

    case "auto_requisition": {
      // Generate a draft requisition for low-stock materials
      const companyId = String(cfg.companyId ?? "");
      const projectId = String(cfg.projectId ?? "");
      const createdByById = cfg.createdByById ? String(cfg.createdByById) : undefined;

      if (!companyId || !projectId) {
        return { stepId: step.id, status: "failed", message: "auto_requisition requires companyId and projectId" };
      }

      try {
        const result = await generateAutoRequisition({
          companyId,
          projectId,
          createdByById,
        });

        if (!result || result.lineCount === 0) {
          return {
            stepId: step.id,
            status: "success",
            message: `Auto-requisition: no materials below reorder point`,
          };
        }

        return {
          stepId: step.id,
          status: "success",
          message: `Generated ${result.reqNumber} with ${result.lineCount} material(s)`,
        };
      } catch (err: unknown) {
        return {
          stepId: step.id,
          status: "failed",
          message: `Auto-requisition failed: ${err instanceof Error ? err.message : "Unknown error"}`,
        };
      }
    }

    default:
      return { stepId: step.id, status: "failed", message: `Unknown step type: ${step.type}` };
  }
}

/**
 * Process due scheduled workflows — called by the scheduler endpoint.
 * Finds all enabled schedules with nextRunAt <= now and executes them.
 */
export async function processScheduledWorkflows() {
  const now = new Date();
  const due = await prisma.scheduledWorkflow.findMany({
    where: { enabled: true, nextRunAt: { lte: now } },
    include: { workflow: true },
  });

  const results: { workflowId: string; runId: string; status: string }[] = [];

  for (const schedule of due) {
    if (schedule.workflow.deletedAt || schedule.workflow.status !== "ACTIVE") continue;

    try {
      const run = await executeWorkflow(schedule.workflowId, "schedule");
      results.push({ workflowId: schedule.workflowId, runId: run.id, status: run.status });
    } catch (err: unknown) {
      results.push({ workflowId: schedule.workflowId, runId: "", status: `error: ${err instanceof Error ? err.message : "Unknown error"}` });
    }

    // Compute next run time
    let nextRun = new Date();
    if (schedule.intervalM) {
      nextRun = new Date(Date.now() + schedule.intervalM * 60 * 1000);
    } else {
      // Default: 1 day from now (simplified cron — real cron parsing would need a library)
      nextRun = new Date(Date.now() + 24 * 60 * 60 * 1000);
    }

    await prisma.scheduledWorkflow.update({
      where: { id: schedule.id },
      data: { lastRunAt: now, nextRunAt: nextRun },
    });
  }

  return results;
}
