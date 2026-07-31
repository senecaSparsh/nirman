/**
 * Role-based access control for Nirman Inventory OS.
 *
 * Six roles with a permission matrix. `OWNER` and `ADMIN` are
 * superuser roles (all permissions). The others get scoped
 * permissions relevant to their job function.
 *
 * Permission model: each module has a `*.view` (read) and
 * `*.manage` (write) permission, plus a small set of approval /
 * high-impact actions (po.approve, requisition.approve, stock.transfer,
 * stock.issue, sale.create, expense.create, asset.sell, land.partition).
 *
 * Used by:
 *  - API routes via `requirePermission()` / `requireRole()`
 *  - Server Components via `getUserRole()` + `can()`
 *  - Client components via the `usePermissions()` hook / session `role`
 */

export type Role = "OWNER" | "ADMIN" | "MANAGER" | "SUPERVISOR" | "SALES" | "ACCOUNTANT";

export const ALL_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "SALES", "ACCOUNTANT"];

export interface RoleDef {
  key: Role;
  label: string;
  description: string;
  /** "*" = all permissions; otherwise a list of permission keys. */
  permissions: string[] | "*";
  /** Can this role manage other users' roles? */
  canManageUsers: boolean;
  /** Can this role assign tasks to others? */
  canAssignTasks: boolean;
  /** Can this role create/edit workflows? */
  canManageWorkflows: boolean;
  /** Can this role edit the playground canvas in live mode? */
  canEditCanvas: boolean;
}

// ── Permission keys ──
// Each module: <module>.view (read) + <module>.manage (write).
// Plus approval / high-impact actions.
export const PERM = {
  // Canvas / playground
  CANVAS_VIEW: "canvas.view",
  CANVAS_EDIT: "canvas.edit",
  CANVAS_CREATE: "canvas.create",
  // Tasks
  TASKS_VIEW: "tasks.view",
  TASKS_ASSIGN: "tasks.assign",
  TASKS_MANAGE_ALL: "tasks.manageAll",
  // Users
  USERS_VIEW: "users.view",
  USERS_MANAGE: "users.manage",
  // Workflows
  WORKFLOWS_VIEW: "workflows.view",
  WORKFLOWS_MANAGE: "workflows.manage",
  WORKFLOWS_RUN: "workflows.run",
  // Projects
  PROJECTS_VIEW: "projects.view",
  PROJECTS_MANAGE: "projects.manage",
  // Inventory (materials + stock)
  INVENTORY_VIEW: "inventory.view",
  INVENTORY_MANAGE: "inventory.manage",
  STOCK_TRANSFER: "stock.transfer",
  STOCK_ISSUE: "stock.issue",
  // Procurement
  PROCUREMENT_VIEW: "procurement.view",
  PROCUREMENT_MANAGE: "procurement.manage",
  PO_APPROVE: "po.approve",
  REQUISITION_APPROVE: "requisition.approve",
  // Assets (land + built units + equipment)
  ASSETS_VIEW: "assets.view",
  ASSETS_MANAGE: "assets.manage",
  ASSET_SELL: "asset.sell",
  LAND_PARTITION: "land.partition",
  // Finance
  FINANCE_VIEW: "finance.view",
  FINANCE_MANAGE: "finance.manage",
  EXPENSE_CREATE: "expense.create",
  // Sales
  SALES_VIEW: "sales.view",
  SALES_MANAGE: "sales.manage",
  SALE_CREATE: "sale.create",
  // Company / settings
  COMPANY_MANAGE: "company.manage",
} as const;

export type Permission = (typeof PERM)[keyof typeof PERM];

export const ALL_PERMISSIONS: string[] = Object.values(PERM);

export const ROLES: Record<Role, RoleDef> = {
  OWNER: {
    key: "OWNER",
    label: "Owner",
    description: "Full access — company owner with all permissions.",
    permissions: "*",
    canManageUsers: true,
    canAssignTasks: true,
    canManageWorkflows: true,
    canEditCanvas: true,
  },
  ADMIN: {
    key: "ADMIN",
    label: "Administrator",
    description: "Full system access — manages users, workflows, and all modules.",
    permissions: "*",
    canManageUsers: true,
    canAssignTasks: true,
    canManageWorkflows: true,
    canEditCanvas: true,
  },
  MANAGER: {
    key: "MANAGER",
    label: "Manager",
    description: "Manages projects, procurement, inventory, and assigns tasks.",
    permissions: [
      PERM.CANVAS_VIEW, PERM.CANVAS_EDIT, PERM.CANVAS_CREATE,
      PERM.TASKS_VIEW, PERM.TASKS_ASSIGN, PERM.TASKS_MANAGE_ALL,
      PERM.WORKFLOWS_VIEW, PERM.WORKFLOWS_MANAGE, PERM.WORKFLOWS_RUN,
      PERM.PROJECTS_VIEW, PERM.PROJECTS_MANAGE,
      PERM.INVENTORY_VIEW, PERM.INVENTORY_MANAGE, PERM.STOCK_TRANSFER, PERM.STOCK_ISSUE,
      PERM.PROCUREMENT_VIEW, PERM.PROCUREMENT_MANAGE, PERM.PO_APPROVE, PERM.REQUISITION_APPROVE,
      PERM.ASSETS_VIEW, PERM.ASSETS_MANAGE, PERM.ASSET_SELL, PERM.LAND_PARTITION,
      PERM.FINANCE_VIEW, PERM.FINANCE_MANAGE, PERM.EXPENSE_CREATE,
      PERM.SALES_VIEW, PERM.SALES_MANAGE, PERM.SALE_CREATE,
      PERM.COMPANY_MANAGE,
    ],
    canManageUsers: false,
    canAssignTasks: true,
    canManageWorkflows: true,
    canEditCanvas: true,
  },
  SUPERVISOR: {
    key: "SUPERVISOR",
    label: "Supervisor",
    description: "Site supervision — views data, updates stock, completes assigned tasks.",
    permissions: [
      PERM.CANVAS_VIEW,
      PERM.TASKS_VIEW,
      PERM.PROJECTS_VIEW,
      PERM.INVENTORY_VIEW, PERM.INVENTORY_MANAGE, PERM.STOCK_TRANSFER, PERM.STOCK_ISSUE,
      PERM.PROCUREMENT_VIEW,
      PERM.ASSETS_VIEW,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    canEditCanvas: false,
  },
  SALES: {
    key: "SALES",
    label: "Sales",
    description: "Manages customers and asset sales.",
    permissions: [
      PERM.SALES_VIEW, PERM.SALES_MANAGE, PERM.SALE_CREATE,
      PERM.ASSETS_VIEW,
      PERM.PROJECTS_VIEW,
      PERM.TASKS_VIEW,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    canEditCanvas: false,
  },
  ACCOUNTANT: {
    key: "ACCOUNTANT",
    label: "Accountant",
    description: "Manages finance — expenses, project costs, payments.",
    permissions: [
      PERM.FINANCE_VIEW, PERM.FINANCE_MANAGE, PERM.EXPENSE_CREATE,
      PERM.PROJECTS_VIEW,
      PERM.PROCUREMENT_VIEW,
      PERM.SALES_VIEW,
      PERM.ASSETS_VIEW,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    canEditCanvas: false,
  },
};

export const ROLE_LIST: RoleDef[] = ALL_ROLES.map((r) => ROLES[r]);

/** Normalize an arbitrary string to a valid Role (falls back to MANAGER). */
export function normalizeRole(raw: string | undefined | null): Role {
  if (raw && raw in ROLES) return raw as Role;
  return "MANAGER";
}

/**
 * Check if a role has a specific permission. Honors the default role
 * matrix plus any additive `RolePermission` overrides passed in.
 */
export function hasPermission(
  role: string | undefined | null,
  permission: string,
  overrides?: string[],
): boolean {
  const r = normalizeRole(role);
  const def = ROLES[r];
  if (def.permissions === "*") return true;
  if (def.permissions.includes(permission)) return true;
  if (overrides && overrides.includes(permission)) return true;
  return false;
}

/** Check if a role is at least a manager-level role (can assign tasks, edit canvas). */
export function isManagerOrAbove(role: string | undefined | null): boolean {
  const r = normalizeRole(role);
  return r === "OWNER" || r === "ADMIN" || r === "MANAGER";
}

/** Check if a role can manage users. */
export function canManageUsers(role: string | undefined | null): boolean {
  return ROLES[normalizeRole(role)].canManageUsers;
}

/** Check if a role can assign tasks. */
export function canAssignTasks(role: string | undefined | null): boolean {
  return ROLES[normalizeRole(role)].canAssignTasks;
}

/** Check if a role can manage workflows. */
export function canManageWorkflows(role: string | undefined | null): boolean {
  return ROLES[normalizeRole(role)].canManageWorkflows;
}

/** Check if a role can edit the canvas in live mode. */
export function canEditCanvas(role: string | undefined | null): boolean {
  return ROLES[normalizeRole(role)].canEditCanvas;
}

/**
 * Return the full effective permission list for a role, merged with
 * any additive overrides. Used to seed the client `usePermissions`
 * hook and to evaluate `can()` on the server.
 */
export function effectivePermissions(
  role: string | undefined | null,
  overrides?: string[],
): string[] {
  const r = normalizeRole(role);
  const def = ROLES[r];
  if (def.permissions === "*") return ALL_PERMISSIONS;
  const set = new Set<string>(def.permissions);
  if (overrides) for (const p of overrides) set.add(p);
  return Array.from(set);
}

/**
 * Roles allowed to approve purchase orders / requisitions. Used by
 * the Approvals queue to decide who sees the queue.
 */
export const APPROVER_ROLES: Role[] = ["OWNER", "ADMIN", "MANAGER"];

/** Can a role approve procurement (POs + requisitions)? */
export function canApproveProcurement(role: string | undefined | null): boolean {
  return hasPermission(role, PERM.PO_APPROVE) || hasPermission(role, PERM.REQUISITION_APPROVE);
}
