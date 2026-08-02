import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, withStockTransaction } from "./stock-ledger";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { postMaterialIssue, postMaterialIssueToDepartment } from "./gl-posting";

/**
 * Issue Service — issue materials from a stock location to a project.
 *
 * This is the "consumption" step: materials leave stock and their cost (at MAC)
 * accumulates into the project's material cost. Triggers cost-per-sqft reallocation.
 *
 * The fromLocation can be any location (company warehouse or a project site) —
 * it doesn't have to belong to the same project being issued to.
 */

interface IssueMaterialsInput {
  projectId: string;
  fromLocationId: string;
  issuedById?: string;
  notes?: string;
  lines: {
    materialId: string;
    qty: Decimal | number | string;
  }[];
}

export async function issueMaterialsToProject(input: IssueMaterialsInput) {
  return withStockTransaction(async (tx) => {
    // Validate project
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) throw new Error("Project not found or deleted");
    if (project.status === "ON_HOLD") {
      throw new Error("Cannot issue materials to an ON_HOLD project");
    }

    // Validate location
    const location = await tx.stockLocation.findFirst({
      where: { id: input.fromLocationId, deletedAt: null },
    });
    if (!location) throw new Error("Source location not found or deleted");

    // Validate lines
    if (input.lines.length === 0) throw new Error("Issue must have at least one line");
    const materialIds = input.lines.map((l) => l.materialId);
    const materials = await tx.material.findMany({
      where: { id: { in: materialIds }, deletedAt: null },
    });
    if (materials.length !== materialIds.length) {
      throw new Error("One or more materials not found or deleted");
    }
    for (const line of input.lines) {
      if (!new Decimal(line.qty).gt(0)) throw new Error("Issue qty must be > 0");
    }

    // Process each line: record movement + capture cost
    const lineResults: { materialId: string; qty: Decimal; unitCost: Decimal; lineCost: Decimal }[] = [];
    let totalCost = new Decimal(0);

    for (const line of input.lines) {
      const result = await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "ISSUE_TO_PROJECT",
        fromLocationId: input.fromLocationId,
        qty: new Decimal(line.qty),
        refType: "MATERIAL_ISSUE",
        userId: input.issuedById,
      });

      const lineCost = new Decimal(line.qty).times(result.newMAC);
      totalCost = totalCost.plus(lineCost);
      lineResults.push({
        materialId: line.materialId,
        qty: new Decimal(line.qty),
        unitCost: result.newMAC,
        lineCost,
      });
    }

    // Create MaterialIssue + lines (audit record)
    const materialIssue = await tx.materialIssue.create({
      data: {
        projectId: input.projectId,
        fromLocationId: input.fromLocationId,
        issuedById: input.issuedById,
        notes: input.notes,
        totalCost,
        lines: {
          create: lineResults.map((l) => ({
            materialId: l.materialId,
            qty: l.qty,
            unitCost: l.unitCost,
          })),
        },
      },
      include: { lines: true },
    });

    // Trigger cost reallocation (materials consumed → project cost changes → costPerSqft changes)
    await reallocateProjectCosts(tx, input.projectId);

    // Post to the General Ledger: move cost from inventory into WIP for the project.
    await postMaterialIssue(tx, {
      companyId: project.companyId,
      materialIssueId: materialIssue.id,
      projectId: input.projectId,
      postedById: input.issuedById,
      totalCost,
    });

    if (input.issuedById) {
      await logAction(tx, {
        userId: input.issuedById,
        action: "MATERIAL_ISSUE_CREATE",
        entityType: "MaterialIssue",
        entityId: materialIssue.id,
        after: { projectId: input.projectId, totalCost },
      });
    }

    return { materialIssue, totalCost };
  });
}

// ───────────────────────────────────────────────────────────
//  Issue to Department (cost center) — the manufacturing /
//  operational consumption path. Mirrors issueMaterialsToProject
//  but: no phase, no subcontractor, no cost-per-sqft reallocation,
//  and posts to Operating Expenses (not WIP). One of the two
//  issue targets must be set — never both, never neither.
// ───────────────────────────────────────────────────────────

interface IssueToDepartmentInput {
  departmentId: string;
  fromLocationId: string;
  issuedById?: string;
  notes?: string;
  lines: {
    materialId: string;
    qty: Decimal | number | string;
  }[];
}

export async function issueMaterialsToDepartment(input: IssueToDepartmentInput) {
  return withStockTransaction(async (tx) => {
    // Validate department
    const department = await tx.department.findFirst({
      where: { id: input.departmentId, deletedAt: null },
    });
    if (!department) throw new Error("Department not found or deleted");
    if (!department.active) throw new Error("Cannot issue materials to an inactive department");

    // Validate location
    const location = await tx.stockLocation.findFirst({
      where: { id: input.fromLocationId, deletedAt: null },
    });
    if (!location) throw new Error("Source location not found or deleted");

    // Validate lines
    if (input.lines.length === 0) throw new Error("Issue must have at least one line");
    const materialIds = input.lines.map((l) => l.materialId);
    const materials = await tx.material.findMany({
      where: { id: { in: materialIds }, deletedAt: null },
    });
    if (materials.length !== materialIds.length) {
      throw new Error("One or more materials not found or deleted");
    }
    for (const line of input.lines) {
      if (!new Decimal(line.qty).gt(0)) throw new Error("Issue qty must be > 0");
    }

    // Process each line: record movement + capture cost
    const lineResults: { materialId: string; qty: Decimal; unitCost: Decimal; lineCost: Decimal }[] = [];
    let totalCost = new Decimal(0);

    for (const line of input.lines) {
      const result = await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "ISSUE_TO_DEPARTMENT",
        fromLocationId: input.fromLocationId,
        qty: new Decimal(line.qty),
        refType: "MATERIAL_ISSUE",
        userId: input.issuedById,
      });

      const lineCost = new Decimal(line.qty).times(result.newMAC);
      totalCost = totalCost.plus(lineCost);
      lineResults.push({
        materialId: line.materialId,
        qty: new Decimal(line.qty),
        unitCost: result.newMAC,
        lineCost,
      });
    }

    // Create MaterialIssue + lines (audit record) — department target
    const materialIssue = await tx.materialIssue.create({
      data: {
        departmentId: input.departmentId,
        fromLocationId: input.fromLocationId,
        issuedById: input.issuedById,
        notes: input.notes,
        totalCost,
        lines: {
          create: lineResults.map((l) => ({
            materialId: l.materialId,
            qty: l.qty,
            unitCost: l.unitCost,
          })),
        },
      },
      include: { lines: true },
    });

    // Post to the General Ledger: expense the consumption (no WIP for departments).
    await postMaterialIssueToDepartment(tx, {
      companyId: department.companyId,
      materialIssueId: materialIssue.id,
      departmentId: input.departmentId,
      postedById: input.issuedById,
      totalCost,
    });

    if (input.issuedById) {
      await logAction(tx, {
        userId: input.issuedById,
        action: "MATERIAL_ISSUE_DEPARTMENT_CREATE",
        entityType: "MaterialIssue",
        entityId: materialIssue.id,
        after: { departmentId: input.departmentId, totalCost },
      });
    }

    return { materialIssue, totalCost };
  });
}
