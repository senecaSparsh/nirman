import { z } from "zod";
import { ALL_ROLES } from "@/lib/roles";

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
  baseUnit: z.string().max(20).optional().nullable(),
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

/** Optional email that tolerates a cleared field — an empty string means
 *  "unset", not a validation failure. Without this, forms sending "" for a
 *  cleared email fail the whole save with "Invalid email". */
const optionalEmail = z.preprocess(
  (v) => (v === "" ? null : v),
  z.string().email("Invalid email").optional().nullable(),
);

// ── Land Seller ──
export const landSellerSchema = z.object({
  name: z.string().min(1, "Name is required").max(160),
  phone: z.string().max(30).optional().nullable(),
  email: optionalEmail,
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
  email: optionalEmail,
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
  tenantEmail: optionalEmail,
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
  tenantEmail: optionalEmail,
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
  newTenantEmail: optionalEmail,
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
  // Straight-line rate as a fraction (0.15 = 15%/yr). Null/0 → not depreciated.
  annualDepreciationRate: z.number().min(0).max(1).optional().nullable(),
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
  email: optionalEmail,
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
  email: optionalEmail,
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
  // Membership reporting line — the UserCompany ID of the manager, applied
  // to the linked user account (drives approvals/delegation). The desktop
  // edit dialog sends this key; stripping it silently dropped the save.
  reportsToMembershipId: z.string().optional().nullable(),
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
  // PAID_LEAVE is intentionally absent — paid-leave days may only be minted
  // by an approved LeaveRequest (balance check + approval + audit). The
  // matrix can mark unpaid leave/absence, never a paid day for free.
  status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "OVERTIME", "LEAVE", "LATE", "NON_PAID_LEAVE"]),
  notes: z.string().max(500).optional().nullable(),
  checkInLat: z.number().min(-90).max(90).optional().nullable(),
  checkInLng: z.number().min(-180).max(180).optional().nullable(),
  checkOutLat: z.number().min(-90).max(90).optional().nullable(),
  checkOutLng: z.number().min(-180).max(180).optional().nullable(),
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
    status: z.enum(["PRESENT", "ABSENT", "HALF_DAY", "OVERTIME", "LEAVE", "LATE", "NON_PAID_LEAVE"]),
    checkIn: z.string().optional().nullable(),
    checkOut: z.string().optional().nullable(),
    hoursWorked: z.coerce.number().min(0).max(24).optional().nullable(),
    notes: z.string().max(500).optional().nullable(),
    checkInLat: z.number().min(-90).max(90).optional().nullable(),
    checkInLng: z.number().min(-180).max(180).optional().nullable(),
    checkOutLat: z.number().min(-90).max(90).optional().nullable(),
    checkOutLng: z.number().min(-180).max(180).optional().nullable(),
    checkInLocation: z.string().max(300).optional().nullable(),
    checkOutLocation: z.string().max(300).optional().nullable(),
  })).min(1, "At least one attendance record is required"),
});

// ── Payroll ──
export const generatePayrollSchema = z.object({
  month: z.coerce.number().int().min(1).max(12),
  year: z.coerce.number().int().min(2000).max(2100),
  // Regenerating an existing DRAFT wipes its lines (including manual edits)
  // — the client must confirm it understands the overwrite.
  confirm: z.boolean().optional(),
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

export const taskStatusSchema = z.enum(["PENDING", "IN_PROGRESS", "BLOCKED", "COMPLETED", "CANCELLED"]);

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
