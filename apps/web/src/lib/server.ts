import { AsyncLocalStorage } from "node:async_hooks";
import { prisma } from "@nirman/db";
import { z } from "zod";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import {
  normalizeRole,
  effectivePermissions,
  isCustomRole,
  roleTier,
  canAssignRole,
  canAssignCustomRole,
  ALL_ROLES,
  APPROVER_ROLES,
  ROLES,
  prettifyRoleKey,
  type Role,
} from "@/lib/roles";
import { logAction, resolveUserScope, ServiceError } from "@nirman/services";
import { recordError, notifyDevelopersOfError } from "@/lib/error-triage";
import { normalizePhoneForLookup } from "@/lib/phone-otp";
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
  actingDelegations?: Promise<DelegationInfo[]>;
  ownActingRole?: Promise<Role>;
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
  // as a side effect of a GET. Redirect to sign-in: middleware only checks
  // session-cookie *presence*, so a stale cookie (expired session, DB reset)
  // reaches here — the user must land on /sign-in, not a 500 error boundary.
  // API routes never reach this branch: apiHandler's getSession() gate
  // returns 401 first. If one ever does, NEXT_REDIRECT is caught by
  // apiHandler's error mapping and still surfaces as a JSON error.
  if (!user && !isDevBypass) {
    redirect("/sign-in");
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
    // Verify the user still has an ACTIVE membership in this company.
    // A terminated employee (deactivated UserCompany) should not resolve
    // to a company they no longer have access to.
    const assigned = await prisma.company.findFirst({
      where: {
        id: user.companyId,
        deletedAt: null,
        userMemberships: { some: { userId: user.id, active: true } },
      },
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
 * Returns IDs of every company that is a *descendant* of the given company —
 * direct children, grandchildren, and so on (BFS, depth-capped at 10 so a
 * hierarchy cycle can never loop forever).
 */
export async function getCompanyDescendantIds(companyId: string): Promise<string[]> {
  const ids = new Set<string>();
  let frontier = [companyId];
  for (let depth = 0; depth < 10 && frontier.length > 0; depth++) {
    const children = await prisma.company.findMany({
      where: { parentCompanyId: { in: frontier }, deletedAt: null },
      select: { id: true },
    });
    frontier = [];
    for (const c of children) {
      if (!ids.has(c.id) && c.id !== companyId) {
        ids.add(c.id);
        frontier.push(c.id);
      }
    }
  }
  return [...ids];
}

/**
 * Returns IDs of every company the user can *manage*: companies where they
 * hold an active membership, plus all descendants of those companies.
 *
 * This is the authorization set for hierarchy edits — creating a child
 * company or re-parenting onto a company must stay inside the caller's own
 * tree. Without this, anyone could graft a child under another tenant and
 * read its data through group-scoped queries (getCompanyGroupIds), since
 * group scope is relationship-based and does not check membership.
 */
export async function getManageableCompanyIds(userId: string): Promise<string[]> {
  const memberships = await prisma.userCompany.findMany({
    where: { userId, active: true, company: { deletedAt: null } },
    select: { companyId: true },
  });
  const ids = new Set(memberships.map((m) => m.companyId));
  for (const root of [...ids]) {
    for (const d of await getCompanyDescendantIds(root)) ids.add(d);
  }
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
  hsnCode: z.string().max(15).optional(),
  gstRate: z.number().min(0).max(100).optional(),
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
  quotationId: z.string().optional().nullable(),
  waiverReason: z.string().max(1000).optional().nullable(),
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
  // Vehicle / transport — captured at creation, carried onto the auto-created
  // gate pass and written back to the transfer on dispatch.
  vehicleType: z.string().max(50).optional(),
  vehicleNumber: z.string().max(50).optional(),
  driverName: z.string().max(100).optional(),
  driverPhone: z.string().max(20).optional(),
  transporterName: z.string().max(100).optional(),
  referenceNo: z.string().max(100).optional(),
  ewayBillNo: z.string().max(100).optional(),
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
  // Optional link to the APPROVED requisition authorizing this issue — the
  // service validates it belongs to the same project/department + company.
  requisitionId: z.string().optional().nullable(),
  lines: z.array(transferLineSchema).min(1, "At least one line is required"),
}).refine(
  (data) => (data.projectId ? !data.departmentId : !!data.departmentId),
  { message: "Specify either a project or a department (cost centre) — not both, not neither.", path: ["projectId"] },
);

// ── Land ──
/**
 * Money/decimal schema helper — accepts string or number, returns a string
 * to preserve precision (avoids float64 rounding from z.coerce.number()).
 * The service layer wraps the value in `new Decimal()`.
 */
const moneyField = (msg: string = "Amount must be > 0") =>
  z.union([z.string(), z.number()]).transform((v) => String(v)).refine((v) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0;
  }, msg);
const moneyFieldOptional = (msg: string = "Amount must be >= 0") =>
  z.union([z.string(), z.number()]).optional().nullable().transform((v) => v == null ? undefined : String(v)).refine((v) => {
    if (v == null) return true;
    const n = Number(v);
    return Number.isFinite(n) && n >= 0;
  }, msg);

export const landPurchaseSchema = z.object({
  projectId: z.string().optional().nullable(),
  sellerId: z.string().optional().nullable(),
  sellerName: z.string().min(1, "Seller name is required"),
  sellerContact: z.string().optional().nullable(),
  purchaseDate: z.string().optional().nullable(),
  totalArea: z.coerce.number().finite().positive("Total area must be > 0"),
  areaUnit: z.enum(["SQFT", "SQM", "SQYD", "ACRE", "BIGHA", "KATHA", "HECTARE"]).default("SQFT"),
  totalCost: moneyField("Total cost must be > 0"),
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
  totalCost: moneyField("Total cost must be > 0"),
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
  // Scheduled cost components — posted atomically with the purchase so an
  // interrupted wizard can't leave the purchase missing its cost breakdown.
  costComponents: z.array(z.object({
    label: z.string().min(1, "Label is required"),
    amount: z.coerce.number().finite().positive("Cost amount must be > 0"),
    frequency: z.enum(["ONE_TIME", "RECURRING"]).default("ONE_TIME"),
    interval: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY"]).optional().nullable(),
    startDate: z.string().optional().nullable(),
    endDate: z.string().optional().nullable(),
    occurrences: z.coerce.number().finite().positive().optional().nullable(),
    notes: z.string().optional().nullable(),
  })).optional(),
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
  totalCost: moneyField("Total cost must be > 0").optional(),
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
  dealMaturityMonths: z.coerce.number().int().positive().max(600).optional().nullable(),
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
  atsDocumentUrl: z.string().optional().nullable(),
  atsDocumentName: z.string().optional().nullable(),
  bbaDocumentUrl: z.string().optional().nullable(),
  bbaDocumentName: z.string().optional().nullable(),
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
  monthlyRent: moneyField("Monthly rent must be > 0"),
  securityDeposit: moneyFieldOptional("Security deposit must be >= 0"),
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
  monthlyRent: moneyField("Monthly rent must be > 0"),
  securityDeposit: moneyFieldOptional("Security deposit must be >= 0"),
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
  acquisitionCost: z.union([z.string(), z.number()]).transform((v) => String(v)).default("0"),
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
  // Consumption target — exactly one of projectId / departmentId must be set
  // (department-scoped indents are cost-centre requisitions, e.g. the rice mill).
  projectId: z.string().min(1).optional().nullable(),
  departmentId: z.string().min(1).optional().nullable(),
  phaseId: z.string().optional().nullable(),
  neededByDate: z.string().optional().nullable().refine((v) => !v || !isNaN(new Date(v).getTime()), "Invalid date"),
  notes: z.string().optional().nullable(),
  lines: z.array(requisitionLineSchema).min(1, "At least one line is required"),
  /** When true (default), the indent is auto-submitted for approval right
   *  after creation — eliminates the useless manual "Submit for Approval"
   *  step. Set to false to save as a draft instead. */
  autoSubmit: z.boolean().optional().default(true),
}).refine(
  (data) => (data.projectId ? !data.departmentId : !!data.departmentId),
  { message: "Specify either a project or a department (cost centre) — not both, not neither.", path: ["projectId"] },
);

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
// ── Salary components ──
// calculationType: FIXED (amount = value) | PERCENTAGE_OF_BASIC (amount =
// pct% × basic) | UNIT_RATE (amount = per-unit rate × quantity entered at
// payroll, e.g. ₹3/km travel, ₹150/day-worked food).
// Must match SalaryComponentTypeInput in @nirman/services — the union the
// payroll engine understands. A bare z.string() would let arbitrary type
// keys into SalaryComponent rows.
const SALARY_COMPONENT_TYPES = [
  "BASIC", "HRA", "DA", "TA", "SPECIAL_ALLOWANCE",
  "FOOD_ALLOWANCE", "MEDICAL_ALLOWANCE", "UNIFORM_ALLOWANCE",
  "WASHING_ALLOWANCE", "LTA", "PERFORMANCE_BONUS",
  "JOINING_BONUS", "RETENTION_BONUS",
  "EMPLOYER_PF", "EMPLOYEE_PF", "EMPLOYER_ESI", "EMPLOYEE_ESI",
  "GRATUITY", "PROFESSION_TAX", "TDS", "OTHER",
] as const;

export const salaryComponentInputSchema = z.object({
  type: z.enum(SALARY_COMPONENT_TYPES),
  amount: z.coerce.number().finite().nonnegative(),
  frequency: z.enum(["MONTHLY", "QUARTERLY", "HALF_YEARLY", "YEARLY", "ONE_TIME"]).optional(),
  isDeduction: z.boolean().optional(),
  isPercentage: z.boolean().optional(),
  percentageOfBasic: z.coerce.number().finite().nullable().optional(),
  calculationType: z.enum(["FIXED", "PERCENTAGE_OF_BASIC", "UNIT_RATE"]).optional(),
  unitType: z.enum(["DAY", "KM", "TRIP", "HOUR", "MONTH", "CUSTOM"]).nullable().optional(),
  unitLabel: z.string().max(40).nullable().optional(),
  notes: z.string().max(300).nullable().optional(),
}).refine(
  (c) => c.calculationType !== "UNIT_RATE" || c.unitType != null,
  { message: "Unit-rate components need a unitType", path: ["unitType"] },
);

export const salaryComponentsSetSchema = z.object({
  components: z.array(salaryComponentInputSchema),
});

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
  joinDate: z.string().optional().nullable().refine((v) => !v || !isNaN(new Date(v).getTime()), "Invalid join date"),
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
  contractStartDate: z.string().optional().nullable().refine((v) => !v || !isNaN(new Date(v).getTime()), "Invalid contract start date"),
  contractEndDate: z.string().optional().nullable().refine((v) => !v || !isNaN(new Date(v).getTime()), "Invalid contract end date"),
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
  salaryComponents: z.array(salaryComponentInputSchema).optional(),
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

// Itemized breakdown replace — amounts are recomputed server-side from
// rate × quantity, so the client never sends a trusted amount.
export const payrollLineComponentsSchema = z.object({
  components: z.array(z.object({
    type: z.string(),
    label: z.string().max(120).nullable().optional(),
    calculationType: z.enum(["FIXED", "PERCENTAGE_OF_BASIC", "UNIT_RATE"]).optional(),
    unitType: z.enum(["DAY", "KM", "TRIP", "HOUR", "MONTH", "CUSTOM"]).nullable().optional(),
    unitLabel: z.string().max(40).nullable().optional(),
    rate: z.coerce.number().finite().nonnegative(),
    quantity: z.coerce.number().finite().nonnegative().nullable().optional(),
    isDeduction: z.boolean().optional(),
    notes: z.string().max(300).nullable().optional(),
  })),
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
  skipAttendanceCheck: z.boolean().optional(),
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
  /** When true (default), the return is submitted right after creation —
   *  the DRAFT→SUBMITTED transition carries no approval semantics, so
   *  requiring a second click is pure ceremony. Set false to keep a draft. */
  autoSubmit: z.boolean().optional().default(true),
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
  // Must be a built-in role key or a CUSTOM_* key pattern — arbitrary strings
  // would be written to User.role verbatim and silently resolve to SUPERVISOR
  // permissions (normalizeRole fails closed, but the stored garbage confuses
  // every label/audit/UI surface). Existence of the custom role is checked
  // downstream against the company's CustomRole rows.
  role: z.string().refine(
    (v) => (ALL_ROLES as string[]).includes(v) || /^CUSTOM_[A-Z0-9_]{2,50}$/.test(v),
    "Role must be a built-in role or a CUSTOM_* role key",
  ).optional(),
  // Multi-role: additional hats held alongside the primary `role`. Same
  // key rules apply — built-in keys or CUSTOM_* keys. Each entry must be
  // assignable by the actor (checked downstream per role, not here).
  secondaryRoles: z.array(
    z.string().refine(
      (v) => (ALL_ROLES as string[]).includes(v) || /^CUSTOM_[A-Z0-9_]{2,50}$/.test(v),
      "Role must be a built-in role or a CUSTOM_* role key",
    ),
  ).max(8).optional(),
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
  // Test-only: allow switching roles via x-test-role header OR cookie (dev
  // bypass mode only). The header covers API/CLI callers; the cookie lets a
  // real browser drive the UI as a specific role (document.cookie) without
  // spinning up real auth sessions per role.
  const testRole =
    (await headers()).get("x-test-role") ??
    (await cookies()).get("x-test-role")?.value;
  // Optional: pin to a specific user (email or 10-digit phone) so browser tests
  // land in the right company/scope, not just the first user of that role.
  const testUser =
    (await headers()).get("x-test-user") ??
    (await cookies()).get("x-test-user")?.value;
  if (testUser || testRole) {
    // Match all stored phoneNormalized variants (10-digit vs 91-prefixed) —
    // the same normalization the real sign-in path uses.
    const phoneVariants = testUser ? normalizePhoneForLookup(testUser) : null;
    const u = await prisma.user.findFirst({
      where: testUser
        ? { OR: [{ email: testUser }, { phoneNormalized: { in: phoneVariants ?? [] } }, { phone: testUser }] }
        : { role: testRole },
      select: { id: true, email: true, name: true, role: true, companyId: true },
    });
    if (u) {
      return { id: u.id, email: u.email, name: u.name, role: u.role ?? "ADMIN", companyId: u.companyId };
    }
    // An explicit x-test-user that matches NOBODY must not silently fall back
    // to the first OWNER — that's a privilege-escalation bug that makes
    // negative permission tests run as a superuser and falsely pass. Fail
    // closed so the test/developer sees the miss immediately.
    if (testUser) {
      throw new Error(`[dev-bypass] x-test-user "${testUser}" matched no user — refusing to fall back to a privileged account`);
    }
  }

  if (_devUser) return _devUser;
  // Prefer the first OWNER (full permissions); fall back to ADMIN, then any
  // user; fall back to synthetic "dev" only if the DB has no users at all.
  const rolePriority = ["OWNER","ADMIN","DEVELOPER","PROJECT_DIRECTOR","FINANCE_HEAD","PROJECT_MANAGER","PROCUREMENT_MANAGER","HR_MANAGER","SITE_ENGINEER","STORE_KEEPER","ACCOUNTANT","SALES_MANAGER","SUPERVISOR","QAQC_ENGINEER","SECURITY_GUARD"];
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
  /** Phone number, when the account has one (phone-login users always do). */
  phone?: string | null;
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
    select: { id: true, role: true, companyId: true, active: true, phone: true },
  });
  if (!exists) return null;
  const role = normalizeRole(exists.role ?? u.role);
  return {
    id: u.id,
    email: u.email ?? "",
    name: u.name ?? "",
    phone: exists.phone ?? null,
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
  if (!user) return "SUPERVISOR";
  // Multi-role: when the user is wearing a secondary hat, that's the role
  // they act as (assignable-role lists, persona checks). NULL/stale hat or
  // no membership → the stored user role, exactly as before.
  const company = await getCompany().catch(() => null);
  const held = company ? await getHeldRoles(user.id, company.id) : null;
  return held?.activeRole ?? user.role;
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
  // OWNER, ADMIN, DEVELOPER, MANAGER are unscoped — they see all projects.
  // Acting role: a delegate holding e.g. OWNER authority inherits the
  // unscoped view (their own scope doesn't narrow the delegator's company).
  const actingRole = await getActingRole();
  if (actingRole === "OWNER" || actingRole === "ADMIN" || actingRole === "DEVELOPER" || actingRole === "PROJECT_DIRECTOR" || actingRole === "PROJECT_MANAGER") {
    return null; // null = unscoped (all projects)
  }
  // SUPERVISOR, SALES, ACCOUNTANT are scoped to their assigned projects.
  // Prefer the hierarchical UserScope (PROJECT scope) when present; fall back
  // to the legacy ProjectAssignment table for backwards compatibility.
  const company = await getCompany();
  const hierarchical = await resolveUserScope(user.id, company.id);
  if (hierarchical && hierarchical.scopeType === "COMPANY") {
    return null; // explicit company scope = unscoped — don't fall to legacy table
  }
  if (hierarchical && hierarchical.scopeType === "PROJECT" && hierarchical.projectIds.length > 0) {
    return hierarchical.projectIds;
  }
  // DEPARTMENT scope: infer project IDs from employees in those departments
  if (hierarchical && hierarchical.scopeType === "DEPARTMENT" && hierarchical.departmentIds.length > 0) {
    const employeesInDept = await prisma.employee.findMany({
      where: { companyId: company.id, deletedAt: null, departmentId: { in: hierarchical.departmentIds }, activeProjectId: { not: null } },
      select: { activeProjectId: true },
      distinct: ["activeProjectId"],
    });
    const projectIds = employeesInDept.map((e) => e.activeProjectId).filter(Boolean) as string[];
    return projectIds.length > 0 ? projectIds : []; // empty = no projects visible
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
  const SCOPE_FIELDS: Record<string, { department?: string | string[]; project?: string | string[] }> = {
    // HR
    Employee:             { department: "departmentId", project: "activeProjectId" },
    WorkerAttendance:     { project: "projectId" },
    LeaveRequest:        { project: "projectId" },
    PayrollLine:          { department: "employee.departmentId", project: "employee.activeProjectId" },
    // Inventory
    MaterialIssue:        { project: "projectId", department: "departmentId" },
    MaterialRequisition:  { project: "projectId", department: "departmentId" },
    // Movements have no projectId — they scope through their locations: a
    // project-scoped user sees any movement touching a location that belongs
    // to their projects (either end), incl. warehouse → site receipts.
    StockMovement:        { project: ["fromLocation.projectId", "toLocation.projectId"] },
    // GRNs have no projectId — they scope via their PO's project or the
    // receiving location's project (site stores).
    GoodsReceipt:         { project: ["purchaseOrder.projectId", "location.projectId"] },
    MaterialReconciliation: { project: "projectId" },
    // Projects / Construction
    // Task is intentionally not scopeable — see KNOWN_UNSCOPABLE below.
    Crew:                 { project: "projectId" },
    DailyProgressReport:  { project: "projectId" },
    DailyReport:          { project: "projectId" },
    QuotationRequest:     { project: "projectId" },
    Quotation:            { project: "projectId" }, // alias for backward compat
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
    // The project entity itself — project-scoped users see only their assigned
    // projects in lists/pickers (filter by the project's own id).
    Project:              { project: "id" },
    BuiltUnit:            { project: "projectId" },
    Tenancy:              { project: "projectId" },
    // Procurement
    PurchaseOrder:        { project: "projectId" },
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
    // Renovations run inside a project; site stores belong to a project or
    // department — both are scopeable.
    RenovationProject:    { project: "projectId" },
    StockLocation:        { project: "projectId", department: "departmentId" },
    StockLocationItem:    { project: "location.projectId", department: "location.departmentId" },
    // Models without project/department FKs are not scopeable
  };

  // Models that are intentionally not scopeable by project/department.
  // These are explicitly listed so that a typo or a new model that hasn't
  // been added to SCOPE_FIELDS doesn't silently fail open (returning
  // unscoped data). If a model is neither in SCOPE_FIELDS nor here,
  // we throw — forcing the developer to decide whether it should be scoped.
  const KNOWN_UNSCOPABLE = new Set([
    "Task", // assigned to a User, not to a project — not scopeable
  ]);

  const fields = SCOPE_FIELDS[model];
  if (!fields) {
    if (KNOWN_UNSCOPABLE.has(model)) return baseWhere;
    throw new Error(
      `scopeWhere: unknown model "${model}" — not in SCOPE_FIELDS or KNOWN_UNSCOPABLE. ` +
        "Add it to SCOPE_FIELDS with the correct project/department FK, or to KNOWN_UNSCOPABLE if intentionally unscoped. " +
        "Failing closed to prevent unscoped data access.",
    );
  }

  const filter: Record<string, unknown> = {};

  const buildFieldFilter = (fieldSpec: string | string[], ids: string[]) => {
    const specs = Array.isArray(fieldSpec) ? fieldSpec : [fieldSpec];
    const clauses = specs.map((spec) => {
      if (spec.includes(".")) {
        // Nested relation filter (e.g. "employee.departmentId")
        const [rel, key] = spec.split(".");
        return { [rel!]: { [key!]: { in: ids } } };
      }
      return { [spec]: { in: ids } };
    });
    return clauses.length === 1 ? clauses[0]! : { OR: clauses };
  };

  // A scoped user with an empty assignment list must see ZERO scoped rows —
  // skipping the filter when the id list is empty fails open to company-wide
  // visibility (e.g. a freshly-added SITE_ENGINEER saw every project in lists
  // while single-record reads 404'd).
  const denyAll = { ...baseWhere, id: { in: [] as string[] } };

  if (scope.scopeType === "DEPARTMENT") {
    if (fields.department) {
      if (scope.departmentIds.length === 0) return denyAll;
      Object.assign(filter, buildFieldFilter(fields.department, scope.departmentIds));
    } else if (fields.project) {
      // The model isn't department-addressable — fall back to the projects
      // visible through the department's deployed employees (same inference
      // getAssignedProjectIds/canAccessProject use) so list and record
      // access stay consistent.
      const effective = await getAssignedProjectIds();
      if (!effective || effective.length === 0) return denyAll;
      Object.assign(filter, buildFieldFilter(fields.project, effective));
    }
  } else if (scope.scopeType === "PROJECT" && fields.project) {
    // Effective ids = UserScope entries when present, else legacy
    // projectAssignment rows — the same set canAccessProject checks.
    const effective = await getAssignedProjectIds();
    if (!effective || effective.length === 0) return denyAll;
    Object.assign(filter, buildFieldFilter(fields.project, effective));
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

  if (scope.scopeType === "DEPARTMENT") {
    if (scope.departmentIds.length === 0) return false; // scoped but nothing assigned
    if (entity.departmentId) return scope.departmentIds.includes(entity.departmentId);
    // Entity isn't department-addressable — fall back to the dept's projects
    // (same inference as scopeWhere/getAssignedProjectIds).
    const projId = entity.projectId ?? entity.activeProjectId;
    if (!projId) return false;
    const effective = await getAssignedProjectIds();
    return !!effective && effective.includes(projId);
  }

  if (scope.scopeType === "PROJECT") {
    // Effective ids = UserScope entries when present, else legacy
    // projectAssignment rows — the same set canAccessProject checks.
    const effective = await getAssignedProjectIds();
    if (!effective || effective.length === 0) return false;
    const projId = entity.projectId ?? entity.activeProjectId;
    if (!projId) return false;
    return effective.includes(projId);
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
 *
 * FIELD TIER DEFINITIONS live in @/lib/employee-visibility — which columns
 * belong to each of these flags. Never serialize a raw Employee row; pass it
 * through pickEmployeeRoster()/redactEmployeeRow() from that module.
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
  // payroll.view is the read-only comp tier by design — its holders (finance,
  // accountants, payroll auditors) already read actual per-employee net pay
  // via /api/payroll lines, so wage fields must not sit behind a stricter gate.
  const canSeePayroll = hasPerm("payroll.view") || hasPerm("payroll.manage") || hasPerm("hr.manage");
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
  // ── Additional action flags for complete FAB gating ──
  const canCreateVehicle = hasPerm("inventory.manage");
  const canCreateStockLocation = hasPerm("inventory.manage") && scope.scopeType === "COMPANY";
  const canCreateStandardConsumption = hasPerm("inventory.manage");
  const canCreateRateContract = hasPerm("inventory.manage");
  const canCreateSubcontractor = hasPerm("projects.manage");
  const canCreateBroker = hasPerm("sales.manage");
  const canCreateTask = hasPerm("tasks.assign");
  const canCreateDpr = hasPerm("dpr.submit");
  const canCreateIndent = hasPerm("procurement.manage");
  const canCreatePo = hasPerm("procurement.manage");
  const canCreateQuotation = hasPerm("quotation.manage");
  const canCreateExpense = hasPerm("expense.create");
  const canCreateProjectCost = hasPerm("projectcost.create");
  const canCreateClaim = hasPerm("claim.create");
  const canManagePettyCash = hasPerm("pettycash.manage");
  const canManageSupplierPayment = hasPerm("supplierpayment.manage");
  const canCreateSafetyItem = hasPerm("safety.manage");

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
    canCreateVehicle,
    canCreateStockLocation,
    canCreateStandardConsumption,
    canCreateRateContract,
    canCreateSubcontractor,
    canCreateBroker,
    canCreateTask,
    canCreateDpr,
    canCreateIndent,
    canCreatePo,
    canCreateQuotation,
    canCreateExpense,
    canCreateProjectCost,
    canCreateClaim,
    canManagePettyCash,
    canManageSupplierPayment,
    canCreateSafetyItem,
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

  // A scoped user with an empty assignment list must not be able to write —
  // skipping the check when the list is empty fails open to company-wide
  // writes (a freshly-added site engineer could issue stock to ANY project).
  if (scope.scopeType === "DEPARTMENT") {
    if (scope.departmentIds.length === 0) {
      throw new Error("You don't have any assigned departments — ask an admin to assign your scope");
    }
    if (target.departmentId) {
      if (!scope.departmentIds.includes(target.departmentId)) {
        throw new Error("You can only create/edit within your department");
      }
      return;
    }
    // The target isn't department-addressable — it must be reachable through
    // the department's projects (same inference as scopeWhere).
    if (target.projectId) {
      const effective = await getAssignedProjectIds();
      if (!effective || !effective.includes(target.projectId)) {
        throw new Error("You can only create/edit within your department's projects");
      }
      return;
    }
    return; // no scoped target provided — nothing to check against
  }

  if (scope.scopeType === "PROJECT") {
    if (target.projectId) {
      // Effective ids = UserScope entries when present, else legacy
      // projectAssignment rows — the same set canAccessProject checks.
      const effective = await getAssignedProjectIds();
      if (!effective || !effective.includes(target.projectId)) {
        throw new Error("You can only create/edit within your project");
      }
      return;
    }
    // A project-scoped user targeting a department-only entity has no valid
    // target — departments aren't reachable through a project scope.
    if (target.departmentId) {
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

  // Hierarchy check: viewer must be above the employee's role.
  // Use the acting role (custom-role viewers act at their baseRole's tier,
  // not the normalized SUPERVISOR fallback getUserRole() would report) and
  // resolve custom TARGET roles via their DB tier — never feed a CUSTOM_*
  // string to canAssignRole(), which normalizes it to SUPERVISOR and
  // silently passes the tier check.
  const actingRole = await getActingRole();
  // Multi-role: the target's held set is { primary } ∪ secondaryRoles on
  // their membership. The viewer must be above EVERY held role — a dormant
  // senior hat still protects the target even while a junior hat is worn.
  const targetMembership = await prisma.userCompany
    .findFirst({
      where: { userId: employee.userId!, companyId: company.id },
      select: { role: true, secondaryRoles: true },
    })
    .catch(() => null);
  const heldRoles = [
    ...new Set(
      [employee.user.role, ...(targetMembership ? [targetMembership.role, ...(targetMembership.secondaryRoles ?? [])] : [])]
        .filter((r): r is string => !!r),
    ),
  ];
  return canManageRoleSet(actingRole, heldRoles, company.id);
}

/**
 * Can an actor at `actorRole` manage/assign `targetRole` — built-in or
 * custom? Custom roles resolve their tier from the CustomRole row in this
 * company; unknown role strings and missing custom roles fail closed.
 *
 * Use this wherever a check involves a stored (possibly CUSTOM_*) role —
 * canAssignRole() alone is unsafe there because normalizeRole() maps any
 * non-built-in string to SUPERVISOR (tier 5), letting every actor at
 * tier 1-4 pass the hierarchy check.
 */
export async function canManageRole(
  actorRole: string | undefined | null,
  targetRole: string | undefined | null,
  companyId: string,
): Promise<boolean> {
  if (!targetRole) return false;
  if (isCustomRole(targetRole)) {
    const customRole = await prisma.customRole.findFirst({
      where: { companyId, key: targetRole },
      select: { tier: true },
    }).catch(() => null);
    return customRole ? canAssignCustomRole(actorRole, customRole.tier) : false;
  }
  if (!(ALL_ROLES as string[]).includes(targetRole)) return false;
  return canAssignRole(actorRole, targetRole);
}

/**
 * Map of "companyId:roleKey" → display label for all custom roles across
 * the given companies. Build once per request/page when rendering a list
 * of stored (possibly CUSTOM_*) role values, then pass to roleDisplayLabel.
 */
export async function getCustomRoleLabels(companyIds: string[]): Promise<Map<string, string>> {
  if (companyIds.length === 0) return new Map();
  const rows = await prisma.customRole.findMany({
    where: { companyId: { in: companyIds } },
    select: { companyId: true, key: true, label: true },
  }).catch(() => [] as { companyId: string; key: string; label: string }[]);
  return new Map(rows.map((r) => [`${r.companyId}:${r.key}`, r.label]));
}

/**
 * Display label for any stored role key — custom role label → built-in
 * ROLES label → prettified key. Never show a raw "CUSTOM_*" key to a human.
 */
export function roleDisplayLabel(
  roleKey: string | null | undefined,
  companyId?: string,
  customLabels?: Map<string, string> | null,
): string {
  if (!roleKey) return "Member";
  const custom = companyId ? customLabels?.get(`${companyId}:${roleKey}`) : undefined;
  if (custom) return custom;
  const builtIn = ROLES[roleKey as keyof typeof ROLES];
  if (builtIn) return builtIn.label;
  return prettifyRoleKey(roleKey);
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
  // Apply scopeWhere so department/project-scoped viewers cannot manage
  // employees outside their scope — even if hierarchy would allow it.
  const employee = await prisma.employee.findFirst({
    where: { id: employeeId, companyId, deletedAt: null, ...await scopeWhere("Employee") },
    select: { userId: true, hierarchyLevel: true, user: { select: { role: true } } },
  });
  if (!employee) throw new Error("Employee not found or out of scope");
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
/**
 * The member's held role set + the hat currently worn.
 *
 * Multi-role model ("one hat at a time"): a membership holds
 * { role } ∪ secondaryRoles, and `activeRole` selects which single hat
 * drives all authority resolution. NULL or stale activeRole (a hat revoked
 * after it was worn) falls back to the primary role — resolvers can rely on
 * the returned activeRole always being a member of heldRoles.
 *
 * Returns null when the user has no membership in the company.
 */
export async function getHeldRoles(
  userId: string,
  companyId: string,
): Promise<{ primaryRole: string; activeRole: string; heldRoles: string[] } | null> {
  const m = await prisma.userCompany
    .findUnique({
      where: { userId_companyId: { userId, companyId } },
      select: { role: true, activeRole: true, secondaryRoles: true },
    })
    .catch(() => null);
  if (!m) return null;
  const heldRoles = [...new Set([m.role, ...(m.secondaryRoles ?? [])])];
  const activeRole = m.activeRole && heldRoles.includes(m.activeRole) ? m.activeRole : m.role;
  return { primaryRole: m.role, activeRole, heldRoles };
}

/**
 * Can the actor manage a target who holds the given role set? The actor
 * must be above EVERY held role — otherwise a junior manager could edit a
 * target while a dormant senior hat protects them. Resolves custom-role
 * tiers via canManageRole (fails closed on unknown strings).
 */
export async function canManageRoleSet(
  actorRole: string | undefined | null,
  heldRoles: string[],
  companyId: string,
): Promise<boolean> {
  for (const r of heldRoles) {
    if (!(await canManageRole(actorRole, r, companyId))) return false;
  }
  return true;
}

/**
 * Resolve the permission list for a role within a company — built-in or
 * custom — including RolePermission row overrides and extra grants.
 */
export async function resolveRolePermissions(
  role: string,
  companyId: string,
  extraPerms: string[],
): Promise<string[]> {
  const roleOverrides = await prisma.rolePermission
    .findMany({ where: { role }, select: { permission: true } })
    .then((rows) => rows.map((r) => r.permission))
    .catch(() => [] as string[]);

  if (isCustomRole(role)) {
    const customRole = await prisma.customRole
      .findFirst({ where: { companyId, key: role } })
      .catch(() => null);
    if (customRole) {
      return effectivePermissions(customRole.baseRole, [
        ...customRole.permissions,
        ...roleOverrides,
        ...extraPerms,
      ]);
    }
    return effectivePermissions("SUPERVISOR", []);
  }
  return effectivePermissions(role, [...roleOverrides, ...extraPerms]);
}

/**
 * An active authority delegation pointing at the current user.
 * While a delegator's delegation is live (delegationEndsAt > now), the
 * delegate acts with the delegator's role authority — permission checks,
 * approval routing ranks and acting-role checks all resolve through
 * getActingRole()/getUserPermissions().
 */
export interface DelegationInfo {
  /** The delegator's UserCompany membership id. */
  membershipId: string;
  /** The delegator's user id — recorded as AuditLog.onBehalfOfId. */
  userId: string;
  name: string;
  role: string;
  endsAt: Date;
}

/**
 * Active delegations where the CURRENT user is the delegate.
 * One level only — a delegate acting for X does not re-delegate X's
 * authority onward. Memoized per request.
 */
export async function getActingDelegations(): Promise<DelegationInfo[]> {
  return memoizeInRequest("actingDelegations", async () => {
    const user = await getCurrentUser();
    if (!user || user.id === "dev") return [];
    const company = await getCompany();
    const membership = await prisma.userCompany
      .findUnique({
        where: { userId_companyId: { userId: user.id, companyId: company.id } },
        select: { id: true },
      })
      .catch(() => null);
    if (!membership) return [];
    const rows = await prisma.userCompany
      .findMany({
        where: {
          companyId: company.id,
          active: true,
          approvalsDelegatedToId: membership.id,
          delegationEndsAt: { gt: new Date() },
        },
        select: {
          id: true,
          role: true,
          delegationEndsAt: true,
          user: { select: { id: true, name: true } },
        },
      })
      .catch(() => [] as never[]);
    return rows.map((r) => ({
      membershipId: r.id,
      userId: r.user.id,
      name: r.user.name,
      role: r.role,
      endsAt: r.delegationEndsAt!,
    }));
  });
}

/**
 * The role the current user ACTS AS for authority checks (approval
 * routing ranks, service-layer actorRole gates). Equals their own role
 * unless an active delegation hands them a higher-authority role.
 * Display/UI should keep using user.role; only authority checks use this.
 */
/**
 * The user's OWN effective role — the membership role with custom roles
 * resolved to their baseRole. Unlike getActingRole(), this ignores
 * delegation: it's the right answer for persona/identity questions
 * ("what surface should this user see") where acting authority must not
 * leak in, while getActingRole() answers authority questions.
 */
export async function getOwnRole(): Promise<Role> {
  const user = await getCurrentUser();
  if (!user) return "SUPERVISOR";
  return memoizeInRequest("ownActingRole", async () => {
    const company = await getCompany().catch(() => null);
    // Multi-role: the worn hat (membership.activeRole, validated against the
    // held set) is the user's own role for authority purposes; NULL/stale
    // falls back to the primary membership role.
    const held = company ? await getHeldRoles(user.id, company.id) : null;
    const rawRole = held?.activeRole ?? user.role;
    if (isCustomRole(rawRole) && company) {
      const customRole = await prisma.customRole
        .findFirst({ where: { companyId: company.id, key: rawRole }, select: { baseRole: true } })
        .catch(() => null);
      if (customRole) return normalizeRole(customRole.baseRole);
    }
    return normalizeRole(rawRole);
  });
}

export async function getActingRole(): Promise<Role> {
  const user = await getCurrentUser();
  if (!user) return "SUPERVISOR";
  // The user's own authority comes from their membership role — which may be
  // a custom role (CUSTOM_*). Custom roles act with their baseRole's
  // authority for tier-based checks (approvals, role management).
  let best = await getOwnRole();
  const company = await getCompany().catch(() => null);
  for (const d of await getActingDelegations()) {
    // A delegator's custom role delegates its baseRole's authority.
    let dr: Role = normalizeRole(d.role);
    if (isCustomRole(d.role) && company) {
      const customRole = await prisma.customRole
        .findFirst({ where: { companyId: company.id, key: d.role }, select: { baseRole: true } })
        .catch(() => null);
      if (customRole) dr = normalizeRole(customRole.baseRole);
    }
    if (roleTier(dr) < roleTier(best)) best = dr;
  }
  return best;
}

export async function getUserPermissions(): Promise<string[]> {
  return memoizeInRequest("permissions", async () => {
  const user = await getCurrentUser();
  if (!user) return [];
  const company = await getCompany();

  const userMembership = await prisma.userCompany
    .findUnique({
      where: { userId_companyId: { userId: user.id, companyId: company.id } },
      include: { userPermissions: { select: { permission: true } } },
    })
    .catch(() => null);
  const userOverrides = userMembership?.userPermissions.map((p) => p.permission) ?? [];

  // Resolve via the membership's ACTIVE role (raw, per-company) — NOT
  // user.role, which getCurrentUser() normalizes to a built-in role,
  // collapsing custom roles (CUSTOM_*) to SUPERVISOR before resolution.
  // Multi-role: the worn hat (activeRole) drives permissions; a stale hat
  // falls back to the primary role.
  const wornHat =
    userMembership?.activeRole &&
    [userMembership.role, ...(userMembership.secondaryRoles ?? [])].includes(userMembership.activeRole)
      ? userMembership.activeRole
      : userMembership?.role;
  const ownPerms = await resolveRolePermissions(wornHat ?? user.role, company.id, userOverrides);

  // ── Delegation union: while an active delegation targets this user,
  // they also hold each delegator's role permissions. ──
  const delegations = await getActingDelegations();
  if (delegations.length === 0) return ownPerms;
  const delegatedPermSets = await Promise.all(
    delegations.map((d) => resolveRolePermissions(d.role, company.id, [])),
  );
  return [...new Set([...ownPerms, ...delegatedPermSets.flat()])];
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
    ownRole: string;
    permissions: string[];
    /** Multi-role: all hats the member holds (primary + secondary). */
    roles: string[];
    /** Multi-role: the hat currently worn (equals `role` when no switch). */
    activeRole: string;
    /** Multi-role: display label per held role key. */
    roleLabels: Record<string, string>;
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

      const [company, permissions, ownRole] = await Promise.all([
        getCompany(),
        getUserPermissions(),
        getOwnRole(),
      ]);
      const held = await getHeldRoles(user.id, company.id);
      // Multi-role: display labels for every held hat (custom roles resolve
      // via their CustomRole row in this company).
      const customLabels = await getCustomRoleLabels([company.id]).catch(() => new Map<string, string>());
      const roleLabels = Object.fromEntries(
        (held?.heldRoles ?? [user.role]).map((r) => [r, roleDisplayLabel(r, company.id, customLabels)]),
      );

      // Same visibility rule as GET /api/company: only companies the user
      // actually belongs to (active membership). OWNER/ADMIN are per-tenant
      // roles — letting them see every company leaked other tenants' names
      // (and IDs) into the switcher. Both switch endpoints re-verify the
      // membership anyway, so a non-member entry could only ever 403.
      const isDevBypass =
        process.env.AUTH_BYPASS === "true" &&
        process.env.NODE_ENV !== "production" &&
        user.id === "dev";
      const visible = await prisma.company.findMany({
        where: {
          deletedAt: null,
          ...(isDevBypass
            ? {}
            : { userMemberships: { some: { userId: user.id, active: true } } }),
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
          ownRole,
          permissions,
          roles: held?.heldRoles ?? [user.role],
          activeRole: held?.activeRole ?? user.role,
          roleLabels,
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
  // Multi-role: gate on the hat actually worn (activeRole ?? primary).
  // A dormant OWNER hat in the held set does NOT bypass the check —
  // the user must switch hats first (no silent privilege leaks).
  const company = await getCompany().catch(() => null);
  const held = company ? await getHeldRoles(user.id, company.id) : null;
  const effectiveRole = normalizeRole(held?.activeRole ?? user.role);
  if (effectiveRole === "OWNER" || effectiveRole === "ADMIN" || effectiveRole === "DEVELOPER") return user;
  if (!allowed.includes(effectiveRole)) throw new ForbiddenError();
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
 * Throw ForbiddenError if the current user lacks ALL of the given permissions.
 * The user must have at least ONE of the permissions to pass.
 */
export async function requireAnyPermission(...permissions: string[]): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) throw new UnauthorizedError();
  if (!user.active) throw new ForbiddenError("Your account is inactive.");
  const perms = await getUserPermissions();
  if (perms.includes("*")) return user; // OWNER/ADMIN superuser
  if (!permissions.some((p) => perms.includes(p))) throw new ForbiddenError();
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
  secondaryRoles: string[];
  activeRole: string | null;
  scopeType: string | null;
  reportsToUserCompanyId: string | null;
} | null> {
  const user = await getCurrentUser();
  if (!user || !user.companyId) return null;
  // The synthetic "dev" user has no real UserCompany row.
  if (user.id === "dev") return null;
  return prisma.userCompany.findFirst({
    where: { userId: user.id, companyId: user.companyId, active: true },
    select: { id: true, role: true, secondaryRoles: true, activeRole: true, scopeType: true, reportsToUserCompanyId: true },
  });
}

// ── Auto-audit (company activity trail) ─────────────────────────────
// Every successful mutation that doesn't carry richer opts.audit
// metadata writes a generic AuditLog entry derived from the request —
// "who did what, where, when" for the OWNER/ADMIN. Routes with
// opts.audit still win (they record semantic before/after payloads).

/** Internal/telemetry/noise endpoints that must never write audit rows. */
const AUTO_AUDIT_SKIP_PREFIXES = [
  "/api/error-logs",
  "/api/audit",
  "/api/activity",
  "/api/notifications",
  "/api/auth",
  "/api/me",
  "/api/health",
  "/api/search",
  "/api/briefing",
  "/api/assistant",
  "/api/mobile",
  "/api/ocr",
  "/api/uploads",
  "/api/telephony",
  "/api/cron",
  "/api/backup",
  "/api/export",
  "/api/reports",
  "/api/tally",
  "/api/e-invoice",
  "/api/feedback",
  "/api/dashboard-counts",
  "/api/persona-home",
  "/api/integrations",
];

/** Path segments that read as business actions, not resource ids —
 * mapped to the ACTION_TYPES vocabulary the audit UI filters on. */
const AUTO_AUDIT_ACTION_WORDS = new Set([
  "approve", "reject", "submit", "resubmit", "order", "receive", "cancel",
  "complete", "assign", "return", "retire", "confirm", "reconcile",
  "convert", "partition", "restore", "pay", "dispatch", "deliver",
  "close", "reopen", "finalize", "lock", "unlock", "publish", "send",
  "sync", "generate", "escalate", "extend", "terminate", "activate",
  "deactivate", "verify", "check-in", "check-out", "issue", "transfer",
  "waive-quotes", "select-quote", "unpartition", "split", "merge",
]);

function deriveAutoAudit(pathname: string, method: string): {
  action: string;
  entityType: string;
  entityId: string | null;
} {
  const segments = pathname.split("/").filter(Boolean); // ["api", "purchase-orders", "abc", "approve"]
  const rawEntity = segments[1] ?? "api";
  const entityType =
    rawEntity
      .split("-")
      .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
      .join("")
      .replace(/s$/, "") || "Api";

  // Last segment wins as the verb when it's an action word; otherwise the
  // HTTP method maps to CREATE/UPDATE/DELETE.
  const last = segments[segments.length - 1] ?? "";
  const verb = AUTO_AUDIT_ACTION_WORDS.has(last)
    ? last.replace(/-/g, "_").toUpperCase()
    : method === "POST"
      ? "CREATE"
      : method === "DELETE"
        ? "DELETE"
        : "UPDATE";

  // First id-like segment after the entity segment.
  const entityId =
    segments.slice(2).find((s) => /^[A-Za-z0-9_-]{15,}$/.test(s)) ?? null;

  // Canonical action vocabulary is ENTITY_VERB in SCREAMING_SNAKE — convert
  // the title-cased entity ("CustomRole" → "CUSTOM_ROLE") so auto-audit rows
  // read identically to the explicit logAction rows for the same operation.
  const actionEntity = entityType
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .toUpperCase();

  return { action: `${actionEntity}_${verb}`, entityType, entityId };
}

/** Read a mutation's response body for the audit `after` payload —
 * bounded, pruned, and never allowed to fail the request. */
async function auditSnapshot(res: Response): Promise<unknown> {
  try {
    const len = Number(res.headers.get("content-length") ?? "0");
    if (len > 200_000) return undefined;
    const parsed = await Promise.race([
      res.clone().json(),
      new Promise((_, rej) => setTimeout(() => rej(new Error("audit snapshot timeout")), 1500)),
    ]);
    const prune = (v: unknown, depth: number): unknown => {
      if (depth > 4) return "…";
      if (typeof v === "string") return v.length > 400 ? v.slice(0, 400) + "…" : v;
      if (Array.isArray(v)) return v.slice(0, 20).map((i) => prune(i, depth + 1));
      if (v && typeof v === "object") {
        const out: Record<string, unknown> = {};
        for (const [k, val] of Object.entries(v).slice(0, 40)) {
          if (/photo|image|base64|blob|data:/i.test(k)) { out[k] = "[omitted]"; continue; }
          out[k] = prune(val, depth + 1);
        }
        return out;
      }
      return v;
    };
    return prune(parsed, 0);
  } catch {
    return undefined;
  }
}

/**
 * Wrap an API handler with auth + error handling.
 * Returns 401 if no session is found (unless AUTH_BYPASS is set).
 * Mutations (POST/PATCH/PUT/DELETE) automatically write an AuditLog
 * entry on success — rich semantic entries when `audit` options are
 * provided, otherwise a generic auto-derived entry (entity from path +
 * pruned response body). Internal/noise endpoints are skipped.
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
          // Central deactivation gate — a session cookie stays valid after an
          // admin deactivates the account, so without this check a terminated
          // user keeps full API access until the session expires. Session-only
          // routes (e.g. /api/me) would otherwise never hit requireUser's
          // active check.
          const gateUser = await getCurrentUser();
          if (!gateUser) {
            return json({ error: "Unauthorized" }, { status: 401 });
          }
          if (!gateUser.active) {
            return json({ error: "Your account is inactive. Contact your administrator." }, { status: 403 });
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

        const requestStartAt = new Date();
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
        const isMutation = req.method === "POST" || req.method === "PATCH" || req.method === "PUT" || req.method === "DELETE";
        if (isMutation) {
          try {
            const user = await getCurrentUser();
            // Acting under someone's delegation? Record it on the audit row.
            const delegations = user ? await getActingDelegations() : [];
            const onBehalfOfId = delegations[0]?.userId ?? undefined;
            const pathname = new URL(req.url).pathname;
            if (opts.audit) {
              const entityId = opts.audit.entityIdFrom?.(req as TReq, res);
              if (entityId) {
                await logAction(prisma, {
                  userId: user?.id,
                  companyId: user?.companyId ?? undefined,
                  action: opts.audit.action,
                  entityType: opts.audit.entityType,
                  entityId,
                  onBehalfOfId,
                });
              }
            } else if (
              res.status < 400 &&
              !opts.skipSession &&
              !AUTO_AUDIT_SKIP_PREFIXES.some((p) => pathname.startsWith(p))
            ) {
              // Skip the generic row when the handler already wrote a
              // semantic audit row during this request (service-layer
              // logAction) — otherwise every mutation shows up twice in
              // the activity feed (USER_ROLE_CHANGE + USER_UPDATE).
              // The 5s skew buffer covers app/DB clock drift.
              const alreadyLogged = user?.id
                ? await prisma.auditLog.findFirst({
                    where: {
                      userId: user.id,
                      timestamp: { gte: new Date(requestStartAt.getTime() - 5000) },
                    },
                    select: { id: true },
                  })
                : null;
              if (!alreadyLogged) {
                const derived = deriveAutoAudit(pathname, req.method);
                const after = await auditSnapshot(res);
                const entityId =
                  derived.entityId ??
                  (after && typeof after === "object" && "id" in after
                    ? String((after as { id: unknown }).id)
                    : "(collection)");
                await logAction(prisma, {
                  userId: user?.id,
                  companyId: user?.companyId ?? undefined,
                  action: derived.action,
                  entityType: derived.entityType,
                  entityId,
                  after,
                  onBehalfOfId,
                });
              }
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

      // Capture 500s in Sentry (no-op without SENTRY_DSN) AND in the
      // ErrorLog table — the developer console must see server crashes
      // even when Sentry isn't configured.
      if (status >= 500) {
        try {
          const Sentry = await import("@sentry/nextjs");
          Sentry.captureException(err);
        } catch {
          // Sentry not available — continue without.
        }
        try {
          const u = await getCurrentUser().catch(() => null);
          const result = await recordError({
            type: "server",
            source: "server",
            message: err instanceof Error ? err.message : String(err),
            stack: err instanceof Error ? err.stack : undefined,
            url: req.url,
            userAgent: req.headers.get("user-agent"),
            userId: u?.id ?? null,
            companyId: u?.companyId ?? null,
          });
          if (result.created || result.reopened) {
            await notifyDevelopersOfError({
              message: err instanceof Error ? err.message : String(err),
              url: req.url,
              reopened: result.reopened,
            });
          }
        } catch {
          // Error recording must never mask the original failure
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
