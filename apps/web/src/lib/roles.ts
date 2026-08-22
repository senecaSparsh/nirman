/**
 * Role-based access control for Nirman Inventory OS.
 *
 * Enterprise-grade 5-tier hierarchy with 13 construction-specific roles.
 *
 * Tier 1 — Executive:     OWNER, ADMIN
 * Tier 2 — Senior Mgmt:   PROJECT_DIRECTOR, FINANCE_HEAD
 * Tier 3 — Middle Mgmt:   PROJECT_MANAGER, PROCUREMENT_MANAGER, HR_MANAGER
 * Tier 4 — Execution:     SITE_ENGINEER, STORE_KEEPER, ACCOUNTANT, SALES_MANAGER
 * Tier 5 — Field:         SUPERVISOR, QAQC_ENGINEER
 *
 * Permission model: each module has a `*.view` (read) and
 * `*.manage` (write) permission, plus approval / high-impact actions.
 *
 * Used by:
 *  - API routes via `requirePermission()` / `requireRole()`
 *  - Server Components via `getUserRole()` + `can()`
 *  - Client components via the `usePermissions()` hook / session `role`
 */

export type Role =
  | "OWNER"
  | "ADMIN"
  | "PROJECT_DIRECTOR"
  | "FINANCE_HEAD"
  | "PROJECT_MANAGER"
  | "PROCUREMENT_MANAGER"
  | "HR_MANAGER"
  | "SITE_ENGINEER"
  | "STORE_KEEPER"
  | "ACCOUNTANT"
  | "SALES_MANAGER"
  | "SUPERVISOR"
  | "QAQC_ENGINEER";

export const ALL_ROLES: Role[] = [
  "OWNER",
  "ADMIN",
  "PROJECT_DIRECTOR",
  "FINANCE_HEAD",
  "PROJECT_MANAGER",
  "PROCUREMENT_MANAGER",
  "HR_MANAGER",
  "SITE_ENGINEER",
  "STORE_KEEPER",
  "ACCOUNTANT",
  "SALES_MANAGER",
  "SUPERVISOR",
  "QAQC_ENGINEER",
];

// ── 5-Tier Delegation Hierarchy ──
// Tier 1: Executive (OWNER/ADMIN) — can create any role below them
// Tier 2: Senior Mgmt (PROJECT_DIRECTOR/FINANCE_HEAD) — can create tier 3-5
// Tier 3: Middle Mgmt (PROJECT_MANAGER/PROCUREMENT_MANAGER/HR_MANAGER) — can create tier 4-5
// Tier 4: Execution (SITE_ENGINEER/STORE_KEEPER/ACCOUNTANT/SALES_MANAGER) — can create tier 5
// Tier 5: Field (SUPERVISOR/QAQC_ENGINEER) — cannot create accounts
//
// A role can only assign roles STRICTLY below it in the hierarchy.
const ROLE_TIER: Record<Role, number> = {
  OWNER: 1,
  ADMIN: 1,
  PROJECT_DIRECTOR: 2,
  FINANCE_HEAD: 2,
  PROJECT_MANAGER: 3,
  PROCUREMENT_MANAGER: 3,
  HR_MANAGER: 3,
  SITE_ENGINEER: 4,
  STORE_KEEPER: 4,
  ACCOUNTANT: 4,
  SALES_MANAGER: 4,
  SUPERVISOR: 5,
  QAQC_ENGINEER: 5,
};

/** Numeric tier for a role (1 = top, 5 = bottom). */
export function roleTier(role: string | undefined | null): number {
  const r = normalizeRole(role);
  return ROLE_TIER[r];
}

/**
 * Can the actor create/assign a membership with the target role?
 * Rules:
 *   - The actor must be at a HIGHER tier (lower number) than the target.
 *   - Same-tier cross-assignment is allowed ONLY for tier 1 (OWNER↔ADMIN).
 *   - Tier 5 roles cannot create any accounts.
 *   - Nobody can assign their own exact role (no self-cloning).
 */
export function canAssignRole(actorRole: string | undefined | null, targetRole: string | undefined | null): boolean {
  const actor = normalizeRole(actorRole);
  const target = normalizeRole(targetRole);
  const actorTier = roleTier(actor);
  const targetTier = roleTier(target);
  // Tier 5 can't create anyone.
  if (actorTier >= 5) return false;
  // Can't assign your own exact role (no self-cloning).
  if (actor === target) return false;
  // Strictly below → always allowed.
  if (actorTier < targetTier) return true;
  // Same tier, different role → allowed only for tier 1 (OWNER↔ADMIN).
  if (actorTier === 1 && actorTier === targetTier && actor !== target) return true;
  // Same tier for tiers 2-4 → not allowed (peers can't create peers).
  // Higher tier → never allowed.
  return false;
}

/**
 * Which roles can the actor assign? Used to filter the role dropdown in the
 * "Add member" / "Edit member" UI.
 */
export function assignableRoles(actorRole: string | undefined | null): Role[] {
  return ALL_ROLES.filter((r) => canAssignRole(actorRole, r));
}

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
  /** Tier number for display. */
  tier: number;
  /** Category for grouping in UI. */
  category: "Executive" | "Senior Management" | "Middle Management" | "Execution" | "Field";
}

// ── Permission keys ──
export const PERM = {
  // Canvas / workflows
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
  QUOTATION_VIEW: "quotation.view",
  QUOTATION_MANAGE: "quotation.manage",
  // Assets (land + built units + equipment)
  ASSETS_VIEW: "assets.view",
  ASSETS_MANAGE: "assets.manage",
  ASSET_SELL: "asset.sell",
  LAND_PARTITION: "land.partition",
  LEGAL_MANAGE: "legal.manage",
  // Finance
  FINANCE_VIEW: "finance.view",
  FINANCE_MANAGE: "finance.manage",
  EXPENSE_CREATE: "expense.create",
  EXPENSE_APPROVE: "expense.approve",
  // Subcontractor / Work Orders
  WO_MANAGE: "wo.manage",
  RA_SUBMIT: "ra.submit",
  RA_APPROVE: "ra.approve",
  RA_PAY: "ra.pay",
  // Sales
  SALES_VIEW: "sales.view",
  SALES_MANAGE: "sales.manage",
  SALE_CREATE: "sale.create",
  // Company / settings
  COMPANY_MANAGE: "company.manage",
  // HR — workforce, attendance, payroll, DPR
  HR_VIEW: "hr.view",
  HR_MANAGE: "hr.manage",
  PAYROLL_VIEW: "payroll.view",
  PAYROLL_MANAGE: "payroll.manage",
  DPR_SUBMIT: "dpr.submit",
  DPR_VIEW: "dpr.view",
  DPR_APPROVE_SUB_ADMIN: "dpr.approve_sub_admin",
  DPR_APPROVE_ADMIN: "dpr.approve_admin",
  // Vehicles
  VEHICLE_VIEW: "vehicle.view",
  VEHICLE_MANAGE: "vehicle.manage",
  // Gate Pass — outbound gate pass with approval workflow
  GATE_PASS_VIEW: "gate_pass.view",
  GATE_PASS_CREATE: "gate_pass.create",
  GATE_PASS_APPROVE: "gate_pass.approve",
  GATE_PASS_EXIT: "gate_pass.exit",     // security guard confirms exit
  GATE_PASS_MANAGE: "gate_pass.manage",  // edit/cancel
} as const;

export type Permission = (typeof PERM)[keyof typeof PERM];

export const ALL_PERMISSIONS: string[] = Object.values(PERM);

export const ROLES: Record<Role, RoleDef> = {
  // ── Tier 1: Executive ──
  OWNER: {
    key: "OWNER",
    label: "Owner",
    description: "Business owner — full access to everything.",
    permissions: "*",
    canManageUsers: true,
    canAssignTasks: true,
    canManageWorkflows: true,
    tier: 1,
    category: "Executive",
  },
  ADMIN: {
    key: "ADMIN",
    label: "System Administrator",
    description: "Full system access — manages users, settings, and all modules.",
    permissions: "*",
    canManageUsers: true,
    canAssignTasks: true,
    canManageWorkflows: true,
    tier: 1,
    category: "Executive",
  },

  // ── Tier 2: Senior Management ──
  PROJECT_DIRECTOR: {
    key: "PROJECT_DIRECTOR",
    label: "Project Director",
    description: "Oversees multiple projects — strategic decisions, approvals, cost control.",
    permissions: [
      PERM.CANVAS_VIEW, PERM.CANVAS_EDIT, PERM.CANVAS_CREATE,
      PERM.TASKS_VIEW, PERM.TASKS_ASSIGN, PERM.TASKS_MANAGE_ALL,
      PERM.WORKFLOWS_VIEW, PERM.WORKFLOWS_RUN,
      PERM.PROJECTS_VIEW, PERM.PROJECTS_MANAGE,
      PERM.INVENTORY_VIEW,
      PERM.PROCUREMENT_VIEW, PERM.PROCUREMENT_MANAGE, PERM.PO_APPROVE, PERM.REQUISITION_APPROVE,
      PERM.QUOTATION_VIEW, PERM.QUOTATION_MANAGE,
      PERM.ASSETS_VIEW, PERM.ASSETS_MANAGE,
      PERM.FINANCE_VIEW,
      PERM.HR_VIEW, PERM.DPR_VIEW, PERM.DPR_APPROVE_ADMIN,
      PERM.WO_MANAGE, PERM.RA_APPROVE,
      PERM.VEHICLE_VIEW,
      PERM.USERS_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_APPROVE, PERM.GATE_PASS_MANAGE,
      PERM.LEGAL_MANAGE,
    ],
    canManageUsers: false,
    canAssignTasks: true,
    canManageWorkflows: false,
    tier: 2,
    category: "Senior Management",
  },
  FINANCE_HEAD: {
    key: "FINANCE_HEAD",
    label: "Finance Head / CFO",
    description: "Manages all finance — payments, payroll, GL, approvals, cost control.",
    permissions: [
      PERM.FINANCE_VIEW, PERM.FINANCE_MANAGE, PERM.EXPENSE_CREATE, PERM.EXPENSE_APPROVE,
      PERM.PROJECTS_VIEW,
      PERM.PROCUREMENT_VIEW,
      PERM.QUOTATION_VIEW,
      PERM.SALES_VIEW,
      PERM.ASSETS_VIEW,
      PERM.HR_VIEW, PERM.PAYROLL_VIEW, PERM.PAYROLL_MANAGE, PERM.DPR_VIEW,
      PERM.RA_APPROVE, PERM.RA_PAY,
      PERM.VEHICLE_VIEW,
      PERM.USERS_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_APPROVE,
      PERM.LEGAL_MANAGE,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    tier: 2,
    category: "Senior Management",
  },

  // ── Tier 3: Middle Management ──
  PROJECT_MANAGER: {
    key: "PROJECT_MANAGER",
    label: "Project Manager",
    description: "Manages a project — procurement, inventory, tasks, DPR sub-admin approval.",
    permissions: [
      PERM.CANVAS_VIEW, PERM.CANVAS_EDIT, PERM.CANVAS_CREATE,
      PERM.TASKS_VIEW, PERM.TASKS_ASSIGN, PERM.TASKS_MANAGE_ALL,
      PERM.WORKFLOWS_VIEW, PERM.WORKFLOWS_RUN,
      PERM.PROJECTS_VIEW, PERM.PROJECTS_MANAGE,
      PERM.INVENTORY_VIEW, PERM.INVENTORY_MANAGE, PERM.STOCK_TRANSFER, PERM.STOCK_ISSUE,
      PERM.PROCUREMENT_VIEW, PERM.PROCUREMENT_MANAGE, PERM.PO_APPROVE, PERM.REQUISITION_APPROVE,
      PERM.QUOTATION_VIEW, PERM.QUOTATION_MANAGE,
      PERM.ASSETS_VIEW, PERM.ASSETS_MANAGE,
      PERM.FINANCE_VIEW, PERM.EXPENSE_CREATE,
      PERM.HR_VIEW, PERM.HR_MANAGE, PERM.DPR_VIEW, PERM.DPR_SUBMIT, PERM.DPR_APPROVE_SUB_ADMIN,
      PERM.WO_MANAGE, PERM.RA_SUBMIT,
      PERM.VEHICLE_VIEW, PERM.VEHICLE_MANAGE,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_APPROVE, PERM.GATE_PASS_MANAGE,
      PERM.LEGAL_MANAGE,
    ],
    canManageUsers: false,
    canAssignTasks: true,
    canManageWorkflows: true,
    tier: 3,
    category: "Middle Management",
  },
  PROCUREMENT_MANAGER: {
    key: "PROCUREMENT_MANAGER",
    label: "Procurement Manager",
    description: "Manages purchasing — suppliers, quotes, POs, requisitions.",
    permissions: [
      PERM.PROJECTS_VIEW,
      PERM.INVENTORY_VIEW, PERM.INVENTORY_MANAGE,
      PERM.PROCUREMENT_VIEW, PERM.PROCUREMENT_MANAGE, PERM.REQUISITION_APPROVE,
      PERM.QUOTATION_VIEW, PERM.QUOTATION_MANAGE,
      PERM.ASSETS_VIEW,
      PERM.FINANCE_VIEW,
      PERM.VEHICLE_VIEW, PERM.VEHICLE_MANAGE,
      PERM.TASKS_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_APPROVE, PERM.GATE_PASS_MANAGE,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    tier: 3,
    category: "Middle Management",
  },
  HR_MANAGER: {
    key: "HR_MANAGER",
    label: "HR Manager",
    description: "Manages workforce — employees, attendance, payroll, DPRs.",
    permissions: [
      PERM.HR_VIEW, PERM.HR_MANAGE,
      PERM.PAYROLL_VIEW, PERM.PAYROLL_MANAGE,
      PERM.DPR_VIEW, PERM.DPR_SUBMIT, PERM.DPR_APPROVE_SUB_ADMIN,
      PERM.PROJECTS_VIEW,
      PERM.INVENTORY_VIEW,
      PERM.USERS_VIEW,
      PERM.TASKS_VIEW,
      PERM.GATE_PASS_VIEW,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    tier: 3,
    category: "Middle Management",
  },

  // ── Tier 4: Execution ──
  SITE_ENGINEER: {
    key: "SITE_ENGINEER",
    label: "Site Engineer",
    description: "Site supervision — DPR submission, material issue, stock view, tasks.",
    permissions: [
      PERM.PROJECTS_VIEW,
      PERM.INVENTORY_VIEW, PERM.INVENTORY_MANAGE, PERM.STOCK_ISSUE,
      PERM.PROCUREMENT_VIEW,
      PERM.QUOTATION_VIEW,
      PERM.ASSETS_VIEW,
      PERM.HR_VIEW, PERM.DPR_VIEW, PERM.DPR_SUBMIT,
      PERM.TASKS_VIEW,
      PERM.VEHICLE_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_MANAGE,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    tier: 4,
    category: "Execution",
  },
  STORE_KEEPER: {
    key: "STORE_KEEPER",
    label: "Store Keeper",
    description: "Warehouse management — stock receipt, transfers, issues, inventory.",
    permissions: [
      PERM.INVENTORY_VIEW, PERM.INVENTORY_MANAGE, PERM.STOCK_TRANSFER, PERM.STOCK_ISSUE,
      PERM.PROCUREMENT_VIEW,
      PERM.QUOTATION_VIEW,
      PERM.PROJECTS_VIEW,
      PERM.VEHICLE_VIEW, PERM.VEHICLE_MANAGE,
      PERM.TASKS_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_EXIT, PERM.GATE_PASS_MANAGE,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    tier: 4,
    category: "Execution",
  },
  ACCOUNTANT: {
    key: "ACCOUNTANT",
    label: "Accountant",
    description: "Bookkeeping — payments, invoices, expenses, bank reconciliation.",
    permissions: [
      PERM.FINANCE_VIEW, PERM.FINANCE_MANAGE, PERM.EXPENSE_CREATE,
      PERM.PROJECTS_VIEW,
      PERM.PROCUREMENT_VIEW,
      PERM.QUOTATION_VIEW,
      PERM.SALES_VIEW,
      PERM.ASSETS_VIEW,
      PERM.HR_VIEW, PERM.PAYROLL_VIEW, PERM.DPR_VIEW,
      PERM.RA_PAY,
      PERM.VEHICLE_VIEW,
      PERM.GATE_PASS_VIEW,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    tier: 4,
    category: "Execution",
  },
  SALES_MANAGER: {
    key: "SALES_MANAGER",
    label: "Sales Manager",
    description: "Manages sales — customers, asset sales, quotations, portal listings.",
    permissions: [
      PERM.SALES_VIEW, PERM.SALES_MANAGE, PERM.SALE_CREATE,
      PERM.ASSETS_VIEW, PERM.ASSETS_MANAGE, PERM.ASSET_SELL,
      PERM.PROJECTS_VIEW,
      PERM.QUOTATION_VIEW, PERM.QUOTATION_MANAGE,
      PERM.TASKS_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_MANAGE,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    tier: 4,
    category: "Execution",
  },

  // ── Tier 5: Field ──
  SUPERVISOR: {
    key: "SUPERVISOR",
    label: "Supervisor",
    description: "Site supervision — views data, submits DPRs, basic stock updates.",
    permissions: [
      PERM.CANVAS_VIEW,
      PERM.TASKS_VIEW,
      PERM.PROJECTS_VIEW,
      PERM.INVENTORY_VIEW, PERM.INVENTORY_MANAGE, PERM.STOCK_TRANSFER, PERM.STOCK_ISSUE,
      PERM.PROCUREMENT_VIEW,
      PERM.QUOTATION_VIEW,
      PERM.ASSETS_VIEW,
      PERM.HR_VIEW, PERM.DPR_VIEW, PERM.DPR_SUBMIT,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_EXIT,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    tier: 5,
    category: "Field",
  },
  QAQC_ENGINEER: {
    key: "QAQC_ENGINEER",
    label: "QA/QC Engineer",
    description: "Quality assurance — inspections, DPR review, material verification.",
    permissions: [
      PERM.PROJECTS_VIEW,
      PERM.INVENTORY_VIEW,
      PERM.PROCUREMENT_VIEW,
      PERM.QUOTATION_VIEW,
      PERM.ASSETS_VIEW,
      PERM.HR_VIEW, PERM.DPR_VIEW, PERM.DPR_SUBMIT,
      PERM.TASKS_VIEW,
      PERM.GATE_PASS_VIEW,
    ],
    canManageUsers: false,
    canAssignTasks: false,
    canManageWorkflows: false,
    tier: 5,
    category: "Field",
  },
};

export const ROLE_LIST: RoleDef[] = ALL_ROLES.map((r) => ROLES[r]);

/** Roles grouped by category for UI display. */
export const ROLES_BY_CATEGORY: Record<RoleDef["category"], RoleDef[]> = {
  Executive: ROLE_LIST.filter((r) => r.category === "Executive"),
  "Senior Management": ROLE_LIST.filter((r) => r.category === "Senior Management"),
  "Middle Management": ROLE_LIST.filter((r) => r.category === "Middle Management"),
  Execution: ROLE_LIST.filter((r) => r.category === "Execution"),
  Field: ROLE_LIST.filter((r) => r.category === "Field"),
};

/**
 * Normalize an arbitrary string to a valid Role.
 * Falls back to the LEAST-privileged role (SUPERVISOR),
 * so a corrupted role string never grants broad access.
 */
export function normalizeRole(raw: string | undefined | null): Role {
  if (raw && raw in ROLES) return raw as Role;
  return "SUPERVISOR";
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

/** Check if a role is at least a manager-level role (tier 3 or above). */
export function isManagerOrAbove(role: string | undefined | null): boolean {
  const r = normalizeRole(role);
  return roleTier(r) <= 3;
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

/**
 * Return the full effective permission list for a role, merged with
 * any additive overrides.
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
 * Roles allowed to approve purchase orders / requisitions.
 */
export const APPROVER_ROLES: Role[] = ["OWNER", "ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER"];

/** Can a role approve procurement (POs + requisitions)? */
export function canApproveProcurement(role: string | undefined | null): boolean {
  return hasPermission(role, PERM.PO_APPROVE) || hasPermission(role, PERM.REQUISITION_APPROVE);
}

/** Map legacy roles to new roles for backward compatibility. */
const LEGACY_ROLE_MAP: Record<string, Role> = {
  MANAGER: "PROJECT_MANAGER",
  SALES: "SALES_MANAGER",
};

/** Migrate a legacy role string to the new role system. */
export function migrateRole(raw: string | undefined | null): Role | null {
  if (!raw) return null;
  if (raw in ROLES) return raw as Role;
  if (raw in LEGACY_ROLE_MAP) return LEGACY_ROLE_MAP[raw] ?? null;
  return null;
}
