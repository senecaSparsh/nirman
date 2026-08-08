import { prisma } from "@nirman/db";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  normalizeRole,
  effectivePermissions,
  APPROVER_ROLES,
  type Role,
} from "@/lib/roles";
import { logAction, resolveUserScope } from "@nirman/services";

/**
 * Server-side helpers shared by API routes and Server Components.
 */
export async function getCompany() {
  const user = await getCurrentUser();
  const selectedId = (await cookies()).get("nirman-company-id")?.value;
  const isDevBypass = process.env.AUTH_BYPASS === "true";

  if (selectedId) {
    const selected = await prisma.company.findFirst({
      where: {
        id: selectedId,
        deletedAt: null,
        ...(isDevBypass ? {} : { userMemberships: { some: { userId: user?.id } } }),
      },
    });
    if (selected) return selected;
  }

  if (user?.companyId) {
    const assigned = await prisma.company.findFirst({
      where: { id: user.companyId, deletedAt: null },
    });
    if (assigned) return assigned;
  }

  // In dev-bypass mode, fall back to any company (no membership filter).
  // In production, filter by the user's memberships — but if the user has no
  // memberships at all, fall back to any company rather than failing.
  const existing = await prisma.company.findFirst({
    where: {
      deletedAt: null,
      ...(isDevBypass || !user ? {} : { userMemberships: { some: { userId: user.id } } }),
    },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  // Last resort: if no company matched the membership filter, try any company.
  if (!isDevBypass && user) {
    const anyCompany = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (anyCompany) return anyCompany;
  }

  return prisma.company.create({
    data: {
      name: "Nirman Constructions",
      currency: "INR",
      ...(user && !isDevBypass
        ? { userMemberships: { create: { userId: user.id, role: user.role } } }
        : {}),
    },
  });
}

/**
 * Returns the IDs of all companies in the current company's *group* —
 * the current company itself plus its siblings (shared parent), its direct
 * parent, and its direct children. Used to scope cross-company operations
 * (e.g. inter-company Stock Transfer Order destinations) to the same group,
 * matching the parent/child company hierarchy (ABP Group → Testify + ABP Realty).
 *
 * A standalone company (no parent, no children) returns just [currentId].
 */
export async function getCompanyGroupIds(current?: { id: string; parentCompanyId: string | null }): Promise<string[]> {
  const company = current ?? (await getCompany());
  // Collect: self, parent, siblings (same parent, excluding self), direct children.
  const ids = new Set<string>([company.id]);
  if (company.parentCompanyId) {
    ids.add(company.parentCompanyId);
    // Siblings: other companies sharing the same parent.
    const siblings = await prisma.company.findMany({
      where: { parentCompanyId: company.parentCompanyId, deletedAt: null, id: { not: company.id } },
      select: { id: true },
    });
    siblings.forEach((s) => ids.add(s.id));
  }
  const children = await prisma.company.findMany({
    where: { parentCompanyId: company.id, deletedAt: null },
    select: { id: true },
  });
  children.forEach((c) => ids.add(c.id));
  return [...ids];
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
  reorderPoint: z.coerce.number().min(0).optional().nullable(),
  economicOrderQty: z.coerce.number().min(0).optional().nullable(),
  volumetricDensity: z.coerce.number().min(0).optional().nullable(),
  bulkDiscountPct: z.coerce.number().min(0).max(100).optional().nullable(),
  isCorporateCommodity: z.boolean().optional().default(false),
  description: z.string().max(500).optional().nullable(),
});

export const stockLocationSchema = z.object({
  type: z.enum(["COMPANY_WAREHOUSE", "PROJECT_SITE"]),
  name: z.string().min(1, "Name is required").max(120),
  projectId: z.string().optional().nullable(),
  address: z.string().max(300).optional().nullable(),
});

export const stockCountSchema = z.object({
  locationId: z.string().min(1, "Location is required"),
  notes: z.string().max(2000).optional().nullable(),
  lines: z
    .array(
      z.object({
        materialId: z.string().min(1),
        countedQty: z.coerce.number().min(0),
      }),
    )
    .min(1, "At least one line is required"),
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
  totalSellableArea: z.coerce.number().min(0).optional().nullable(),
  lciThreshold: z.coerce.number().min(0).max(100).optional().nullable(),
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
  leadTimeDays: z.coerce.number().int().min(0).optional().nullable(),
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
  lotNumber: z.string().max(80).optional().nullable(),
});

export const receiveGoodsSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(receiveGoodsLineSchema).min(1, "At least one line is required"),
});

export const transferLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qty: z.coerce.number().min(0.001, "Quantity must be > 0"),
  lotNumber: z.string().max(80).optional().nullable(),
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
  builtUnitId: z.string().min(1).optional().nullable(),  // optional: issue to a specific unit within the project
  fromLocationId: z.string().min(1, "Source location is required"),
  notes: z.string().max(2000).optional().nullable(),
  // Receiver accountability — who physically picked up the stock
  receiverName: z.string().max(200).optional().nullable(),
  receiverMobile: z.string().max(20).optional().nullable(),
  // Round-off to match physical bill totals
  roundOff: z.coerce.number().optional().nullable(),
  lines: z.array(transferLineSchema).min(1, "At least one line is required"),
}).refine(
  (data) => (data.projectId ? !data.departmentId : !!data.departmentId),
  { message: "Specify either a project or a department (cost centre) — not both, not neither.", path: ["projectId"] },
);

// ── Land ──
export const landPurchaseSchema = z.object({
  projectId: z.string().optional().nullable(),
  sellerName: z.string().min(1, "Seller name is required"),
  sellerContact: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  totalArea: z.coerce.number().positive("Total area must be > 0"),
  areaUnit: z.enum(["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"]).default("SQFT"),
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
    isInfrastructure: z.boolean().optional(),
    marketValue: z.coerce.number().nonnegative().optional(),
    weightFactor: z.coerce.number().positive().optional(),
    geometry: z.any().optional(),
  })).min(2, "At least 2 children required"),
  notes: z.string().optional(),
  allocationModel: z.enum(["PRO_RATA", "MARKET_VALUE"]).default("PRO_RATA"),
  developmentCost: z.coerce.number().nonnegative().optional(),
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
  areaUnit: z.enum(["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"]).default("SQFT"),
  askingPrice: z.coerce.number().positive().optional().nullable(),
});

export const builtUnitStatusSchema = z.enum(["PLANNED", "UNDER_CONSTRUCTION", "AVAILABLE", "HOLD", "SOLD"]);
export const builtUnitValuationSchema = z.object({
  askingPrice: z.coerce.number().positive().optional().nullable(),
  currentValuation: z.coerce.number().nonnegative().optional(),
});

// Edit an existing built unit's core attributes (no project/phase change).
export const builtUnitEditSchema = z.object({
  unitType: z.enum(["BHK_1", "BHK_2", "BHK_3", "BHK_4", "SHOP", "OFFICE", "WAREHOUSE_UNIT", "VILLA", "OTHER"]),
  unitNumber: z.string().min(1, "Unit number is required"),
  floor: z.coerce.number().int().optional().nullable(),
  wing: z.string().optional().nullable(),
  area: z.coerce.number().positive("Area must be > 0"),
  areaUnit: z.enum(["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"]),
  askingPrice: z.coerce.number().positive().optional().nullable(),
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
  gstRate: z.coerce.number().nonnegative().max(28).optional(),
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

export const depositSchema = z.object({
  depositAmount: z.coerce.number().positive("Deposit amount must be > 0"),
  paymentMode: z.string().optional(),
  reference: z.string().optional().nullable(),
});

export const completeSaleSchema = z.object({
  finalPaymentAmount: z.coerce.number().nonnegative().optional(),
  paymentMode: z.string().optional(),
  reference: z.string().optional().nullable(),
});

// ── Material Sales ──
export const materialSaleLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  locationId: z.string().min(1, "Stock location is required"),
  qty: z.coerce.number().positive("Quantity must be > 0"),
  unitPrice: z.coerce.number().positive("Unit price must be > 0"),
  gstRate: z.coerce.number().nonnegative().max(28).optional(),
});

export const materialSaleSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  projectId: z.string().optional().nullable(),
  lines: z.array(materialSaleLineSchema).min(1, "At least one line item is required"),
  paymentMode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

// ── Renovation / Value-Add ──
export const renovationSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  type: z.enum(["RENOVATION", "ADDITION", "VALUE_ADD", "REPAIR"]),
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  builtUnitId: z.string().optional().nullable(),
  landParcelId: z.string().optional().nullable(),
  budget: z.coerce.number().nonnegative().optional(),
  startDate: z.string().optional().nullable(),
});

export const renovationCostSchema = z.object({
  renovationProjectId: z.string().min(1, "Renovation project is required"),
  costType: z.enum(["LABOUR", "OVERHEAD", "EQUIPMENT", "CONTRACTOR", "PERMIT", "OTHER"]),
  amount: z.coerce.number().positive("Amount must be > 0"),
  vendor: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  receiptUrl: z.string().optional().nullable(),
});

// ── Leave Requests ──
export const leaveRequestSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  type: z.enum(["CASUAL", "SICK", "EARNED", "UNPAID", "MATERNITY", "PATERNITY"]).optional(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  reason: z.string().optional().nullable(),
});

export const leaveActionSchema = z.object({
  approve: z.boolean(),
  rejectedReason: z.string().optional().nullable(),
});

// ── Tenancy (Rent/Lease) ──
export const tenancySchema = z.object({
  assetType: z.enum(["LAND", "BUILT_UNIT"]),
  landParcelId: z.string().optional().nullable(),
  builtUnitId: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  tenantName: z.string().min(1, "Tenant name is required"),
  tenantPhone: z.string().optional().nullable(),
  tenantEmail: z.string().email("Invalid email").optional().nullable(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  monthlyRent: z.coerce.number().positive("Monthly rent must be > 0"),
  securityDeposit: z.coerce.number().nonnegative().optional(),
  rentAgreementNo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const editTenancySchema = z.object({
  tenantName: z.string().min(1, "Tenant name is required"),
  tenantPhone: z.string().optional().nullable(),
  tenantEmail: z.string().email("Invalid email").optional().nullable(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  monthlyRent: z.coerce.number().positive("Monthly rent must be > 0"),
  securityDeposit: z.coerce.number().nonnegative().optional(),
  rentAgreementNo: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
});

export const rentPaymentSchema = z.object({
  amount: z.coerce.number().positive("Amount must be > 0"),
  paymentDate: z.string().optional(),
  dueDate: z.string().optional(),
  mode: z.string().min(1, "Payment mode is required"),
  reference: z.string().optional().nullable(),
});

// ── Daily Reports ──
export const dailyReportSchema = z.object({
  projectId: z.string().optional().nullable(),
  date: z.string().min(1, "Date is required"),
  attendanceSummary: z.string().optional().nullable(),
  workDone: z.string().min(1, "Work done is required"),
  materialUsed: z.string().optional().nullable(),
  equipment: z.string().optional().nullable(),
  delay: z.string().optional().nullable(),
  remarks: z.string().optional().nullable(),
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
  preferredSupplierId: z.string().optional().nullable(),
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

// ── Employee (HR module — workers, wages, crews) ──
export const employeeSchema = z.object({
  name: z.string().min(1, "Name is required"),
  trade: z.string().optional().nullable(),
  phone: z.string().optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable(),
  dailyRate: z.coerce.number().nonnegative("Daily rate must be >= 0").optional().nullable(),
  wageType: z.enum(["DAILY", "MONTHLY", "FIXED"]).optional(),
  monthlySalary: z.coerce.number().nonnegative().optional().nullable(),
  designation: z.string().optional().nullable(),
  joinDate: z.string().optional().nullable(),
  crewId: z.string().optional().nullable(),
  activeProjectId: z.string().optional().nullable(),
  active: z.boolean().optional(),
});

// ── Crew ──
export const crewSchema = z.object({
  name: z.string().min(1, "Crew name is required").max(120),
  projectId: z.string().optional().nullable(),
  supervisorId: z.string().optional().nullable(),
  memberIds: z.array(z.string()).optional(),
  active: z.boolean().optional(),
});

// ── Attendance ──
export const attendanceSchema = z.object({
  employeeId: z.string().min(1, "Employee is required"),
  date: z.string().min(1, "Date is required"),
  projectId: z.string().optional().nullable(),
  checkIn: z.string().optional().nullable(),
  checkOut: z.string().optional().nullable(),
  hoursWorked: z.coerce.number().min(0).max(24).optional().nullable(),
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "OVERTIME", "LEAVE"]),
  notes: z.string().max(500).optional().nullable(),
});

export const bulkAttendanceSchema = z.object({
  date: z.string().min(1, "Date is required"),
  projectId: z.string().optional().nullable(),
  records: z.array(z.object({
    employeeId: z.string().min(1),
    status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "OVERTIME", "LEAVE"]),
    checkIn: z.string().optional().nullable(),
    checkOut: z.string().optional().nullable(),
    hoursWorked: z.coerce.number().min(0).max(24).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    checkInLat: z.number().optional().nullable(),
    checkInLng: z.number().optional().nullable(),
    checkOutLat: z.number().optional().nullable(),
    checkOutLng: z.number().optional().nullable(),
    checkInLocation: z.string().max(300).optional().nullable(),
    checkOutLocation: z.string().max(300).optional().nullable(),
  })).min(1, "At least one attendance record is required"),
});

// ── Payroll ──
export const generatePayrollSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
});

export const payrollLineUpdateSchema = z.object({
  overtimeAmount: z.coerce.number().nonnegative().optional(),
  allowance: z.coerce.number().nonnegative().optional(),
  bonus: z.coerce.number().nonnegative().optional(),
  pf: z.coerce.number().nonnegative().optional(),
  tax: z.coerce.number().nonnegative().optional(),
  deductions: z.coerce.number().nonnegative().optional(),
});

// ── DPR (Daily Progress Report) ──
export const dprMaterialLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qty: z.coerce.number().positive("Quantity must be > 0"),
  unitCost: z.coerce.number().nonnegative("Unit cost must be >= 0"),
});

export const dprLaborLineSchema = z.object({
  employeeId: z.string().optional().nullable(),
  crewId: z.string().optional().nullable(),
  hoursWorked: z.coerce.number().positive("Hours must be > 0"),
  taskDescription: z.string().min(1, "Task description is required").max(300),
}).refine(
  (data) => data.employeeId || data.crewId,
  { message: "Specify either an employee or a crew", path: ["employeeId"] },
);

export const dprSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  date: z.string().min(1, "Date is required"),
  weather: z.string().max(200).optional().nullable(),
  workSummary: z.string().min(1, "Work summary is required").max(2000),
  workType: z.string().max(200).optional().nullable(),
  workQty: z.coerce.number().positive("Work qty must be > 0").optional().nullable(),
  workUnit: z.string().max(50).optional().nullable(),
  progressPct: z.coerce.number().min(0).max(100).optional().nullable(),
  blockers: z.string().max(1000).optional().nullable(),
  tomorrowPlan: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  materialLines: z.array(dprMaterialLineSchema).optional(),
  laborLines: z.array(dprLaborLineSchema).optional(),
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
 * Cached dev-bypass user — resolved once from the DB (first OWNER) so that
 * mutations which record `userId` (requisitions, POs, audit logs, etc.) don't
 * fail with FK violations on a non-existent "dev" id.
 */
let _devUser: { id: string; email: string; name: string; role: string; companyId: string | null } | null = null;

async function getDevBypassUser() {
  if (_devUser) return _devUser;
  // Prefer the first OWNER (full permissions); fall back to ADMIN, then any
  // user; fall back to synthetic "dev" only if the DB has no users at all.
  const rolePriority = ["OWNER", "ADMIN", "MANAGER", "SUPERVISOR", "SALES", "ACCOUNTANT"];
  let u = null;
  for (const role of rolePriority) {
    u = await prisma.user.findFirst({
      where: { role },
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });
    if (u) break;
  }
  if (!u) {
    u = await prisma.user.findFirst({
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });
  }
  _devUser = u
    ? { id: u.id, email: u.email, name: u.name, role: u.role ?? "ADMIN", companyId: u.companyId }
    : { id: "dev", email: "dev@nirman.local", name: "Developer", role: "ADMIN", companyId: null };
  return _devUser;
}

/**
 * Get the authenticated session from the current request, or null if not
 * authenticated. When AUTH_BYPASS=true is set explicitly, returns a session
 * backed by the first real user in the DB (so mutations that record userId
 * work) — or a synthetic "dev" user only if the DB has no users yet. By
 * default (no AUTH_BYPASS), dev uses real Better-Auth sessions so that
 * sign-in / sign-out and per-role one-click login work end-to-end.
 */
export async function getSession() {
  // Dev bypass: skip auth entirely ONLY when AUTH_BYPASS=true is set
  // explicitly. By default (no env var), dev uses real Better-Auth sessions
  // so sign-in / sign-out and one-click role login work end-to-end.
  if (process.env.AUTH_BYPASS === "true") {
    const u = await getDevBypassUser();
    return {
      user: {
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        companyId: u.companyId,
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
 * In dev-bypass mode (AUTH_BYPASS=true set explicitly), the synthetic
 * "dev" user is returned without DB validation since it doesn't exist in
 * the DB — this is intentional for local development.
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

  // Dev-bypass mode: the session already resolved to a real DB user (via
  // getDevBypassUser) or the synthetic "dev" fallback (empty DB before seeding).
  // For the synthetic fallback, return as-is without DB validation.
  const isDevBypass = process.env.AUTH_BYPASS === "true";
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

  // Production / real session (or dev-bypass with a real DB user): validate
  // the user still exists — a stale session cookie (e.g. after a DB re-seed)
  // would otherwise produce FK violations when the user ID is used as a
  // foreign key in transactional records.
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
 * Get the current user's assigned project IDs (from ProjectAssignment).
 * Returns null if the user is unscoped (OWNER/ADMIN/MANAGER — sees all projects).
 * Returns an array of project IDs if the user has project assignments.
 * An empty array means the user is scoped but has no assignments (sees nothing).
 */
export async function getAssignedProjectIds(): Promise<string[] | null> {
  const user = await getCurrentUser();
  if (!user) return null;
  // OWNER, ADMIN, MANAGER are unscoped — they see all projects
  if (user.role === "OWNER" || user.role === "ADMIN" || user.role === "MANAGER") {
    return null; // null = unscoped (all projects)
  }
  // SUPERVISOR, SALES, ACCOUNTANT are scoped to their assigned projects.
  // Prefer the hierarchical UserScope (PROJECT scope) when present; fall back
  // to the legacy ProjectAssignment table for backwards compatibility.
  const company = await getCompany();
  const hierarchical = await resolveUserScope(user.id, company.id);
  if (hierarchical && hierarchical.scopeType === "PROJECT" && hierarchical.projectIds.length > 0) {
    return hierarchical.projectIds;
  }
  const assignments = await prisma.projectAssignment.findMany({
    where: { userId: user.id },
    select: { projectId: true },
  });
  return assignments.map((a) => a.projectId);
}

/**
 * Resolve the current user's hierarchical scope (Admin → Sub-Admin →
 * Sub-Sub-Admin) within the active company. Returns:
 *   - { scopeType: "COMPANY", ... } → unscoped, list APIs apply no filter
 *   - { scopeType: "DEPARTMENT", departmentIds } → filter lists to these depts
 *   - { scopeType: "PROJECT", projectIds } → filter lists to these projects
 * Falls back to COMPANY scope when the user has no membership (dev-bypass) so
 * the app keeps working in headless dev.
 */
export async function getUserScope() {
  const user = await getCurrentUser();
  const company = await getCompany();
  if (!user) {
    return { scopeType: "COMPANY" as const, departmentIds: [], projectIds: [] };
  }
  const scope = await resolveUserScope(user.id, company.id);
  if (!scope) {
    return { scopeType: "COMPANY" as const, departmentIds: [], projectIds: [] };
  }
  return scope;
}

/**
 * Check if the current user has access to a specific project.
 * Unscoped users (OWNER/ADMIN/MANAGER) always have access.
 * Scoped users must have a ProjectAssignment for the project.
 */
export async function canAccessProject(projectId: string): Promise<boolean> {
  const assigned = await getAssignedProjectIds();
  if (assigned === null) return true; // unscoped
  return assigned.includes(projectId);
}

/**
 * Build a Prisma `where` clause for project-scoped queries.
 * Returns `{ id: { in: [...] } }` for scoped users, or `undefined`
 * for unscoped users (no filter — see all projects).
 */
export async function projectScopeFilter(): Promise<{ id: { in: string[] } } | undefined> {
  const assigned = await getAssignedProjectIds();
  if (assigned === null) return undefined;
  return { id: { in: assigned } };
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
export function apiHandler<TReq extends Request = Request, TCtx = unknown>(
  fn: (req: TReq, ctx: TCtx) => Promise<Response>,
  opts: { audit?: { action: string; entityType: string; entityIdFrom?: (req: TReq, res: Response) => string | undefined } } = {},
) {
  return async (req: Request, ctx: TCtx): Promise<Response> => {
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
    } catch (err: unknown) {
      const message = (err instanceof Error ? err.message : "Internal server error");
      const status = (err as { status?: number })?.status ?? 500;
      return json({ error: message }, { status });
    }
  };
}

/**
 * Wrap an API handler that requires a specific permission.
 * Returns 403 if the user's role lacks the permission.
 */
export function apiHandlerWithPermission<TReq extends Request = Request, TCtx = unknown>(
  permission: string,
  fn: (req: TReq, ctx: TCtx) => Promise<Response>,
) {
  return async (req: Request, ctx: TCtx): Promise<Response> => {
    try {
      await requirePermission(permission);
      return await fn(req as TReq, ctx);
    } catch (err: unknown) {
      const message = (err instanceof Error ? err.message : "Internal server error");
      const status = (err as { status?: number })?.status ?? 500;
      return json({ error: message }, { status });
    }
  };
}

/**
 * Wrap an API handler that requires one of the given roles.
 */
export function apiHandlerWithRole<TReq extends Request = Request, TCtx = unknown>(
  allowed: Role[],
  fn: (req: TReq, ctx: TCtx) => Promise<Response>,
) {
  return async (req: Request, ctx: TCtx): Promise<Response> => {
    try {
      await requireRole(...allowed);
      return await fn(req as TReq, ctx);
    } catch (err: unknown) {
      const message = (err instanceof Error ? err.message : "Internal server error");
      const status = (err as { status?: number })?.status ?? 500;
      return json({ error: message }, { status });
    }
  };
}

/** Roles allowed to view the procurement approvals queue. */
export const APPROVAL_QUEUE_ROLES = APPROVER_ROLES;
