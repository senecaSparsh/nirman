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
 * Tenancy anchor — a workflow belongs to one company (`Workflow.companyId`).
 * Step configs are caller-written JSON, so every id inside them
 * (companyId / projectId / entityId / assignedToId) is untrusted input.
 * Without an anchor a crafted graph let a run in company A read company B's
 * records (custom_field predicate) or write into them (update_status,
 * project_cost, auto_requisition, tasks pushed to foreign users) — verified
 * live in the tenancy sweep. The anchor is enforced whenever the workflow
 * has a companyId; legacy company-less workflows fall back to config values.
 */
async function entityBelongsToTenant(
  entityType: string,
  entityId: string,
  tenantId: string,
): Promise<boolean> {
  const sel = { select: { id: true } } as const;
  switch (entityType) {
    case "Project":
      return !!(await prisma.project.findFirst({ where: { id: entityId, companyId: tenantId }, ...sel }));
    case "PurchaseOrder":
      return !!(await prisma.purchaseOrder.findFirst({ where: { id: entityId, companyId: tenantId }, ...sel }));
    case "MaterialRequisition":
      return !!(await prisma.materialRequisition.findFirst({
        where: { id: entityId, OR: [{ project: { companyId: tenantId } }, { department: { companyId: tenantId } }] },
        ...sel,
      }));
    case "StockTransfer":
      return !!(await prisma.stockTransfer.findFirst({
        where: { id: entityId, OR: [{ fromLocation: { companyId: tenantId } }, { toLocation: { companyId: tenantId } }] },
        ...sel,
      }));
    case "Task":
      return !!(await prisma.task.findFirst({
        where: { id: entityId, assignedTo: { memberships: { some: { companyId: tenantId } } } },
        ...sel,
      }));
    default:
      return false;
  }
}

/** Task assignees must be active members of the workflow's company —
 *  same rule POST /api/tasks enforces on the direct path. */
async function assigneeInTenant(assignedToId: string, tenantId: string): Promise<boolean> {
  return !!(await prisma.user.findFirst({
    where: { id: assignedToId, active: true, memberships: { some: { companyId: tenantId } } },
    select: { id: true },
  }));
}

/**
 * Evaluate a condition operator against a field value and comparison value.
 * Supports: eq, ne, gt, lt, contains. Unknown operators return false.
 */
export function evaluateCondition(
  operator: string,
  fieldValue: string,
  value: string,
): boolean {
  switch (operator) {
    case "eq":
      return fieldValue === value;
    case "ne":
      return fieldValue !== value;
    case "gt":
      return parseFloat(fieldValue) > parseFloat(value);
    case "lt":
      return parseFloat(fieldValue) < parseFloat(value);
    case "contains":
      return fieldValue.includes(value);
    default:
      return false;
  }
}

/**
 * Find the next step ID from a step via edges.
 * If a branch is specified, prefers a matching conditional edge, falling back
 * to a non-conditional edge. If no branch, uses the first outgoing edge.
 */
export function findNextStep(
  edges: WorkflowEdge[],
  fromStepId: string,
  branch?: string,
): string | null {
  if (branch) {
    const branchEdge = edges.find((e) => e.from === fromStepId && e.condition === branch);
    if (branchEdge) return branchEdge.to;
  }
  const fallbackEdge = edges.find((e) => e.from === fromStepId && !e.condition);
  if (fallbackEdge) return fallbackEdge.to;
  if (!branch) {
    const anyEdge = edges.find((e) => e.from === fromStepId);
    return anyEdge?.to ?? null;
  }
  return null;
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
        const result = await executeStep(step, workflow.companyId ?? null);

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
 * `tenantCompanyId` is the workflow's owning company — the tenancy anchor
 * for every id the config references.
 */
async function executeStep(step: WorkflowStep, tenantCompanyId: string | null): Promise<RunResult> {
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
      if (tenantCompanyId && !(await assigneeInTenant(assignedToId, tenantCompanyId))) {
        return { stepId: step.id, status: "failed", message: "Assignee is not a member of this company" };
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
      if (tenantCompanyId && !(await assigneeInTenant(assignedToId, tenantCompanyId))) {
        return { stepId: step.id, status: "failed", message: "Recipient is not a member of this company" };
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
      // The workflow's own company anchors every predicate — a config-supplied
      // companyId can only ever widen the read to another tenant.
      const companyId = tenantCompanyId ?? (cfg.companyId ? String(cfg.companyId) : null);

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
                // Tasks carry no companyId — tenancy flows through the
                // assignee's membership.
                ...(tenantCompanyId
                  ? { assignedTo: { memberships: { some: { companyId: tenantCompanyId } } } }
                  : {}),
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

            // Dynamic Prisma model access — typed via a minimal interface
            // since the model name is determined at runtime from the entity type.
            if (tenantCompanyId && !(await entityBelongsToTenant(entityType, entityId, tenantCompanyId))) {
              return { stepId: step.id, status: "failed", message: `${entityType} ${entityId} not found` };
            }
            const model = prisma[modelName as keyof typeof prisma] as unknown as {
              findUnique: (args: { where: { id: string } }) => Promise<Record<string, unknown> | null>;
            };
            const record = await model.findUnique({ where: { id: entityId } });
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

      // Map entity type to Prisma model — use the typed Prisma client API
      // (NOT raw SQL) to prevent SQL injection via table name interpolation.
      const modelMap: Record<string, "project" | "purchaseOrder" | "materialRequisition" | "stockTransfer" | "task"> = {
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

      // Status writes must stay inside the workflow's own company —
      // update() takes a bare id, so a foreign entityId would rewrite
      // another tenant's record (verified: reachable across tenants).
      if (tenantCompanyId && !(await entityBelongsToTenant(entityType, entityId, tenantCompanyId))) {
        return { stepId: step.id, status: "failed", message: `${entityType} ${entityId} not found` };
      }

      // Dynamic Prisma model access — typed via a minimal interface.
      const updateModel = prisma[modelName as keyof typeof prisma] as unknown as {
        update: (args: { where: { id: string }; data: Record<string, unknown> }) => Promise<unknown>;
      };
      await updateModel.update({
        where: { id: entityId },
        data: { status: newStatus },
      });

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
          if (tenantCompanyId && !(await assigneeInTenant(assignedToId, tenantCompanyId))) {
            return { stepId: step.id, status: "failed", message: "Assignee is not a member of this company" };
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
          // A foreign projectId would plant a cost line inside another
          // tenant's books — anchor to the workflow's company.
          if (
            tenantCompanyId &&
            !(await prisma.project.findFirst({ where: { id: projectId, companyId: tenantCompanyId }, select: { id: true } }))
          ) {
            return { stepId: step.id, status: "failed", message: "Project not found in this company" };
          }
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
          // Record a company expense — anchored to the workflow's company,
          // never a config-supplied companyId.
          const companyId = tenantCompanyId ?? String(cfg.companyId ?? "");
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
      // Generate a draft requisition for low-stock materials — anchored to
      // the workflow's company; a config companyId/projectId pair pointing at
      // another tenant would mint requisitions in the victim's project.
      const companyId = tenantCompanyId ?? String(cfg.companyId ?? "");
      const projectId = String(cfg.projectId ?? "");
      const createdByById = cfg.createdByById ? String(cfg.createdByById) : undefined;

      if (!companyId || !projectId) {
        return { stepId: step.id, status: "failed", message: "auto_requisition requires companyId and projectId" };
      }
      if (
        !(await prisma.project.findFirst({ where: { id: projectId, companyId }, select: { id: true } }))
      ) {
        return { stepId: step.id, status: "failed", message: "Project not found in this company" };
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
 * Minimal 5-field cron matcher — fields: minute hour dom month dow.
 * Supports star, step (star-slash-n), single values, ranges (a-b), lists.
 * Day-of-week accepts 0–7 where 0 and 7 are Sunday.
 */
function cronFieldMatches(field: string, value: number, min: number, _max: number): boolean {
  for (const part of field.split(",")) {
    const slashIdx = part.indexOf("/");
    const step = slashIdx !== -1 ? Number(part.slice(slashIdx + 1)) : 1;
    const range = slashIdx !== -1 ? part.slice(0, slashIdx) : part;
    if (range === "*") {
      if ((value - min) % step === 0) return true;
      continue;
    }
    const dashIdx = range.indexOf("-");
    const lo = dashIdx !== -1 ? Number(range.slice(0, dashIdx)) : Number(range);
    const hi = dashIdx !== -1 ? Number(range.slice(dashIdx + 1)) : lo;
    if (Number.isNaN(lo) || Number.isNaN(hi) || Number.isNaN(step) || step < 1) continue;
    if (value >= lo && value <= hi && (value - lo) % step === 0) return true;
  }
  return false;
}

/**
 * Next fire time for a 5-field cron expression, scanning forward minute by
 * minute (day-of-month and day-of-week are OR'd, matching Vixie cron).
 * Returns null for an unparseable expression.
 */
export function nextRunFromCron(expr: string, from: Date): Date | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const [minField, hourField, domField, monthField, dowField] = fields as [string, string, string, string, string];
  const d = new Date(from.getTime() + 60_000);
  d.setSeconds(0, 0);
  // Scan up to ~4 years ahead (covers Feb 29-only schedules).
  const limit = from.getTime() + 366 * 4 * 24 * 60 * 60 * 1000;
  while (d.getTime() < limit) {
    const minute = d.getMinutes();
    const hour = d.getHours();
    const dom = d.getDate();
    const month = d.getMonth() + 1;
    const dow = d.getDay();
    const domWild = domField === "*", dowWild = dowField === "*";
    const domHit = cronFieldMatches(domField, dom, 1, 31);
    const dowHit = cronFieldMatches(dowField, dow, 0, 7) || (dow === 0 && cronFieldMatches(dowField, 7, 0, 7));
    const dayOk =
      domWild && dowWild ? true
      : domWild ? dowHit
      : dowWild ? domHit
      : domHit || dowHit;
    const monthOk = cronFieldMatches(monthField, month, 1, 12);
    if (!(dayOk && monthOk)) {
      // Fast-forward to next midnight — no minute today can match.
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
      continue;
    }
    if (
      cronFieldMatches(minField, minute, 0, 59) &&
      cronFieldMatches(hourField, hour, 0, 23)
    ) {
      return d;
    }
    d.setTime(d.getTime() + 60_000);
  }
  return null;
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

    // Compute next run time — real cron when set, else the interval, else daily.
    let nextRun: Date;
    if (schedule.cron) {
      nextRun = nextRunFromCron(schedule.cron, now) ?? new Date(now.getTime() + 24 * 60 * 60 * 1000);
    } else if (schedule.intervalM) {
      nextRun = new Date(now.getTime() + schedule.intervalM * 60 * 1000);
    } else {
      nextRun = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    }

    // Claim the run atomically BEFORE executing — a second concurrent tick
    // sees this schedule as due, but its claim fails after ours updates
    // nextRunAt (stale-value compare-and-set). Without this, a slow run
    // overlapping the next tick mints duplicate tasks/notifications.
    const claimed = await prisma.scheduledWorkflow.updateMany({
      where: { id: schedule.id, nextRunAt: schedule.nextRunAt },
      data: { lastRunAt: now, nextRunAt: nextRun },
    });
    if (claimed.count === 0) continue;

    try {
      const run = await executeWorkflow(schedule.workflowId, "schedule");
      results.push({ workflowId: schedule.workflowId, runId: run.id, status: run.status });
    } catch (err: unknown) {
      results.push({ workflowId: schedule.workflowId, runId: "", status: `error: ${err instanceof Error ? err.message : "Unknown error"}` });
    }
  }

  return results;
}
