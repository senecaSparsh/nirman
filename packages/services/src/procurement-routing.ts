import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { ServiceError } from "./errors";

/**
 * Procurement Routing — the Logistics Decision Engine.
 *
 * Resolves the central question of construction procurement: when a project site
 * raises a Material Requisition, should the buy happen through Centralised Corporate
 * Procurement (leveraging enterprise volume discounts, then Stock Transfer Order to
 * site) or Direct Project Procurement (vendor → site, no double-handling)?
 *
 * The engine evaluates each requisition line through a Logistics Complexity Index:
 *
 *     LCI = (w1 · S_lead) + (w2 · V_unit/W_unit) + (w3 · D_vendor_site) − (w4 · Disc_bulk)
 *
 *   S_lead         vendor lead time (days)
 *   V_unit/W_unit  volumetric density ratio — flags bulky / hard-to-transport goods
 *   D_vendor_site  distance from the qualified supplier to the job site
 *   Disc_bulk      enterprise volume discount % achievable via centralised bulk buying
 *   w1..w4         normalised weighting coefficients configured per company
 *
 * Routing rule (per the platform spec):
 *   - If ANY line is a designated corporate commodity, OR
 *   - If ANY line's LCI >= the project's LCI threshold,
 *   → route the requisition to Centralised Corporate Procurement (COMPANY scope).
 *   Otherwise → Direct Project Procurement (PROJECT scope).
 *
 * The decision is computed on submit and cached on MaterialRequisition.lciDecision,
 * so approvers see the recommendation. At PO conversion the recommended scope is used
 * by default but can be overridden manually.
 *
 * NOTE on units: the four input terms carry different units (days, ratio, km, %).
 * The weights are the normalisation knobs — tune them (and the threshold) per company
 * so the default threshold (50.00) produces sensible routing. Inputs default to 0 when
 * absent, so a company can roll this out incrementally as data is populated.
 */

export type ProcurementScope = "COMPANY" | "PROJECT";

/** Default normalised weights (sum = 1.0). */
export const DEFAULT_LCI_WEIGHTS: LciWeights = {
  w1: new Decimal(0.3), // lead time
  w2: new Decimal(0.2), // volumetric density
  w3: new Decimal(0.3), // distance
  w4: new Decimal(0.2), // bulk discount (subtracted)
};

/** Default threshold when neither project nor company override is set. */
export const DEFAULT_LCI_THRESHOLD = new Decimal(50);

export interface LciWeights {
  w1: Decimal;
  w2: Decimal;
  w3: Decimal;
  w4: Decimal;
}

export interface LciFactors {
  /** S_lead — vendor lead time in days. */
  leadTimeDays: Decimal | number | string;
  /** V_unit/W_unit — volumetric density ratio (higher = bulkier). */
  volumetricDensity: Decimal | number | string;
  /** D_vendor_site — supplier → site distance in km. */
  distanceKm: Decimal | number | string;
  /** Disc_bulk — enterprise volume discount % (0–100). */
  bulkDiscountPct: Decimal | number | string;
}

/**
 * Pure LCI computation. The single testable core, mirroring computeMovingAverageCost.
 *
 *     LCI = w1·S_lead + w2·(V/W) + w3·D − w4·Disc
 */
export function computeLogisticsComplexityIndex(
  factors: LciFactors,
  weights: LciWeights = DEFAULT_LCI_WEIGHTS,
): Decimal {
  const sLead = new Decimal(factors.leadTimeDays ?? 0);
  const density = new Decimal(factors.volumetricDensity ?? 0);
  const distance = new Decimal(factors.distanceKm ?? 0);
  const discount = new Decimal(factors.bulkDiscountPct ?? 0);

  return weights.w1
    .times(sLead)
    .plus(weights.w2.times(density))
    .plus(weights.w3.times(distance))
    .minus(weights.w4.times(discount));
}

export interface LineRoutingResult {
  materialId: string;
  lci: Decimal;
  isCorporateCommodity: boolean;
  /** True if this line alone forces central procurement. */
  forcesCentral: boolean;
}

export interface RoutingDecision {
  recommendedScope: ProcurementScope;
  threshold: Decimal;
  perLine: LineRoutingResult[];
  /** Highest LCI across lines (the binding constraint for the threshold test). */
  maxLci: Decimal;
  /** Why the engine recommended this scope. */
  reason: string;
  weights: LciWeights;
  supplierLeadTimeDays: Decimal;
  distanceKm: Decimal;
  computedAt: string;
}

/**
 * Pure scope decision from per-line results + threshold. Exposed for testing.
 *
 * Central (COMPANY) if any line is a corporate commodity OR any line LCI >= threshold.
 * Otherwise PROJECT.
 */
export function decideProcurementScope(
  perLine: LineRoutingResult[],
  threshold: Decimal | number | string,
): { scope: ProcurementScope; reason: string; maxLci: Decimal } {
  const thr = new Decimal(threshold);
  const maxLci = perLine.reduce(
    (m, l) => Decimal.max(m, l.lci),
    new Decimal(0),
  );
  const corporateLine = perLine.find((l) => l.isCorporateCommodity);
  if (corporateLine) {
    return {
      scope: "COMPANY",
      reason: `Material ${corporateLine.materialId} is a designated corporate commodity → central procurement`,
      maxLci,
    };
  }
  if (maxLci.gte(thr)) {
    return {
      scope: "COMPANY",
      reason: `Max LCI ${maxLci.toFixed(2)} ≥ threshold ${thr.toFixed(2)} → central procurement`,
      maxLci,
    };
  }
  return {
    scope: "PROJECT",
    reason: `Max LCI ${maxLci.toFixed(2)} < threshold ${thr.toFixed(2)} → direct project procurement`,
    maxLci,
  };
}

/** Parse company lciWeights JSON into a validated LciWeights, falling back to defaults. */
export function parseLciWeights(raw: unknown): LciWeights {
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    const pick = (k: string, fallback: Decimal) => {
      const v = r[k];
      if (v === undefined || v === null) return fallback;
      try {
        return new Decimal(v as string | number);
      } catch {
        return fallback;
      }
    };
    return {
      w1: pick("w1", DEFAULT_LCI_WEIGHTS.w1),
      w2: pick("w2", DEFAULT_LCI_WEIGHTS.w2),
      w3: pick("w3", DEFAULT_LCI_WEIGHTS.w3),
      w4: pick("w4", DEFAULT_LCI_WEIGHTS.w4),
    };
  }
  return { ...DEFAULT_LCI_WEIGHTS };
}

export interface EvaluateRoutingOptions {
  /** Optional supplier to source S_lead (lead time) from. */
  supplierId?: string;
  /** Override distance vendor→site (km). Defaults to 0 when unknown. */
  distanceKm?: Decimal | number | string;
  /** Override LCI weights. Defaults to company config → DEFAULT_LCI_WEIGHTS. */
  weights?: LciWeights;
  /** Override threshold. Defaults to project → company → DEFAULT_LCI_THRESHOLD. */
  threshold?: Decimal | number | string;
}

/**
 * DB-backed evaluation: gathers LCI inputs for a requisition's lines, computes
 * per-line LCI, decides the recommended scope, and caches the decision on the
 * requisition (MaterialRequisition.lciDecision). Returns the decision.
 *
 * S_lead and D_vendor_site are supplier/distance-dependent. At submit time a
 * supplier is often not yet chosen, so both default to 0 (refine later by passing
 * supplierId / distanceKm). The material-level inputs (density, discount,
 * corporate-commodity flag) drive most of the routing signal.
 */
export async function evaluateRequisitionRouting(
  requisitionId: string,
  opts: EvaluateRoutingOptions = {},
): Promise<RoutingDecision> {
  const req = await prisma.materialRequisition.findUnique({
    where: { id: requisitionId },
    include: { lines: true, project: { include: { company: true } }, department: { include: { company: true } } },
  });
  if (!req) throw new ServiceError("Requisition not found", 404);
  if (!req.project && !req.department) throw new ServiceError("Requisition has no project or department");

  const company = req.project?.company ?? req.department?.company;
  const weights = opts.weights ?? parseLciWeights(company?.lciWeights);

  // Threshold: explicit override → project → company default → DEFAULT
  let threshold: Decimal;
  if (opts.threshold !== undefined) {
    threshold = new Decimal(opts.threshold);
  } else if (req.project?.lciThreshold) {
    threshold = new Decimal(req.project.lciThreshold);
  } else if (company?.lciThresholdDefault) {
    threshold = new Decimal(company.lciThresholdDefault);
  } else {
    threshold = DEFAULT_LCI_THRESHOLD;
  }

  // S_lead from the chosen supplier, if any
  let supplierLeadTimeDays = new Decimal(0);
  if (opts.supplierId) {
    const supplier = await prisma.supplier.findUnique({
      where: { id: opts.supplierId },
      select: { leadTimeDays: true },
    });
    supplierLeadTimeDays = new Decimal(supplier?.leadTimeDays ?? 0);
  }

  const distanceKm = new Decimal(opts.distanceKm ?? 0);

  // Material-level LCI inputs
  const materialIds = req.lines.map((l) => l.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds } },
    select: {
      id: true,
      volumetricDensity: true,
      bulkDiscountPct: true,
      isCorporateCommodity: true,
    },
  });
  const materialById = new Map(materials.map((m) => [m.id, m]));

  const perLine: LineRoutingResult[] = req.lines.map((line) => {
    const m = materialById.get(line.materialId);
    const factors: LciFactors = {
      leadTimeDays: supplierLeadTimeDays,
      volumetricDensity: m?.volumetricDensity ?? 0,
      distanceKm,
      bulkDiscountPct: m?.bulkDiscountPct ?? 0,
    };
    const lci = computeLogisticsComplexityIndex(factors, weights);
    const isCorporateCommodity = !!m?.isCorporateCommodity;
    return {
      materialId: line.materialId,
      lci,
      isCorporateCommodity,
      forcesCentral: isCorporateCommodity || lci.gte(threshold),
    };
  });

  const { scope, reason, maxLci } = decideProcurementScope(perLine, threshold);

  const decision: RoutingDecision = {
    recommendedScope: scope,
    threshold,
    perLine,
    maxLci,
    reason,
    weights,
    supplierLeadTimeDays,
    distanceKm,
    computedAt: new Date().toISOString(),
  };

  // Cache on the requisition so approvers / converters can read it without recomputing.
  await prisma.materialRequisition.update({
    where: { id: requisitionId },
    data: {
      lciDecision: {
        recommendedScope: decision.recommendedScope,
        threshold: decision.threshold.toString(),
        maxLci: decision.maxLci.toString(),
        reason: decision.reason,
        weights: {
          w1: decision.weights.w1.toString(),
          w2: decision.weights.w2.toString(),
          w3: decision.weights.w3.toString(),
          w4: decision.weights.w4.toString(),
        },
        supplierLeadTimeDays: decision.supplierLeadTimeDays.toString(),
        distanceKm: decision.distanceKm.toString(),
        computedAt: decision.computedAt,
        perLine: decision.perLine.map((l) => ({
          materialId: l.materialId,
          lci: l.lci.toString(),
          isCorporateCommodity: l.isCorporateCommodity,
          forcesCentral: l.forcesCentral,
        })),
      },
    },
  });

  return decision;
}

/**
 * Read the cached recommended scope for a requisition. Returns null if no LCI
 * decision has been computed yet. Used by convertRequisitionToPo to default the
 * procurement scope when the caller doesn't pass an explicit override.
 */
export async function getCachedRoutingScope(
  requisitionId: string,
): Promise<ProcurementScope | null> {
  const req = await prisma.materialRequisition.findUnique({
    where: { id: requisitionId },
    select: { lciDecision: true },
  });
  if (!req?.lciDecision) return null;
  const raw = req.lciDecision as { recommendedScope?: string };
  return raw.recommendedScope === "COMPANY" ? "COMPANY" : raw.recommendedScope === "PROJECT" ? "PROJECT" : null;
}
