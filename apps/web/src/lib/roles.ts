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
  | "DEVELOPER"
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
  "DEVELOPER",
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
  DEVELOPER: 1,
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
  // Same tier, different role → allowed only for tier 1 (OWNER↔ADMIN↔DEVELOPER).
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

/**
 * Can the actor assign a custom role? Custom roles are assignable if the
 * actor can assign the custom role's base role (i.e., the actor is at a
 * higher tier than the custom role's tier).
 */
export function canAssignCustomRole(
  actorRole: string | undefined | null,
  customRoleTier: number,
): boolean {
  const actorTier = roleTier(actorRole);
  // Tier 5 can't assign anyone.
  if (actorTier >= 5) return false;
  // Actor must be at a higher tier (lower number) than the custom role.
  return actorTier < customRoleTier;
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
  // Project control / planning — BOQ, WBS, Measurement Book, EVM, budget variance
  BOQ_VIEW: "boq.view",
  BOQ_MANAGE: "boq.manage",
  WBS_VIEW: "wbs.view",
  WBS_MANAGE: "wbs.manage",
  MB_VIEW: "mb.view",
  MB_VERIFY: "mb.verify",
  MB_APPROVE: "mb.approve",
  PROJECT_CONTROL_VIEW: "project_control.view",
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
  // Rentals (equipment leasing to customers/projects)
  RENTALS_VIEW: "rentals.view",
  RENTALS_MANAGE: "rentals.manage",
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
  // Generic document attachments — link uploads to any entity
  ATTACHMENT_MANAGE: "attachment.manage",
  // Call tracking & recording
  CALL_VIEW: "call.view",
  CALL_VIEW_ALL: "call.view_all",
  CALL_VIEW_CHILD: "call.view_child_companies",
  CALL_VIEW_FULL_NUMBER: "call.view_full_number",
  CALL_CREATE: "call.create",
  CALL_EDIT: "call.edit",
  CALL_DELETE: "call.delete",
  CALL_MANAGE: "call.manage",
  CALL_RECORDING_LISTEN: "call.recording.listen",
  CALL_RECORDING_DELETE: "call.recording.delete",
  CALL_ANALYTICS: "call.analytics",
  TELEPHONY_VIEW: "telephony.view",
  TELEPHONY_MANAGE: "telephony.manage",
  // Safety — incidents, hazards, inspections
  SAFETY_VIEW: "safety.view",
  SAFETY_MANAGE: "safety.manage",
  // Quality control — NCRs and CAPA
  QC_VIEW: "qc.view",
  QC_MANAGE: "qc.manage",
  // Audit — view audit logs (before/after payloads)
  AUDIT_VIEW: "audit.view",
} as const;

export type Permission = (typeof PERM)[keyof typeof PERM];

export const ALL_PERMISSIONS: string[] = Object.values(PERM);

/**
 * Permission groups by module — used by the permissions UI to show
 * toggles grouped by functional area. Each module has a label, icon
 * name, and the list of permission keys that belong to it.
 */
export const PERMISSION_MODULES: {
  key: string;
  label: string;
  icon: string;
  permissions: string[];
}[] = [
  {
    key: "projects",
    label: "Projects & Planning",
    icon: "HardHat",
    permissions: [PERM.PROJECTS_VIEW, PERM.PROJECTS_MANAGE, PERM.BOQ_VIEW, PERM.BOQ_MANAGE, PERM.WBS_VIEW, PERM.WBS_MANAGE, PERM.MB_VIEW, PERM.MB_VERIFY, PERM.MB_APPROVE, PERM.PROJECT_CONTROL_VIEW],
  },
  {
    key: "inventory",
    label: "Inventory & Stock",
    icon: "Package",
    permissions: [PERM.INVENTORY_VIEW, PERM.INVENTORY_MANAGE, PERM.STOCK_TRANSFER, PERM.STOCK_ISSUE],
  },
  {
    key: "procurement",
    label: "Procurement",
    icon: "ShoppingCart",
    permissions: [PERM.PROCUREMENT_VIEW, PERM.PROCUREMENT_MANAGE, PERM.PO_APPROVE, PERM.REQUISITION_APPROVE, PERM.QUOTATION_VIEW, PERM.QUOTATION_MANAGE],
  },
  {
    key: "assets",
    label: "Assets & Land",
    icon: "MapPin",
    permissions: [PERM.ASSETS_VIEW, PERM.ASSETS_MANAGE, PERM.ASSET_SELL, PERM.LAND_PARTITION, PERM.LEGAL_MANAGE, PERM.RENTALS_VIEW, PERM.RENTALS_MANAGE],
  },
  {
    key: "finance",
    label: "Finance & Books",
    icon: "Calculator",
    permissions: [PERM.FINANCE_VIEW, PERM.FINANCE_MANAGE, PERM.EXPENSE_CREATE, PERM.EXPENSE_APPROVE],
  },
  {
    key: "sales",
    label: "Sales",
    icon: "TrendingUp",
    permissions: [PERM.SALES_VIEW, PERM.SALES_MANAGE, PERM.SALE_CREATE],
  },
  {
    key: "hr",
    label: "People & HR",
    icon: "Users",
    permissions: [PERM.HR_VIEW, PERM.HR_MANAGE, PERM.PAYROLL_VIEW, PERM.PAYROLL_MANAGE, PERM.DPR_SUBMIT, PERM.DPR_VIEW, PERM.DPR_APPROVE_SUB_ADMIN, PERM.DPR_APPROVE_ADMIN],
  },
  {
    key: "subcontractor",
    label: "Subcontractors & RA",
    icon: "FileText",
    permissions: [PERM.WO_MANAGE, PERM.RA_SUBMIT, PERM.RA_APPROVE, PERM.RA_PAY],
  },
  {
    key: "vehicles",
    label: "Vehicles",
    icon: "Truck",
    permissions: [PERM.VEHICLE_VIEW, PERM.VEHICLE_MANAGE],
  },
  {
    key: "gate",
    label: "Gate Pass",
    icon: "DoorOpen",
    permissions: [PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_APPROVE, PERM.GATE_PASS_EXIT, PERM.GATE_PASS_MANAGE],
  },
  {
    key: "tasks",
    label: "Tasks & Workflows",
    icon: "CheckSquare",
    permissions: [PERM.TASKS_VIEW, PERM.TASKS_ASSIGN, PERM.TASKS_MANAGE_ALL, PERM.WORKFLOWS_VIEW, PERM.WORKFLOWS_MANAGE, PERM.WORKFLOWS_RUN, PERM.CANVAS_VIEW, PERM.CANVAS_EDIT, PERM.CANVAS_CREATE],
  },
  {
    key: "calls",
    label: "Calls & Telephony",
    icon: "Phone",
    permissions: [PERM.CALL_VIEW, PERM.CALL_VIEW_ALL, PERM.CALL_VIEW_CHILD, PERM.CALL_VIEW_FULL_NUMBER, PERM.CALL_CREATE, PERM.CALL_EDIT, PERM.CALL_DELETE, PERM.CALL_MANAGE, PERM.CALL_RECORDING_LISTEN, PERM.CALL_RECORDING_DELETE, PERM.CALL_ANALYTICS, PERM.TELEPHONY_VIEW, PERM.TELEPHONY_MANAGE],
  },
  {
    key: "admin",
    label: "Admin & Settings",
    icon: "Settings",
    permissions: [PERM.USERS_VIEW, PERM.USERS_MANAGE, PERM.COMPANY_MANAGE, PERM.ATTACHMENT_MANAGE, PERM.AUDIT_VIEW],
  },
  {
    key: "safety",
    label: "Safety",
    icon: "ShieldAlert",
    permissions: [PERM.SAFETY_VIEW, PERM.SAFETY_MANAGE],
  },
  {
    key: "quality",
    label: "Quality Control",
    icon: "ClipboardCheck",
    permissions: [PERM.QC_VIEW, PERM.QC_MANAGE],
  },
];

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
  DEVELOPER: {
    key: "DEVELOPER",
    label: "Developer (God Mode)",
    description: "Platform developer — full access to everything + receives all user feedback.",
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
      PERM.ASSETS_VIEW, PERM.ASSETS_MANAGE, PERM.RENTALS_VIEW, PERM.RENTALS_MANAGE,
      PERM.BOQ_VIEW, PERM.BOQ_MANAGE, PERM.WBS_VIEW, PERM.WBS_MANAGE,
      PERM.MB_VIEW, PERM.MB_VERIFY, PERM.MB_APPROVE,
      PERM.PROJECT_CONTROL_VIEW,
      PERM.FINANCE_VIEW,
      PERM.HR_VIEW, PERM.DPR_VIEW, PERM.DPR_APPROVE_ADMIN,
      PERM.WO_MANAGE, PERM.RA_APPROVE,
      PERM.VEHICLE_VIEW,
      PERM.USERS_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_APPROVE, PERM.GATE_PASS_MANAGE,
      PERM.LEGAL_MANAGE,
      PERM.CALL_VIEW, PERM.CALL_VIEW_ALL, PERM.CALL_VIEW_CHILD, PERM.CALL_VIEW_FULL_NUMBER,
      PERM.CALL_CREATE, PERM.CALL_EDIT, PERM.CALL_RECORDING_LISTEN, PERM.CALL_ANALYTICS,
      PERM.TELEPHONY_VIEW,
      PERM.SAFETY_VIEW, PERM.SAFETY_MANAGE,
      PERM.QC_VIEW, PERM.QC_MANAGE,
      PERM.AUDIT_VIEW,
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
      PERM.ASSETS_VIEW, PERM.RENTALS_VIEW,
      PERM.BOQ_VIEW, PERM.WBS_VIEW, PERM.MB_VIEW, PERM.PROJECT_CONTROL_VIEW,
      PERM.HR_VIEW, PERM.PAYROLL_VIEW, PERM.PAYROLL_MANAGE, PERM.DPR_VIEW,
      PERM.RA_APPROVE, PERM.RA_PAY,
      PERM.VEHICLE_VIEW,
      PERM.USERS_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_APPROVE,
      PERM.LEGAL_MANAGE,
      PERM.CALL_VIEW, PERM.CALL_ANALYTICS,
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
      PERM.ASSETS_VIEW, PERM.ASSETS_MANAGE, PERM.RENTALS_VIEW, PERM.RENTALS_MANAGE,
      PERM.BOQ_VIEW, PERM.BOQ_MANAGE, PERM.WBS_VIEW, PERM.WBS_MANAGE,
      PERM.MB_VIEW, PERM.MB_VERIFY, PERM.MB_APPROVE, PERM.PROJECT_CONTROL_VIEW,
      PERM.FINANCE_VIEW, PERM.EXPENSE_CREATE,
      PERM.HR_VIEW, PERM.HR_MANAGE, PERM.DPR_VIEW, PERM.DPR_SUBMIT, PERM.DPR_APPROVE_SUB_ADMIN,
      PERM.WO_MANAGE, PERM.RA_SUBMIT,
      PERM.VEHICLE_VIEW, PERM.VEHICLE_MANAGE,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_APPROVE, PERM.GATE_PASS_MANAGE,
      PERM.LEGAL_MANAGE,
      PERM.CALL_VIEW, PERM.CALL_VIEW_ALL, PERM.CALL_VIEW_FULL_NUMBER,
      PERM.CALL_CREATE, PERM.CALL_EDIT, PERM.CALL_RECORDING_LISTEN, PERM.CALL_ANALYTICS,
      PERM.SAFETY_VIEW, PERM.SAFETY_MANAGE,
      PERM.QC_VIEW, PERM.QC_MANAGE,
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
      PERM.PROCUREMENT_VIEW, PERM.PROCUREMENT_MANAGE, PERM.PO_APPROVE, PERM.REQUISITION_APPROVE,
      PERM.QUOTATION_VIEW, PERM.QUOTATION_MANAGE,
      PERM.ASSETS_VIEW, PERM.RENTALS_VIEW,
      PERM.BOQ_VIEW, PERM.WBS_VIEW, PERM.MB_VIEW, PERM.PROJECT_CONTROL_VIEW,
      PERM.FINANCE_VIEW,
      PERM.VEHICLE_VIEW, PERM.VEHICLE_MANAGE,
      PERM.TASKS_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_APPROVE, PERM.GATE_PASS_MANAGE,
      PERM.CALL_VIEW, PERM.CALL_CREATE, PERM.CALL_EDIT,
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
      PERM.BOQ_VIEW, PERM.WBS_VIEW, PERM.MB_VIEW, PERM.PROJECT_CONTROL_VIEW,
      PERM.USERS_VIEW, PERM.USERS_MANAGE,
      PERM.TASKS_VIEW,
      PERM.GATE_PASS_VIEW,
      PERM.CALL_VIEW, PERM.CALL_CREATE, PERM.CALL_EDIT,
    ],
    canManageUsers: true,
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
      PERM.ASSETS_VIEW, PERM.RENTALS_VIEW,
      PERM.BOQ_VIEW, PERM.WBS_VIEW, PERM.MB_VIEW, PERM.MB_VERIFY, PERM.PROJECT_CONTROL_VIEW,
      PERM.HR_VIEW, PERM.DPR_VIEW, PERM.DPR_SUBMIT,
      PERM.TASKS_VIEW,
      PERM.VEHICLE_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_MANAGE,
      PERM.CALL_VIEW, PERM.CALL_CREATE, PERM.CALL_EDIT, PERM.CALL_RECORDING_LISTEN,
      PERM.SAFETY_VIEW, PERM.SAFETY_MANAGE,
      PERM.QC_VIEW,
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
      PERM.BOQ_VIEW, PERM.WBS_VIEW, PERM.MB_VIEW, PERM.PROJECT_CONTROL_VIEW,
      PERM.VEHICLE_VIEW, PERM.VEHICLE_MANAGE,
      PERM.TASKS_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_EXIT, PERM.GATE_PASS_MANAGE,
      PERM.CALL_VIEW, PERM.CALL_CREATE, PERM.CALL_EDIT,
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
      PERM.ASSETS_VIEW, PERM.RENTALS_VIEW,
      PERM.BOQ_VIEW, PERM.WBS_VIEW, PERM.MB_VIEW, PERM.PROJECT_CONTROL_VIEW,
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
      PERM.ASSETS_VIEW, PERM.ASSETS_MANAGE, PERM.ASSET_SELL, PERM.RENTALS_VIEW, PERM.RENTALS_MANAGE,
      PERM.PROJECTS_VIEW,
      PERM.QUOTATION_VIEW, PERM.QUOTATION_MANAGE,
      PERM.TASKS_VIEW,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_MANAGE,
      PERM.CALL_VIEW, PERM.CALL_VIEW_FULL_NUMBER, PERM.CALL_CREATE, PERM.CALL_EDIT,
      PERM.CALL_RECORDING_LISTEN, PERM.CALL_ANALYTICS,
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
      PERM.ASSETS_VIEW, PERM.RENTALS_VIEW,
      PERM.BOQ_VIEW, PERM.WBS_VIEW, PERM.MB_VIEW, PERM.MB_VERIFY, PERM.PROJECT_CONTROL_VIEW,
      PERM.HR_VIEW, PERM.DPR_VIEW, PERM.DPR_SUBMIT,
      PERM.GATE_PASS_VIEW, PERM.GATE_PASS_CREATE, PERM.GATE_PASS_EXIT,
      PERM.CALL_VIEW, PERM.CALL_CREATE, PERM.CALL_EDIT, PERM.CALL_RECORDING_LISTEN,
      PERM.SAFETY_VIEW, PERM.SAFETY_MANAGE,
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
      PERM.ASSETS_VIEW, PERM.RENTALS_VIEW,
      PERM.BOQ_VIEW, PERM.WBS_VIEW, PERM.MB_VIEW, PERM.MB_VERIFY, PERM.PROJECT_CONTROL_VIEW,
      PERM.HR_VIEW, PERM.DPR_VIEW, PERM.DPR_SUBMIT,
      PERM.TASKS_VIEW,
      PERM.GATE_PASS_VIEW,
      PERM.CALL_VIEW, PERM.CALL_CREATE,
      PERM.SAFETY_VIEW, PERM.SAFETY_MANAGE,
      PERM.QC_VIEW, PERM.QC_MANAGE,
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
 *
 * For custom roles (key starts with "CUSTOM_"), the caller should
 * resolve the base role via `resolveCustomRoleBase()` and pass the
 * custom role's permissions as overrides to `hasPermission`.
 */
export function normalizeRole(raw: string | undefined | null): Role {
  if (raw && raw in ROLES) return raw as Role;
  // Custom roles are not in the ROLES map — fall back to SUPERVISOR.
  // The actual permission resolution happens in getUserPermissions()
  // which looks up the custom role's base role + permissions from the DB.
  return "SUPERVISOR";
}

/** Check if a role string is a custom role (starts with "CUSTOM_"). */
export function isCustomRole(role: string | undefined | null): boolean {
  return !!role && role.startsWith("CUSTOM_");
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
export const APPROVER_ROLES: Role[] = ["OWNER", "ADMIN", "PROJECT_DIRECTOR", "PROJECT_MANAGER", "PROCUREMENT_MANAGER"];

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

/** Visual metadata for each built-in role (color, label, icon name). */
export const ROLE_META: Record<Role, { color: string; label: string; icon: string }> = {
  OWNER: { color: "var(--color-ink-500)", label: "Owner", icon: "Crown" },
  ADMIN: { color: "var(--color-ink-500)", label: "Admin", icon: "Shield" },
  DEVELOPER: { color: "var(--color-ink-500)", label: "Developer", icon: "Code" },
  PROJECT_DIRECTOR: { color: "var(--color-go)", label: "Project Director", icon: "UserCog" },
  FINANCE_HEAD: { color: "var(--color-go)", label: "Finance Head", icon: "UserCog" },
  PROJECT_MANAGER: { color: "var(--color-go)", label: "Project Manager", icon: "UserCog" },
  PROCUREMENT_MANAGER: { color: "var(--color-signal)", label: "Procurement Manager", icon: "CircleDot" },
  HR_MANAGER: { color: "var(--color-signal)", label: "HR Manager", icon: "CircleDot" },
  SITE_ENGINEER: { color: "var(--color-signal)", label: "Site Engineer", icon: "CircleDot" },
  STORE_KEEPER: { color: "var(--color-signal)", label: "Store Keeper", icon: "CircleDot" },
  ACCOUNTANT: { color: "var(--color-signal)", label: "Accountant", icon: "CircleDot" },
  SALES_MANAGER: { color: "var(--color-signal)", label: "Sales Manager", icon: "CircleDot" },
  SUPERVISOR: { color: "var(--color-signal)", label: "Supervisor", icon: "CircleDot" },
  QAQC_ENGINEER: { color: "var(--color-signal)", label: "QA/QC Engineer", icon: "CircleDot" },
};
