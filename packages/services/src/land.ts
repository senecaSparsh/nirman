import { prisma, type Prisma } from "@nirman/db";
import { withSerializableTransaction } from "./transaction";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { postLandPurchase, postJournalEntry, ACCT } from "./gl-posting";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";
import { ServiceError } from "./errors";

/**
 * Land Service — record land purchases and create initial parcels.
 *
 * Two entry points:
 * 1. `recordLandPurchase()` — simple: creates one whole parcel. Backward compatible.
 * 2. `recordLandPurchaseWithPlan()` — guided wizard: creates the land purchase +
 *    parcels (whole or pre-subdivided) + optional inline project creation, all
 *    in one atomic Serializable transaction. Each section is tagged with a
 *    purpose (SELL / PROJECT / HOLD) and linked to a project when purpose=PROJECT.
 */

interface RecordLandPurchaseInput {
  companyId: string;
  projectId?: string;
  sellerId?: string;
  sellerName: string;
  sellerContact?: string;
  purchaseDate?: Date;
  totalArea: Decimal | number | string;
  areaUnit?: "SQFT" | "SQM" | "SQYD" | "ACRE" | "BIGHA" | "KATHA" | "HECTARE";
  totalCost: Decimal | number | string;
  registryNo?: string;
  location?: string;
  documentUrl?: string;
  initialParcelNumber?: string; // default "PLOT-1"
  createdById?: string;
}

export async function recordLandPurchase(input: RecordLandPurchaseInput) {
  const totalArea = new Decimal(input.totalArea);
  const totalCost = new Decimal(input.totalCost);

  if (!totalArea.gt(0)) throw new ServiceError("Total area must be > 0");
  if (!totalCost.gt(0)) throw new ServiceError("Total cost must be > 0");

  const result = await withSerializableTransaction(async (tx) => {
    // Validate company
    const company = await tx.company.findFirst({ where: { id: input.companyId, deletedAt: null } });
    if (!company) throw new ServiceError("Company not found or deleted", 404);

    // Validate project if set
    if (input.projectId) {
      const project = await tx.project.findFirst({
        where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
      });
      if (!project) throw new ServiceError("Project not found, deleted, or doesn't belong to this company", 404);
    }

    // Validate seller if set
    if (input.sellerId) {
      const seller = await tx.landSeller.findFirst({ where: { id: input.sellerId, deletedAt: null } });
      if (!seller) throw new ServiceError("Land seller not found or deleted", 404);
    }

    // Create land purchase
    const landPurchase = await tx.landPurchase.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        sellerId: input.sellerId ?? null,
        sellerName: input.sellerName,
        sellerContact: input.sellerContact,
        purchaseDate: input.purchaseDate ?? new Date(),
        totalArea,
        areaUnit: input.areaUnit ?? "SQFT",
        totalCost,
        baseCost: totalCost, // ensure baseCost is set so recomputeLandTotalCost doesn't reset totalCost to 0
        registryNo: input.registryNo,
        location: input.location,
        documentUrl: input.documentUrl,
        mode: "WHOLE",
      },
    });

    // Create initial parcel (the whole plot)
    const parcel = await tx.landParcel.create({
      data: {
        landPurchaseId: landPurchase.id,
        number: input.initialParcelNumber ?? "PLOT-1",
        area: totalArea,
        areaUnit: input.areaUnit ?? "SQFT",
        status: "AVAILABLE",
        purpose: input.projectId ? "PROJECT" : "HOLD",
        acquisitionCost: totalCost,
        currentValuation: totalCost, // initial valuation = acquisition cost
        projectId: input.projectId,
      },
    });

    // If linked to a project, trigger cost reallocation (land cost flows into project)
    if (input.projectId) {
      await reallocateProjectCosts(tx, input.projectId);
    }

    // Post to the General Ledger: capitalise the land as an unsold asset, credit cash.
    await postLandPurchase(tx, {
      companyId: input.companyId,
      landPurchaseId: landPurchase.id,
      totalCost,
      postedById: input.createdById,
    });

    // Audit log
    if (input.createdById) {
      await logAction(tx, {
        userId: input.createdById,
        action: "CREATE",
        entityType: "LandPurchase",
        entityId: landPurchase.id,
        after: { sellerName: input.sellerName, totalArea: totalArea.toString(), totalCost: totalCost.toString() },
      });
    }

    // Auto-create OWNERSHIP_CERTIFICATE legal doc if a registry number was provided
    if (input.registryNo && input.registryNo.trim()) {
      await tx.legalDocument.create({
        data: {
          companyId: input.companyId,
          landPurchaseId: landPurchase.id,
          projectId: input.projectId ?? null,
          type: "OWNERSHIP_CERTIFICATE",
          title: "Ownership Certificate / Sale Deed",
          authority: "Sub-Registrar / Revenue Department",
          status: "APPROVED",
          appliesTo: "BOTH",
          sortOrder: 0,
          prerequisiteType: null,
          obtained: true,
          docNumber: input.registryNo.trim(),
          notes: "Auto-created from land purchase — registry completed.",
          createdById: input.createdById ?? null,
        },
      });
    }

    return { landPurchase, parcel };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.LAND_PURCHASE_CREATED,
    companyId: input.companyId,
    entityType: "LandPurchase",
    entityId: result.landPurchase.id,
    variables: {
      sellerName: input.sellerName,
      totalArea: totalArea.toString(),
      totalCost: totalCost.toString(),
      location: input.location ?? "",
    },
    timestamp: new Date(),
  });

  return result;
}

// ───────────────────────────────────────────────────────────
//  Guided Land Purchase Wizard — recordLandPurchaseWithPlan
// ───────────────────────────────────────────────────────────

type AreaUnitCode = "SQFT" | "SQM" | "SQYD" | "ACRE" | "BIGHA" | "KATHA" | "HECTARE";
type ParcelPurpose = "SELL" | "PROJECT" | "HOLD";

/** Inline project creation spec — the wizard collects these fields and the
 *  service creates the project inside the same transaction (atomic). */
interface InlineProjectCreate {
  name: string;
  type?: "RESIDENTIAL" | "COMMERCIAL" | "WAREHOUSE" | "MALL" | "LAND" | "OTHER";
  status?: "PLANNED" | "ACTIVE" | "COMPLETED" | "ON_HOLD";
  address?: string;
  startDate?: string;
  endDate?: string;
  totalBudget?: Decimal | number | string;
  totalSellableArea?: Decimal | number | string;
  description?: string;
}

interface PlanSection {
  number: string;
  area: Decimal | number | string;
  purpose: ParcelPurpose;
  askingPrice?: Decimal | number | string;
  /** For purpose=PROJECT: existing project ID to link. */
  projectId?: string;
  /** For purpose=PROJECT: create a new project inline (mutually exclusive with projectId). */
  projectCreate?: InlineProjectCreate;
}

interface RecordLandPurchaseWithPlanInput {
  companyId: string;
  sellerId?: string;
  sellerName: string;
  sellerContact?: string;
  purchaseDate?: Date;
  totalArea: Decimal | number | string;
  areaUnit?: AreaUnitCode;
  totalCost: Decimal | number | string;
  registryNo?: string;
  location?: string;
  documentUrl?: string;
  /** "WHOLE" = single parcel; "SUBDIVIDED" = N sections. */
  mode: "WHOLE" | "SUBDIVIDED";
  /** For WHOLE mode: exactly 1 section. For SUBDIVIDED: ≥2 sections. */
  sections: PlanSection[];
  /** Parent parcel number (default "PLOT-1"). For SUBDIVIDED, the parent is
   *  immediately marked PARTITIONED and a LandPartition record is created. */
  parentParcelNumber?: string;
  createdById?: string;
  // ── Land type & lease details ──
  landType?: "FREEHOLD" | "LEASEHOLD";
  leaseType?: "ONE_TIME" | "YEARLY" | null;
  leasePeriodYears?: number | null;
  leaseStartDate?: Date | null;
  leaseEndDate?: Date | null;
  // ── Cost breakup ──
  baseCost?: Decimal | number | string;
  leaseRentPercent?: Decimal | number | string | null;
  leaseRentAmount?: Decimal | number | string | null;
  gstPercent?: Decimal | number | string | null;
  gstAmount?: Decimal | number | string | null;
  registrationPercent?: Decimal | number | string | null;
  registrationAmount?: Decimal | number | string | null;
  stampDutyPercent?: Decimal | number | string | null;
  stampDutyAmount?: Decimal | number | string | null;
  // Transfer duty (authority land only)
  transferDutyPercent?: Decimal | number | string | null;
  transferDutyAmount?: Decimal | number | string | null;
  // Additional acquisition costs
  brokerageAmount?: Decimal | number | string | null;
  legalFees?: Decimal | number | string | null;
  otherCharges?: Decimal | number | string | null;
}

export async function recordLandPurchaseWithPlan(input: RecordLandPurchaseWithPlanInput) {
  const totalArea = new Decimal(input.totalArea);
  const totalCost = new Decimal(input.totalCost);
  const areaUnit = input.areaUnit ?? "SQFT";

  if (!totalArea.gt(0)) throw new ServiceError("Total area must be > 0");
  if (!totalCost.gt(0)) throw new ServiceError("Total cost must be > 0");
  if (!input.sections || input.sections.length === 0) {
    throw new ServiceError("At least one section is required");
  }
  if (input.mode === "SUBDIVIDED" && input.sections.length < 2) {
    throw new ServiceError("Subdivided mode requires at least 2 sections");
  }
  if (input.mode === "WHOLE" && input.sections.length !== 1) {
    throw new ServiceError("Whole mode requires exactly 1 section");
  }

  // Pre-validate all sections (areas > 0, unique numbers, purpose/project consistency)
  const sectionAreas = input.sections.map((s) => new Decimal(s.area));
  for (let i = 0; i < input.sections.length; i++) {
    if (!sectionAreas[i]!.gt(0)) {
      throw new ServiceError(`Section ${i + 1}: area must be > 0`);
    }
    if (input.sections[i]!.purpose === "PROJECT" && !input.sections[i]!.projectId && !input.sections[i]!.projectCreate) {
      throw new ServiceError(`Section "${input.sections[i]!.number}": purpose PROJECT requires either projectId or projectCreate`);
    }
    if (input.sections[i]!.projectId && input.sections[i]!.projectCreate) {
      throw new ServiceError(`Section "${input.sections[i]!.number}": cannot specify both projectId and projectCreate`);
    }
  }
  const numbers = input.sections.map((s) => s.number);
  if (new Set(numbers).size !== numbers.length) {
    throw new ServiceError("Section parcel numbers must be unique");
  }

  // Area conservation (subdivided only)
  if (input.mode === "SUBDIVIDED") {
    const sumSections = sectionAreas.reduce((s, a) => s.plus(a), new Decimal(0));
    if (!sumSections.equals(totalArea)) {
      throw new ServiceError(
        `Area conservation violated: Σ sections (${sumSections}) ≠ total area (${totalArea}). ` +
        `Difference: ${sumSections.minus(totalArea)}`,
      );
    }
  }

  const result = await withSerializableTransaction(async (tx) => {
    // 1. Validate company
    const company = await tx.company.findFirst({ where: { id: input.companyId, deletedAt: null } });
    if (!company) throw new ServiceError("Company not found or deleted", 404);

    // 1b. Validate seller if set
    if (input.sellerId) {
      const seller = await tx.landSeller.findFirst({ where: { id: input.sellerId, deletedAt: null } });
      if (!seller) throw new ServiceError("Land seller not found or deleted", 404);
    }

    // 2. Determine LandPurchase.projectId:
    //    - WHOLE + PROJECT → the section's projectId
    //    - SUBDIVIDED + all sections same project → that project
    //    - Otherwise → null (per-parcel projectId is authoritative)
    let purchaseProjectId: string | null = null;
    if (input.mode === "WHOLE" && input.sections[0]!.purpose === "PROJECT") {
      // Will be resolved after project validation/creation below
    }
    const projectSectionIds = input.sections
      .filter((s) => s.purpose === "PROJECT")
      .map((s) => s.projectId)
      .filter((v): v is string => Boolean(v));
    if (input.mode === "SUBDIVIDED" && projectSectionIds.length > 0) {
      const allSame = projectSectionIds.every((id) => id === projectSectionIds[0]);
      if (allSame) purchaseProjectId = projectSectionIds[0]!;
    }

    // 3. Create the LandPurchase
    const landPurchase = await tx.landPurchase.create({
      data: {
        companyId: input.companyId,
        projectId: purchaseProjectId,
        sellerId: input.sellerId ?? null,
        sellerName: input.sellerName,
        sellerContact: input.sellerContact,
        purchaseDate: input.purchaseDate ?? new Date(),
        totalArea,
        areaUnit,
        totalCost,
        registryNo: input.registryNo,
        location: input.location,
        documentUrl: input.documentUrl,
        mode: input.mode,
        landType: input.landType ?? "FREEHOLD",
        leaseType: input.leaseType ?? null,
        leasePeriodYears: input.leasePeriodYears ?? null,
        leaseStartDate: input.leaseStartDate ?? null,
        leaseEndDate: input.leaseEndDate ?? null,
        baseCost: input.baseCost != null ? new Decimal(input.baseCost) : totalCost,
        leaseRentPercent: input.leaseRentPercent != null ? new Decimal(input.leaseRentPercent) : null,
        leaseRentAmount: input.leaseRentAmount != null ? new Decimal(input.leaseRentAmount) : null,
        gstPercent: input.gstPercent != null ? new Decimal(input.gstPercent) : null,
        gstAmount: input.gstAmount != null ? new Decimal(input.gstAmount) : null,
        registrationPercent: input.registrationPercent != null ? new Decimal(input.registrationPercent) : null,
        registrationAmount: input.registrationAmount != null ? new Decimal(input.registrationAmount) : null,
        stampDutyPercent: input.stampDutyPercent != null ? new Decimal(input.stampDutyPercent) : null,
        stampDutyAmount: input.stampDutyAmount != null ? new Decimal(input.stampDutyAmount) : null,
        transferDutyPercent: input.transferDutyPercent != null ? new Decimal(input.transferDutyPercent) : null,
        transferDutyAmount: input.transferDutyAmount != null ? new Decimal(input.transferDutyAmount) : null,
        brokerageAmount: input.brokerageAmount != null ? new Decimal(input.brokerageAmount) : null,
        legalFees: input.legalFees != null ? new Decimal(input.legalFees) : null,
        otherCharges: input.otherCharges != null ? new Decimal(input.otherCharges) : null,
      },
    });

    // 4. Create parent parcel
    //    WHOLE: parent = the single sellable parcel (AVAILABLE)
    //    SUBDIVIDED: parent = container (PARTITIONED), children created below
    const parentParcelNumber = input.parentParcelNumber ?? "PLOT-1";
    const parentParcel = await tx.landParcel.create({
      data: {
        landPurchaseId: landPurchase.id,
        number: parentParcelNumber,
        area: totalArea,
        areaUnit,
        status: input.mode === "WHOLE" ? "AVAILABLE" : "PARTITIONED",
        purpose: "HOLD",
        acquisitionCost: totalCost,
        currentValuation: totalCost,
        projectId: purchaseProjectId,
      },
    });

    // 5. For WHOLE mode: update the parent parcel with the section's purpose/project/askingPrice
    const createdParcels = [];
    // Track unique projectIds for reallocation (used by both WHOLE and SUBDIVIDED)
    const projectIdsToReallocate = new Set<string>();

    if (input.mode === "WHOLE") {
      const section = input.sections[0]!;
      let parcelProjectId: string | null = null;

      if (section.purpose === "PROJECT") {
        if (section.projectId) {
          // Validate existing project
          const project = await tx.project.findFirst({
            where: { id: section.projectId, companyId: input.companyId, deletedAt: null },
          });
          if (!project) throw new ServiceError("Project not found, deleted, or doesn't belong to this company", 404);
          parcelProjectId = section.projectId;
        } else if (section.projectCreate) {
          // Create project inline
          const newProject = await tx.project.create({
            data: {
              companyId: input.companyId,
              name: section.projectCreate.name,
              type: section.projectCreate.type ?? "LAND",
              status: section.projectCreate.status ?? "PLANNED",
              address: section.projectCreate.address ?? input.location ?? null,
              startDate: section.projectCreate.startDate ? new Date(section.projectCreate.startDate) : null,
              endDate: section.projectCreate.endDate ? new Date(section.projectCreate.endDate) : null,
              totalBudget: section.projectCreate.totalBudget ? new Decimal(section.projectCreate.totalBudget) : null,
              totalSellableArea: section.projectCreate.totalSellableArea ? new Decimal(section.projectCreate.totalSellableArea) : null,
              description: section.projectCreate.description ?? null,
            },
          });
          parcelProjectId = newProject.id;
          // Update LandPurchase.projectId
          await tx.landPurchase.update({ where: { id: landPurchase.id }, data: { projectId: newProject.id } });
        }
      }

      if (parcelProjectId) projectIdsToReallocate.add(parcelProjectId);

      const updated = await tx.landParcel.update({
        where: { id: parentParcel.id },
        data: {
          purpose: section.purpose,
          projectId: parcelProjectId,
          askingPrice: section.askingPrice ? new Decimal(section.askingPrice) : null,
        },
      });
      createdParcels.push(updated);
    } else {
      // 6. SUBDIVIDED mode: allocate cost PRO_RATA by area across saleable sections,
      //    create child parcels, record LandPartition.
      //    Infrastructure sections (purpose=HOLD with isInfrastructure) absorb no cost.
      //    For the wizard, all sections are saleable (SELL or PROJECT); HOLD is treated
      //    as saleable for cost allocation (it's not infrastructure).
      const saleableIndices = input.sections.map((_, i) => i); // all sections are saleable
      const sumSaleableAreas = sectionAreas.reduce((s, a) => s.plus(a), new Decimal(0));
      if (!sumSaleableAreas.gt(0)) throw new ServiceError("Sum of section areas must be > 0");

      const childCosts = saleableIndices.map((i) =>
        totalCost.times(sectionAreas[i]!).div(sumSaleableAreas),
      );

      for (let i = 0; i < input.sections.length; i++) {
        const section = input.sections[i]!;
        let parcelProjectId: string | null = null;

        if (section.purpose === "PROJECT") {
          if (section.projectId) {
            const project = await tx.project.findFirst({
              where: { id: section.projectId, companyId: input.companyId, deletedAt: null },
            });
            if (!project) throw new ServiceError(`Project not found for section "${section.number}"`, 404);
            parcelProjectId = section.projectId;
          } else if (section.projectCreate) {
            const newProject = await tx.project.create({
              data: {
                companyId: input.companyId,
                name: section.projectCreate.name,
                type: section.projectCreate.type ?? "LAND",
                status: section.projectCreate.status ?? "PLANNED",
                address: section.projectCreate.address ?? input.location ?? null,
                startDate: section.projectCreate.startDate ? new Date(section.projectCreate.startDate) : null,
                endDate: section.projectCreate.endDate ? new Date(section.projectCreate.endDate) : null,
                totalBudget: section.projectCreate.totalBudget ? new Decimal(section.projectCreate.totalBudget) : null,
                totalSellableArea: section.projectCreate.totalSellableArea ? new Decimal(section.projectCreate.totalSellableArea) : null,
                description: section.projectCreate.description ?? null,
              },
            });
            parcelProjectId = newProject.id;
          }
          if (parcelProjectId) projectIdsToReallocate.add(parcelProjectId);
        }

        const child = await tx.landParcel.create({
          data: {
            landPurchaseId: landPurchase.id,
            parentParcelId: parentParcel.id,
            number: section.number,
            area: sectionAreas[i]!,
            areaUnit,
            status: "AVAILABLE",
            purpose: section.purpose,
            acquisitionCost: childCosts[i]!,
            askingPrice: section.askingPrice ? new Decimal(section.askingPrice) : null,
            currentValuation: childCosts[i]!,
            projectId: parcelProjectId,
          },
        });
        createdParcels.push(child);
      }

      // Record partition event
      await tx.landPartition.create({
        data: {
          parentParcelId: parentParcel.id,
          childCount: input.sections.length,
          allocationModel: "PRO_RATA",
        },
      });
    }

    // 7. GL posting — capitalise the land
    await postLandPurchase(tx, {
      companyId: input.companyId,
      landPurchaseId: landPurchase.id,
      totalCost,
      postedById: input.createdById,
    });

    // 8. Reallocate costs for each unique project linked to any section
    for (const pid of projectIdsToReallocate) {
      await reallocateProjectCosts(tx, pid);
    }

    // 9. Audit log
    if (input.createdById) {
      await logAction(tx, {
        userId: input.createdById,
        action: "CREATE",
        entityType: "LandPurchase",
        entityId: landPurchase.id,
        after: {
          sellerName: input.sellerName,
          totalArea: totalArea.toString(),
          totalCost: totalCost.toString(),
          mode: input.mode,
          sectionCount: input.sections.length,
          purposes: input.sections.map((s) => s.purpose),
        },
      });
    }

    // 10. Auto-create OWNERSHIP_CERTIFICATE legal doc if a registry number was provided
    //     — eliminates the friction of re-entering it in the Legal tab / step 4.
    if (input.registryNo && input.registryNo.trim()) {
      await tx.legalDocument.create({
        data: {
          companyId: input.companyId,
          landPurchaseId: landPurchase.id,
          projectId: purchaseProjectId,
          type: "OWNERSHIP_CERTIFICATE",
          title: "Ownership Certificate / Sale Deed",
          authority: "Sub-Registrar / Revenue Department",
          status: "APPROVED",
          appliesTo: "BOTH",
          sortOrder: 0,
          prerequisiteType: null,
          obtained: true,
          docNumber: input.registryNo.trim(),
          notes: "Auto-created from land purchase — registry completed.",
          createdById: input.createdById ?? null,
        },
      });
    }

    return {
      landPurchase,
      parentParcel,
      parcels: createdParcels,
    };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.LAND_PURCHASE_CREATED,
    companyId: input.companyId,
    entityType: "LandPurchase",
    entityId: result.landPurchase.id,
    variables: {
      sellerName: input.sellerName,
      totalArea: totalArea.toString(),
      totalCost: totalCost.toString(),
      location: input.location ?? "",
      mode: input.mode,
    },
    timestamp: new Date(),
  });

  return result;
}

// ───────────────────────────────────────────────────────────
//  Staged Land Purchase — book with token, pay balance per schedule,
//  complete when registry document uploaded.
// ───────────────────────────────────────────────────────────

export interface LandPurchaseOrderInput {
  companyId: string;
  projectId?: string;
  sellerId?: string;
  sellerName: string;
  sellerContact?: string;
  purchaseDate?: Date;
  totalArea: Decimal | number | string;
  areaUnit?: "SQFT" | "SQM" | "SQYD" | "ACRE" | "BIGHA" | "KATHA" | "HECTARE";
  totalCost: Decimal | number | string;
  registryNo?: string;
  location?: string;
  documentUrl?: string;
  // Token payment
  tokenAmount?: Decimal | number | string;
  tokenPaymentMode?: string;
  tokenChequeNo?: string;
  tokenChequeDate?: string;
  tokenChequeBank?: string;
  tokenChequePhotoUrl?: string;
  // ATS document (optional at booking)
  atsDocumentUrl?: string;
  atsDocumentName?: string;
  // Allow registry completion before full payment
  partialRegistryAllowed?: boolean;
  createdById?: string;
}

/**
 * Record a land purchase ORDER (booking).
 * Like a sales order, this books the land with a token amount and
 * creates a payment schedule for the balance. The purchase is not
 * "complete" until the registry document is uploaded.
 *
 * Lifecycle: BOOKED → COMPLETED (registry doc uploaded + payment settled)
 */
export async function recordLandPurchaseOrder(input: LandPurchaseOrderInput) {
  const totalArea = new Decimal(input.totalArea);
  const totalCost = new Decimal(input.totalCost);
  const tokenAmount = input.tokenAmount ? new Decimal(input.tokenAmount) : new Decimal(0);

  if (!totalArea.gt(0)) throw new ServiceError("Total area must be > 0");
  if (!totalCost.gt(0)) throw new ServiceError("Total cost must be > 0");
  if (tokenAmount.gt(totalCost)) {
    throw new ServiceError(`Token amount ${tokenAmount} exceeds total cost ${totalCost}`);
  }

  const result = await withSerializableTransaction(async (tx) => {
    const company = await tx.company.findFirst({ where: { id: input.companyId, deletedAt: null } });
    if (!company) throw new ServiceError("Company not found or deleted", 404);

    if (input.projectId) {
      const project = await tx.project.findFirst({
        where: { id: input.projectId, companyId: input.companyId, deletedAt: null },
      });
      if (!project) throw new ServiceError("Project not found, deleted, or doesn't belong to this company", 404);
    }

    if (input.sellerId) {
      const seller = await tx.landSeller.findFirst({ where: { id: input.sellerId, deletedAt: null } });
      if (!seller) throw new ServiceError("Land seller not found or deleted", 404);
    }

    // Create land purchase in BOOKED stage
    const landPurchase = await tx.landPurchase.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        sellerId: input.sellerId ?? null,
        sellerName: input.sellerName,
        sellerContact: input.sellerContact,
        purchaseDate: input.purchaseDate ?? new Date(),
        totalArea,
        areaUnit: input.areaUnit ?? "SQFT",
        totalCost,
        baseCost: totalCost, // ensure baseCost is set so recomputeLandTotalCost doesn't reset totalCost to 0
        registryNo: input.registryNo,
        location: input.location,
        documentUrl: input.documentUrl,
        mode: "WHOLE",
        purchaseStage: "BOOKED",
        tokenAmount: tokenAmount.gt(0) ? tokenAmount : null,
        tokenPaymentDate: tokenAmount.gt(0) ? new Date() : null,
        tokenPaymentMode: tokenAmount.gt(0) ? (input.tokenPaymentMode ?? "BANK_TRANSFER") : null,
        tokenChequePhotoUrl: input.tokenChequePhotoUrl ?? null,
        atsDocumentUrl: input.atsDocumentUrl ?? null,
        atsDocumentName: input.atsDocumentName ?? null,
        partialRegistryAllowed: input.partialRegistryAllowed ?? false,
      },
    });

    // Create initial parcel (the whole plot) — HOLD status during BOOKED
    const parcel = await tx.landParcel.create({
      data: {
        landPurchaseId: landPurchase.id,
        number: "PLOT-1",
        area: totalArea,
        areaUnit: input.areaUnit ?? "SQFT",
        status: "HOLD",
        purpose: input.projectId ? "PROJECT" : "HOLD",
        acquisitionCost: totalCost,
        currentValuation: totalCost,
        projectId: input.projectId,
      },
    });

    // Record token payment if provided
    if (tokenAmount.gt(0)) {
      await tx.landPurchasePayment.create({
        data: {
          landPurchaseId: landPurchase.id,
          amount: tokenAmount,
          paymentMode: input.tokenPaymentMode ?? "BANK_TRANSFER",
          chequeNo: input.tokenChequeNo ?? null,
          chequeDate: input.tokenChequeDate ? new Date(input.tokenChequeDate) : null,
          chequeBank: input.tokenChequeBank ?? null,
          chequePhotoUrl: input.tokenChequePhotoUrl ?? null,
          chequeStatus: (input.tokenPaymentMode === "CHEQUE") ? "PENDING" : null,
        },
      });
    }

    // Post the land purchase to GL — for staged (BOOKED) purchases, only the
    // token amount is paid in cash; the balance is credited to Accounts Payable.
    await postLandPurchase(tx, {
      companyId: input.companyId,
      landPurchaseId: landPurchase.id,
      totalCost,
      cashPaid: tokenAmount,
      postedById: input.createdById,
    });

    if (input.createdById) {
      await logAction(tx, {
        userId: input.createdById,
        action: "LAND_PURCHASE_ORDER",
        entityType: "LandPurchase",
        entityId: landPurchase.id,
        after: {
          sellerName: input.sellerName,
          totalArea: totalArea.toString(),
          totalCost: totalCost.toString(),
          tokenAmount: tokenAmount.toString(),
          purchaseStage: "BOOKED",
        },
      });
    }

    return { landPurchase, parcel };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.LAND_PURCHASE_CREATED,
    companyId: input.companyId,
    entityType: "LandPurchase",
    entityId: result.landPurchase.id,
    variables: {
      sellerName: input.sellerName,
      totalArea: totalArea.toString(),
      totalCost: totalCost.toString(),
      location: input.location ?? "",
      mode: "BOOKED",
    },
    timestamp: new Date(),
  });

  return result;
}

// ───────────────────────────────────────────────────────────
//  Land purchase payment — record a payment against a land purchase
// ───────────────────────────────────────────────────────────

export interface RecordLandPurchasePaymentInput {
  landPurchaseId: string;
  amount: Decimal | number | string;
  paymentMode: string;
  referenceNo?: string;
  notes?: string;
  userId?: string;
  chequeNo?: string;
  chequeDate?: string;
  chequeBank?: string;
  chequePhotoUrl?: string;
}

export async function recordLandPurchasePayment(input: RecordLandPurchasePaymentInput) {
  return withSerializableTransaction(async (tx) => {
    const lp = await tx.landPurchase.findUnique({
      where: { id: input.landPurchaseId },
      include: { payments: true },
    });
    if (!lp) throw new ServiceError("Land purchase not found", 404);
    if (lp.deletedAt) throw new ServiceError("Land purchase is deleted");
    if (lp.purchaseStage === "COMPLETED") throw new ServiceError("Land purchase is already completed");
    if (lp.purchaseStage === "CANCELLED") throw new ServiceError("Cannot record payment on a cancelled purchase");

    const amount = new Decimal(input.amount);
    if (!amount.gt(0)) throw new ServiceError("Payment amount must be > 0");

    const totalPaid = lp.payments.reduce(
      (sum, p) => sum.plus(new Decimal(p.amount)),
      new Decimal(0),
    );
    const totalCost = new Decimal(lp.totalCost);
    if (totalPaid.plus(amount).gt(totalCost)) {
      throw new ServiceError(`Overpayment: cumulative ${totalPaid.plus(amount)} > total cost ${totalCost}`);
    }

    const payment = await tx.landPurchasePayment.create({
      data: {
        landPurchaseId: input.landPurchaseId,
        amount,
        paymentMode: input.paymentMode,
        referenceNo: input.referenceNo ?? null,
        notes: input.notes ?? null,
        chequeNo: input.chequeNo ?? null,
        chequeDate: input.chequeDate ? new Date(input.chequeDate) : null,
        chequeBank: input.chequeBank ?? null,
        chequePhotoUrl: input.chequePhotoUrl ?? null,
        chequeStatus: (input.paymentMode === "CHEQUE") ? "PENDING" : null,
      },
    });

    // Post GL entry: Dr Accounts Payable / Cr Cash
    // For cheque payments, the GL is deferred until the cheque clears
    // (clearLandPurchaseCheque posts the entry at that point).
    if (input.paymentMode !== "CHEQUE") {
      await postJournalEntry(tx, {
        companyId: lp.companyId,
        sourceType: "LAND_PURCHASE_PAYMENT",
        sourceId: payment.id,
        memo: `Land purchase payment — ${input.paymentMode}`,
        postedById: input.userId,
        lines: [
          { accountCode: ACCT.AP, debit: amount, credit: 0, entityType: "LandPurchase", entityId: input.landPurchaseId, memo: "Payable paid down" },
          { accountCode: ACCT.CASH, debit: 0, credit: amount, entityType: "LandPurchase", entityId: input.landPurchaseId, memo: "Cash paid for land" },
        ],
      });
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: lp.companyId,
        action: "LAND_PURCHASE_PAYMENT",
        entityType: "LandPurchase",
        entityId: input.landPurchaseId,
        after: { amount: amount.toString(), paymentMode: input.paymentMode },
      });
    }

    return { payment };
  });
}

// ───────────────────────────────────────────────────────────
//  Land purchase document upload — ATS, Registry documents
// ───────────────────────────────────────────────────────────

export interface UploadLandPurchaseDocumentInput {
  landPurchaseId: string;
  userId?: string;
  documentType: "ATS" | "REGISTRY";
  documentUrl: string;
  documentName?: string;
  registryNo?: string;
}

export async function uploadLandPurchaseDocument(input: UploadLandPurchaseDocumentInput) {
  return withSerializableTransaction(async (tx) => {
    const lp = await tx.landPurchase.findUnique({ where: { id: input.landPurchaseId } });
    if (!lp) throw new ServiceError("Land purchase not found", 404);
    if (lp.deletedAt) throw new ServiceError("Land purchase is deleted");

    const data: Prisma.LandPurchaseUpdateInput = {};
    if (input.documentType === "ATS") {
      data.atsDocumentUrl = input.documentUrl;
      data.atsDocumentName = input.documentName ?? null;
    } else if (input.documentType === "REGISTRY") {
      data.registryDocumentUrl = input.documentUrl;
      data.registryDocumentName = input.documentName ?? null;
      if (input.registryNo) data.registryNo = input.registryNo;
    }

    const updated = await tx.landPurchase.update({ where: { id: input.landPurchaseId }, data });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: lp.companyId,
        action: "LAND_PURCHASE_DOCUMENT_UPLOAD",
        entityType: "LandPurchase",
        entityId: input.landPurchaseId,
        after: { documentType: input.documentType, documentName: input.documentName },
      });
    }

    return updated;
  });
}

// ───────────────────────────────────────────────────────────
//  Complete land purchase — mark COMPLETED when registry doc uploaded
// ───────────────────────────────────────────────────────────

export interface CompleteLandPurchaseInput {
  landPurchaseId: string;
  userId?: string;
  registryDocumentUrl?: string;
  registryDocumentName?: string;
  registryNo?: string;
  partialRegistryAllowed?: boolean; // allow completion with balance due
}

export async function completeLandPurchase(input: CompleteLandPurchaseInput) {
  return withSerializableTransaction(async (tx) => {
    const lp = await tx.landPurchase.findUnique({
      where: { id: input.landPurchaseId },
      include: { payments: true, parcels: true },
    });
    if (!lp) throw new ServiceError("Land purchase not found", 404);
    if (lp.deletedAt) throw new ServiceError("Land purchase is deleted");
    if (lp.purchaseStage === "COMPLETED") throw new ServiceError("Land purchase is already completed");
    if (lp.purchaseStage === "CANCELLED") throw new ServiceError("Cannot complete a cancelled purchase");

    // Registry document is REQUIRED for completion
    const registryDocUrl = input.registryDocumentUrl ?? lp.registryDocumentUrl;
    if (!registryDocUrl) {
      throw new ServiceError(
        "Land purchase cannot be completed without uploading the registry document. Please upload the registry document first.",
      );
    }

    // Payment check: unless partialRegistryAllowed, full payment is required
    // Only count cleared payments — pending/bounced cheques are NOT counted as paid
    const allowPartial = lp.partialRegistryAllowed || input.partialRegistryAllowed;
    if (!allowPartial) {
      const totalPaid = lp.payments.reduce((s, p) => {
        // Skip pending or bounced cheques
        if (p.paymentMode === "CHEQUE" && p.chequeStatus && p.chequeStatus !== "CLEARED") return s;
        return s.plus(p.amount);
      }, new Decimal(0));
      const balance = new Decimal(lp.totalCost).minus(totalPaid);
      if (balance.gt(0)) {
        throw new ServiceError(
          `Land purchase has a balance of ₹${balance.toFixed(2)}. Full payment is required before completion, or enable "Partial Registry" option.`,
        );
      }
    }

    const data: Prisma.LandPurchaseUpdateInput = { purchaseStage: "COMPLETED" };
    if (input.registryDocumentUrl) {
      data.registryDocumentUrl = input.registryDocumentUrl;
      data.registryDocumentName = input.registryDocumentName ?? null;
    }
    if (input.registryNo) data.registryNo = input.registryNo;
    if (input.partialRegistryAllowed !== undefined) data.partialRegistryAllowed = input.partialRegistryAllowed;

    const updated = await tx.landPurchase.update({ where: { id: input.landPurchaseId }, data });

    // Mark parcels as AVAILABLE (they were HOLD during BOOKED stage)
    await tx.landParcel.updateMany({
      where: { landPurchaseId: input.landPurchaseId, deletedAt: null },
      data: { status: "AVAILABLE" },
    });

    // If linked to a project, trigger cost reallocation
    if (lp.projectId) {
      await reallocateProjectCosts(tx, lp.projectId);
    }

    // Auto-create OWNERSHIP_CERTIFICATE legal doc if registry number provided
    const registryNo = input.registryNo ?? lp.registryNo;
    if (registryNo && registryNo.trim()) {
      const existing = await tx.legalDocument.findFirst({
        where: { landPurchaseId: input.landPurchaseId, type: "OWNERSHIP_CERTIFICATE" },
      });
      if (!existing) {
        await tx.legalDocument.create({
          data: {
            companyId: lp.companyId,
            landPurchaseId: input.landPurchaseId,
            projectId: lp.projectId ?? null,
            type: "OWNERSHIP_CERTIFICATE",
            title: "Ownership Certificate / Sale Deed",
            authority: "Sub-Registrar / Revenue Department",
            status: "APPROVED",
            appliesTo: "BOTH",
            sortOrder: 0,
            prerequisiteType: null,
            obtained: true,
            docNumber: registryNo.trim(),
            documentUrl: registryDocUrl,
            documentName: input.registryDocumentName ?? null,
            notes: "Auto-created from land purchase completion — registry completed.",
            createdById: input.userId ?? null,
          },
        });
      }
    }

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: lp.companyId,
        action: "LAND_PURCHASE_COMPLETE",
        entityType: "LandPurchase",
        entityId: input.landPurchaseId,
        before: { purchaseStage: lp.purchaseStage },
        after: { purchaseStage: "COMPLETED", registryNo: registryNo ?? null },
      });
    }

    return updated;
  });
}

// ───────────────────────────────────────────────────────────
//  Land purchase cheque management — clear or bounce
// ───────────────────────────────────────────────────────────

export async function clearLandPurchaseCheque(paymentId: string, userId?: string) {
  return withSerializableTransaction(async (tx) => {
    const payment = await tx.landPurchasePayment.findUnique({
      where: { id: paymentId },
      include: { landPurchase: true },
    });
    if (!payment) throw new ServiceError("Payment not found", 404);
    if (payment.chequeStatus !== "PENDING") {
      throw new ServiceError(`Cheque is already ${payment.chequeStatus?.toLowerCase() ?? "processed"}`);
    }

    await tx.landPurchasePayment.update({
      where: { id: paymentId },
      data: { chequeStatus: "CLEARED", chequeClearDate: new Date() },
    });

    // Post the GL entry now that the cheque has cleared:
    // Dr Accounts Payable / Cr Cash (the payment was deferred at record time)
    const amount = new Decimal(payment.amount);
    await postJournalEntry(tx, {
      companyId: payment.landPurchase.companyId,
      sourceType: "LAND_PURCHASE_PAYMENT",
      sourceId: paymentId,
      memo: `Land purchase cheque cleared — ${payment.chequeNo ?? ""}`,
      postedById: userId,
      lines: [
        { accountCode: ACCT.AP, debit: amount, credit: 0, entityType: "LandPurchase", entityId: payment.landPurchaseId, memo: "Payable paid down (cheque cleared)" },
        { accountCode: ACCT.CASH, debit: 0, credit: amount, entityType: "LandPurchase", entityId: payment.landPurchaseId, memo: "Cash paid for land (cheque cleared)" },
      ],
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: payment.landPurchase.companyId,
        action: "LAND_PURCHASE_CHEQUE_CLEARED",
        entityType: "LandPurchasePayment",
        entityId: paymentId,
        after: { chequeStatus: "CLEARED" },
      });
    }

    return { chequeStatus: "CLEARED" as const };
  });
}

export async function bounceLandPurchaseCheque(paymentId: string, userId?: string, bounceReason?: string) {
  return withSerializableTransaction(async (tx) => {
    const payment = await tx.landPurchasePayment.findUnique({
      where: { id: paymentId },
      include: { landPurchase: true },
    });
    if (!payment) throw new ServiceError("Payment not found", 404);
    if (payment.chequeStatus !== "PENDING") {
      throw new ServiceError(`Cheque is already ${payment.chequeStatus?.toLowerCase() ?? "processed"}`);
    }

    await tx.landPurchasePayment.update({
      where: { id: paymentId },
      data: { chequeStatus: "BOUNCED", chequeBounceReason: bounceReason ?? null },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        companyId: payment.landPurchase.companyId,
        action: "LAND_PURCHASE_CHEQUE_BOUNCED",
        entityType: "LandPurchasePayment",
        entityId: paymentId,
        after: { chequeStatus: "BOUNCED", bounceReason: bounceReason ?? null },
      });
    }

    return { chequeStatus: "BOUNCED" as const };
  });
}

// ───────────────────────────────────────────────────────────
//  Land Purchase Payment Schedule — structured payment plan
//  for staged purchases. Token at booking, balance per schedule.
// ───────────────────────────────────────────────────────────

export interface LandPaymentScheduleItemInput {
  installmentNo: number;
  description: string;
  percentage: number;  // % of totalAmount
  dueDate?: string | null;
}

export interface CreateLandPaymentScheduleInput {
  landPurchaseId: string;
  items: LandPaymentScheduleItemInput[];
  userId?: string;
}

export async function createLandPaymentSchedule(input: CreateLandPaymentScheduleInput) {
  return withSerializableTransaction(async (tx) => {
    const lp = await tx.landPurchase.findUnique({
      where: { id: input.landPurchaseId },
      include: { payments: true },
    });
    if (!lp) throw new ServiceError("Land purchase not found", 404);

    // Calculate balance after token
    const totalPaid = lp.payments.reduce((s, p) => s.plus(p.amount), new Decimal(0));
    const balance = new Decimal(lp.totalCost).minus(totalPaid);

    // Delete existing schedule if any
    const existing = await tx.landPurchasePaymentSchedule.findUnique({
      where: { landPurchaseId: input.landPurchaseId },
    });
    if (existing) {
      await tx.landPurchasePaymentScheduleItem.deleteMany({
        where: { paymentScheduleId: existing.id },
      });
      await tx.landPurchasePaymentSchedule.delete({
        where: { id: existing.id },
      });
    }

    // Validate percentages sum to 100
    const totalPct = input.items.reduce((s, i) => s + i.percentage, 0);
    if (Math.abs(totalPct - 100) > 0.01) {
      throw new ServiceError(`Payment schedule percentages must sum to 100%, got ${totalPct}%`);
    }

    // Create schedule + items
    const schedule = await tx.landPurchasePaymentSchedule.create({
      data: {
        landPurchaseId: input.landPurchaseId,
        totalAmount: balance,
        items: {
          create: input.items.map((item) => ({
            installmentNo: item.installmentNo,
            description: item.description,
            percentage: new Decimal(item.percentage),
            amount: balance.mul(item.percentage).div(100).toDecimalPlaces(2),
            dueDate: item.dueDate ? new Date(item.dueDate) : null,
            status: "PENDING" as const,
          })),
        },
      },
      include: { items: { orderBy: { installmentNo: "asc" } } },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        companyId: lp.companyId,
        action: "LAND_PAYMENT_SCHEDULE_CREATED",
        entityType: "LandPurchase",
        entityId: input.landPurchaseId,
        before: null,
        after: { itemCount: input.items.length, totalAmount: balance.toString() },
      });
    }

    return schedule;
  });
}

export async function getLandPaymentSchedule(landPurchaseId: string) {
  return prisma.landPurchasePaymentSchedule.findUnique({
    where: { landPurchaseId },
    include: { items: { orderBy: { installmentNo: "asc" } } },
  });
}

// ───────────────────────────────────────────────────────────
//  Possession tracking — mark land/project as possessed
// ───────────────────────────────────────────────────────────

export interface MarkPossessionInput {
  landPurchaseId?: string;
  projectId?: string;
  isPossessed: boolean;
  possessionDate?: string;
  notes?: string;
  userId?: string;
  possessionDocumentUrl?: string;
}

export async function markPossession(input: MarkPossessionInput) {
  return withSerializableTransaction(async (tx) => {
    if (input.landPurchaseId) {
      const lp = await tx.landPurchase.findUnique({ where: { id: input.landPurchaseId } });
      if (!lp) throw new ServiceError("Land purchase not found", 404);

      const updated = await tx.landPurchase.update({
        where: { id: input.landPurchaseId },
        data: {
          isPossessed: input.isPossessed,
          possessionDate: input.isPossessed
            ? (input.possessionDate ? new Date(input.possessionDate) : new Date())
            : null,
          possessionNotes: input.notes ?? null,
          possessionDocumentUrl: input.isPossessed ? (input.possessionDocumentUrl ?? null) : null,
        },
      });

      if (input.userId) {
        await logAction(tx, {
          userId: input.userId,
          companyId: lp.companyId,
          action: "LAND_POSSESSION_MARKED",
          entityType: "LandPurchase",
          entityId: input.landPurchaseId,
          before: { isPossessed: lp.isPossessed },
          after: { isPossessed: input.isPossessed, possessionDate: updated.possessionDate, possessionDocumentUrl: input.possessionDocumentUrl ?? null },
        });
      }
      return updated;
    }

    if (input.projectId) {
      const proj = await tx.project.findFirst({ where: { id: input.projectId, deletedAt: null } });
      if (!proj) throw new ServiceError("Project not found", 404);

      const updated = await tx.project.update({
        where: { id: input.projectId },
        data: {
          isPossessed: input.isPossessed,
          possessionDate: input.isPossessed
            ? (input.possessionDate ? new Date(input.possessionDate) : new Date())
            : null,
          possessionNotes: input.notes ?? null,
          possessionDocumentUrl: input.isPossessed ? (input.possessionDocumentUrl ?? null) : null,
        },
      });

      if (input.userId) {
        await logAction(tx, {
          userId: input.userId,
          companyId: proj.companyId,
          action: "PROJECT_POSSESSION_MARKED",
          entityType: "Project",
          entityId: input.projectId,
          before: { isPossessed: proj.isPossessed },
          after: { isPossessed: input.isPossessed, possessionDate: updated.possessionDate, possessionDocumentUrl: input.possessionDocumentUrl ?? null },
        });
      }
      return updated;
    }

    throw new ServiceError("Either landPurchaseId or projectId is required");
  });
}
