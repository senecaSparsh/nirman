import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { postLandPurchase } from "./gl-posting";
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

  const result = await prisma.$transaction(async (tx) => {
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
  }, { isolationLevel: "Serializable" });

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

  return prisma.$transaction(async (tx) => {
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
  }, { isolationLevel: "Serializable" });
}
