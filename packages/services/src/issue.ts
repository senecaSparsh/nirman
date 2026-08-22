import { prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { recordMovement, withStockTransaction, refreshMaterialCurrentCost } from "./stock-ledger";
import { reallocateProjectCosts } from "./valuation";
import { logAction } from "./audit";
import { postMaterialIssue, postMaterialIssueToDepartment, reverseJournalEntry } from "./gl-posting";
import { autoSyncEntryToTally } from "./auto-sync";
import { ServiceError } from "./errors";
import { assertGatePassApproved, autoCreateGatePassFromRef } from "./gate-pass";

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
  receiverName?: string;
  receiverMobile?: string;
  // Vehicle — how the goods were transported from store to site
  vehicleNumber?: string;
  vehicleType?: string;
  vehiclePhotoUrl?: string;
  driverName?: string;
  driverPhone?: string;
  roundOff?: Decimal | number | string;
  builtUnitId?: string;
  lines: {
    materialId: string;
    qty: Decimal | number | string;
    lotNumber?: string | null;
  }[];
}

export async function issueMaterialsToProject(input: IssueMaterialsInput) {
  const result = await withStockTransaction(async (tx) => {
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

    // Validate builtUnitId belongs to the project (if specified)
    if (input.builtUnitId) {
      const unit = await tx.builtUnit.findFirst({
        where: { id: input.builtUnitId, projectId: input.projectId },
      });
      if (!unit) throw new Error("Built unit not found or does not belong to this project");
    }

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
        lotNumber: line.lotNumber ?? undefined,
        companyId: project.companyId,
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
        builtUnitId: input.builtUnitId ?? null,
        receiverName: input.receiverName,
        receiverMobile: input.receiverMobile,
        vehicleNumber: input.vehicleNumber,
        vehicleType: input.vehicleType,
        vehiclePhotoUrl: input.vehiclePhotoUrl,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
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
        companyId: project.companyId,
        action: "MATERIAL_ISSUE_CREATE",
        entityType: "MaterialIssue",
        entityId: materialIssue.id,
        after: { projectId: input.projectId, totalCost },
      });
    }

    return { materialIssue, totalCost };
  });

  // Auto-sync to Tally (best-effort, outside the transaction)
  void (async () => {
    try {
      const je = await prisma.journalEntry.findFirst({
        where: { sourceId: result.materialIssue.id, sourceType: "MATERIAL_ISSUE" },
        select: { id: true, companyId: true },
      });
      if (je) await autoSyncEntryToTally(je.companyId, je.id);
    } catch { /* best-effort */ }
  })();

  return result;
}

/**
 * Create a material issue REQUEST (PENDING state) with an auto-created gate pass.
 * No stock movements are executed. The issue is executed later by
 * `executeMaterialIssue()` after the gate pass is approved.
 *
 * This is the gate-pass-gated flow: items cannot leave until approved.
 */
export async function createMaterialIssueRequest(input: IssueMaterialsInput) {
  // Validate project
  const project = await prisma.project.findFirst({
    where: { id: input.projectId, deletedAt: null },
  });
  if (!project) throw new ServiceError("Project not found or deleted", 404);
  if (project.status === "ON_HOLD") {
    throw new ServiceError("Cannot issue materials to an ON_HOLD project");
  }

  // Validate location
  const location = await prisma.stockLocation.findFirst({
    where: { id: input.fromLocationId, deletedAt: null },
  });
  if (!location) throw new ServiceError("Source location not found or deleted", 404);

  // Validate lines
  if (input.lines.length === 0) throw new ServiceError("Issue must have at least one line");
  const materialIds = input.lines.map((l) => l.materialId);
  const materials = await prisma.material.findMany({
    where: { id: { in: materialIds }, deletedAt: null },
  });
  if (materials.length !== materialIds.length) {
    throw new ServiceError("One or more materials not found or deleted", 404);
  }
  for (const line of input.lines) {
    if (!new Decimal(line.qty).gt(0)) throw new ServiceError("Issue qty must be > 0");
  }

  return prisma.$transaction(async (tx) => {
    // Create MaterialIssue in PENDING state (no stock movements yet)
    const materialIssue = await tx.materialIssue.create({
      data: {
        projectId: input.projectId,
        fromLocationId: input.fromLocationId,
        issuedById: input.issuedById,
        notes: input.notes,
        status: "PENDING",
        builtUnitId: input.builtUnitId ?? null,
        receiverName: input.receiverName,
        receiverMobile: input.receiverMobile,
        vehicleNumber: input.vehicleNumber,
        vehicleType: input.vehicleType,
        vehiclePhotoUrl: input.vehiclePhotoUrl,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
        lines: {
          create: input.lines.map((l) => ({
            materialId: l.materialId,
            qty: new Decimal(l.qty),
            unitCost: new Decimal(0), // will be set at execution time (MAC)
          })),
        },
      },
      include: { lines: true },
    });

    // Auto-create gate pass (PENDING) linked to this issue
    await autoCreateGatePassFromRef(tx, {
      companyId: project.companyId,
      locationId: input.fromLocationId,
      projectId: input.projectId,
      category: "MATERIAL_ISSUE",
      refType: "MaterialIssue",
      refId: materialIssue.id,
      lines: input.lines.map((l) => ({ materialId: l.materialId, qty: l.qty })),
      vehicleNumber: input.vehicleNumber,
      vehicleType: input.vehicleType,
      driverName: input.driverName,
      driverPhone: input.driverPhone,
      destination: project.name,
      createdById: input.issuedById,
    });

    if (input.issuedById) {
      await logAction(tx, {
        userId: input.issuedById,
        companyId: project.companyId,
        action: "MATERIAL_ISSUE_CREATE",
        entityType: "MaterialIssue",
        entityId: materialIssue.id,
        after: { projectId: input.projectId, status: "PENDING" },
      });
    }

    return { materialIssue, totalCost: new Decimal(0) };
  }, { isolationLevel: "Serializable" });
}

/**
 * Execute a PENDING material issue — runs stock movements and completes the issue.
 * Requires an approved gate pass. Called after the gate pass is approved.
 */
export async function executeMaterialIssue(issueId: string, userId?: string) {
  // Gate Pass check — items cannot leave the gate until the gate pass is approved
  await assertGatePassApproved("MaterialIssue", issueId);

  return withStockTransaction(async (tx) => {
    const issue = await tx.materialIssue.findUnique({
      where: { id: issueId },
      include: { lines: true, project: true },
    });
    if (!issue) throw new ServiceError("Material issue not found", 404);
    if (issue.status !== "PENDING") {
      throw new ServiceError(`Cannot execute issue in status ${issue.status}`);
    }
    if (!issue.project) throw new ServiceError("Issue is not linked to a project");

    // Process each line: record movement + capture cost
    const lineResults: { materialId: string; qty: Decimal; unitCost: Decimal; lineCost: Decimal }[] = [];
    let totalCost = new Decimal(0);

    for (const line of issue.lines) {
      const result = await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "ISSUE_TO_PROJECT",
        fromLocationId: issue.fromLocationId,
        qty: new Decimal(line.qty),
        refType: "MATERIAL_ISSUE",
        refId: issueId,
        userId: userId ?? issue.issuedById ?? undefined,
        companyId: issue.project.companyId,
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

    // Update the issue with costs and set status to COMPLETED
    const updated = await tx.materialIssue.update({
      where: { id: issueId },
      data: {
        status: "COMPLETED",
        totalCost,
        lines: {
          update: lineResults.map((l, i) => ({
            where: { id: issue.lines[i]!.id },
            data: { unitCost: l.unitCost },
          })),
        },
      },
    });

    // Trigger cost reallocation
    await reallocateProjectCosts(tx, issue.projectId!);

    // Post to the General Ledger
    await postMaterialIssue(tx, {
      companyId: issue.project.companyId,
      materialIssueId: issueId,
      projectId: issue.projectId!,
      postedById: userId ?? issue.issuedById ?? undefined,
      totalCost,
    });

    if (userId ?? issue.issuedById) {
      await logAction(tx, {
        userId: userId ?? issue.issuedById!,
        companyId: issue.project.companyId,
        action: "MATERIAL_ISSUE_EXECUTE",
        entityType: "MaterialIssue",
        entityId: issueId,
        before: { status: "PENDING" },
        after: { status: "COMPLETED", totalCost },
      });
    }

    return { materialIssue: updated, totalCost };
  });
}

//  operational consumption path. Mirrors issueMaterialsToProject

interface IssueToDepartmentInput {
  departmentId: string;
  fromLocationId: string;
  issuedById?: string;
  notes?: string;
  receiverName?: string;
  receiverMobile?: string;
  vehicleNumber?: string;
  vehicleType?: string;
  vehiclePhotoUrl?: string;
  driverName?: string;
  driverPhone?: string;
  lines: {
    materialId: string;
    qty: Decimal | number | string;
    lotNumber?: string | null;
  }[];
}

export async function issueMaterialsToDepartment(input: IssueToDepartmentInput) {
  const result = await withStockTransaction(async (tx) => {
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
        lotNumber: line.lotNumber ?? undefined,
        companyId: department.companyId,
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
        receiverName: input.receiverName,
        receiverMobile: input.receiverMobile,
        vehicleNumber: input.vehicleNumber,
        vehicleType: input.vehicleType,
        vehiclePhotoUrl: input.vehiclePhotoUrl,
        driverName: input.driverName,
        driverPhone: input.driverPhone,
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
        companyId: department.companyId,
        action: "MATERIAL_ISSUE_DEPARTMENT_CREATE",
        entityType: "MaterialIssue",
        entityId: materialIssue.id,
        after: { departmentId: input.departmentId, totalCost },
      });
    }

    return { materialIssue, totalCost };
  });

  // Auto-sync to Tally (best-effort, outside the transaction)
  void (async () => {
    try {
      const je = await prisma.journalEntry.findFirst({
        where: { sourceId: result.materialIssue.id, sourceType: "MATERIAL_ISSUE" },
        select: { id: true, companyId: true },
      });
      if (je) await autoSyncEntryToTally(je.companyId, je.id);
    } catch { /* best-effort */ }
  })();

  return result;
}

/** Cancel a material issue — reverse stock, GL, and project cost allocation. */
export async function cancelMaterialIssue(id: string, userId?: string) {
  return withStockTransaction(async (tx) => {
    const issue = await tx.materialIssue.findFirst({
      where: { id },
      include: { lines: true, project: { select: { companyId: true } }, department: { select: { companyId: true } } },
    });
    if (!issue) throw new ServiceError("Material issue not found", 404);
    if (issue.status === "CANCELLED") throw new ServiceError("Issue is already cancelled");

    const companyId = issue.project?.companyId ?? issue.department?.companyId;
    if (!companyId) throw new ServiceError("Cannot determine company for this issue");

    // Reverse stock: put materials back (ADJUSTMENT_IN at original unit cost)
    for (const line of issue.lines) {
      await recordMovement(tx, {
        materialId: line.materialId,
        movementType: "ADJUSTMENT_IN",
        toLocationId: issue.fromLocationId,
        qty: line.qty,
        unitCost: line.unitCost, // restore at original MAC
        reason: `Reversal of material issue ${issue.issueNumber ?? id.slice(-6)}`,
        refType: "MATERIAL_ISSUE",
        refId: issue.id,
        userId,
        companyId,
      });
    }

    // Refresh MAC for restored materials
    const restoredMaterials = issue.lines.map((l) => l.materialId);
    if (restoredMaterials.length > 0) {
      await refreshMaterialCurrentCost(tx, restoredMaterials);
    }

    // Reverse GL entries
    const journalEntries = await tx.journalEntry.findMany({
      where: { sourceId: issue.id, sourceType: "MATERIAL_ISSUE" },
    });
    for (const je of journalEntries) {
      await reverseJournalEntry(tx, je.id, { postedById: userId, memo: `Reversal of ${je.memo}` });
    }

    // Mark as cancelled
    const updated = await tx.materialIssue.update({
      where: { id: issue.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelledById: userId ?? null,
      },
    });

    // Re-run project cost reallocation (materials returned → project cost decreases)
    if (issue.projectId) {
      await reallocateProjectCosts(tx, issue.projectId);
    }

    if (userId) {
      await logAction(tx, {
        userId,
        companyId,
        action: "MATERIAL_ISSUE_CANCEL",
        entityType: "MaterialIssue",
        entityId: issue.id,
        before: { status: "COMPLETED" },
        after: { status: "CANCELLED" },
      });
    }

    return updated;
  });
}

// ── Amount in words (Indian numbering system) ─────────────────────────
// Used by print pages to show "Rupees One Lakh Twenty Three Thousand Four
// Hundred Fifty Only" below the numeric amount.

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];

const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy",
  "Eighty", "Ninety",
];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  return (TENS[Math.floor(n / 10)] ?? "") + (n % 10 ? " " + (ONES[n % 10] ?? "") : "");
}

function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const r = n % 100;
  let s = "";
  if (h) s += ONES[h] + " Hundred";
  if (r) s += (h ? " " : "") + twoDigits(r);
  return s;
}

export function amountInWords(amount: number | string): string {
  const num = typeof amount === "string" ? parseFloat(amount) : amount;
  if (isNaN(num) || num === 0) return "Zero";

  const isNegative = num < 0;
  let n = Math.abs(Math.floor(num));
  const paise = Math.round((Math.abs(num) - n) * 100);

  let words = "";

  // Crores (10^7)
  if (n >= 10000000) {
    words += threeDigits(Math.floor(n / 10000000)) + " Crore ";
    n %= 10000000;
  }
  // Lakhs (10^5)
  if (n >= 100000) {
    words += threeDigits(Math.floor(n / 100000)) + " Lakh ";
    n %= 100000;
  }
  // Thousands (10^3)
  if (n >= 1000) {
    words += threeDigits(Math.floor(n / 1000)) + " Thousand ";
    n %= 1000;
  }
  // Hundreds + tens + ones
  if (n > 0) {
    words += threeDigits(n);
  }

  words = words.trim();

  if (paise > 0) {
    words += " and " + twoDigits(paise) + " Paise";
  }

  return (isNegative ? "Minus " : "") + "Rupees " + words + " Only";
}
