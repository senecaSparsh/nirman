import { prisma } from "@nirman/db";
import { z } from "zod";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  hasPermission,
  normalizeRole,
  canManageUsers,
  canAssignTasks,
  canManageWorkflows,
  canEditCanvas,
  effectivePermissions,
  APPROVER_ROLES,
  type Role,
} from "@/lib/roles";
import { logAction } from "@nirman/services";

/**
 * Server-side helpers shared by API routes and Server Components.
 *
 * The app is single-company for now ("One company, many projects"). This helper
 * returns the active company, creating a default one on first run so the app is
 * usable immediately after `db:push` without manual seeding.
 */
export async function getCompany() {
  const existing = await prisma.company.findFirst({
    where: { deletedAt: null },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return prisma.company.create({
    data: {
      name: "Nirman Constructions",
      currency: "INR",
    },
  });
}

/** Convert a Prisma Decimal (or string) to a JS number for client serialization. */
export function toNum(v: unknown): number {
  if (v == null) return 0;
  if (typeof v === "number") return v;
  const n = Number(String(v));
  return Number.isNaN(n) ? 0 : n;
}

// ───────────────────────────────────────────────────────────
//  Zod schemas — shared between API routes and client forms
// ───────────────────────────────────────────────────────────

export const materialCategorySchema = z.object({
  name: z.string().min(1, "Name is required").max(80),
  unit: z.string().min(1).max(20).default("NOS"),
});

export const materialSchema = z.object({
  code: z.string().min(1, "Code is required").max(40),
  name: z.string().min(1, "Name is required").max(120),
  categoryId: z.string().min(1, "Category is required"),
  unit: z.string().min(1).max(20).default("NOS"),
  hsnCode: z.string().max(20).optional().nullable(),
  gstRate: z.coerce.number().min(0).max(100).default(0),
  standardCost: z.coerce.number().min(0).default(0),
  minStock: z.coerce.number().min(0).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

export const stockLocationSchema = z.object({
  type: z.enum(["COMPANY_WAREHOUSE", "PROJECT_SITE"]),
  name: z.string().min(1, "Name is required").max(120),
  projectId: z.string().optional().nullable(),
  address: z.string().max(300).optional().nullable(),
});

export const projectTypeSchema = z.enum([
  "RESIDENTIAL",
  "COMMERCIAL",
  "WAREHOUSE",
  "MALL",
  "LAND",
  "OTHER",
]);

export const projectStatusSchema = z.enum([
  "PLANNED",
  "ACTIVE",
  "COMPLETED",
  "ON_HOLD",
]);

export const projectSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  type: projectTypeSchema.default("RESIDENTIAL"),
  status: projectStatusSchema.default("PLANNED"),
  address: z.string().max(300).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  totalBudget: z.coerce.number().min(0).optional().nullable(),
  description: z.string().max(2000).optional().nullable(),
});

export const projectPhaseSchema = z.object({
  name: z.string().min(1, "Name is required").max(120),
  status: projectStatusSchema.default("PLANNED"),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  budget: z.coerce.number().min(0).optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).default(0),
});

// ───────────────────────────────────────────────────────────
//  Procurement schemas
// ───────────────────────────────────────────────────────────

export const supplierSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  gstin: z.string().max(20).optional().nullable(),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().max(120).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
});

export const purchaseOrderLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qtyOrdered: z.coerce.number().min(0.001, "Quantity must be > 0"),
  unitCost: z.coerce.number().min(0, "Unit cost must be >= 0"),
  gstRate: z.coerce.number().min(0).max(100).default(0),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  procurementScope: z.enum(["COMPANY", "PROJECT"]),
  projectId: z.string().optional().nullable(),
  destinationLocationId: z.string().min(1, "Destination location is required"),
  expectedDate: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(purchaseOrderLineSchema).min(1, "At least one line item is required"),
});

export const receiveGoodsLineSchema = z.object({
  purchaseOrderLineId: z.string().min(1),
  materialId: z.string().min(1),
  qtyReceived: z.coerce.number().min(0.001, "Received quantity must be > 0"),
  unitCost: z.coerce.number().min(0, "Unit cost must be >= 0"),
});

export const receiveGoodsSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(receiveGoodsLineSchema).min(1, "At least one line is required"),
});

export const transferLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qty: z.coerce.number().min(0.001, "Quantity must be > 0"),
});

export const transferSchema = z.object({
  fromLocationId: z.string().min(1, "Source location is required"),
  toLocationId: z.string().min(1, "Destination location is required"),
  notes: z.string().max(2000).optional().nullable(),
  // Inter-company STO charges (only applied when from/to belong to different companies).
  freight: z.coerce.number().min(0).optional(),
  handlingFee: z.coerce.number().min(0).optional(),
  markupPct: z.coerce.number().min(0).max(100).optional(),
  lines: z.array(transferLineSchema).min(1, "At least one line is required"),
});

export const issueMaterialsSchema = z.object({
  // Consumption target — exactly one of projectId / departmentId must be set.
  // Enforced with a refine() below so the error message is meaningful.
  projectId: z.string().min(1).optional().nullable(),
  departmentId: z.string().min(1).optional().nullable(),
  fromLocationId: z.string().min(1, "Source location is required"),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(transferLineSchema).min(1, "At least one line is required"),
}).refine(
  (data) => (data.projectId ? !data.departmentId : !!data.departmentId),
  { message: "Specify either a project or a department (cost center) — not both, not neither.", path: ["projectId"] },
);

// ── Land ──
export const landPurchaseSchema = z.object({
  projectId: z.string().optional().nullable(),
  sellerName: z.string().min(1, "Seller name is required"),
  sellerContact: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  totalArea: z.coerce.number().positive("Total area must be > 0"),
  areaUnit: z.enum(["SQFT", "SQM", "ACRE", "BIGHA", "HECTARE"]).default("SQFT"),
  totalCost: z.coerce.number().positive("Total cost must be > 0"),
  registryNo: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  documentUrl: z.string().optional().nullable(),
  initialParcelNumber: z.string().optional(),
});

export const partitionSchema = z.object({
  parentParcelId: z.string().min(1),
  children: z.array(z.object({
    number: z.string().min(1, "Parcel number is required"),
    area: z.coerce.number().positive("Area must be > 0"),
    askingPrice: z.coerce.number().positive().optional(),
    geometry: z.any().optional(),
  })).min(2, "At least 2 children required"),
  notes: z.string().optional(),
});

export const parcelValuationSchema = z.object({
  currentValuation: z.coerce.number().nonnegative().optional(),
  askingPrice: z.coerce.number().positive().optional().nullable(),
});

// ── Built Units ──
export const builtUnitSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  phaseId: z.string().optional().nullable(),
  unitType: z.enum(["BHK_1", "BHK_2", "BHK_3", "BHK_4", "SHOP", "OFFICE", "WAREHOUSE_UNIT", "OTHER"]),
  unitNumber: z.string().min(1, "Unit number is required"),
  floor: z.coerce.number().int().optional().nullable(),
  wing: z.string().optional().nullable(),
  area: z.coerce.number().positive("Area must be > 0"),
  areaUnit: z.enum(["SQFT", "SQM", "ACRE", "BIGHA", "HECTARE"]).default("SQFT"),
  askingPrice: z.coerce.number().positive().optional().nullable(),
});

export const builtUnitStatusSchema = z.enum(["PLANNED", "UNDER_CONSTRUCTION", "AVAILABLE", "HOLD", "SOLD"]);
export const builtUnitValuationSchema = z.object({
  askingPrice: z.coerce.number().positive().optional().nullable(),
  currentValuation: z.coerce.number().nonnegative().optional(),
});

// ── Customers ──
export const customerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  phone: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable(),
  gstin: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
});

// ── Sales ──
export const sellAssetSchema = z.object({
  assetType: z.enum(["LAND", "BUILT_UNIT"]),
  landParcelId: z.string().optional().nullable(),
  builtUnitId: z.string().optional().nullable(),
  customerId: z.string().min(1, "Customer is required"),
  projectId: z.string().min(1, "Project is required"),
  salePrice: z.coerce.number().positive("Sale price must be > 0"),
  paymentMode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  initialPayment: z.coerce.number().nonnegative().optional(),
  initialPaymentMode: z.string().optional(),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be > 0"),
  mode: z.string().min(1, "Payment mode is required"),
  reference: z.string().optional().nullable(),
});

// ── Project Costs ──
export const projectCostSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  costType: z.enum(["LABOUR", "OVERHEAD", "EQUIPMENT", "CONTRACTOR", "PERMIT", "OTHER"]),
  amount: z.coerce.number().positive("Amount must be > 0"),
  date: z.string().optional().nullable(),
  vendor: z.string().optional().nullable(),
  subcontractorId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
});

// ── Equipment ──
export const equipmentSchema = z.object({
  assetTag: z.string().min(1, "Asset tag is required"),
  name: z.string().min(1, "Name is required"),
  model: z.string().optional().nullable(),
  serialNumber: z.string().optional().nullable(),
  category: z.string().optional().nullable(),
  acquisitionCost: z.coerce.number().nonnegative("Cost must be >= 0"),
  purchaseDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const equipmentAssignSchema = z.object({
  equipmentId: z.string().min(1),
  locationId: z.string().min(1),
  projectId: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const equipmentMaintenanceSchema = z.object({
  equipmentId: z.string().min(1),
  type: z.enum(["SCHEDULED", "REPAIR", "INSPECTION"]),
  cost: z.coerce.number().nonnegative().optional(),
  vendor: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

// ── Requisitions ──
export const requisitionLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qtyRequested: z.coerce.number().positive("Quantity must be > 0"),
  notes: z.string().optional().nullable(),
});

export const requisitionSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  phaseId: z.string().optional().nullable(),
  neededByDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(requisitionLineSchema).min(1, "At least one line is required"),
});

// ── Subcontractor ──
export const subcontractorSchema = z.object({
  name: z.string().min(1, "Name is required"),
  gstin: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable(),
  address: z.string().optional().nullable(),
  trade: z.string().optional().nullable(),
});

// ── Employee (playground task assignee) ──
export const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  trade: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable(),
  dailyRate: z.coerce.number().nonnegative("Daily rate must be >= 0").optional().nullable(),
  active: z.boolean().optional(),
});

// ── Department / cost center ──
export const departmentSchema = z.object({
  code: z.string().min(1, "Code is required").max(40).trim().toUpperCase(),
  name: z.string().min(1, "Name is required").max(120),
  description: z.string().max(500).optional().nullable(),
  active: z.boolean().optional(),
});

// ── Supplier Return ──
export const supplierReturnLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qty: z.coerce.number().positive("Quantity must be > 0"),
  unitCost: z.coerce.number().nonnegative("Unit cost must be >= 0"),
  reason: z.string().optional().nullable(),
});

export const supplierReturnSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  purchaseOrderId: z.string().optional().nullable(),
  locationId: z.string().min(1, "Source location is required"),
  creditNoteNo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(supplierReturnLineSchema).min(1, "At least one line is required"),
});

// ── Tasks ──
export const taskSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  description: z.string().max(2000).optional().nullable(),
  instructions: z.string().max(5000).optional().nullable(),
  assignedToId: z.string().min(1, "Assignee is required"),
  priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  dueDate: z.string().optional().nullable(),
  workspaceId: z.string().optional().nullable(),
  nodeLabel: z.string().max(200).optional().nullable(),
  estimateMins: z.coerce.number().int().min(1).max(60000).optional().nullable(),
  subtasks: z.array(z.string().min(1).max(200)).max(100).optional(),
});

export const taskStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "COMPLETED", "CANCELLED"]);

export const subTaskSchema = z.object({
  title: z.string().min(1, "Step title is required").max(200),
});

// ── Workflows ──
export const workflowSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  description: z.string().max(2000).optional().nullable(),
  icon: z.string().max(60).default("Workflow"),
  graphJson: z.any(),
});

export const workflowScheduleSchema = z.object({
  cron: z.string().max(100).optional().nullable(),
  intervalM: z.coerce.number().int().min(1).optional().nullable(),
  enabled: z.boolean().default(true),
});

// ── User role management ──
export const userRoleSchema = z.object({
  role: z.enum(["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "SALES", "ACCOUNTANT"]),
  active: z.boolean().optional(),
});

/** Standard JSON API response helper. */
export function json(body: unknown, init?: ResponseInit) {
  return Response.json(body, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
}

/**
 * Get the authenticated session from the current request, or null if not
 * authenticated. In development with AUTH_BYPASS=true, returns a synthetic
 * session so the app is usable before a user is created.
 */
export async function getSession() {
  // Dev bypass: skip auth entirely when AUTH_BYPASS=true (default in dev)
  if (process.env.AUTH_BYPASS === "true" || process.env.NODE_ENV !== "production") {
    return {
      user: {
        id: "dev",
        email: "dev@nirman.local",
        name: "Developer",
        role: "ADMIN" as const,
        companyId: null as string | null,
        active: true,
      },
    };
  }
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session;
  } catch {
    return null;
  }
}

/** Typed shape of the current user derived from the session. */
export interface CurrentUser {
  id: string;
  email: string;
  name: string;
  role: Role;
  companyId: string | null;
  active: boolean;
}

/**
 * Get the authenticated user as a typed object, or null. Resolves the
 * effective role from the default `User.role` (and, when a company
 * scope is active, the `UserCompany.role` membership takes precedence).
 *
 * Validates the user still exists in the DB — a stale session cookie
 * (e.g. after a DB re-seed) would otherwise produce FK violations when
 * the user ID is used as a foreign key in transactional records.
 *
 * In dev-bypass mode (AUTH_BYPASS=true or non-production NODE_ENV), the
 * synthetic "dev" user is returned without DB validation since it doesn't
 * exist in the DB — this is intentional for local development.
 */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  const session = await getSession();
  if (!session?.user) return null;
  const u = session.user as {
    id: string;
    email?: string;
    name?: string;
    role?: string;
    companyId?: string | null;
    active?: boolean;
  };

  // Dev-bypass mode: return the synthetic user without DB validation.
  // The synthetic "dev" user doesn't exist in the DB — validating it
  // would break all API calls in development.
  const isDevBypass = process.env.AUTH_BYPASS === "true" || process.env.NODE_ENV !== "production";
  if (isDevBypass && u.id === "dev") {
    return {
      id: u.id,
      email: u.email ?? "",
      name: u.name ?? "",
      role: normalizeRole(u.role),
      companyId: u.companyId ?? null,
      active: u.active ?? true,
    };
  }

  // Production / real session: validate the user still exists in the DB.
  const exists = await prisma.user.findUnique({
    where: { id: u.id },
    select: { id: true, role: true, companyId: true, active: true },
  });
  if (!exists) return null;
  const role = normalizeRole(exists.role ?? u.role);
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name ?? "",
    role,
    companyId: exists.companyId ?? null,
    active: exists.active ?? true,
  };
}

/**
 * Get the current user's role (normalized). Falls back to MANAGER.
 */
export async function getUserRole(): Promise<string> {
  const user = await getCurrentUser();
  return user?.role ?? "MANAGER";
}

/**
 * Get the current user's effective permission list (role matrix +
 * any additive RolePermission overrides from the DB). Cached per
 * request via a module-level memo would be nice but is not required
 * for correctness.
 */
export async function getUserPermissions(): Promise<string[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const overrides = await prisma.rolePermission
    .findMany({ where: { role: user.role }, select: { permission: true } })
    .then((rows) => rows.map((r) => r.permission))
    .catch(() => [] as string[]);
  return effectivePermissions(user.role, overrides);
}

/** Error thrown when a permission/role check fails — caught by apiHandler. */
export class ForbiddenError extends Error {
  status = 403;
  constructor(message = "Forbidden — your role does not have permission for this action") {
    super(message);
    this.name = "ForbiddenError";
  }
}

/** Error thrown when no authenticated session is found. */
export class UnauthorizedError extends Error {
  status = 401;
  constructor(message = "Unauthorized") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

/**
 * Throw ForbiddenError if the current user lacks the permission.
 * Call inside an apiHandler / route body. Resolves overrides from DB.
 */
export async function requirePermission(permission: string): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.active) throw new ForbiddenError("Your account is inactive.");
  const perms = await getUserPermissions();
  // OWNER/ADMIN have "*" → effectivePermissions returns ALL_PERMISSIONS,
  // so this also covers superusers.
  if (!perms.includes(permission)) throw new ForbiddenError();
  return user;
}

/**
 * Throw ForbiddenError if the current user's role is not at least the
 * given role (OWNER > ADMIN > MANAGER > SUPERVISOR/SALES/ACCOUNTANT).
 * "At least" here means: the user's role is in the allowed set OR is
 * OWNER/ADMIN (superuser).
 */
export async function requireRole(...allowed: Role[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.active) throw new ForbiddenError("Your account is inactive.");
  if (user.role === "OWNER" || user.role === "ADMIN") return user;
  if (!allowed.includes(user.role)) throw new ForbiddenError();
  return user;
}

/** Require the current user to be authenticated (any role). */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.active) throw new ForbiddenError("Your account is inactive.");
  return user;
}

/**
 * Wrap an API handler with auth + error handling.
 * Returns 401 if no session is found (unless AUTH_BYPASS is set).
 * Mutations (POST/PATCH/PUT/DELETE) automatically write an AuditLog
 * entry on success when `audit` options are provided.
 */
export function apiHandler<TReq extends Request = Request>(
  fn: (req: TReq, ctx: any) => Promise<Response>,
  opts: { audit?: { action: string; entityType: string; entityIdFrom?: (req: TReq, res: Response) => string | undefined } } = {},
) {
  return async (req: Request, ctx: any): Promise<Response> => {
    try {
      const session = await getSession();
      if (!session) {
        return json({ error: "Unauthorized" }, { status: 401 });
      }
      const res = await fn(req as TReq, ctx);
      // Best-effort audit logging for mutations
      if (opts.audit && (req.method === "POST" || req.method === "PATCH" || req.method === "PUT" || req.method === "DELETE")) {
        try {
          const user = await getCurrentUser();
          const entityId = opts.audit.entityIdFrom?.(req as TReq, res);
          if (entityId) {
            await logAction(prisma, {
              userId: user?.id,
              action: opts.audit.action,
              entityType: opts.audit.entityType,
              entityId,
            });
          }
        } catch {
          // audit failure must never break the response
        }
      }
      return res;
    } catch (err: any) {
      const message = err?.message ?? "Internal server error";
      const status = err?.status ?? 500;
      return json({ error: message }, { status });
    }
  };
}

/**
 * Wrap an API handler that requires a specific permission.
 * Returns 403 if the user's role lacks the permission.
 */
export function apiHandlerWithPermission<TReq extends Request = Request>(
  permission: string,
  fn: (req: TReq, ctx: any) => Promise<Response>,
) {
  return async (req: Request, ctx: any): Promise<Response> => {
    try {
      await requirePermission(permission);
      return await fn(req as TReq, ctx);
    } catch (err: any) {
      const message = err?.message ?? "Internal server error";
      const status = err?.status ?? 500;
      return json({ error: message }, { status });
    }
  };
}

/**
 * Wrap an API handler that requires one of the given roles.
 */
export function apiHandlerWithRole<TReq extends Request = Request>(
  allowed: Role[],
  fn: (req: TReq, ctx: any) => Promise<Response>,
) {
  return async (req: Request, ctx: any): Promise<Response> => {
    try {
      await requireRole(...allowed);
      return await fn(req as TReq, ctx);
    } catch (err: any) {
      const message = err?.message ?? "Internal server error";
      const status = err?.status ?? 500;
      return json({ error: message }, { status });
    }
  };
}

/** Roles allowed to view the procurement approvals queue. */
export const APPROVAL_QUEUE_ROLES = APPROVER_ROLES;
