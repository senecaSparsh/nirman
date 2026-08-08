import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * BOQ (Bill of Quantities) + WBS (Work Breakdown Structure) +
 * Measurement Book (MB) Service.
 *
 * The three models form the construction execution backbone:
 * - BOQ = the cost budget (what we plan to build, at what qty/rate)
 * - WBS = the schedule (when, in what order, with dependencies)
 * - MB = the earned value (what we actually built, verified on site)
 *
 * EVM is computed from these: PV = BOQ budget, EV = MB × BOQ rate,
 * AC = actuals (MaterialIssue + ProjectCost + RA bills).
 */

// ── BOQ (Bill of Quantities) ───────────────────────────────

export interface CreateBoqItemInput {
  projectId: string;
  phaseId?: string;
  parentId?: string;
  type?: "SECTION" | "SUBSECTION" | "LINE_ITEM";
  serialNo: string;
  description: string;
  materialId?: string;
  unit?: string;
  estimatedQty?: Decimal | number | string;
  rate?: Decimal | number | string;
  notes?: string;
  sortOrder?: number;
  userId?: string;
}

export async function createBoqItem(input: CreateBoqItemInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) throw new ServiceError("Project not found or deleted", 404);

    if (input.phaseId) {
      const phase = await tx.projectPhase.findFirst({
        where: { id: input.phaseId, projectId: input.projectId },
      });
      if (!phase) throw new ServiceError("Phase not found in this project", 404);
    }

    if (input.parentId) {
      const parent = await tx.boqItem.findFirst({
        where: { id: input.parentId, projectId: input.projectId },
      });
      if (!parent) throw new ServiceError("Parent BOQ item not found", 404);
    }

    const type = input.type ?? (input.parentId ? "LINE_ITEM" : "SECTION");

    // Validate leaf-item fields
    if (type === "LINE_ITEM") {
      if (!input.unit) throw new ServiceError("Line item requires a unit", 400);
      if (input.estimatedQty == null) throw new ServiceError("Line item requires estimatedQty", 400);
      if (input.rate == null) throw new ServiceError("Line item requires a rate", 400);
    }

    const estimatedQty = input.estimatedQty != null ? new Decimal(input.estimatedQty) : null;
    const rate = input.rate != null ? new Decimal(input.rate) : null;
    const estimatedAmount =
      estimatedQty && rate ? estimatedQty.times(rate).toDecimalPlaces(2) : null;

    const item = await tx.boqItem.create({
      data: {
        projectId: input.projectId,
        phaseId: input.phaseId ?? null,
        parentId: input.parentId ?? null,
        type,
        serialNo: input.serialNo,
        description: input.description,
        materialId: input.materialId ?? null,
        unit: input.unit ?? null,
        estimatedQty: estimatedQty?.toString() ?? null,
        rate: rate?.toString() ?? null,
        estimatedAmount: estimatedAmount?.toString() ?? null,
        notes: input.notes ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "BOQ_ITEM_CREATE",
        entityType: "BoqItem",
        entityId: item.id,
        after: { serialNo: item.serialNo, description: item.description, type: item.type },
      });
    }

    return item;
  });
}

export async function updateBoqItem(
  id: string,
  patch: Partial<CreateBoqItemInput> & { userId?: string },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.boqItem.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("BOQ item not found", 404);

    const data: Prisma.BoqItemUpdateInput = {};
    if (patch.description !== undefined) data.description = patch.description;
    if (patch.serialNo !== undefined) data.serialNo = patch.serialNo;
    if (patch.materialId !== undefined) data.material = patch.materialId ? { connect: { id: patch.materialId } } : { disconnect: true };
    if (patch.unit !== undefined) data.unit = patch.unit ?? null;
    if (patch.notes !== undefined) data.notes = patch.notes ?? null;
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;

    if (patch.estimatedQty !== undefined) {
      const qty = patch.estimatedQty != null ? new Decimal(patch.estimatedQty) : null;
      data.estimatedQty = qty?.toString() ?? null;
      // Recompute amount
      const rate = existing.rate ? new Decimal(existing.rate) : null;
      if (qty && rate) {
        data.estimatedAmount = qty.times(rate).toDecimalPlaces(2).toString();
      }
    }
    if (patch.rate !== undefined) {
      const rate = patch.rate != null ? new Decimal(patch.rate) : null;
      data.rate = rate?.toString() ?? null;
      const qty = existing.estimatedQty ? new Decimal(existing.estimatedQty) : null;
      if (qty && rate) {
        data.estimatedAmount = qty.times(rate).toDecimalPlaces(2).toString();
      }
    }

    const updated = await tx.boqItem.update({ where: { id }, data });

    if (patch.userId) {
      await logAction(tx, {
        userId: patch.userId,
        action: "BOQ_ITEM_UPDATE",
        entityType: "BoqItem",
        entityId: id,
        before: { serialNo: existing.serialNo, description: existing.description },
        after: { serialNo: updated.serialNo, description: updated.description },
      });
    }

    return updated;
  });
}

export async function deleteBoqItem(id: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.boqItem.findUnique({
      where: { id },
      include: { children: true, mbEntries: true, wbsNodes: true, workOrderLines: true },
    });
    if (!existing) throw new ServiceError("BOQ item not found", 404);

    // Cannot delete if it has MB entries or work order lines (it's in use)
    if (existing.mbEntries.length > 0) {
      throw new ServiceError("Cannot delete BOQ item with measurement book entries", 409);
    }
    if (existing.workOrderLines.length > 0) {
      throw new ServiceError("Cannot delete BOQ item linked to a subcontractor work order", 409);
    }
    // Cascade delete children
    if (existing.children.length > 0) {
      for (const child of existing.children) {
        await deleteBoqItem(child.id, userId);
      }
    }

    await tx.boqItem.delete({ where: { id } });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "BOQ_ITEM_DELETE",
        entityType: "BoqItem",
        entityId: id,
        before: { serialNo: existing.serialNo, description: existing.description },
      });
    }

    return { ok: true };
  });
}

/** Get the full BOQ tree for a project (hierarchical, with computed totals). */
export async function getBoqTree(projectId: string) {
  const items = await prisma.boqItem.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { serialNo: "asc" }],
    include: {
      material: { select: { id: true, code: true, name: true, unit: true } },
      _count: { select: { mbEntries: true, wbsNodes: true } },
    },
  });

  type TreeNode = (typeof items)[number] & { children: TreeNode[] };

  // Build tree
  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }
  for (const item of items) {
    const node = map.get(item.id)!;
    if (item.parentId) {
      const parent = map.get(item.parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  // Compute section totals (sum of all descendant line items)
  function computeTotals(node: TreeNode): Decimal {
    if (node.type === "LINE_ITEM") {
      return node.estimatedAmount ? new Decimal(node.estimatedAmount) : new Decimal(0);
    }
    let sum = new Decimal(0);
    for (const child of node.children) {
      sum = sum.plus(computeTotals(child));
    }
    return sum;
  }

  const totalEstimatedAmount = roots.reduce(
    (sum, r) => sum.plus(computeTotals(r)),
    new Decimal(0),
  );

  return { tree: roots, totalEstimatedAmount };
}

// ── WBS (Work Breakdown Structure) ─────────────────────────

export interface CreateWbsNodeInput {
  projectId: string;
  phaseId?: string;
  parentId?: string;
  boqItemId?: string;
  type?: "PROJECT_NODE" | "PHASE_NODE" | "ACTIVITY" | "SUB_ACTIVITY" | "MILESTONE";
  code: string;
  name: string;
  description?: string;
  plannedStart?: Date;
  plannedEnd?: Date;
  sortOrder?: number;
  userId?: string;
}

export async function createWbsNode(input: CreateWbsNodeInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) throw new ServiceError("Project not found or deleted", 404);

    if (input.parentId) {
      const parent = await tx.wbsNode.findFirst({
        where: { id: input.parentId, projectId: input.projectId },
      });
      if (!parent) throw new ServiceError("Parent WBS node not found", 404);
    }

    if (input.boqItemId) {
      const boq = await tx.boqItem.findFirst({
        where: { id: input.boqItemId, projectId: input.projectId, type: "LINE_ITEM" },
      });
      if (!boq) throw new ServiceError("BOQ line item not found (must be a LINE_ITEM)", 404);
    }

    const node = await tx.wbsNode.create({
      data: {
        projectId: input.projectId,
        phaseId: input.phaseId ?? null,
        parentId: input.parentId ?? null,
        boqItemId: input.boqItemId ?? null,
        type: input.type ?? "ACTIVITY",
        code: input.code,
        name: input.name,
        description: input.description ?? null,
        plannedStart: input.plannedStart ?? null,
        plannedEnd: input.plannedEnd ?? null,
        sortOrder: input.sortOrder ?? 0,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "WBS_NODE_CREATE",
        entityType: "WbsNode",
        entityId: node.id,
        after: { code: node.code, name: node.name, type: node.type },
      });
    }

    return node;
  });
}

export async function updateWbsNode(
  id: string,
  patch: Partial<CreateWbsNodeInput> & {
    actualStart?: Date;
    actualEnd?: Date;
    progressPct?: Decimal | number | string;
    isCritical?: boolean;
    totalFloat?: number;
    userId?: string;
  },
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.wbsNode.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("WBS node not found", 404);

    const data: Prisma.WbsNodeUpdateInput = {};
    if (patch.name !== undefined) data.name = patch.name;
    if (patch.description !== undefined) data.description = patch.description ?? null;
    if (patch.plannedStart !== undefined) data.plannedStart = patch.plannedStart ?? null;
    if (patch.plannedEnd !== undefined) data.plannedEnd = patch.plannedEnd ?? null;
    if (patch.actualStart !== undefined) data.actualStart = patch.actualStart ?? null;
    if (patch.actualEnd !== undefined) data.actualEnd = patch.actualEnd ?? null;
    if (patch.progressPct !== undefined) data.progressPct = new Decimal(patch.progressPct).toString();
    if (patch.isCritical !== undefined) data.isCritical = patch.isCritical;
    if (patch.totalFloat !== undefined) data.totalFloat = patch.totalFloat;
    if (patch.sortOrder !== undefined) data.sortOrder = patch.sortOrder;
    if (patch.boqItemId !== undefined) data.boqItem = patch.boqItemId ? { connect: { id: patch.boqItemId } } : { disconnect: true };

    const updated = await tx.wbsNode.update({ where: { id }, data });

    if (patch.userId) {
      await logAction(tx, {
        userId: patch.userId,
        action: "WBS_NODE_UPDATE",
        entityType: "WbsNode",
        entityId: id,
        after: { code: updated.code, name: updated.name, progressPct: updated.progressPct.toString() },
      });
    }

    return updated;
  });
}

export async function deleteWbsNode(id: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.wbsNode.findUnique({
      where: { id },
      include: { children: true, mbEntries: true, dependencies: true, blocks: true },
    });
    if (!existing) throw new ServiceError("WBS node not found", 404);

    if (existing.mbEntries.length > 0) {
      throw new ServiceError("Cannot delete WBS node with measurement book entries", 409);
    }

    // Delete dependencies
    await tx.wbsDependency.deleteMany({
      where: { OR: [{ predecessorId: id }, { successorId: id }] },
    });

    // Cascade delete children
    for (const child of existing.children) {
      await deleteWbsNode(child.id, userId);
    }

    await tx.wbsNode.delete({ where: { id } });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "WBS_NODE_DELETE",
        entityType: "WbsNode",
        entityId: id,
        before: { code: existing.code, name: existing.name },
      });
    }

    return { ok: true };
  });
}

export async function addWbsDependency(
  predecessorId: string,
  successorId: string,
  type: "FS" | "SS" | "FF" | "SF" = "FS",
  lagDays = 0,
  userId?: string,
) {
  if (predecessorId === successorId) {
    throw new ServiceError("A node cannot depend on itself", 400);
  }
  return prisma.$transaction(async (tx) => {
    // Check for cycles (simple check: does the predecessor already depend on the successor?)
    const reverse = await tx.wbsDependency.findFirst({
      where: { predecessorId: successorId, successorId: predecessorId },
    });
    if (reverse) throw new ServiceError("Adding this dependency would create a cycle", 400);

    const dep = await tx.wbsDependency.create({
      data: { predecessorId, successorId, type, lagDays },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "WBS_DEPENDENCY_ADD",
        entityType: "WbsDependency",
        entityId: dep.id,
        after: { predecessorId, successorId, type, lagDays },
      });
    }

    return dep;
  });
}

export async function removeWbsDependency(dependencyId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const dep = await tx.wbsDependency.findUnique({ where: { id: dependencyId } });
    if (!dep) throw new ServiceError("Dependency not found", 404);

    await tx.wbsDependency.delete({ where: { id: dependencyId } });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "WBS_DEPENDENCY_REMOVE",
        entityType: "WbsDependency",
        entityId: dependencyId,
        before: { predecessorId: dep.predecessorId, successorId: dep.successorId },
      });
    }

    return { ok: true };
  });
}

/** Get the full WBS tree for a project. */
export async function getWbsTree(projectId: string) {
  const nodes = await prisma.wbsNode.findMany({
    where: { projectId },
    orderBy: [{ sortOrder: "asc" }, { code: "asc" }],
    include: {
      boqItem: { select: { id: true, serialNo: true, description: true, estimatedAmount: true } },
      _count: { select: { mbEntries: true, children: true } },
    },
  });

  type TreeNode = (typeof nodes)[number] & { children: TreeNode[] };

  const map = new Map<string, TreeNode>();
  const roots: TreeNode[] = [];

  for (const node of nodes) {
    map.set(node.id, { ...node, children: [] });
  }
  for (const node of nodes) {
    const n = map.get(node.id)!;
    if (node.parentId) {
      const parent = map.get(node.parentId);
      if (parent) parent.children.push(n);
      else roots.push(n);
    } else {
      roots.push(n);
    }
  }

  return roots;
}

// ── Measurement Book (MB) ──────────────────────────────────

async function generateMbNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `MB-${ymd}-`;
  const existing = await tx.measurementBookEntry.findMany({
    where: { mbNumber: { startsWith: prefix } },
    select: { mbNumber: true },
  });
  const maxSeq = existing.reduce((max, e) => {
    const n = parseInt(e.mbNumber.slice(prefix.length) ?? "0", 10);
    return n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

export interface CreateMbEntryInput {
  projectId: string;
  phaseId?: string;
  boqItemId: string;
  wbsNodeId?: string;
  measuredQty: Decimal | number | string;
  description: string;
  locationRef?: string;
  measureDate?: Date;
  measuredById?: string;
}

export async function createMbEntry(input: CreateMbEntryInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
    });
    if (!project) throw new ServiceError("Project not found or deleted", 404);

    const boqItem = await tx.boqItem.findFirst({
      where: { id: input.boqItemId, projectId: input.projectId, type: "LINE_ITEM" },
    });
    if (!boqItem) throw new ServiceError("BOQ line item not found (must be a LINE_ITEM)", 404);

    if (input.wbsNodeId) {
      const wbs = await tx.wbsNode.findFirst({
        where: { id: input.wbsNodeId, projectId: input.projectId },
      });
      if (!wbs) throw new ServiceError("WBS node not found in this project", 404);
    }

    const qty = new Decimal(input.measuredQty);
    if (!qty.gt(0)) throw new ServiceError("Measured quantity must be > 0", 400);

    // Compute cumulative qty (sum of all previous APPROVED/VERIFIED entries for this BOQ item)
    const prevEntries = await tx.measurementBookEntry.findMany({
      where: {
        boqItemId: input.boqItemId,
        status: { in: ["VERIFIED", "APPROVED"] },
      },
      select: { measuredQty: true },
    });
    const prevQty = prevEntries.reduce(
      (sum, e) => sum.plus(new Decimal(e.measuredQty)),
      new Decimal(0),
    );
    const cumulativeQty = prevQty.plus(qty);

    const mbNumber = await generateMbNumber(tx);

    const entry = await tx.measurementBookEntry.create({
      data: {
        projectId: input.projectId,
        phaseId: input.phaseId ?? null,
        boqItemId: input.boqItemId,
        wbsNodeId: input.wbsNodeId ?? null,
        mbNumber,
        measuredQty: qty.toString(),
        cumulativeQty: cumulativeQty.toString(),
        description: input.description,
        locationRef: input.locationRef ?? null,
        measureDate: input.measureDate ?? new Date(),
        status: "DRAFT",
        measuredById: input.measuredById ?? null,
      },
    });

    if (input.measuredById) {
      await logAction(tx, {
        userId: input.measuredById,
        action: "MB_ENTRY_CREATE",
        entityType: "MeasurementBookEntry",
        entityId: entry.id,
        after: { mbNumber, boqItemId: input.boqItemId, measuredQty: qty.toString(), cumulativeQty: cumulativeQty.toString() },
      });
    }

    return entry;
  });
}

export async function verifyMbEntry(id: string, verifiedById: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.measurementBookEntry.findUnique({ where: { id } });
    if (!entry) throw new ServiceError("MB entry not found", 404);
    if (entry.status !== "DRAFT") {
      throw new ServiceError(`Cannot verify entry in status ${entry.status}`, 400);
    }

    const updated = await tx.measurementBookEntry.update({
      where: { id },
      data: { status: "VERIFIED", verifiedById, verifiedAt: new Date() },
    });

    await logAction(tx, {
      userId: verifiedById,
      action: "MB_ENTRY_VERIFY",
      entityType: "MeasurementBookEntry",
      entityId: id,
      after: { mbNumber: entry.mbNumber, status: "VERIFIED" },
    });

    return updated;
  });
}

export async function approveMbEntry(id: string, approvedById: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.measurementBookEntry.findUnique({ where: { id } });
    if (!entry) throw new ServiceError("MB entry not found", 404);
    if (entry.status !== "VERIFIED") {
      throw new ServiceError(`Cannot approve entry in status ${entry.status} (must be VERIFIED first)`, 400);
    }

    const updated = await tx.measurementBookEntry.update({
      where: { id },
      data: { status: "APPROVED", approvedById, approvedAt: new Date() },
    });

    // Auto-update WBS node progress if linked
    if (entry.wbsNodeId && entry.boqItemId) {
      const boq = await tx.boqItem.findUnique({ where: { id: entry.boqItemId } });
      if (boq?.estimatedQty) {
        const approvedEntries = await tx.measurementBookEntry.aggregate({
          where: { boqItemId: entry.boqItemId, status: "APPROVED" },
          _sum: { measuredQty: true },
        });
        const totalMeasured = new Decimal(approvedEntries._sum.measuredQty ?? 0);
        const progressPct = totalMeasured
          .div(new Decimal(boq.estimatedQty))
          .times(100)
          .toDecimalPlaces(2);
        await tx.wbsNode.update({
          where: { id: entry.wbsNodeId },
          data: { progressPct: progressPct.toString() },
        });
      }
    }

    await logAction(tx, {
      userId: approvedById,
      action: "MB_ENTRY_APPROVE",
      entityType: "MeasurementBookEntry",
      entityId: id,
      after: { mbNumber: entry.mbNumber, status: "APPROVED" },
    });

    return updated;
  });
}

export async function rejectMbEntry(id: string, rejectReason: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const entry = await tx.measurementBookEntry.findUnique({ where: { id } });
    if (!entry) throw new ServiceError("MB entry not found", 404);
    if (entry.status === "APPROVED") {
      throw new ServiceError("Cannot reject an already-approved entry", 400);
    }

    const updated = await tx.measurementBookEntry.update({
      where: { id },
      data: { status: "REJECTED", rejectReason },
    });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "MB_ENTRY_REJECT",
        entityType: "MeasurementBookEntry",
        entityId: id,
        after: { mbNumber: entry.mbNumber, status: "REJECTED", rejectReason },
      });
    }

    return updated;
  });
}

// ── Material Take-Off (MTO) ────────────────────────────────

/**
 * Generate a material take-off from the BOQ — for each LINE_ITEM with a
 * linked material, compute the total required quantity and check against
 * current stock + open requisitions to identify the procurement gap.
 *
 * This is the bridge from BOQ (planning) to procurement (execution).
 */
export async function generateMaterialTakeOff(projectId: string) {
  const lineItems = await prisma.boqItem.findMany({
    where: { projectId, type: "LINE_ITEM", materialId: { not: null } },
    include: {
      material: { select: { id: true, code: true, name: true, unit: true } },
      mbEntries: {
        where: { status: "APPROVED" },
        select: { measuredQty: true },
      },
    },
  });

  // Group by material (multiple BOQ items may reference the same material)
  const byMaterial = new Map<
    string,
    {
      material: { id: string; code: string; name: string; unit: string };
      boqQty: Decimal;
      consumedQty: Decimal; // from approved MB entries
      boqItems: Array<{ id: string; serialNo: string; description: string; qty: Decimal }>;
    }
  >();

  for (const item of lineItems) {
    if (!item.materialId || !item.material || !item.estimatedQty) continue;
    const materialId = item.materialId;
    const existing = byMaterial.get(materialId);
    const itemQty = new Decimal(item.estimatedQty);
    const consumed = item.mbEntries.reduce(
      (sum, e) => sum.plus(new Decimal(e.measuredQty)),
      new Decimal(0),
    );

    if (existing) {
      existing.boqQty = existing.boqQty.plus(itemQty);
      existing.consumedQty = existing.consumedQty.plus(consumed);
      existing.boqItems.push({
        id: item.id,
        serialNo: item.serialNo,
        description: item.description,
        qty: itemQty,
      });
    } else {
      byMaterial.set(materialId, {
        material: item.material,
        boqQty: itemQty,
        consumedQty: consumed,
        boqItems: [
          { id: item.id, serialNo: item.serialNo, description: item.description, qty: itemQty },
        ],
      });
    }
  }

  // For each material, check current stock + open requisitions
  const result: Array<{
    materialId: string;
    materialCode: string;
    materialName: string;
    unit: string;
    boqQty: Decimal;
    consumedQty: Decimal;
    remainingQty: Decimal; // boqQty - consumedQty
    currentStock: Decimal;
    openRequisitionQty: Decimal;
    procurementGap: Decimal; // remainingQty - currentStock - openRequisitionQty
  }> = [];

  // Batch-fetch stock + open requisitions for all materials in 2 queries
  const allMaterialIds = [...byMaterial.keys()];
  const [stockAggs, reqAggs] = await Promise.all([
    prisma.stockLocationItem.groupBy({
      by: ["materialId"],
      where: { materialId: { in: allMaterialIds }, location: { deletedAt: null } },
      _sum: { qty: true },
    }),
    prisma.materialRequisitionLine.groupBy({
      by: ["materialId"],
      where: {
        materialId: { in: allMaterialIds },
        requisition: { projectId, status: { in: ["DRAFT", "SUBMITTED", "APPROVED"] } },
      },
      _sum: { qtyRequested: true },
    }),
  ]);
  const stockMap = new Map(stockAggs.map((s) => [s.materialId, new Decimal(s._sum.qty ?? 0)]));
  const reqMap = new Map(reqAggs.map((r) => [r.materialId, new Decimal(r._sum.qtyRequested ?? 0)]));

  for (const [materialId, data] of byMaterial) {
    const currentStock = stockMap.get(materialId) ?? new Decimal(0);
    const openRequisitionQty = reqMap.get(materialId) ?? new Decimal(0);

    const remainingQty = data.boqQty.minus(data.consumedQty);
    const procurementGap = remainingQty.minus(currentStock).minus(openRequisitionQty);

    result.push({
      materialId,
      materialCode: data.material.code,
      materialName: data.material.name,
      unit: data.material.unit,
      boqQty: data.boqQty,
      consumedQty: data.consumedQty,
      remainingQty,
      currentStock,
      openRequisitionQty,
      procurementGap: procurementGap.lt(0) ? new Decimal(0) : procurementGap,
    });
  }

  return result.sort((a, b) => b.procurementGap.minus(a.procurementGap).toNumber());
}

// ── EVM (Earned Value Management) ──────────────────────────

/**
 * Compute Earned Value Management metrics for a project.
 *
 * - PV (Planned Value) = Σ BOQ line items × rate (the budget)
 * - EV (Earned Value) = Σ approved MB entries × BOQ rate (work done at budget rate)
 * - AC (Actual Cost) = actual project cost (materials + labour + land - scrap recovery)
 *
 * Derived:
 * - CV (Cost Variance) = EV - AC
 * - SV (Schedule Variance) = EV - PV
 * - CPI (Cost Performance Index) = EV / AC
 * - SPI (Schedule Performance Index) = EV / PV
 * - EAC (Estimate at Completion) = BAC / CPI (if CPI is stable)
 * - VAC (Variance at Completion) = BAC - EAC
 */
export async function getEvmMetrics(projectId: string) {
  // PV = Σ BOQ line items estimatedAmount
  const boqItems = await prisma.boqItem.findMany({
    where: { projectId, type: "LINE_ITEM" },
    select: { estimatedAmount: true, estimatedQty: true, rate: true, id: true },
  });
  const pv = boqItems.reduce(
    (sum, item) => sum.plus(item.estimatedAmount ? new Decimal(item.estimatedAmount) : new Decimal(0)),
    new Decimal(0),
  );

  // EV = Σ approved MB entries × BOQ rate
  const mbEntries = await prisma.measurementBookEntry.findMany({
    where: { projectId, status: "APPROVED" },
    include: { boqItem: { select: { rate: true } } },
  });
  const ev = mbEntries.reduce((sum, entry) => {
    const rate = entry.boqItem.rate ? new Decimal(entry.boqItem.rate) : new Decimal(0);
    return sum.plus(new Decimal(entry.measuredQty).times(rate));
  }, new Decimal(0));

  // AC = actual project cost (from valuation service)
  // We call projectTotalCost which already includes materials + labour + land - scrap recovery
  const { projectTotalCost } = await import("./valuation");
  const costBreakdown = await projectTotalCost(projectId);
  const ac = costBreakdown.total;

  // Derived metrics
  const cv = ev.minus(ac);
  const sv = ev.minus(pv);
  const cpi = ac.gt(0) ? ev.div(ac) : new Decimal(1);
  const spi = pv.gt(0) ? ev.div(pv) : new Decimal(1);
  const eac = cpi.gt(0) ? pv.div(cpi) : pv; // BAC / CPI
  const vac = pv.minus(eac);

  // % complete = EV / PV
  const pctComplete = pv.gt(0) ? ev.div(pv).times(100).toDecimalPlaces(2) : new Decimal(0);

  return {
    pv: pv.toDecimalPlaces(2),
    ev: ev.toDecimalPlaces(2),
    ac: ac.toDecimalPlaces(2),
    cv: cv.toDecimalPlaces(2),
    sv: sv.toDecimalPlaces(2),
    cpi: cpi.toDecimalPlaces(4),
    spi: spi.toDecimalPlaces(4),
    eac: eac.toDecimalPlaces(2),
    vac: vac.toDecimalPlaces(2),
    pctComplete,
  };
}
