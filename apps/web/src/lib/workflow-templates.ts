import type { WorkflowGraph } from "@/lib/workflow-engine";

export interface WorkflowTemplate {
  key: string;
  label: string;
  description: string;
  icon: string;
  graph: WorkflowGraph;
}

export const WORKFLOW_TEMPLATES: WorkflowTemplate[] = [
  {
    key: "weekly-site-inspection",
    label: "Weekly Site Inspection",
    description: "Every Monday: assign inspection tasks to supervisors, send reminders",
    icon: "ClipboardList",
    graph: {
      startStepId: "s1",
      steps: [
        {
          id: "s1",
          type: "create_task",
          label: "Assign site inspection task",
          config: {
            title: "Weekly site inspection — check all active projects",
            instructions: "1. Visit each active project site\n2. Check safety compliance\n3. Verify material stock levels\n4. Report any issues",
            priority: "high",
          },
        },
        {
          id: "s2",
          type: "send_notification",
          label: "Send reminder notification",
          config: {
            title: "Reminder: Weekly site inspection due",
            message: "Please complete your site inspection by end of day Friday.",
          },
        },
      ],
      edges: [{ from: "s1", to: "s2" }],
    },
  },
  {
    key: "low-stock-reorder",
    label: "Low Stock Reorder",
    description: "Check if any materials are below reorder point → auto-generate requisition + notify manager",
    icon: "Package",
    graph: {
      startStepId: "s1",
      steps: [
        {
          id: "s1",
          type: "condition",
          label: "Any materials below reorder point?",
          config: { predicate: "low_stock" },
        },
        {
          id: "s2",
          type: "auto_requisition",
          label: "Auto-generate draft requisition",
          config: {},
        },
        {
          id: "s3",
          type: "send_notification",
          label: "Notify manager about low stock",
          config: {
            title: "Alert: Materials below minimum stock",
            message: "Several materials are below their reorder points. A draft requisition has been auto-generated — please review and submit it.",
          },
        },
        {
          id: "s4",
          type: "send_notification",
          label: "No action needed",
          config: {
            title: "Stock levels OK",
            message: "All materials are above their reorder points. No action needed.",
          },
        },
      ],
      edges: [
        { from: "s1", to: "s2", condition: "true" },
        { from: "s1", to: "s4", condition: "false" },
        { from: "s2", to: "s3" },
      ],
    },
  },
  {
    key: "monthly-financial-review",
    label: "Monthly Financial Review",
    description: "Monthly: assign financial review task to accountant, send summary notification",
    icon: "Wallet",
    graph: {
      startStepId: "s1",
      steps: [
        {
          id: "s1",
          type: "create_task",
          label: "Assign monthly financial review",
          config: {
            title: "Monthly financial review — reconcile all project costs",
            instructions: "1. Review all project costs for the month\n2. Reconcile expenses against budgets\n3. Check for missing receipts\n4. Generate summary report",
            priority: "high",
          },
        },
        {
          id: "s2",
          type: "send_notification",
          label: "Send review complete notification",
          config: {
            title: "Monthly financial review completed",
            message: "The monthly financial review has been completed. Please check the Finance page for details.",
          },
        },
      ],
      edges: [{ from: "s1", to: "s2" }],
    },
  },
  {
    key: "project-status-update",
    label: "Project Status Update",
    description: "Weekly: create task to update project statuses, notify stakeholders",
    icon: "Building2",
    graph: {
      startStepId: "s1",
      steps: [
        {
          id: "s1",
          type: "create_task",
          label: "Assign project status update task",
          config: {
            title: "Update all project statuses",
            instructions: "1. Review each active project's progress\n2. Update project status if needed (PLANNED → ACTIVE → COMPLETED)\n3. Check for overdue tasks\n4. Log any blockers",
            priority: "medium",
          },
        },
        {
          id: "s2",
          type: "send_notification",
          label: "Notify team of status updates",
          config: {
            title: "Project statuses updated",
            message: "Weekly project status update is complete. Check the Projects page for current statuses.",
          },
        },
      ],
      edges: [{ from: "s1", to: "s2" }],
    },
  },
  {
    key: "equipment-maintenance-reminder",
    label: "Equipment Maintenance Reminder",
    description: "Monthly: assign maintenance check task, send reminder",
    icon: "Wrench",
    graph: {
      startStepId: "s1",
      steps: [
        {
          id: "s1",
          type: "create_task",
          label: "Assign equipment maintenance check",
          config: {
            title: "Monthly equipment maintenance check",
            instructions: "1. Inspect all active equipment\n2. Check maintenance logs for overdue items\n3. Schedule repairs if needed\n4. Update equipment status",
            priority: "medium",
          },
        },
      ],
      edges: [],
    },
  },
  {
    key: "overdue-po-chase",
    label: "Overdue PO Chase-up",
    description: "Check for overdue POs → create task to chase suppliers + notify procurement manager",
    icon: "Truck",
    graph: {
      startStepId: "s1",
      steps: [
        {
          id: "s1",
          type: "condition",
          label: "Any overdue purchase orders?",
          config: { predicate: "overdue_pos" },
        },
        {
          id: "s2",
          type: "create_task",
          label: "Create supplier chase task",
          config: {
            title: "Chase overdue suppliers",
            instructions: "1. Check the Procurement page for POs past their expected date\n2. Call each supplier to confirm delivery\n3. Update expected dates if needed\n4. Escalate critical delays to management",
            priority: "high",
          },
        },
        {
          id: "s3",
          type: "send_notification",
          label: "Notify procurement manager",
          config: {
            title: "Overdue POs need attention",
            message: "One or more purchase orders are past their expected delivery date. A chase task has been created.",
          },
        },
        {
          id: "s4",
          type: "send_notification",
          label: "No overdue POs",
          config: {
            title: "All POs on schedule",
            message: "No purchase orders are overdue. Deliveries are on track.",
          },
        },
      ],
      edges: [
        { from: "s1", to: "s2", condition: "true" },
        { from: "s1", to: "s4", condition: "false" },
        { from: "s2", to: "s3" },
      ],
    },
  },
  {
    key: "blank",
    label: "Blank Workflow",
    description: "Start from scratch — add your own steps",
    icon: "Workflow",
    graph: {
      startStepId: "s1",
      steps: [
        {
          id: "s1",
          type: "create_task",
          label: "First step",
          config: { title: "New task", priority: "medium" },
        },
      ],
      edges: [],
    },
  },
];
