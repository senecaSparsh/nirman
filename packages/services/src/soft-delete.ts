import { prisma } from "@nirman/db";
import { ServiceError } from "./errors";

/**
 * Soft Delete Service — safe deletion of master entities.
 *
 * Never hard-deletes. Sets deletedAt = now() after checking guard conditions.
 * Guards prevent deleting entities that are "in use" (have stock, open orders, etc.).
 */

type EntityType =
  | "Company"
  | "Project"
  | "StockLocation"
  | "MaterialCategory"
  | "Material"
  | "Supplier"
  | "Customer"
  | "LandPurchase"
  | "LandParcel"
  | "BuiltUnit"
  | "Employee"
  | "Subcontractor"
  | "Equipment";

export async function softDelete(entityType: EntityType, entityId: string): Promise<void> {
  // Run guard check first
  await guardDelete(entityType, entityId);

  const model = getModel(entityType);
  await (model as any).update({
    where: { id: entityId },
    data: { deletedAt: new Date() },
  });
}

export async function restoreEntity(entityType: EntityType, entityId: string): Promise<void> {
  const model = getModel(entityType);
  await (model as any).update({
    where: { id: entityId },
    data: { deletedAt: null },
  });
}

function getModel(entityType: EntityType) {
  const map: Record<EntityType, any> = {
    Company: prisma.company,
    Project: prisma.project,
    StockLocation: prisma.stockLocation,
    MaterialCategory: prisma.materialCategory,
    Material: prisma.material,
    Supplier: prisma.supplier,
    Customer: prisma.customer,
    LandPurchase: prisma.landPurchase,
    LandParcel: prisma.landParcel,
    BuiltUnit: prisma.builtUnit,
    Employee: prisma.employee,
    Subcontractor: prisma.subcontractor,
    Equipment: prisma.equipment,
  };
  return map[entityType];
}

async function guardDelete(entityType: EntityType, entityId: string): Promise<void> {
  switch (entityType) {
    case "Company":
      throw new ServiceError("Cannot delete the company (singleton)");

    case "Material": {
      const items = await prisma.stockLocationItem.findMany({
        where: { materialId: entityId },
        select: { qty: true },
      });
      const hasStock = items.some((i) => Number(i.qty) > 0);
      if (hasStock) throw new ServiceError("Cannot delete material with stock at any location. Transfer or adjust stock first.");
      break;
    }

    case "StockLocation": {
      const items = await prisma.stockLocationItem.findMany({
        where: { locationId: entityId },
        select: { qty: true },
      });
      const hasStock = items.some((i) => Number(i.qty) > 0);
      if (hasStock) throw new ServiceError("Cannot delete location with stock. Transfer stock out first.");
      break;
    }

    case "Project": {
      const project = await prisma.project.findUnique({ where: { id: entityId } });
      if (!project) throw new ServiceError("Project not found", 404);
      if (project.status === "ACTIVE") {
        throw new ServiceError("Cannot delete an ACTIVE project. Complete or put on hold first.");
      }
      break;
    }

    case "Supplier": {
      const openPos = await prisma.purchaseOrder.count({
        where: {
          supplierId: entityId,
          status: { in: ["DRAFT", "APPROVED", "ORDERED", "PARTIAL"] },
        },
      });
      if (openPos > 0) throw new ServiceError("Cannot delete supplier with open purchase orders.");
      break;
    }

    case "Customer": {
      const [activeSales, activeMaterialSales, activeTenancies] = await Promise.all([
        prisma.assetSale.count({ where: { customerId: entityId, status: "ACTIVE" } }),
        prisma.materialSale.count({ where: { customerId: entityId, status: "ACTIVE" } }),
        prisma.tenancy.count({ where: { customerId: entityId, status: { in: ["PENDING", "ACTIVE"] } } }),
      ]);
      if (activeSales > 0) throw new ServiceError("Cannot delete customer with active asset sales.");
      if (activeMaterialSales > 0) throw new ServiceError("Cannot delete customer with active material sales.");
      if (activeTenancies > 0) throw new ServiceError("Cannot delete customer with active or pending tenancies.");
      break;
    }

    case "LandParcel": {
      const parcel = await prisma.landParcel.findUnique({ where: { id: entityId } });
      if (!parcel) throw new ServiceError("Parcel not found", 404);
      if (parcel.status === "AVAILABLE" || parcel.status === "HOLD") {
        throw new ServiceError("Cannot delete an AVAILABLE or HOLD parcel. Sell or partition first.");
      }
      break;
    }

    case "BuiltUnit": {
      const unit = await prisma.builtUnit.findUnique({ where: { id: entityId } });
      if (!unit) throw new ServiceError("Unit not found", 404);
      if (unit.status !== "PLANNED") {
        throw new ServiceError("Can only delete units in PLANNED status. Once construction starts, units cannot be removed.");
      }
      break;
    }

    case "LandPurchase": {
      const parcels = await prisma.landParcel.count({
        where: { landPurchaseId: entityId, status: { in: ["AVAILABLE", "HOLD"] } },
      });
      if (parcels > 0) throw new ServiceError("Cannot delete land purchase with unsold parcels.");
      break;
    }

    case "MaterialCategory": {
      const materials = await prisma.material.count({
        where: { categoryId: entityId, deletedAt: null },
      });
      if (materials > 0) throw new ServiceError("Cannot delete category with active materials. Delete materials first.");
      break;
    }

    case "Employee": {
      const employee = await prisma.employee.findUnique({ where: { id: entityId } });
      if (!employee) throw new ServiceError("Employee not found", 404);
      if (employee.active) {
        throw new ServiceError("Cannot delete an active employee. Mark them inactive first.");
      }
      break;
    }

    case "Subcontractor": {
      const [hasCosts, hasIssues] = await Promise.all([
        prisma.projectCost.count({ where: { subcontractorId: entityId } }),
        prisma.materialIssue.count({ where: { subcontractorId: entityId } }),
      ]);
      if (hasCosts > 0 || hasIssues > 0) {
        throw new ServiceError("Cannot delete subcontractor with project costs or material issues.");
      }
      break;
    }

    case "Equipment": {
      const equipment = await prisma.equipment.findUnique({ where: { id: entityId } });
      if (!equipment) throw new ServiceError("Equipment not found", 404);
      if (equipment.status === "ASSIGNED") {
        throw new ServiceError("Cannot delete assigned equipment. Return it first.");
      }
      if (equipment.status === "IN_MAINTENANCE") {
        throw new ServiceError("Cannot delete equipment in maintenance. Complete maintenance first.");
      }
      break;
    }
  }
}
