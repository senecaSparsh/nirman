import { prisma } from "@nirman/db";
import type { Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";
import { emitNotificationEvent, NotificationEventType } from "./notification-event-bus";

/**
 * Gate Pass Service — outbound gate pass with approval workflow.
 *
 * Whenever items physically leave a gate (warehouse or project site),
 * a gate pass is generated with item details, vehicle, driver,
 * destination. An authorized person must approve before items can
 * physically exit. Security confirms the exit.
 *
 * Workflow: DRAFT → PENDING → APPROVED → EXITED
 *                  → REJECTED     → CANCELLED
 */

/** Generate a unique gate pass number: GP-YYMMDD-NNNN */
async function generateGatePassNumber(tx: Prisma.TransactionClient): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `GP-${ymd}-`;
  const existing = await tx.gatePass.findMany({
    where: { gatePassNumber: { startsWith: prefix } },
    select: { gatePassNumber: true },
  });
  const maxSeq = existing.reduce((max, e) => {
    const n = parseInt(e.gatePassNumber?.slice(prefix.length) ?? "0", 10);
    return n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

export interface GatePassLineInput {
  materialId?: string;
  materialCode?: string;
  materialName?: string;
  unit?: string;
  qty: Decimal | number | string;
  description?: string;
}

export interface CreateGatePassInput {
  companyId: string;
  locationId: string;
  projectId?: string;
  category: "MATERIAL_ISSUE" | "STOCK_TRANSFER" | "MATERIAL_SALE" | "SUPPLIER_RETURN" | "MANUAL";
  refType?: string;
  refId?: string;
  lines: GatePassLineInput[];
  vehicleNumber?: string;
  vehicleType?: string;
  driverName?: string;
  driverPhone?: string;
  transporterName?: string;
  destination?: string;
  purpose?: string;
  notes?: string;
  createdById?: string;
  /** If true, skip DRAFT and go straight to PENDING (auto-submit). */
  autoSubmit?: boolean;
}

/**
 * Create a gate pass. Lines' material snapshots (code, name, unit) are
 * auto-filled from the Material master if a materialId is provided but
 * the snapshot fields are missing.
 */
export async function createGatePass(input: CreateGatePassInput) {
  if (input.lines.length === 0) throw new ServiceError("Gate pass must have at least one line");

  // Validate location belongs to the company
  const location = await prisma.stockLocation.findFirst({
    where: { id: input.locationId, companyId: input.companyId, deletedAt: null },
  });
  if (!location) throw new ServiceError("Location not found in this company", 404);

  // Pre-fetch material snapshots for lines that have materialId but no snapshot
  const materialIds = input.lines.filter((l) => l.materialId && !l.materialName).map((l) => l.materialId!);
  const materials = materialIds.length > 0
    ? await prisma.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, code: true, name: true, unit: true } })
    : [];
  const materialMap = new Map(materials.map((m) => [m.id, m]));

  const result = await prisma.$transaction(async (tx) => {
    const gatePassNumber = await generateGatePassNumber(tx);

    const gatePass = await tx.gatePass.create({
      data: {
        gatePassNumber,
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        locationId: input.locationId,
        status: input.autoSubmit ? "PENDING" : "DRAFT",
        category: input.category,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
        vehicleNumber: input.vehicleNumber ?? null,
        vehicleType: input.vehicleType ?? null,
        driverName: input.driverName ?? null,
        driverPhone: input.driverPhone ?? null,
        transporterName: input.transporterName ?? null,
        destination: input.destination ?? null,
        purpose: input.purpose ?? null,
        notes: input.notes ?? null,
        createdById: input.createdById ?? null,
        submittedById: input.autoSubmit ? (input.createdById ?? null) : null,
        submittedAt: input.autoSubmit ? new Date() : null,
        lines: {
          create: input.lines.map((l) => {
            const mat = l.materialId ? materialMap.get(l.materialId) : null;
            return {
              materialId: l.materialId ?? null,
              materialCode: l.materialCode ?? mat?.code ?? null,
              materialName: l.materialName ?? mat?.name ?? null,
              unit: l.unit ?? mat?.unit ?? null,
              qty: typeof l.qty === "number" || typeof l.qty === "string" ? new Decimal(l.qty) : l.qty,
              description: l.description ?? null,
            };
          }),
        },
      },
      include: { lines: true },
    });

    await logAction(tx, {
      userId: input.createdById,
      companyId: input.companyId,
      action: "GATE_PASS_CREATE",
      entityType: "GatePass",
      entityId: gatePass.id,
      after: { gatePassNumber: gatePass.gatePassNumber, status: gatePass.status, category: gatePass.category },
    });

    return gatePass;
  });

  // Emit notification if auto-submitted
  if (input.autoSubmit) {
    void emitNotificationEvent({
      eventType: NotificationEventType.GATE_PASS_SUBMITTED,
      companyId: input.companyId,
      entityType: "GatePass",
      entityId: result.id,
      variables: { gatePassNumber: result.gatePassNumber, category: input.category },
      timestamp: new Date(),
    });
  }

  return result;
}

/** Submit a DRAFT gate pass for approval → PENDING */
export async function submitGatePass(id: string, userId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const gp = await tx.gatePass.findUnique({ where: { id } });
    if (!gp) throw new ServiceError("Gate pass not found", 404);
    if (gp.status !== "DRAFT") throw new ServiceError(`Cannot submit gate pass in status ${gp.status}`);

    const updated = await tx.gatePass.update({
      where: { id },
      data: { status: "PENDING", submittedById: userId, submittedAt: new Date() },
    });

    await logAction(tx, {
      userId,
      companyId: gp.companyId,
      action: "GATE_PASS_SUBMIT",
      entityType: "GatePass",
      entityId: id,
      before: { status: gp.status },
      after: { status: "PENDING" },
    });

    return { updated, companyId: gp.companyId };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.GATE_PASS_SUBMITTED,
    companyId: result.companyId,
    entityType: "GatePass",
    entityId: id,
    variables: { gatePassNumber: result.updated.gatePassNumber },
    timestamp: new Date(),
  });

  return result.updated;
}

/** Approve a PENDING gate pass → APPROVED */
export async function approveGatePass(id: string, approverId: string, notes?: string) {
  const result = await prisma.$transaction(async (tx) => {
    const gp = await tx.gatePass.findUnique({ where: { id } });
    if (!gp) throw new ServiceError("Gate pass not found", 404);
    if (gp.status !== "PENDING") throw new ServiceError(`Cannot approve gate pass in status ${gp.status}`);
    // Prevent self-approval
    if (gp.createdById && gp.createdById === approverId) {
      throw new ServiceError("Cannot approve your own gate pass");
    }

    const updated = await tx.gatePass.update({
      where: { id },
      data: { status: "APPROVED", approvedById: approverId, approvedAt: new Date(), approvalNotes: notes ?? null },
    });

    await logAction(tx, {
      userId: approverId,
      companyId: gp.companyId,
      action: "GATE_PASS_APPROVE",
      entityType: "GatePass",
      entityId: id,
      before: { status: gp.status },
      after: { status: "APPROVED" },
    });

    return { updated, companyId: gp.companyId };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.GATE_PASS_APPROVED,
    companyId: result.companyId,
    entityType: "GatePass",
    entityId: id,
    variables: { gatePassNumber: result.updated.gatePassNumber },
    timestamp: new Date(),
  });

  // Auto-execute the linked source transaction (if it's a MaterialIssue or MaterialSale in PENDING state).
  // Stock Transfer and Supplier Return don't need auto-execution — their dispatch/complete
  // functions call assertGatePassApproved() which will now pass.
  // Uses lazy imports to avoid circular dependency (issue.ts and material-sale.ts import gate-pass.ts).
  void (async () => {
    try {
      if (result.updated.refType === "MaterialIssue" && result.updated.refId) {
        const { executeMaterialIssue } = await import("./issue");
        await executeMaterialIssue(result.updated.refId, approverId);
      } else if (result.updated.refType === "MaterialSale" && result.updated.refId) {
        const { executeMaterialSale } = await import("./material-sale");
        await executeMaterialSale(result.updated.refId, approverId);
      }
    } catch (err) {
      // Best-effort — the gate pass is approved even if auto-execution fails.
      // The user can manually execute from the gate pass detail dialog.
      console.error(`[gate-pass] Auto-execution failed for ${result.updated.refType} ${result.updated.refId}:`, err);
    }
  })();

  return result.updated;
}

/** Reject a PENDING gate pass → REJECTED. Also cancels linked PENDING issue/sale. */
export async function rejectGatePass(id: string, rejecterId: string, reason: string) {
  const result = await prisma.$transaction(async (tx) => {
    const gp = await tx.gatePass.findUnique({ where: { id } });
    if (!gp) throw new ServiceError("Gate pass not found", 404);
    if (gp.status !== "PENDING") throw new ServiceError(`Cannot reject gate pass in status ${gp.status}`);

    const updated = await tx.gatePass.update({
      where: { id },
      data: { status: "REJECTED", rejectedById: rejecterId, rejectedAt: new Date(), rejectionReason: reason },
    });

    // Cascade-cancel linked PENDING MaterialIssue or MaterialSale
    if (gp.refType === "MaterialIssue" && gp.refId) {
      const issue = await tx.materialIssue.findUnique({ where: { id: gp.refId } });
      if (issue && issue.status === "PENDING") {
        await tx.materialIssue.update({ where: { id: issue.id }, data: { status: "CANCELLED" } });
      }
    } else if (gp.refType === "MaterialSale" && gp.refId) {
      const sale = await tx.materialSale.findUnique({ where: { id: gp.refId } });
      if (sale && sale.status === "PENDING") {
        await tx.materialSale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });
      }
    }

    await logAction(tx, {
      userId: rejecterId,
      companyId: gp.companyId,
      action: "GATE_PASS_REJECT",
      entityType: "GatePass",
      entityId: id,
      before: { status: gp.status },
      after: { status: "REJECTED", rejectionReason: reason },
    });

    return { updated, companyId: gp.companyId };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.GATE_PASS_REJECTED,
    companyId: result.companyId,
    entityType: "GatePass",
    entityId: id,
    variables: { gatePassNumber: result.updated.gatePassNumber, reason },
    timestamp: new Date(),
  });

  return result.updated;
}

/** Resubmit a REJECTED gate pass → PENDING (fix and resubmit). Also re-opens linked CANCELLED issue/sale. */
export async function resubmitGatePass(id: string, userId: string, notes?: string) {
  const result = await prisma.$transaction(async (tx) => {
    const gp = await tx.gatePass.findUnique({ where: { id } });
    if (!gp) throw new ServiceError("Gate pass not found", 404);
    if (gp.status !== "REJECTED") throw new ServiceError(`Cannot resubmit gate pass in status ${gp.status}`);

    const updated = await tx.gatePass.update({
      where: { id },
      data: {
        status: "PENDING",
        rejectedById: null,
        rejectedAt: null,
        rejectionReason: null,
        submittedById: userId,
        submittedAt: new Date(),
        approvalNotes: notes ?? null,
      },
    });

    // Re-open linked CANCELLED MaterialIssue or MaterialSale (set back to PENDING)
    if (gp.refType === "MaterialIssue" && gp.refId) {
      const issue = await tx.materialIssue.findUnique({ where: { id: gp.refId } });
      if (issue && issue.status === "CANCELLED") {
        await tx.materialIssue.update({ where: { id: issue.id }, data: { status: "PENDING" } });
      }
    } else if (gp.refType === "MaterialSale" && gp.refId) {
      const sale = await tx.materialSale.findUnique({ where: { id: gp.refId } });
      if (sale && sale.status === "CANCELLED") {
        await tx.materialSale.update({ where: { id: sale.id }, data: { status: "PENDING" } });
      }
    }

    await logAction(tx, {
      userId,
      companyId: gp.companyId,
      action: "GATE_PASS_RESUBMIT",
      entityType: "GatePass",
      entityId: id,
      before: { status: "REJECTED" },
      after: { status: "PENDING" },
    });

    return { updated, companyId: gp.companyId };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.GATE_PASS_SUBMITTED,
    companyId: result.companyId,
    entityType: "GatePass",
    entityId: id,
    variables: { gatePassNumber: result.updated.gatePassNumber },
    timestamp: new Date(),
  });

  return result.updated;
}

export interface ConfirmExitInput {
  exitNotes?: string;
  exitPhotos?: unknown; // JSON array
}

/** Confirm physical exit of items → EXITED (security guard action) */
export async function confirmExit(id: string, securityId: string, exitDetails: ConfirmExitInput) {
  const result = await prisma.$transaction(async (tx) => {
    const gp = await tx.gatePass.findUnique({ where: { id } });
    if (!gp) throw new ServiceError("Gate pass not found", 404);
    if (gp.status !== "APPROVED") throw new ServiceError(`Cannot confirm exit for gate pass in status ${gp.status}. Items can only exit after approval.`);

    const updated = await tx.gatePass.update({
      where: { id },
      data: {
        status: "EXITED",
        exitedAt: new Date(),
        exitedById: securityId,
        exitNotes: exitDetails.exitNotes ?? null,
        exitPhotos: exitDetails.exitPhotos ?? undefined,
      },
    });

    await logAction(tx, {
      userId: securityId,
      companyId: gp.companyId,
      action: "GATE_PASS_EXIT",
      entityType: "GatePass",
      entityId: id,
      before: { status: gp.status },
      after: { status: "EXITED" },
    });

    return { updated, companyId: gp.companyId };
  });

  void emitNotificationEvent({
    eventType: NotificationEventType.GATE_PASS_EXITED,
    companyId: result.companyId,
    entityType: "GatePass",
    entityId: id,
    variables: { gatePassNumber: result.updated.gatePassNumber },
    timestamp: new Date(),
  });

  return result.updated;
}

/** Cancel a gate pass (DRAFT or PENDING → CANCELLED). Also cancels linked PENDING issue/sale. */
export async function cancelGatePass(id: string, userId: string) {
  const result = await prisma.$transaction(async (tx) => {
    const gp = await tx.gatePass.findUnique({ where: { id } });
    if (!gp) throw new ServiceError("Gate pass not found", 404);
    if (gp.status === "APPROVED") throw new ServiceError("Cannot cancel an approved gate pass — items are cleared to leave. Contact security to confirm or reject the exit.");
    if (gp.status === "EXITED") throw new ServiceError("Cannot cancel an exited gate pass");
    if (gp.status === "CANCELLED") throw new ServiceError("Gate pass is already cancelled");
    if (gp.status === "REJECTED") throw new ServiceError("Cannot cancel a rejected gate pass");

    const updated = await tx.gatePass.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    // Cascade-cancel linked PENDING MaterialIssue or MaterialSale
    if (gp.refType === "MaterialIssue" && gp.refId) {
      const issue = await tx.materialIssue.findUnique({ where: { id: gp.refId } });
      if (issue && issue.status === "PENDING") {
        await tx.materialIssue.update({ where: { id: issue.id }, data: { status: "CANCELLED" } });
      }
    } else if (gp.refType === "MaterialSale" && gp.refId) {
      const sale = await tx.materialSale.findUnique({ where: { id: gp.refId } });
      if (sale && sale.status === "PENDING") {
        await tx.materialSale.update({ where: { id: sale.id }, data: { status: "CANCELLED" } });
      }
    }

    await logAction(tx, {
      userId,
      companyId: gp.companyId,
      action: "GATE_PASS_CANCEL",
      entityType: "GatePass",
      entityId: id,
      before: { status: gp.status },
      after: { status: "CANCELLED" },
    });

    return { updated, companyId: gp.companyId };
  });

  return result.updated;
}

/**
 * Assert that ALL gate passes linked to the given ref are APPROVED.
 * Called by Material Issue, Transfer, Sale, Supplier Return services
 * before executing stock movements. Throws if any gate pass is not approved.
 * If no gate passes exist at all, throws (gate pass required).
 */
export async function assertGatePassApproved(refType: string, refId: string): Promise<void> {
  const gatePasses = await prisma.gatePass.findMany({
    where: { refType, refId },
    select: { id: true, status: true, gatePassNumber: true },
  });
  if (gatePasses.length === 0) {
    throw new ServiceError(
      `No gate pass found for ${refType}. Items cannot leave the gate without an approved gate pass.`,
      403,
    );
  }
  const notApproved = gatePasses.filter((gp) => gp.status !== "APPROVED" && gp.status !== "EXITED");
  if (notApproved.length > 0) {
    const first = notApproved[0]!;
    throw new ServiceError(
      `Gate pass ${first.gatePassNumber} is ${first.status} — items cannot leave the gate until approved.`,
      403,
    );
  }
}

/**
 * Auto-create a gate pass from a source transaction (Material Issue,
 * Stock Transfer, Material Sale, Supplier Return). Called inside the
 * source transaction's creation flow. The gate pass is created as PENDING
 * (auto-submitted for approval). Emits a notification event after the
 * transaction commits (via a post-commit void call).
 */
export async function autoCreateGatePassFromRef(
  tx: Prisma.TransactionClient,
  params: {
    companyId: string;
    locationId: string;
    category: "MATERIAL_ISSUE" | "STOCK_TRANSFER" | "MATERIAL_SALE" | "SUPPLIER_RETURN";
    refType: string;
    refId: string;
    lines: GatePassLineInput[];
    projectId?: string;
    vehicleNumber?: string;
    vehicleType?: string;
    driverName?: string;
    driverPhone?: string;
    transporterName?: string;
    destination?: string;
    createdById?: string;
  },
) {
  const gatePassNumber = await generateGatePassNumber(tx);

  // Pre-fetch material snapshots
  const materialIds = params.lines.filter((l) => l.materialId && !l.materialName).map((l) => l.materialId!);
  const materials = materialIds.length > 0
    ? await tx.material.findMany({ where: { id: { in: materialIds } }, select: { id: true, code: true, name: true, unit: true } })
    : [];
  const materialMap = new Map(materials.map((m) => [m.id, m]));

  const gatePass = await tx.gatePass.create({
    data: {
      gatePassNumber,
      companyId: params.companyId,
      projectId: params.projectId ?? null,
      locationId: params.locationId,
      status: "PENDING", // auto-submitted for approval
      category: params.category,
      refType: params.refType,
      refId: params.refId,
      vehicleNumber: params.vehicleNumber ?? null,
      vehicleType: params.vehicleType ?? null,
      driverName: params.driverName ?? null,
      driverPhone: params.driverPhone ?? null,
      transporterName: params.transporterName ?? null,
      destination: params.destination ?? null,
      createdById: params.createdById ?? null,
      submittedById: params.createdById ?? null,
      submittedAt: new Date(),
      lines: {
        create: params.lines.map((l) => {
          const mat = l.materialId ? materialMap.get(l.materialId) : null;
          return {
            materialId: l.materialId ?? null,
            materialCode: l.materialCode ?? mat?.code ?? null,
            materialName: l.materialName ?? mat?.name ?? null,
            unit: l.unit ?? mat?.unit ?? null,
            qty: typeof l.qty === "number" || typeof l.qty === "string" ? new Decimal(l.qty) : l.qty,
            description: l.description ?? null,
          };
        }),
      },
    },
    include: { lines: true },
  });

  await logAction(tx, {
    userId: params.createdById,
    companyId: params.companyId,
    action: "GATE_PASS_CREATE",
    entityType: "GatePass",
    entityId: gatePass.id,
    after: { gatePassNumber: gatePass.gatePassNumber, status: "PENDING", category: gatePass.category, refType: params.refType, refId: params.refId },
  });

  // Emit notification (best-effort, post-commit via setImmediate)
  setImmediate(() => {
    void emitNotificationEvent({
      eventType: NotificationEventType.GATE_PASS_SUBMITTED,
      companyId: params.companyId,
      entityType: "GatePass",
      entityId: gatePass.id,
      variables: { gatePassNumber: gatePass.gatePassNumber, category: params.category },
      timestamp: new Date(),
    });
  });

  return gatePass;
}
