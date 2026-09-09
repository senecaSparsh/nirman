import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@nirman/db";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { auth } from "@/lib/auth";
import {
  normalizeRole,
  effectivePermissions,
  isCustomRole,
  APPROVER_ROLES,
  type Role,
} from "@/lib/roles";
import { logAction, resolveUserScope, ServiceError } from "@nirman/services";
import { getBackpressureStats, trackRequest } from "@/lib/backpressure";
import { rateLimit, RATE_LIMITS } from "@/lib/rate-limit";
import { cached as withCache } from "@/lib/server-cache";

// ───────────────────────────────────────────────────────────
//  Request-scoped memoization (AsyncLocalStorage)
// ───────────────────────────────────────────────────────────
// A single API request calls getCurrentUser() 4-5× (apiHandler rate-limit
// check, requirePermission/requireUser, getCompany, getUserPermissions,
// getUserScope…) and getCompany() 2-3× — each doing a DB round-trip.
// Without memoization that's ~10-15 DB queries just for auth context on
// every request. This ALS-based cache deduplicates them to 1 query per
// resource per request. The cache is scoped to a single request via
// AsyncLocalStorage, so there's no cross-request leakage and no manual
// cleanup — the store is GC'd when the request completes.
//
// Promises are cached (not values) so concurrent callers share the same
// in-flight DB query (thundering-herd prevention). On rejection the cache
// entry is cleared so a retry gets a fresh attempt.

interface RequestContext {
  session?: Promise<unknown>;
  user?: Promise<CurrentUser | null>;
  company?: Promise<unknown>;
  permissions?: Promise<string[]>;
  navBootstrap?: Promise<NavBootstrap | null>;
}

const requestContextALS = new AsyncLocalStorage<RequestContext>();

/**
 * Memoize an async function's result within the current request context.
 * If no request context is active (e.g. called outside apiHandler/layout),
 * falls back to executing the function directly with no caching.
 */
function memoizeInRequest<T>(
  key: keyof RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  const ctx = requestContextALS.getStore();
  if (!ctx) return fn();
  const existing = ctx[key] as Promise<T> | undefined;
  if (existing) return existing;
  const promise = fn().catch((err) => {
    // Clear on rejection so a retry within the same request gets a fresh attempt.
    if (ctx[key] === promise) (ctx as Record<string, unknown>)[key] = undefined;
    throw err;
  });
  (ctx as Record<string, unknown>)[key] = promise;
  return promise;
}

/**
 * Wrap a function execution in a request-scoped context. All
 * getCurrentUser/getCompany/getSession/getUserPermissions calls within
 * the wrapped execution share cached results. Called by apiHandler for
 * API routes and by the root layout for Server Components.
 */
export function runWithRequestContext<T>(fn: () => T): T {
  return requestContextALS.run({}, fn);
}

/**
 * Server-side helpers shared by API routes and Server Components.
 */
export async function getCompany() {
  return memoizeInRequest("company", async () => {
  const user = await getCurrentUser();
  const selectedId = (await cookies()).get("nirman-company-id")?.value;
  const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production";

  // ── Fail closed: no company resolution without authentication ──
  // Without an authenticated user (and not in dev-bypass), we must NOT
  // resolve an arbitrary company from a cookie, and we must NOT create one
  // as a side effect of a GET. Throw so the caller surfaces a 401 instead
  // of silently operating on the wrong tenant.
  if (!user && !isDevBypass) {
    throw new Error("getCompany() called without an authenticated user");
  }

  if (selectedId && user) {
    const selected = await prisma.company.findFirst({
      where: {
        id: selectedId,
        deletedAt: null,
        userMemberships: { some: { userId: user.id, active: true } },
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

  // In dev-bypass mode only, fall back to any company (no membership filter).
  if (isDevBypass) {
    const existing = await prisma.company.findFirst({
      where: { deletedAt: null },
      orderBy: { createdAt: "asc" },
    });
    if (existing) return existing;
  }

  // In production, filter by the user's memberships.
  if (user) {
    const member = await prisma.company.findFirst({
      where: {
        deletedAt: null,
        userMemberships: { some: { userId: user.id, active: true } },
      },
      orderBy: { createdAt: "asc" },
    });
    if (member) return member;
  }

  // No company found. In dev-bypass mode, create a default one (onboarding).
  // In production, throw — an authenticated user without a company membership
  // is a provisioning error, not an onboarding flow. Auto-creating "My Company"
  // in production caused ghost companies during failed login attempts.
  if (isDevBypass) {
    return prisma.company.create({
      data: {
        name: "My Company",
        currency: "INR",
        ...(user
          ? { userMemberships: { create: { userId: user.id, role: user.role } } }
          : {}),
      },
    });
  }
  throw new Error(
    `No company found for authenticated user ${user?.id ?? "(unknown)"} — this is a provisioning error. ` +
    `Run the SRG provisioning script or assign the user to a company.`,
  );
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

/**
 * Validate that all attachment upload IDs belong to the user's company.
 * Prevents cross-company attachment linking (e.g. linking another company's
 * upload ID to a safety record). Returns an error message string if any
 * attachment doesn't belong to the company, or null if all are valid.
 *
 * Empty/undefined attachment arrays are valid (no check needed).
 */
export async function validateAttachments(attachmentIds: string[] | undefined, companyId: string): Promise<string | null> {
  if (!attachmentIds || attachmentIds.length === 0) return null;
  const valid = await prisma.upload.findMany({
    where: { id: { in: attachmentIds }, companyId },
    select: { id: true },
  });
  if (valid.length !== attachmentIds.length) {
    return "One or more attachments do not belong to your company.";
  }
  return null;
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
  class: z.enum(["RAW_MATERIAL", "CONSUMABLE", "MRO", "TEMPORARY"]).optional(),
});

export const materialSchema = z.object({
  code: z.string().min(1, "Code is required").max(40),
  name: z.string().min(1, "Name is required").max(120),
  grade: z.string().max(60).optional().nullable(),
  specification: z.string().max(200).optional().nullable(),
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
  isLotTracked: z.boolean().optional().default(false),
  isScrap: z.boolean().optional().default(false),
  baseUnit: z.string().max(20).optional(),
  secondaryUnit: z.string().max(20).optional().nullable(),
  uomConversionFactor: z.coerce.number().min(0).optional().nullable(),
  description: z.string().max(500).optional().nullable(),
});

export const stockLocationSchema = z.object({
  type: z.enum(["CENTRAL_WAREHOUSE", "COMPANY_WAREHOUSE", "PROJECT_SITE", "DEPARTMENT"]),
  name: z.string().min(1, "Name is required").max(120),
  projectId: z.string().optional().nullable(),
  address: z.string().max(300).optional().nullable(),
  lat: z.coerce.number().min(-90).max(90).optional().nullable(),
  lng: z.coerce.number().min(-180).max(180).optional().nullable(),
  geoRadius: z.coerce.number().int().min(10).max(50000).optional().nullable(),
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
  // ATS (Agreement to Sell) — not stored on Project, used to auto-create a legal doc
  isATS: z.boolean().optional(),
  atsRegistrationAmount: z.coerce.number().min(0).optional().nullable(),
  atsExpectedRegistryDate: z.string().optional().nullable(),
  // Registry number — captured when ATS = No (registry is done)
  registryNo: z.string().max(200).optional().nullable(),
  // ── RERA registration ──
  reraNumber: z.string().max(100).optional().nullable(),
  reraRegistrationDate: z.string().optional().nullable(),
  reraValidityDate: z.string().optional().nullable(),
  reraWebsiteUrl: z.string().max(500).optional().nullable(),
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

// ───────────────────────────────────────────────────────────
//  Standalone Quotation Request schemas
// ───────────────────────────────────────────────────────────

export const quotationRequestLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qtyRequired: z.coerce.number().finite().min(0.001, "Quantity must be > 0"),
});

export const quotationRequestSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  projectId: z.string().optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  minQuotesRequired: z.coerce.number().int().min(1).max(20).default(3),
  requiredByDate: z.string().min(1, "Required-by date is mandatory"),
  workActivity: z.string().max(200).optional().nullable(),
  destinationLocationId: z.string().min(1, "Destination location is mandatory — pick where material should be delivered"),
  lines: z.array(quotationRequestLineSchema).min(1, "At least one material is required"),
});

export const quoteLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qty: z.coerce.number().finite().min(0.001, "Quantity must be > 0"),
  unitPrice: z.coerce.number().finite().min(0, "Unit price must be >= 0"),
  discountPerUnit: z.coerce.number().finite().min(0).default(0),
  packingPerUnit: z.coerce.number().finite().min(0).default(0),
  freightPerUnit: z.coerce.number().finite().min(0).default(0),
  loadingPerUnit: z.coerce.number().finite().min(0).default(0),
  insurancePerUnit: z.coerce.number().finite().min(0).default(0),
  handlingPerUnit: z.coerce.number().finite().min(0).default(0),
  buyerTransportPerUnit: z.coerce.number().finite().min(0).default(0),
});

export const addQuoteSchema = z.object({
  supplierId: z.string().optional().nullable(),
  // Inline supplier creation — when the supplier doesn't exist yet, the
  // user can create one directly from the quote upload dialog without
  // going to a separate "add supplier" page.
  newSupplier: z.object({
    name: z.string().min(1).max(160),
    gstin: z.string().max(20).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    email: z.string().max(120).optional().nullable(),
    address: z.string().max(500).optional().nullable(),
  }).optional(),
  fileUrl: z.string().optional().nullable(),
  fileName: z.string().optional().nullable(),
  mimeType: z.string().optional().nullable(),
  quoteSource: z.enum(["DOCUMENT", "EMAIL", "VERBAL", "WHATSAPP", "LETTER", "EXCEL"]).default("DOCUMENT"),
  sourceNote: z.string().max(500).optional().nullable(),
  validUntil: z.string().min(1, "Quote validity date is mandatory"),
  notes: z.string().max(2000).optional().nullable(),
  // ── Commercial terms (mandatory for like-for-like comparison) ──
  paymentTerms: z.string().min(1, "Payment terms are mandatory").max(200),
  // Structured delivery basis — determines who bears transport cost.
  deliveryTermsType: z.enum(["DELIVERED_SITE", "EX_WORKS", "FOR_STATION", "CUSTOM"]).default("DELIVERED_SITE"),
  // Free-text detail (required when deliveryTermsType = CUSTOM)
  deliveryTerms: z.string().max(100).optional().nullable(),
  leadTimeDays: z.coerce.number().int().min(0, "Lead time is mandatory").max(365),
  warranty: z.string().max(200).optional().nullable(),
  lines: z.array(quoteLineSchema).min(1, "At least one line is required"),
}).refine(
  (data) => data.supplierId || data.newSupplier,
  { message: "Either supplierId or newSupplier is required" },
).refine(
  // deliveryTerms detail is required when deliveryTermsType = CUSTOM
  (data) => data.deliveryTermsType !== "CUSTOM" || !!data.deliveryTerms?.trim(),
  { message: "Delivery terms detail is required when delivery basis is 'Custom'", path: ["deliveryTerms"] },
).refine(
  // Buyer transport is mandatory for ex-works / FOR-station quotes
  (data) => {
    if (data.deliveryTermsType !== "EX_WORKS" && data.deliveryTermsType !== "FOR_STATION") return true;
    return data.lines.every((l) => l.buyerTransportPerUnit > 0);
  },
  { message: "Buyer transport per unit is mandatory for ex-works / FOR-station quotes — enter estimated transport for every line", path: ["lines"] },
).refine(
  // File is required for document-based sources; optional for verbal/email
  (data) => {
    const needsFile = ["DOCUMENT", "LETTER", "EXCEL"].includes(data.quoteSource);
    if (!needsFile) return true;
    return !!data.fileUrl;
  },
  { message: "Quote file is required for DOCUMENT/LETTER/EXCEL sources. Use VERBAL or EMAIL source for quotes without a file.", path: ["fileUrl"] },
).refine(
  // Source note is required for non-document sources
  (data) => {
    const needsFile = ["DOCUMENT", "LETTER", "EXCEL"].includes(data.quoteSource);
    if (needsFile) return true;
    return !!data.sourceNote?.trim();
  },
  { message: "A source note is required for non-document quotes (e.g. 'Verbal quote from Ramesh on 15-Aug over phone')", path: ["sourceNote"] },
);

export const approveQuotationSchema = z.object({
  selectedQuoteId: z.string().min(1, "A quote must be selected"),
  reason: z.string().max(1000).optional().nullable(),
});

export const purchaseOrderLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qtyOrdered: z.coerce.number().finite().min(0.001, "Quantity must be > 0"),
  unitCost: z.coerce.number().finite().min(0, "Unit cost must be >= 0"),
  gstRate: z.coerce.number().min(0).max(100).default(0),
  freightPerUnit: z.coerce.number().min(0).optional().default(0),
  loadingPerUnit: z.coerce.number().min(0).optional().default(0),
  packingPerUnit: z.coerce.number().min(0).optional().default(0),
  insurancePerUnit: z.coerce.number().min(0).optional().default(0),
  discountPerUnit: z.coerce.number().min(0).optional().default(0),
});

export const purchaseOrderChargeSchema = z.object({
  heading: z.string().min(1, "Charge heading is required").max(100),
  amount: z.coerce.number().finite().min(0, "Amount must be >= 0"),
  notes: z.string().max(500).optional().nullable(),
});

export const purchaseOrderSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  procurementScope: z.enum(["COMPANY", "PROJECT"]),
  projectId: z.string().optional().nullable(),
  destinationLocationId: z.string().min(1, "Destination location is required"),
  expectedDate: z.string().optional().nullable().refine((v) => !v || !isNaN(new Date(v).getTime()), "Invalid date"),
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(purchaseOrderLineSchema).min(1, "At least one line item is required"),
  charges: z.array(purchaseOrderChargeSchema).optional().default([]),
});

export const receiveGoodsLineSchema = z.object({
  purchaseOrderLineId: z.string().min(1),
  materialId: z.string().min(1),
  qtyReceived: z.coerce.number().finite().min(0.001, "Received quantity must be > 0"),
  unitCost: z.coerce.number().finite().min(0, "Unit cost must be >= 0"),
  lotNumber: z.string().max(80).optional().nullable(),
  batchCode: z.string().max(80).optional().nullable(),
  expiryDate: z.coerce.date().optional().nullable(),
  manufacturingDate: z.coerce.date().optional().nullable(),
  inspectionStatus: z.enum(["PASSED", "FAILED", "RETEST", "PENDING"]).optional().nullable(),
  inspectionRemarks: z.string().max(500).optional().nullable(),
});

export const receiveGoodsSchema = z.object({
  notes: z.string().max(2000).optional().nullable(),
  lines: z.array(receiveGoodsLineSchema).min(1, "At least one line is required"),
  // Delivery proof & logistics
  deliveryTermsType: z.string().optional(),
  deliveryMode: z.string().optional(),
  vehicleType: z.string().optional(),
  vehicleNumber: z.string().max(50).optional(),
  driverName: z.string().max(100).optional(),
  driverPhone: z.string().max(20).optional(),
  transporterName: z.string().max(100).optional(),
  challanNumber: z.string().max(50).optional(),
  invoiceNumber: z.string().max(50).optional(),
  ewayBillNumber: z.string().max(50).optional(),
  lrNumber: z.string().max(50).optional(),
  packageCount: z.coerce.number().int().min(0).optional(),
  photos: z.array(z.object({ url: z.string(), fileName: z.string().optional() })).optional(),
  receiverSignature: z.string().optional(),
  receiverLat: z.coerce.number().optional(),
  receiverLng: z.coerce.number().optional(),
  receiverLocation: z.string().max(200).optional(),
  gateInAt: z.coerce.date().optional(),
  shortageRemarks: z.string().max(1000).optional(),
  damageRemarks: z.string().max(1000).optional(),
  // Supervisor co-signature
  supervisorSignature: z.string().optional(),
  supervisorId: z.string().optional(),
  // Weighbridge
  weighbridgeTicketNo: z.string().max(50).optional(),
  grossWeight: z.coerce.number().optional(),
  tareWeight: z.coerce.number().optional(),
  netWeight: z.coerce.number().optional(),
  // Gate pass / receiving + unloading
  gatePassNo: z.string().max(50).optional(),
  receivingPhotoUrl: z.string().optional(),
  unloadingSlipNo: z.string().max(50).optional(),
  unloadedAt: z.coerce.date().optional(),
  unloadingLocation: z.string().max(200).optional(),
  unloadingRemarks: z.string().max(1000).optional(),
});

export const rejectDeliverySchema = z.object({
  rejectionReason: z.string().min(1, "Rejection reason is required").max(2000),
  rejectionPhotos: z.array(z.object({ url: z.string(), fileName: z.string().optional() })).optional(),
  vehicleNumber: z.string().max(50).optional(),
  challanNumber: z.string().max(50).optional(),
  receiverLat: z.coerce.number().optional(),
  receiverLng: z.coerce.number().optional(),
  receiverLocation: z.string().max(200).optional(),
  gatePassNo: z.string().max(50).optional(),
  notes: z.string().max(2000).optional(),
});

export const transferLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qty: z.coerce.number().finite().min(0.001, "Quantity must be > 0"),
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
  // Vehicle — how the goods were transported from store to site
  vehicleNumber: z.string().max(50).optional(),
  vehicleType: z.string().max(50).optional(),
  vehiclePhotoUrl: z.string().optional(),
  driverName: z.string().max(100).optional(),
  driverPhone: z.string().max(20).optional(),
  // Round-off to match physical bill totals
  roundOff: z.coerce.number().optional().nullable(),
  requireGatePass: z.boolean().optional(),
  lines: z.array(transferLineSchema).min(1, "At least one line is required"),
}).refine(
  (data) => (data.projectId ? !data.departmentId : !!data.departmentId),
  { message: "Specify either a project or a department (cost centre) — not both, not neither.", path: ["projectId"] },
);

// ── Land ──
export const landPurchaseSchema = z.object({
  projectId: z.string().optional().nullable(),
  sellerId: z.string().optional().nullable(),
  sellerName: z.string().min(1, "Seller name is required"),
  sellerContact: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  totalArea: z.coerce.number().finite().positive("Total area must be > 0"),
  areaUnit: z.enum(["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"]).default("SQFT"),
  totalCost: z.coerce.number().finite().positive("Total cost must be > 0"),
  registryNo: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  documentUrl: z.string().optional().nullable(),
  initialParcelNumber: z.string().optional(),
});

// Inline project creation spec for the guided land purchase wizard
const inlineProjectCreateSchema = z.object({
  name: z.string().min(1, "Project name is required"),
  type: z.enum(["RESIDENTIAL", "COMMERCIAL", "WAREHOUSE", "MALL", "LAND", "OTHER"]).optional(),
  status: z.enum(["PLANNED", "ACTIVE", "COMPLETED", "ON_HOLD"]).optional(),
  address: z.string().optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  totalBudget: z.coerce.number().finite().nonnegative().optional(),
  totalSellableArea: z.coerce.number().finite().nonnegative().optional(),
  description: z.string().optional().nullable(),
});

// A single section in the guided land purchase plan
const planSectionSchema = z.object({
  number: z.string().min(1, "Section number is required"),
  area: z.coerce.number().finite().positive("Section area must be > 0"),
  purpose: z.enum(["SELL", "PROJECT", "HOLD"]),
  askingPrice: z.coerce.number().finite().positive().optional(),
  projectId: z.string().optional().nullable(),
  projectCreate: inlineProjectCreateSchema.optional(),
}).refine(
  (data) => !(data.projectId && data.projectCreate),
  { message: "Cannot specify both projectId and projectCreate", path: ["projectId"] },
);

// The full guided land purchase plan (wizard payload)
export const landPurchasePlanSchema = z.object({
  sellerId: z.string().optional().nullable(),
  sellerName: z.string().min(1, "Seller name is required"),
  sellerContact: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  totalArea: z.coerce.number().finite().positive("Total area must be > 0"),
  areaUnit: z.enum(["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"]).default("SQFT"),
  totalCost: z.coerce.number().finite().positive("Total cost must be > 0"),
  registryNo: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  documentUrl: z.string().optional().nullable(),
  mode: z.enum(["WHOLE", "SUBDIVIDED"]),
  sections: z.array(planSectionSchema).min(1, "At least one section is required"),
  parentParcelNumber: z.string().optional(),
  // ── Land type & lease details ──
  landType: z.enum(["FREEHOLD", "LEASEHOLD"]).default("FREEHOLD"),
  leaseType: z.enum(["ONE_TIME", "YEARLY"]).optional().nullable(),
  leasePeriodYears: z.coerce.number().finite().positive().optional().nullable(),
  leaseStartDate: z.string().optional().nullable(),
  leaseEndDate: z.string().optional().nullable(),
  // ── Cost breakup ──
  baseCost: z.coerce.number().finite().nonnegative().optional(),
  leaseRentPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  leaseRentAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  gstPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  gstAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  registrationPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  registrationAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  stampDutyPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  stampDutyAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  // Transfer duty (authority land — DDA, HUDCO, etc.)
  transferDutyPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  transferDutyAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  // Additional acquisition costs
  brokerageAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  legalFees: z.coerce.number().finite().nonnegative().optional().nullable(),
  otherCharges: z.coerce.number().finite().nonnegative().optional().nullable(),
});

// Edit schema for PATCH /api/land-purchases/[id] — includes all editable fields
// (base + cost breakup + lease details) but NOT mode/sections (immutable after creation).
export const landPurchaseEditSchema = z.object({
  projectId: z.string().optional().nullable(),
  sellerId: z.string().optional().nullable(),
  sellerName: z.string().min(1, "Seller name is required").optional(),
  sellerContact: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  totalArea: z.coerce.number().finite().positive("Total area must be > 0").optional(),
  areaUnit: z.enum(["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"]).optional(),
  totalCost: z.coerce.number().finite().positive("Total cost must be > 0").optional(),
  registryNo: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  documentUrl: z.string().optional().nullable(),
  // ── Land type & lease details ──
  landType: z.enum(["FREEHOLD", "LEASEHOLD"]).optional(),
  leaseType: z.enum(["ONE_TIME", "YEARLY"]).optional().nullable(),
  leasePeriodYears: z.coerce.number().finite().positive().optional().nullable(),
  leaseStartDate: z.string().optional().nullable(),
  leaseEndDate: z.string().optional().nullable(),
  // ── Cost breakup ──
  baseCost: z.coerce.number().finite().nonnegative().optional().nullable(),
  leaseRentPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  leaseRentAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  gstPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  gstAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  registrationPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  registrationAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  stampDutyPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  stampDutyAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  // Transfer duty (authority land — DDA, HUDCO, etc.)
  transferDutyPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  transferDutyAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  brokerageAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  legalFees: z.coerce.number().finite().nonnegative().optional().nullable(),
  otherCharges: z.coerce.number().finite().nonnegative().optional().nullable(),
});

// ── Land cost components (arbitrary / recurring / future costs) ──
export const landCostComponentSchema = z.object({
  label: z.string().min(1, "Label is required").max(120),
  amount: z.coerce.number().finite().positive("Amount must be > 0"),
  frequency: z.enum(["ONE_TIME", "RECURRING"]).default("ONE_TIME"),
  interval: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]).optional().nullable(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  occurrences: z.coerce.number().finite().positive().optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

// ── Land Seller ──
export const landSellerSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  phone: z.string().max(30).optional().nullable(),
  email: z.string().email("Invalid email").optional().nullable(),
  gstin: z.string().max(20).optional().nullable(),
  address: z.string().max(500).optional().nullable(),
  notes: z.string().max(1000).optional().nullable(),
});

export const partitionSchema = z.object({
  parentParcelId: z.string().min(1),
  children: z.array(z.object({
    number: z.string().min(1, "Parcel number is required"),
    area: z.coerce.number().finite().positive("Area must be > 0"),
    askingPrice: z.coerce.number().finite().positive().optional(),
    isInfrastructure: z.boolean().optional(),
    marketValue: z.coerce.number().finite().nonnegative().optional(),
    weightFactor: z.coerce.number().finite().positive().optional(),
    geometry: z.any().optional(),
  })).min(2, "At least 2 children required"),
  notes: z.string().optional(),
  allocationModel: z.enum(["PRO_RATA", "MARKET_VALUE"]).default("PRO_RATA"),
  developmentCost: z.coerce.number().finite().nonnegative().optional(),
});

export const parcelValuationSchema = z.object({
  currentValuation: z.coerce.number().finite().nonnegative().optional(),
  askingPrice: z.coerce.number().finite().positive().optional().nullable(),
});

// ── Built Units ──
export const builtUnitSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  phaseId: z.string().optional().nullable(),
  unitType: z.enum(["BHK_1", "BHK_2", "BHK_3", "BHK_4", "SHOP", "OFFICE", "WAREHOUSE_UNIT", "VILLA", "OTHER"]),
  unitNumber: z.string().min(1, "Unit number is required"),
  floor: z.coerce.number().int().optional().nullable(),
  wing: z.string().optional().nullable(),
  area: z.coerce.number().finite().positive("Area must be > 0"),
  areaUnit: z.enum(["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"]).default("SQFT"),
  askingPrice: z.coerce.number().finite().positive().optional().nullable(),
  // RERA fields
  carpetArea: z.coerce.number().finite().nonnegative().optional().nullable(),
  superBuiltUpArea: z.coerce.number().finite().nonnegative().optional().nullable(),
  balconyArea: z.coerce.number().finite().nonnegative().optional().nullable(),
  clearHeight: z.coerce.number().finite().nonnegative().optional().nullable(),
  hasLoadingDock: z.coerce.boolean().optional(),
  landParcelId: z.string().optional().nullable(),
});

export const builtUnitStatusSchema = z.enum(["PLANNED", "UNDER_CONSTRUCTION", "AVAILABLE", "HOLD", "SOLD"]);
export const builtUnitValuationSchema = z.object({
  askingPrice: z.coerce.number().finite().positive().optional().nullable(),
  currentValuation: z.coerce.number().finite().nonnegative().optional(),
});

// Edit an existing built unit's core attributes (no project/phase change).
export const builtUnitEditSchema = z.object({
  unitType: z.enum(["BHK_1", "BHK_2", "BHK_3", "BHK_4", "SHOP", "OFFICE", "WAREHOUSE_UNIT", "VILLA", "OTHER"]),
  unitNumber: z.string().min(1, "Unit number is required"),
  floor: z.coerce.number().int().optional().nullable(),
  wing: z.string().optional().nullable(),
  area: z.coerce.number().finite().positive("Area must be > 0"),
  areaUnit: z.enum(["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"]),
  askingPrice: z.coerce.number().finite().positive().optional().nullable(),
  // RERA fields
  carpetArea: z.coerce.number().finite().nonnegative().optional().nullable(),
  superBuiltUpArea: z.coerce.number().finite().nonnegative().optional().nullable(),
  balconyArea: z.coerce.number().finite().nonnegative().optional().nullable(),
  clearHeight: z.coerce.number().finite().nonnegative().optional().nullable(),
  hasLoadingDock: z.coerce.boolean().optional(),
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
  assetType: z.enum(["LAND", "BUILT_UNIT", "PROJECT"]),
  landParcelId: z.string().optional().nullable(),
  builtUnitId: z.string().optional().nullable(),
  projectId: z.string().optional().nullable(),
  customerId: z.string().min(1, "Customer is required"),
  salePrice: z.coerce.number().finite().positive("Sale price must be > 0"),
  gstRate: z.coerce.number().finite().nonnegative().max(28).optional(),
  paymentMode: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  initialPayment: z.coerce.number().finite().nonnegative().optional(),
  initialPaymentMode: z.string().optional(),
  // Sale deed / registry tracking
  saleDeedNo: z.string().max(200).optional().nullable(),
  expectedRegistryDate: z.string().optional().nullable(),
  // ATS (Agreement to Sell) — merged with registry: either atsNo OR saleDeedNo
  atsNo: z.string().max(200).optional().nullable(),
  atsDate: z.string().optional().nullable(),
  allowRegistryBeforeFullPayment: z.boolean().optional(),
  // Sale compliance documents
  allotmentLetterNo: z.string().max(200).optional().nullable(),
  allotmentDate: z.string().optional().nullable(),
  bbaNo: z.string().max(200).optional().nullable(),
  bbaDate: z.string().optional().nullable(),
  // TDS tracking
  tdsAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  tdsCertificateNo: z.string().max(200).optional().nullable(),
  // Home loan tracking
  homeLoanBank: z.string().max(200).optional().nullable(),
  homeLoanAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  homeLoanSanctionNo: z.string().max(200).optional().nullable(),
  homeLoanSanctionDate: z.string().optional().nullable(),
  // Deal terms
  dealMaturityMonths: z.coerce.number().int().positive().optional().nullable(),
  paymentCycle: z.string().max(500).optional().nullable(),
  // Sale expenses
  expenses: z.array(z.object({
    head: z.enum(["REGISTRY", "STAMP_DUTY", "TRANSFER", "LEASE_RENT", "GST", "OTHER"]),
    label: z.string().max(200).optional().nullable(),
    amount: z.coerce.number().finite().nonnegative(),
    borneBy: z.enum(["CLIENT", "SELLER", "NA"]),
    isIncluded: z.boolean().optional(),
  })).optional(),
  // Sale terms & conditions
  terms: z.array(z.object({
    description: z.string().min(1, "Term description is required"),
    extraAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
    isIncluded: z.boolean().optional(),
  })).optional(),
  // Broker / deal source
  dealSource: z.enum(["SELF", "BROKER"]).optional(),
  brokerId: z.string().optional().nullable(),
  brokerName: z.string().max(200).optional().nullable(),
  brokerPhone: z.string().max(20).optional().nullable(),
  commissionAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  commissionIsPartOfDeal: z.boolean().optional(),
  // Payment schedule
  paymentSchedule: z.object({
    type: z.enum(["CLP", "TLP", "DPP"]),
    items: z.array(z.object({
      installmentNo: z.coerce.number().int().positive(),
      description: z.string().min(1),
      percentage: z.coerce.number().finite().nonnegative(),
      amount: z.coerce.number().finite().nonnegative(),
      dueDate: z.string().optional().nullable(),
      wbsNodeId: z.string().optional().nullable(),
    })).min(1, "At least one installment is required"),
  }).optional(),
  // Cheque details for initial payment
  initialChequeNo: z.string().max(200).optional().nullable(),
  initialChequeDate: z.string().optional().nullable(),
  initialChequeBank: z.string().max(200).optional().nullable(),
  initialChequePhotoUrl: z.string().optional().nullable(),
  // ATS document upload (optional at booking)
  atsDocumentUrl: z.string().optional().nullable(),
  atsDocumentName: z.string().optional().nullable(),
  // Draft / LOI (Letter of Intent)
  draftDocumentUrl: z.string().optional().nullable(),
  draftDocumentName: z.string().optional().nullable(),
  draftNotes: z.string().optional().nullable(),
  draftDate: z.string().optional().nullable(),
});

export const paymentScheduleSchema = z.object({
  type: z.enum(["CLP", "TLP", "DPP"]),
  items: z.array(z.object({
    installmentNo: z.coerce.number().int().positive(),
    description: z.string().min(1),
    percentage: z.coerce.number().finite().nonnegative(),
    amount: z.coerce.number().finite().nonnegative(),
    dueDate: z.string().optional().nullable(),
    wbsNodeId: z.string().optional().nullable(),
  })).min(1, "At least one installment is required"),
});

export const brokerSchema = z.object({
  name: z.string().min(1, "Broker name is required"),
  phone: z.string().max(20).optional().nullable(),
  agency: z.string().max(200).optional().nullable(),
  defaultCommissionPercent: z.coerce.number().finite().nonnegative().max(100).optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const paymentSchema = z.object({
  amount: z.coerce.number().finite().positive("Amount must be > 0"),
  mode: z.string().min(1, "Payment mode is required"),
  reference: z.string().optional().nullable(),
  // Cheque details
  chequeNo: z.string().max(200).optional().nullable(),
  chequeDate: z.string().optional().nullable(),
  chequeBank: z.string().max(200).optional().nullable(),
  chequePhotoUrl: z.string().optional().nullable(),
});

export const depositSchema = z.object({
  depositAmount: z.coerce.number().finite().positive("Deposit amount must be > 0"),
  paymentMode: z.string().optional(),
  reference: z.string().optional().nullable(),
  // Cheque details
  chequeNo: z.string().max(200).optional().nullable(),
  chequeDate: z.string().optional().nullable(),
  chequeBank: z.string().max(200).optional().nullable(),
  chequePhotoUrl: z.string().optional().nullable(),
});

export const completeSaleSchema = z.object({
  finalPaymentAmount: z.coerce.number().finite().nonnegative().optional(),
  paymentMode: z.string().optional(),
  reference: z.string().optional().nullable(),
  saleDeedNo: z.string().max(200).optional().nullable(),
  // ATS fields — either atsNo OR saleDeedNo is the registered document
  atsNo: z.string().max(200).optional().nullable(),
  atsDate: z.string().optional().nullable(),
  // Compliance fields that can be captured at completion
  allotmentLetterNo: z.string().max(200).optional().nullable(),
  allotmentDate: z.string().optional().nullable(),
  bbaNo: z.string().max(200).optional().nullable(),
  bbaDate: z.string().optional().nullable(),
  tdsAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  tdsCertificateNo: z.string().max(200).optional().nullable(),
  // Home loan details — often finalized at completion
  homeLoanBank: z.string().max(200).optional().nullable(),
  homeLoanAmount: z.coerce.number().finite().nonnegative().optional().nullable(),
  homeLoanSanctionNo: z.string().max(200).optional().nullable(),
  homeLoanSanctionDate: z.string().optional().nullable(),
  // Cheque details
  chequeNo: z.string().max(200).optional().nullable(),
  chequeDate: z.string().optional().nullable(),
  chequeBank: z.string().max(200).optional().nullable(),
  chequePhotoUrl: z.string().optional().nullable(),
  // Registry document upload
  registryDocumentUrl: z.string().optional().nullable(),
  registryDocumentName: z.string().optional().nullable(),
});

// ── Material Sales ──
export const materialSaleLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  locationId: z.string().min(1, "Stock location is required"),
  qty: z.coerce.number().finite().positive("Quantity must be > 0"),
  unitPrice: z.coerce.number().finite().positive("Unit price must be > 0"),
  gstRate: z.coerce.number().finite().nonnegative().max(28).optional(),
});

export const materialSaleSchema = z.object({
  customerId: z.string().min(1, "Customer is required"),
  projectId: z.string().optional().nullable(),
  lines: z.array(materialSaleLineSchema).min(1, "At least one line item is required"),
  paymentMode: z.string().optional().nullable(),
  partyName: z.string().max(200).optional().nullable(),
  // Vehicle — how the goods were dispatched to the customer
  vehicleNumber: z.string().max(50).optional(),
  vehicleType: z.string().max(50).optional(),
  vehiclePhotoUrl: z.string().optional(),
  driverName: z.string().max(100).optional(),
  driverPhone: z.string().max(20).optional(),
  requireGatePass: z.boolean().optional(),
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
  budget: z.coerce.number().finite().nonnegative().optional(),
  startDate: z.string().optional().nullable(),
});

export const renovationCostSchema = z.object({
  renovationProjectId: z.string().min(1, "Renovation project is required"),
  costType: z.enum(["LABOUR", "OVERHEAD", "EQUIPMENT", "CONTRACTOR", "PERMIT", "TRANSFER_DUTY", "OTHER"]),
  amount: z.coerce.number().finite().positive("Amount must be > 0"),
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
  monthlyRent: z.coerce.number().finite().positive("Monthly rent must be > 0"),
  securityDeposit: z.coerce.number().finite().nonnegative().optional(),
  rentAgreementNo: z.string().optional().nullable(),
  rentAgreementDocumentUrl: z.string().optional().nullable(),
  rentAgreementDocumentName: z.string().optional().nullable(),
  sacCode: z.string().optional().nullable(),
  escalationPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  escalationIntervalMonths: z.coerce.number().int().positive().optional(),
  rentFreeDays: z.coerce.number().int().nonnegative().optional(),
  draftDocumentUrl: z.string().optional().nullable(),
  draftDocumentName: z.string().optional().nullable(),
  draftNotes: z.string().optional().nullable(),
  draftDate: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
});

export const editTenancySchema = z.object({
  tenantName: z.string().min(1, "Tenant name is required"),
  tenantPhone: z.string().optional().nullable(),
  tenantEmail: z.string().email("Invalid email").optional().nullable(),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().min(1, "End date is required"),
  monthlyRent: z.coerce.number().finite().positive("Monthly rent must be > 0"),
  securityDeposit: z.coerce.number().finite().nonnegative().optional(),
  rentAgreementNo: z.string().optional().nullable(),
  rentAgreementDocumentUrl: z.string().optional().nullable(),
  rentAgreementDocumentName: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  customerId: z.string().optional().nullable(),
  escalationPercent: z.coerce.number().finite().nonnegative().optional().nullable(),
  rentFreeDays: z.coerce.number().int().nonnegative().optional(),
  draftDocumentUrl: z.string().optional().nullable(),
  draftDocumentName: z.string().optional().nullable(),
  draftNotes: z.string().optional().nullable(),
  draftDate: z.string().optional().nullable(),
});

export const rentPaymentSchema = z.object({
  amount: z.coerce.number().finite().positive("Amount must be > 0"),
  paymentDate: z.string().optional(),
  dueDate: z.string().optional(),
  mode: z.string().min(1, "Payment mode is required"),
  reference: z.string().optional().nullable(),
  tdsAmount: z.coerce.number().finite().nonnegative().optional(),
  tdsCertificateNo: z.string().optional().nullable(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

export const changeTenantSchema = z.object({
  newTenantName: z.string().min(1, "New tenant name is required"),
  newTenantPhone: z.string().optional().nullable(),
  newTenantEmail: z.string().email("Invalid email").optional().nullable(),
  newCustomerId: z.string().optional().nullable(),
  newMonthlyRent: z.coerce.number().finite().positive().optional(),
  newRentAgreementNo: z.string().optional().nullable(),
  newRentAgreementDocumentUrl: z.string().optional().nullable(),
  newRentAgreementDocumentName: z.string().optional().nullable(),
  newStartDate: z.string().optional(),
  newEndDate: z.string().optional(),
  newSecurityDeposit: z.coerce.number().finite().nonnegative().optional(),
  notes: z.string().optional().nullable(),
});

export const rentScheduleSchema = z.object({
  monthsAhead: z.coerce.number().int().positive().max(60).optional(),
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
  costType: z.enum(["LABOUR", "OVERHEAD", "EQUIPMENT", "CONTRACTOR", "PERMIT", "TRANSFER_DUTY", "OTHER"]),
  amount: z.coerce.number().finite().positive("Amount must be > 0"),
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
  acquisitionCost: z.coerce.number().finite().nonnegative("Cost must be >= 0").default(0),
  purchaseDate: z.string().optional().nullable().refine((v) => !v || !isNaN(new Date(v).getTime()), "Invalid date"),
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
  cost: z.coerce.number().finite().nonnegative().optional(),
  vendor: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
});

// ── Requisitions ──
export const requisitionLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qtyRequested: z.coerce.number().finite().positive("Quantity must be > 0"),
  notes: z.string().optional().nullable(),
  preferredSupplierId: z.string().optional().nullable(),
});

export const requisitionSchema = z.object({
  projectId: z.string().min(1, "Project is required"),
  phaseId: z.string().optional().nullable(),
  neededByDate: z.string().optional().nullable().refine((v) => !v || !isNaN(new Date(v).getTime()), "Invalid date"),
  notes: z.string().optional().nullable(),
  lines: z.array(requisitionLineSchema).min(1, "At least one line is required"),
  /** When true (default), the indent is auto-submitted for approval right
   *  after creation — eliminates the useless manual "Submit for Approval"
   *  step. Set to false to save as a draft instead. */
  autoSubmit: z.boolean().optional().default(true),
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
  // Multi-company onboarding: create the same employee in multiple companies
  // (parent + children). If omitted, the active company is used.
  companyIds: z.array(z.string()).optional(),
  dailyRate: z.coerce.number().finite().nonnegative("Daily rate must be >= 0").optional().nullable(),
  wageType: z.enum(["DAILY", "MONTHLY", "FIXED"]).optional(),
  monthlySalary: z.coerce.number().finite().nonnegative().optional().nullable(),
  designation: z.string().optional().nullable(),
  departmentId: z.string().optional().nullable(),
  joinDate: z.string().optional().nullable(),
  crewId: z.string().optional().nullable(),
  activeProjectId: z.string().optional().nullable(),
  active: z.boolean().optional(),
  reportingLocationId: z.string().optional().nullable(),
  hierarchyLevel: z.coerce.number().int().min(1).max(6).optional().nullable(),
  // Reporting line — the Employee ID of the manager this person reports to.
  // Works for all employees, including those without login accounts.
  reportsToEmployeeId: z.string().optional().nullable(),
  // Employment terms (dossier) — accepted at creation time
  employmentType: z.enum(["PERMANENT", "CONTRACT", "CASUAL", "PROBATION", "INTERN"]).optional().nullable(),
  noticePeriodDays: z.coerce.number().int().min(0).max(365).optional().nullable(),
  contractStartDate: z.string().optional().nullable(),
  contractEndDate: z.string().optional().nullable(),
  // Dossier fields — collected during hiring for complete onboarding
  payDay: z.coerce.number().int().min(1).max(31).optional().nullable(),
  bankAccountHolder: z.string().optional().nullable(),
  bankAccountNumber: z.string().optional().nullable(),
  bankIfsc: z.string().optional().nullable(),
  bankName: z.string().optional().nullable(),
  bankBranch: z.string().optional().nullable(),
  panNumber: z.string().optional().nullable(),
  aadhaarNumber: z.string().optional().nullable(),
  pfNumber: z.string().optional().nullable(),
  esiNumber: z.string().optional().nullable(),
  uan: z.string().optional().nullable(),
  emergencyContactName: z.string().optional().nullable(),
  emergencyContactPhone: z.string().optional().nullable(),
  emergencyContactRelation: z.string().optional().nullable(),
  permanentAddress: z.string().optional().nullable(),
  currentAddress: z.string().optional().nullable(),
  // Identity / personal (for ID card & compliance)
  dateOfBirth: z.string().optional().nullable().refine((v) => !v || !isNaN(new Date(v).getTime()), "Invalid date of birth"),
  bloodGroup: z.string().optional().nullable(),
  photoUrl: z.string().optional().nullable(),
  // Onboarding checklist
  documentsSubmitted: z.boolean().optional().nullable(),
  backgroundVerified: z.boolean().optional().nullable(),
  // Salary components (CTC breakdown) — saved before auto-generating documents
  salaryComponents: z.array(z.object({
    type: z.string(),
    amount: z.coerce.number().finite().nonnegative(),
    frequency: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "ONE_TIME"]).optional(),
    isDeduction: z.boolean().optional(),
    isPercentage: z.boolean().optional(),
    percentageOfBasic: z.coerce.number().finite().nullable().optional(),
  })).optional(),
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
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "OVERTIME", "LEAVE", "LATE", "PAID_LEAVE", "NON_PAID_LEAVE"]),
  notes: z.string().max(500).optional().nullable(),
  checkInLat: z.number().optional().nullable(),
  checkInLng: z.number().optional().nullable(),
  checkOutLat: z.number().optional().nullable(),
  checkOutLng: z.number().optional().nullable(),
  checkInLocation: z.string().max(300).optional().nullable(),
  checkOutLocation: z.string().max(300).optional().nullable(),
  geoFenceOk: z.boolean().optional().nullable(),
  geoFenceDistance: z.number().optional().nullable(),
});

export const bulkAttendanceSchema = z.object({
  date: z.string().min(1, "Date is required"),
  projectId: z.string().optional().nullable(),
  records: z.array(z.object({
    employeeId: z.string().min(1),
    status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "OVERTIME", "LEAVE", "LATE", "PAID_LEAVE", "NON_PAID_LEAVE"]),
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
  overtimeAmount: z.coerce.number().finite().nonnegative().optional(),
  allowance: z.coerce.number().finite().nonnegative().optional(),
  bonus: z.coerce.number().finite().nonnegative().optional(),
  pf: z.coerce.number().finite().nonnegative().optional(),
  employerPf: z.coerce.number().finite().nonnegative().optional(),
  esi: z.coerce.number().finite().nonnegative().optional(),
  professionTax: z.coerce.number().finite().nonnegative().optional(),
  tax: z.coerce.number().finite().nonnegative().optional(),
  deductions: z.coerce.number().finite().nonnegative().optional(),
});

// ── DPR (Daily Progress Report) ──
export const dprMaterialLineSchema = z.object({
  materialId: z.string().min(1, "Material is required"),
  qty: z.coerce.number().finite().positive("Quantity must be > 0"),
  unitCost: z.coerce.number().finite().nonnegative("Unit cost must be >= 0"),
});

export const dprLaborLineSchema = z.object({
  employeeId: z.string().optional().nullable(),
  crewId: z.string().optional().nullable(),
  hoursWorked: z.coerce.number().finite().positive("Hours must be > 0"),
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
  workQty: z.coerce.number().finite().positive("Work qty must be > 0").optional().nullable(),
  workUnit: z.string().max(50).optional().nullable(),
  progressPct: z.coerce.number().min(0).max(100).optional().nullable(),
  blockers: z.string().max(1000).optional().nullable(),
  tomorrowPlan: z.string().max(1000).optional().nullable(),
  notes: z.string().max(2000).optional().nullable(),
  photoUrls: z.array(z.string()).max(8, "Maximum 8 photos").optional(),
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
  qty: z.coerce.number().finite().positive("Quantity must be > 0"),
  unitCost: z.coerce.number().finite().nonnegative("Unit cost must be >= 0"),
  reason: z.string().optional().nullable(),
});

export const supplierReturnSchema = z.object({
  supplierId: z.string().min(1, "Supplier is required"),
  purchaseOrderId: z.string().optional().nullable(),
  locationId: z.string().min(1, "Source location is required"),
  creditNoteNo: z.string().optional().nullable(),
  // Vehicle — how the goods are being sent back to the supplier
  vehicleNumber: z.string().max(50).optional(),
  vehicleType: z.string().max(50).optional(),
  vehiclePhotoUrl: z.string().optional(),
  driverName: z.string().max(100).optional(),
  driverPhone: z.string().max(20).optional(),
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
  role: z.string().optional(),
  active: z.boolean().optional(),
  name: z.string().min(1).max(100).optional(),
  phone: z.string().max(20).nullable().optional(),
  designation: z.string().max(100).nullable().optional(),
  department: z.string().max(100).nullable().optional(),
  employeeCode: z.string().max(50).nullable().optional(),
  joiningDate: z.string().nullable().optional(), // ISO date string
  employmentEndDate: z.string().nullable().optional(), // ISO date string
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
  // Test-only: allow switching roles via x-test-role header (dev bypass mode only).
  // This enables RBAC testing without spinning up real auth sessions per role.
  const testRole = (await headers()).get("x-test-role");
  if (testRole) {
    const u = await prisma.user.findFirst({
      where: { role: testRole },
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });
    if (u) {
      return { id: u.id, email: u.email, name: u.name, role: u.role ?? "ADMIN", companyId: u.companyId };
    }
  }

  if (_devUser) return _devUser;
  // Prefer the first OWNER (full permissions); fall back to ADMIN, then any
  // user; fall back to synthetic "dev" only if the DB has no users at all.
  const rolePriority = ["OWNER","ADMIN","DEVELOPER","PROJECT_DIRECTOR","FINANCE_HEAD","PROJECT_MANAGER","PROCUREMENT_MANAGER","HR_MANAGER","SITE_ENGINEER","STORE_KEEPER","ACCOUNTANT","SALES_MANAGER","SUPERVISOR","QAQC_ENGINEER"];
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
  return memoizeInRequest("session", async () => {
  // Dev bypass: skip auth entirely ONLY when AUTH_BYPASS=true is set
  // explicitly AND we're not in production. By default (no env var), dev uses
  // real Better-Auth sessions so sign-in / sign-out and one-click role login
  // work end-to-end. The NODE_ENV check prevents accidental bypass in production.
  if (process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production") {
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
  } catch (err) {
    console.error("getSession failed:", err);
    return null;
  }
  });
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
  return memoizeInRequest("user", async () => {
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
  const isDevBypass = process.env.AUTH_BYPASS === "true" && process.env.NODE_ENV !== "production";
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
  });
}

/**
 * Get the current user's role (normalized). Falls back to the least-privileged
 * role (SALES) when there is no session — never grants broad access by default.
 */
export async function getUserRole(): Promise<string> {
  const user = await getCurrentUser();
  return user?.role ?? "SUPERVISOR";
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
  // OWNER, ADMIN, DEVELOPER, MANAGER are unscoped — they see all projects
  if (user.role === "OWNER" || user.role === "ADMIN" || user.role === "DEVELOPER" || user.role === "PROJECT_DIRECTOR" || user.role === "PROJECT_MANAGER") {
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
 * ───────────────────────────────────────────────────────────────
 *  GLOBAL SCOPE SYSTEM
 * ───────────────────────────────────────────────────────────────
 * A single, server-side scope resolver that works for ALL models.
 * Instead of writing scope filters in every page/API one by one,
 * call `scopeWhere("Employee", baseWhere)` and the correct filter is
 * applied automatically based on the viewer's scope type.
 *
 * How it works:
 *   COMPANY scope  → no filter (sees everything)
 *   DEPARTMENT scope → filters by departmentId (or equivalent FK)
 *   PROJECT scope  → filters by projectId / activeProjectId
 *
 * The filter is applied in the Prisma `where` clause — the server
 * never queries rows the viewer shouldn't see. This is NOT client-
 * side filtering; the data never leaves the database.
 *
 * Usage:
 *   const where = await scopeWhere("Employee", { companyId, deletedAt: null });
 *   const employees = await prisma.employee.findMany({ where });
 *
 *   const where = await scopeWhere("MaterialIssue", { companyId });
 *   const issues = await prisma.materialIssue.findMany({ where });
 */
export async function scopeWhere(
  model: string,
  baseWhere: Record<string, unknown> = {},
): Promise<Record<string, unknown>> {
  const scope = await getUserScope();
  // COMPANY scope = unscoped = sees everything
  if (scope.scopeType === "COMPANY") return baseWhere;

  // Map each model to its scope-relevant foreign key
  const SCOPE_FIELDS: Record<string, { department?: string; project?: string }> = {
    // HR
    Employee:             { department: "departmentId", project: "activeProjectId" },
    WorkerAttendance:     { project: "projectId" },
    LeaveRequest:        { project: "projectId" },
    PayrollLine:          { department: "employee.departmentId", project: "employee.activeProjectId" },
    // Inventory
    MaterialIssue:        { project: "projectId", department: "departmentId" },
    MaterialRequisition:  { project: "projectId", department: "departmentId" },
    StockMovement:        { project: "projectId" },
    GoodsReceipt:         { project: "projectId" },
    MaterialReconciliation: { project: "projectId" },
    // Projects / Construction
    Task:                 { project: "projectId" },
    Crew:                 { project: "projectId" },
    DailyProgressReport:  { project: "projectId" },
    DailyReport:          { project: "projectId" },
    Quotation:            { project: "projectId" },
    ChangeOrder:          { project: "projectId" },
    WorkOrder:            { project: "projectId" },
    SubcontractorWorkOrder: { project: "projectId" },
    MeasurementBook:      { project: "projectId" },
    MeasurementBookEntry: { project: "projectId" },
    RaBill:               { project: "projectId" },
    BoqItem:              { project: "projectId" },
    WbsNode:              { project: "projectId" },
    ProjectPhase:         { project: "projectId" },
    ProjectCost:          { project: "projectId" },
    ProjectAssignment:    { project: "projectId" },
    BuiltUnit:            { project: "projectId" },
    Tenancy:              { project: "projectId" },
    // Finance
    Expense:              { project: "projectId" },
    ExpenseBudget:        { project: "projectId" },
    ExpenseClaim:         { project: "projectId" },
    RecurringExpense:     { project: "projectId" },
    PettyCashFloat:       { project: "projectId" },
    AssetSale:            { project: "projectId" },
    MaterialSale:         { project: "projectId" },
    // Land
    LandPurchase:         { project: "projectId" },
    LandParcel:           { project: "projectId" },
    // Safety
    NonConformanceReport: { project: "projectId" },
    SafetyHazard:         { project: "projectId" },
    SafetyIncident:       { project: "projectId" },
    SafetyInspection:     { project: "projectId" },
    Capa:                 { project: "projectId" },
    // Sales / CRM
    Lead:                 { project: "projectId" },
    // Gate
    GatePass:             { project: "projectId" },
    // Equipment
    EquipmentAssignment:  { project: "projectId" },
    // Models without project/department FKs are not scopeable
  };

  const fields = SCOPE_FIELDS[model];
  if (!fields) return baseWhere;

  const filter: Record<string, unknown> = {};

  if (scope.scopeType === "DEPARTMENT" && scope.departmentIds.length > 0 && fields.department) {
    const deptField = fields.department;
    if (deptField.includes(".")) {
      // Nested relation filter (e.g. "employee.departmentId")
      const parts = deptField.split(".");
      const rel = parts[0]!;
      const key = parts[1]!;
      filter[rel] = { [key]: { in: scope.departmentIds } };
    } else {
      filter[deptField] = { in: scope.departmentIds };
    }
  } else if (scope.scopeType === "PROJECT" && scope.projectIds.length > 0 && fields.project) {
    const projField = fields.project;
    if (projField.includes(".")) {
      const parts = projField.split(".");
      const rel = parts[0]!;
      const key = parts[1]!;
      filter[rel] = { [key]: { in: scope.projectIds } };
    } else {
      filter[projField] = { in: scope.projectIds };
    }
  }

  // Merge scope filter with the base where clause
  return { ...baseWhere, ...filter };
}

/**
 * Check if the current viewer can access a specific entity.
 * Uses the same scope logic as scopeWhere but for a single record.
 * Returns true if the viewer's scope includes the entity.
 */
export async function canAccessEntity(
  model: string,
  entity: { departmentId?: string | null; projectId?: string | null; activeProjectId?: string | null },
): Promise<boolean> {
  const scope = await getUserScope();
  if (scope.scopeType === "COMPANY") return true;

  if (scope.scopeType === "DEPARTMENT" && scope.departmentIds.length > 0) {
    const deptId = entity.departmentId;
    if (!deptId) return false; // no department = not visible to dept-scoped users
    return scope.departmentIds.includes(deptId);
  }

  if (scope.scopeType === "PROJECT" && scope.projectIds.length > 0) {
    const projId = entity.projectId ?? entity.activeProjectId;
    if (!projId) return false;
    return scope.projectIds.includes(projId);
  }

  return true;
}

/**
 * Employee access scope — determines what the current viewer can see
 * and manage in the employee directory. This is the ROOT-LEVEL filter:
 * the server uses this to decide which employees to query, which fields
 * to include, and which actions to allow. The client never receives data
 * it shouldn't see.
 *
 * Returns:
 *   - employeeFilter: Prisma where-clause for the Employee query
 *   - canSeeBankDetails: bank account fields
 *   - canSeePayroll: payroll history + salary components
 *   - canSeePersonalDocs: PAN, Aadhaar, PF, ESI, UAN
 *   - canSeeAccessInfo: user role, phone verification status
 *   - canManageEmployee: can edit profile, onboarding, documents
 *   - canManageAccess: can assign roles, permissions, scope
 *   - canManagePayroll: can mark as paid, edit salary
 */
export async function getEmployeeAccessScope() {
  const role = await getUserRole();
  const scope = await getUserScope();
  const perms = await getUserPermissions();

  const hasPerm = (p: string) => perms.includes(p);

  // ── Visibility filter: which employees can the viewer see? ──
  // Uses the global scopeWhere helper — same logic for all models.
  const employeeFilter = await scopeWhere("Employee", {});

  // ── Field visibility: which fields can the viewer see? ──
  // Bank details, payroll, salary → only PAYROLL_MANAGE or HR_MANAGE
  const canSeeBankDetails = hasPerm("payroll.manage") || hasPerm("hr.manage");
  const canSeePayroll = hasPerm("payroll.manage") || hasPerm("hr.manage");
  const canSeePersonalDocs = hasPerm("hr.manage") || hasPerm("payroll.manage");
  // Access info (role, phone verification) → only USERS_MANAGE or HR_MANAGE
  const canSeeAccessInfo = hasPerm("users.manage") || hasPerm("hr.manage");

  // ── Management: what can the viewer do? ──
  const canManageEmployee = hasPerm("hr.manage");
  const canManageAccess = hasPerm("users.manage");
  const canManagePayroll = hasPerm("payroll.manage");
  const canManageOnboarding = hasPerm("hr.manage");

  return {
    role,
    employeeFilter,
    canSeeBankDetails,
    canSeePayroll,
    canSeePersonalDocs,
    canSeeAccessInfo,
    canManageEmployee,
    canManageAccess,
    canManagePayroll,
    canManageOnboarding,
    scopeType: scope.scopeType,
    departmentIds: scope.departmentIds,
  };
}

/**
 * ───────────────────────────────────────────────────────────────
 *  ACTION PERMISSIONS — scope-aware action gating
 * ───────────────────────────────────────────────────────────────
 * Combines permission + scope + hierarchy into a single object
 * that pages use to gate FABs, buttons, action menus, and forms.
 *
 * The server computes this once, passes it to the client as flags.
 * The client never decides on its own whether an action is allowed —
 * it only renders what the server says it can.
 *
 * For create actions (FABs):
 *   canCreateEmployee = hasPerm(HR_MANAGE) AND scope allows creation
 *   (COMPANY scope → yes; DEPARTMENT scope → yes, but form restricts
 *   dept to their depts; PROJECT scope → yes, but form restricts
 *   project to their projects)
 *
 * For form options:
 *   allowedDepartmentIds = [] (COMPANY) or scope.departmentIds (DEPARTMENT)
 *   allowedProjectIds = [] (COMPANY) or scope.projectIds (PROJECT)
 *   The form uses these to filter its dropdowns.
 *
 * For entity-specific actions (edit, delete, mark-paid):
 *   Use canManageSpecificEmployee() which already checks hierarchy.
 *   Scope is already enforced by the query filter — if the viewer
 *   can't see the employee, they can't even get to the detail page.
 */
export async function getActionPermissions() {
  const role = await getUserRole();
  const scope = await getUserScope();
  const perms = await getUserPermissions();
  const hasPerm = (p: string) => perms.includes(p);

  // ── Create permissions (FABs) ──
  // A viewer can create if they have the permission AND their scope
  // allows it. COMPANY scope = unrestricted. DEPARTMENT/PROJECT scope
  // = can create, but the form must restrict the target to their scope.
  const canCreateEmployee = hasPerm("hr.manage");
  const canRecordLeave = hasPerm("hr.manage");
  const canCreateMaterial = hasPerm("inventory.manage");
  const canCreateWorkOrder = hasPerm("sales.manage") || hasPerm("projects.manage");
  const canCreateProject = hasPerm("projects.manage") && scope.scopeType === "COMPANY";
  const canCreateCompany = hasPerm("company.manage") && scope.scopeType === "COMPANY";
  const canCreateDepartment = hasPerm("company.manage");
  const canCreateCustomer = hasPerm("sales.manage");
  const canCreateLead = hasPerm("sales.manage");
  const canCreateSupplier = hasPerm("inventory.manage");
  const canCreateEquipment = hasPerm("inventory.manage");
  const canCreateMaterialSale = hasPerm("inventory.manage");
  const canCreateRental = hasPerm("inventory.manage");
  const canCreateGatePass = hasPerm("inventory.manage");
  const canCreateChangeOrder = hasPerm("projects.manage");
  const canCreateBoq = hasPerm("projects.manage");
  const canCreateWbs = hasPerm("projects.manage");
  const canCreateNcr = hasPerm("projects.manage") || hasPerm("inventory.manage");
  const canCreateLand = hasPerm("projects.manage");
  const canCreatePortalListing = hasPerm("sales.manage");
  const canCreatePayroll = hasPerm("payroll.manage") || hasPerm("hr.manage");
  const canCreateTeamMember = hasPerm("company.manage");
  const canCreateBuiltUnit = hasPerm("projects.manage");
  const canCreateSms = hasPerm("inventory.manage") || hasPerm("hr.manage");

  // ── Form option restrictions ──
  // When scope is DEPARTMENT, the department dropdown in any create/edit
  // form should only show the viewer's departments. Same for PROJECT scope.
  const restrictDepartments = scope.scopeType === "DEPARTMENT" && scope.departmentIds.length > 0;
  const restrictProjects = scope.scopeType === "PROJECT" && scope.projectIds.length > 0;
  const allowedDepartmentIds = restrictDepartments ? scope.departmentIds : null; // null = no restriction
  const allowedProjectIds = restrictProjects ? scope.projectIds : null;

  return {
    role,
    scopeType: scope.scopeType,
    canCreateEmployee,
    canRecordLeave,
    canCreateMaterial,
    canCreateWorkOrder,
    canCreateProject,
    canCreateCompany,
    canCreateDepartment,
    canCreateCustomer,
    canCreateLead,
    canCreateSupplier,
    canCreateEquipment,
    canCreateMaterialSale,
    canCreateRental,
    canCreateGatePass,
    canCreateChangeOrder,
    canCreateBoq,
    canCreateWbs,
    canCreateNcr,
    canCreateLand,
    canCreatePortalListing,
    canCreatePayroll,
    canCreateTeamMember,
    canCreateBuiltUnit,
    canCreateSms,
    allowedDepartmentIds,
    allowedProjectIds,
  };
}

/** Type returned by getActionPermissions() — used by client components
 *  that receive the serialized actions object as a prop. */
export type ActionPermissions = Awaited<ReturnType<typeof getActionPermissions>>;

/**
 * Validate that a target department/project is within the current
 * viewer's scope. Throws a 403-style error if not. Used by create/update
 * APIs to prevent scope-escape via direct API calls.
 */
export async function assertScopeAllows(
  target: { departmentId?: string | null; projectId?: string | null },
): Promise<void> {
  const scope = await getUserScope();
  if (scope.scopeType === "COMPANY") return;

  if (scope.scopeType === "DEPARTMENT" && scope.departmentIds.length > 0) {
    if (target.departmentId && !scope.departmentIds.includes(target.departmentId)) {
      throw new Error("You can only create/edit within your department");
    }
  }

  if (scope.scopeType === "PROJECT" && scope.projectIds.length > 0) {
    const projId = target.projectId;
    if (projId && !scope.projectIds.includes(projId)) {
      throw new Error("You can only create/edit within your project");
    }
  }
}

/**
 * Filter an array of options (departments/projects) to only those
 * within the viewer's scope. Used by pages to pass restricted option
 * lists to create/edit forms.
 */
export function filterOptionsByScope<T extends { id: string }>(
  options: T[],
  allowedIds: string[] | null,
): T[] {
  if (allowedIds === null) return options; // null = no restriction
  return options.filter((o) => allowedIds.includes(o.id));
}

/**
 * Get scoped form options for a page — departments, projects, and crews
 * filtered by the viewer's scope. This is the systemic fix for Layer C:
 * instead of filtering dropdowns in 136+ client components, filter at the
 * server level before serialization. The client never receives out-of-scope
 * options.
 *
 * Usage in a page loader:
 *   const opts = await getScopedFormOptions();
 *   // opts.departments, opts.projects, opts.crews — all pre-filtered
 *
 * For COMPANY scope, returns all options (no filtering).
 * For DEPARTMENT scope, returns only the viewer's departments + projects
 *   in those departments.
 * For PROJECT scope, returns only the viewer's projects + departments that
 *   contain those projects.
 */
export async function getScopedFormOptions(): Promise<{
  departments: { id: string; name: string }[];
  projects: { id: string; name: string }[];
  crews: { id: string; name: string }[];
  suppliers: { id: string; name: string }[];
  customers: { id: string; name: string }[];
}> {
  const company = await getCompany();
  const scope = await getUserScope();

  // COMPANY scope = no filtering
  if (scope.scopeType === "COMPANY") {
    const [departments, projects, crews, suppliers, customers] = await Promise.all([
      prisma.department.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.project.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.crew.findMany({ where: { companyId: company.id, active: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.supplier.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.customer.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { departments, projects, crews, suppliers, customers };
  }

  // DEPARTMENT scope: filter departments to viewer's, projects to those depts.
  // Projects don't have a direct departmentId — find projects where employees
  // in the viewer's departments are assigned (via Employee.activeProjectId).
  if (scope.scopeType === "DEPARTMENT" && scope.departmentIds.length > 0) {
    const departments = await prisma.department.findMany({
      where: { id: { in: scope.departmentIds }, companyId: company.id, deletedAt: null },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
    // Find project IDs from employees in the viewer's departments
    const employeesInDept = await prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, departmentId: { in: scope.departmentIds }, activeProjectId: { not: null } },
      select: { activeProjectId: true }, distinct: ["activeProjectId"],
    });
    const projectIds = employeesInDept.map((e) => e.activeProjectId).filter(Boolean) as string[];
    const projects = projectIds.length > 0
      ? await prisma.project.findMany({ where: { id: { in: projectIds }, companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];
    const crews = await prisma.crew.findMany({
      where: { companyId: company.id, active: true, projectId: { in: projectIds.length > 0 ? projectIds : ["__none__"] } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
    // Suppliers and customers are company-level, not department-scoped
    const [suppliers, customers] = await Promise.all([
      prisma.supplier.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.customer.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { departments, projects, crews, suppliers, customers };
  }

  // PROJECT scope: filter projects to viewer's, departments from employees in those projects
  if (scope.scopeType === "PROJECT" && scope.projectIds.length > 0) {
    const projects = await prisma.project.findMany({
      where: { id: { in: scope.projectIds }, companyId: company.id, deletedAt: null },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
    // Find department IDs from employees in the viewer's projects
    const employeesInProj = await prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, activeProjectId: { in: scope.projectIds }, departmentId: { not: null } },
      select: { departmentId: true }, distinct: ["departmentId"],
    });
    const deptIds = [...new Set(employeesInProj.map((e) => e.departmentId).filter(Boolean))] as string[];
    const departments = deptIds.length > 0
      ? await prisma.department.findMany({ where: { id: { in: deptIds }, companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } })
      : [];
    const crews = await prisma.crew.findMany({
      where: { companyId: company.id, active: true, projectId: { in: scope.projectIds } },
      select: { id: true, name: true }, orderBy: { name: "asc" },
    });
    const [suppliers, customers] = await Promise.all([
      prisma.supplier.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.customer.findMany({ where: { companyId: company.id, deletedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return { departments, projects, crews, suppliers, customers };
  }

  // Fallback (shouldn't happen)
  return { departments: [], projects: [], crews: [], suppliers: [], customers: [] };
}

/**
 * Check if the current viewer can manage a specific employee.
 * Combines the access scope with a hierarchy check: the viewer must
 * be at a higher tier (lower number) than the employee's linked user.
 * Returns false for self-management (can't edit your own profile via
 * the employee page) and for employees at or above the viewer's tier.
 */
export async function canManageSpecificEmployee(
  employee: { userId: string | null; user?: { role: string | null } | null; hierarchyLevel?: number | null },
  viewerUserId: string,
): Promise<boolean> {
  const scope = await getEmployeeAccessScope();
  if (!scope.canManageEmployee) return false;

  // Self-edit blocked
  if (employee.userId && employee.userId === viewerUserId) return false;

  // No linked user → can manage (field worker without login)
  if (!employee.userId || !employee.user?.role) return true;

  // ── Hierarchy level check (H1-H6) ──
  // Lower number = higher authority. A viewer can only manage employees
  // with a STRICTLY higher hierarchyLevel number (lower authority).
  // e.g. H3 can manage H4, H5, H6 but NOT H1, H2, or other H3s.
  // If either the viewer or target has no hierarchyLevel set, fall back to
  // the RBAC role tier check only.
  const company = await getCompany();
  const { prisma } = await import("@nirman/db");
  const viewerEmployee = await prisma.employee.findFirst({
    where: { userId: viewerUserId, companyId: company.id, deletedAt: null },
    select: { hierarchyLevel: true },
  }).catch(() => null);

  if (
    viewerEmployee?.hierarchyLevel != null &&
    employee.hierarchyLevel != null
  ) {
    // Viewer must be at a strictly lower number (higher authority)
    if (viewerEmployee.hierarchyLevel >= employee.hierarchyLevel) return false;
  }

  // Hierarchy check: viewer must be above the employee's role
  const { canAssignRole, isCustomRole, roleTier } = await import("@/lib/roles");
  const employeeRole = employee.user.role;
  if (isCustomRole(employeeRole)) {
    // Custom role — look up tier from DB
    const customRole = await prisma.customRole.findFirst({
      where: { companyId: company.id, key: employeeRole },
      select: { tier: true },
    }).catch(() => null);
    if (!customRole) return false;
    return canAssignRole(scope.role, employeeRole) || customRole.tier > roleTier(scope.role);
  }
  return canAssignRole(scope.role, employeeRole);
}

/**
 * Assert that the current viewer can manage a specific employee (by ID).
 * Fetches the employee, checks hierarchy + role tier, and throws 403 if not.
 * Use this at the top of any employee mutation route (salary, phone, contract,
 * onboarding, etc.) to enforce hierarchy at the API level.
 */
export async function assertCanManageEmployee(employeeId: string, companyId: string): Promise<void> {
  const currentUser = await getCurrentUser();
  if (!currentUser) return; // dev-bypass
  const { prisma } = await import("@nirman/db");
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null },
    select: { userId: true, hierarchyLevel: true, user: { select: { role: true } } },
  });
  if (!employee) throw new Error("Employee not found");
  const canEdit = await canManageSpecificEmployee(
    { userId: employee.userId, user: employee.user ? { role: employee.user.role } : null, hierarchyLevel: employee.hierarchyLevel },
    currentUser.id,
  );
  if (!canEdit) {
    throw new Error("You cannot manage this employee (hierarchy or role restriction)");
  }
}

/**
 * Get the current user's effective permission list (role matrix +
 * any additive RolePermission overrides from the DB + per-user
 * UserPermission overrides). Memoized per request via AsyncLocalStorage
 * so repeated requirePermission() calls within one request share a single
 * DB round-trip.
 */
export async function getUserPermissions(): Promise<string[]> {
  return memoizeInRequest("permissions", async () => {
  const user = await getCurrentUser();
  if (!user) return [];
  const company = await getCompany();

  // ── If the user has a custom role, resolve it from the DB ──
  // Custom roles store a baseRole (for tier + default permissions) and
  // an additional permissions array. We resolve the base role's
  // permissions + the custom role's permissions + any RolePermission
  // overrides + UserPermission overrides.
  if (isCustomRole(user.role)) {
    const customRole = await prisma.customRole.findFirst({
      where: { companyId: company.id, key: user.role },
    }).catch(() => null);

    if (customRole) {
      const baseRole = customRole.baseRole;
      const [roleOverrides, userMembership] = await Promise.all([
        prisma.rolePermission
          .findMany({ where: { role: user.role }, select: { permission: true } })
          .then((rows) => rows.map((r) => r.permission))
          .catch(() => [] as string[]),
        prisma.userCompany
          .findUnique({
            where: { userId_companyId: { userId: user.id, companyId: company.id } },
            include: { userPermissions: { select: { permission: true } } },
          })
          .catch(() => null),
      ]);
      const userOverrides = userMembership?.userPermissions.map((p) => p.permission) ?? [];
      // Start with the base role's permissions, add custom role permissions,
      // add RolePermission overrides, add UserPermission overrides.
      return effectivePermissions(baseRole, [...customRole.permissions, ...roleOverrides, ...userOverrides]);
    }
    // Custom role not found in DB — fall back to SUPERVISOR permissions
    return effectivePermissions("SUPERVISOR", []);
  }

  // ── Standard built-in role ──
  // Fetch role-level and user-level overrides in parallel
  const [roleOverrides, userMembership] = await Promise.all([
    prisma.rolePermission
      .findMany({ where: { role: user.role }, select: { permission: true } })
      .then((rows) => rows.map((r) => r.permission))
      .catch(() => [] as string[]),
    prisma.userCompany
      .findUnique({
        where: { userId_companyId: { userId: user.id, companyId: company.id } },
        include: { userPermissions: { select: { permission: true } } },
      })
      .catch(() => null),
  ]);
  const userOverrides = userMembership?.userPermissions.map((p) => p.permission) ?? [];
  return effectivePermissions(user.role, [...roleOverrides, ...userOverrides]);
  });
}

/**
 * Identity payload for the nav shells (desktop AppShell + mobile
 * MobileShellV2). Resolved once per request in the root layout so the
 * nav renders with the real role/permissions/company on first paint —
 * no client-side /api/me + /api/company waterfall after hydration.
 *
 * `me` matches the /api/me response shape and `company` matches
 * /api/company, so both can seed SWR's `fallback` cache directly — every
 * client consumer (AppShell, usePermissions, page hooks) starts with
 * real data instead of a least-privileged placeholder.
 */
export interface NavBootstrap {
  me: {
    id: string;
    name: string | null;
    email: string | null;
    role: string;
    permissions: string[];
  };
  company: {
    id: string;
    name: string;
    currency: string;
    gstin: string | null;
    pan: string | null;
    address: string | null;
    phone: string | null;
    email: string | null;
    businessType: string | null;
    parentCompanyId: string | null;
    companies: {
      id: string;
      name: string;
      businessType: string | null;
      parentName: string | null;
      parentCompanyId: string | null;
      isCurrent: boolean;
    }[];
  };
}

/**
 * Resolve the nav identity for the current request, or null when there is
 * no authenticated session (public routes — the client auth guard handles
 * the redirect). Memoized per request: the root layout's call and the /m
 * layout's call share one computation when the ALS context propagates.
 */
export async function getNavBootstrap(): Promise<NavBootstrap | null> {
  const run = () =>
    memoizeInRequest("navBootstrap", async () => {
      const user = await getCurrentUser();
      if (!user) return null;

      const [company, permissions] = await Promise.all([
        getCompany(),
        getUserPermissions(),
      ]);

      // Same visibility rule as GET /api/company: superusers (and dev-bypass)
      // see every company; everyone else sees only their memberships.
      const isSuperuser = user.role === "OWNER" || user.role === "ADMIN";
      const isDevBypass =
        process.env.AUTH_BYPASS === "true" &&
        process.env.NODE_ENV !== "production" &&
        user.id === "dev";
      const visible = await prisma.company.findMany({
        where: {
          deletedAt: null,
          ...(isSuperuser || isDevBypass
            ? {}
            : { userMemberships: { some: { userId: user.id } } }),
        },
        orderBy: { name: "asc" },
        select: {
          id: true,
          name: true,
          businessType: true,
          parentCompanyId: true,
          parent: { select: { id: true, name: true } },
        },
      });

      return {
        me: {
          id: user.id,
          name: user.name || null,
          email: user.email || null,
          role: user.role,
          permissions,
        },
        company: {
          id: company.id,
          name: company.name,
          currency: company.currency,
          gstin: company.gstin,
          pan: company.pan,
          address: company.address,
          phone: company.phone,
          email: company.email,
          businessType: company.businessType,
          parentCompanyId: company.parentCompanyId,
          companies: visible.map((c) => ({
            id: c.id,
            name: c.name,
            businessType: c.businessType,
            parentName: c.parent?.name ?? null,
            parentCompanyId: c.parentCompanyId ?? null,
            isCurrent: c.id === company.id,
          })),
        },
      };
    });
  // When no request context is active (called outside apiHandler/layout),
  // create one so the internal getCurrentUser/getCompany/getUserPermissions
  // calls still dedupe among themselves.
  if (!requestContextALS.getStore()) return runWithRequestContext(run);
  return run();
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
  if (user.role === "OWNER" || user.role === "ADMIN" || user.role === "DEVELOPER") return user;
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
 * Get the current user's UserCompany membership for the active company.
 * Returns the membership row (with id, role, scopeType, reportsToUserCompanyId)
 * or null if the user has no membership in the current company.
 *
 * In dev-bypass mode with the synthetic "dev" user (no real DB row), this
 * returns null — callers should handle that gracefully (e.g. allow the
 * operation without hierarchy enforcement).
 */
export async function getCurrentUserMembership(): Promise<{
  id: string;
  role: string;
  scopeType: string | null;
  reportsToUserCompanyId: string | null;
} | null> {
  const user = await getCurrentUser();
  if (!user || !user.companyId) return null;
  // The synthetic "dev" user has no real UserCompany row.
  if (user.id === "dev") return null;
  return prisma.userCompany.findFirst({
    where: { userId: user.id, companyId: user.companyId, active: true },
    select: { id: true, role: true, scopeType: true, reportsToUserCompanyId: true },
  });
}

/**
 * Wrap an API handler with auth + error handling.
 * Returns 401 if no session is found (unless AUTH_BYPASS is set).
 * Mutations (POST/PATCH/PUT/DELETE) automatically write an AuditLog
 * entry on success when `audit` options are provided.
 *
 * **Auto-applies rate limiting**: GET → `read` preset, mutations → `write`
 * preset. Override with `{ rateLimit: "heavy" }` or `{ rateLimit: false }`.
 *
 * **Prisma error mapping**: P2024 (pool exhausted) → 503, P1001 (DB
 * unreachable) → 503, P1002 (timeout) → 504 — so the start wrapper / load
 * balancer can retry instead of returning a 500.
 *
 * **Sentry**: 500 errors are captured via `Sentry.captureException`
 * (dynamic import, no-op without `SENTRY_DSN`).
 */
export function apiHandler<TReq extends Request = Request, TCtx = unknown>(
  fn: (req: TReq, ctx: TCtx) => Promise<Response>,
  opts: {
    audit?: { action: string; entityType: string; entityIdFrom?: (req: TReq, res: Response) => string | undefined };
    rateLimit?: "read" | "write" | "auth" | "webhook" | "heavy" | false;
    /** Cache tag for server-side caching (GET only). Set to enable. */
    cache?: { tag: string; ttlMs?: number };
    /** Skip session check — for cron/webhook routes that authenticate via secret header. */
    skipSession?: boolean;
  } = {},
) {
  return async (req: Request, ctx: TCtx): Promise<Response> => {
    // ── Backpressure protection ────────────────────────────────
    // If the server is at capacity, reject early with 503 + Retry-After.
    // This prevents request queueing that wastes DB connections + memory.
    const bp = getBackpressureStats();
    if (bp.activeRequests >= bp.maxConcurrency) {
      return json(
        { error: "Server is busy — please retry shortly", retryable: true },
        { status: 503, headers: { "Retry-After": "2" } },
      );
    }

    // Track active requests for backpressure
    const untrack = trackRequest();
    return runWithRequestContext(async () => {
    try {
        if (!opts.skipSession) {
          const session = await getSession();
          if (!session) {
            return json({ error: "Unauthorized" }, { status: 401 });
          }
        }

        // Auto-apply rate limiting (unless explicitly disabled).
        const rlPreset = opts.rateLimit === undefined
          ? (req.method === "GET" ? "read" : "write")
          : opts.rateLimit;
        if (rlPreset) {
          const user = await getCurrentUser();
          const rl = rateLimit(req, RATE_LIMITS[rlPreset], user?.id);
          if (rl) return rl;
        }

        // ── Server-side response cache (GET only) ──────────────
        // Caches the full response in memory for the TTL duration.
        // Subsequent requests within the TTL are served from memory
        // without hitting the DB. Stale-while-revalidate on expiry.
        if (opts.cache && req.method === "GET") {
          const cachedFn = withCache(opts.cache.tag, opts.cache.ttlMs ?? 15_000, fn);
          const res = await cachedFn(req as TReq, ctx);
          // Auto-add Cache-Control header if not already set
          if (!res.headers.has("Cache-Control")) {
            const ttlSec = Math.ceil((opts.cache.ttlMs ?? 15_000) / 1000);
            res.headers.set(
              "Cache-Control",
              `private, max-age=${ttlSec}, stale-while-revalidate=${ttlSec * 4}`,
            );
          }
          return res;
        }

        const res = await fn(req as TReq, ctx);

        // ── Auto-add Cache-Control to GET responses ────────────
        // If the handler didn't set a Cache-Control header, add a
        // conservative default for GET requests (5s client cache +
        // 20s stale-while-revalidate). This lets the browser serve
        // repeated navigations from cache without re-fetching.
        if (req.method === "GET" && !res.headers.has("Cache-Control") && res.status >= 200 && res.status < 300) {
          res.headers.set(
            "Cache-Control",
            "private, max-age=5, stale-while-revalidate=20",
          );
        }

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
      if (err instanceof ServiceError) {
        return json({ error: err.message }, { status: err.status ?? 400 });
      }
      if (err instanceof SyntaxError && err.message.includes("JSON")) {
        return json({ error: "Malformed JSON in request body" }, { status: 400 });
      }
      if (err instanceof ForbiddenError) {
        return json({ error: err.message }, { status: 403 });
      }
      if (err instanceof UnauthorizedError) {
        return json({ error: err.message }, { status: 401 });
      }

      // Prisma error code mapping — transient DB errors get retryable status
      // codes so the start wrapper / load balancer can retry.
      const prismaCode = (err as { code?: string })?.code;
      if (prismaCode) {
        if (prismaCode === "P2024") {
          // Connection pool exhausted — the DB can't keep up. 503 tells
          // the load balancer to retry and the start wrapper to consider
          // a restart if it persists.
          console.error("[apiHandler] Prisma P2024: connection pool exhausted");
          return json({ error: "Database busy — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "5" } });
        }
        if (prismaCode === "P1001") {
          // DB unreachable — the DB is down or network is partitioned.
          console.error("[apiHandler] Prisma P1001: database unreachable");
          return json({ error: "Database unreachable — please retry shortly", retryable: true }, { status: 503, headers: { "Retry-After": "10" } });
        }
        if (prismaCode === "P1002") {
          // DB timeout — query took too long.
          console.error("[apiHandler] Prisma P1002: database timeout");
          return json({ error: "Database request timed out — please retry", retryable: true }, { status: 504 });
        }
      }

      // Log the full error server-side but don't leak internal details to the client
      console.error("[apiHandler] Unhandled error:", err);
      const status = (err as { status?: number })?.status ?? 500;

      // Capture 500s in Sentry (no-op without SENTRY_DSN).
      if (status >= 500) {
        try {
          const Sentry = await import("@sentry/nextjs");
          Sentry.captureException(err);
        } catch {
          // Sentry not available — continue without.
        }
      }

      return json({ error: status === 500 ? "Internal server error" : (err instanceof Error ? err.message : "Request failed") }, { status });
    } finally {
      untrack();
    }
    });
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
  // Delegate to apiHandler so this wrapper inherits ALL robustness layers:
  // backpressure protection, rate limiting, Prisma error mapping (P2024/P1001/
  // P1002 → 503/504), Sentry capture, Cache-Control headers, and the
  // request-scoped memoization context. The previous standalone try/catch
  // bypassed all of these — a 500 from a Prisma pool exhaustion would leak
  // as a raw 500 instead of a retryable 503, and there was no rate limiting.
  return apiHandler<TReq, TCtx>(async (req, ctx) => {
    await requirePermission(permission);
    return fn(req, ctx);
  });
}

/**
 * Wrap an API handler that requires one of the given roles.
 */
export function apiHandlerWithRole<TReq extends Request = Request, TCtx = unknown>(
  allowed: Role[],
  fn: (req: TReq, ctx: TCtx) => Promise<Response>,
) {
  // Delegate to apiHandler — see apiHandlerWithPermission for rationale.
  return apiHandler<TReq, TCtx>(async (req, ctx) => {
    await requireRole(...allowed);
    return fn(req, ctx);
  });
}

/** Roles allowed to view the procurement approvals queue. */
export const APPROVAL_QUEUE_ROLES = APPROVER_ROLES;
