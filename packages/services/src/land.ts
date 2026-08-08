import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { postLandPurchase } from "./gl-posting";
import { ServiceError } from "./errors";

/**
 * Land Service — record land purchases and create initial parcels.
 */

interface RecordLandPurchaseInput {
  companyId: string;
  projectId?: string;
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

  return prisma.$transaction(async (tx) => {
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

    // Create land purchase
    const landPurchase = await tx.landPurchase.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        sellerName: input.sellerName,
        sellerContact: input.sellerContact,
        purchaseDate: input.purchaseDate ?? new Date(),
        totalArea,
        areaUnit: input.areaUnit ?? "SQFT",
        totalCost,
        registryNo: input.registryNo,
        location: input.location,
        documentUrl: input.documentUrl,
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

    return { landPurchase, parcel };
  });
}
