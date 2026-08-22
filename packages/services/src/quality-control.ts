import { prisma, type Prisma } from "@nirman/db";
import Decimal from "decimal.js";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Quality Control Service — Non-Conformance Reports (NCR) and
 * Corrective And Preventive Actions (CAPA).
 *
 * NCR Lifecycle:
 *   OPEN → UNDER_REVIEW → CAPA_REQUIRED → (CAPA created) → CLOSED
 *                        → ACCEPTED → CLOSED  (minor, accepted with concession)
 *                        → REJECTED → CLOSED  (rework required, then re-inspected)
 *   OPEN → CANCELLED
 *
 * CAPA Lifecycle:
 *   DRAFT → IN_PROGRESS → VERIFICATION → VERIFIED → CLOSED
 *                                       → REJECTED → IN_PROGRESS (rework)
 *
 * An NCR can have at most one CAPA (1:1, enforced by @unique on ncrId).
 */

// ── Types ──────────────────────────────────────────────────

export type NcrSeverity = "CRITICAL" | "MAJOR" | "MINOR" | "OBSERVATION";
export type NcrStatus = "OPEN" | "UNDER_REVIEW" | "CAPA_REQUIRED" | "ACCEPTED" | "REJECTED" | "CLOSED" | "CANCELLED";
export type NcrCategory = "MATERIAL" | "WORKMANSHIP" | "DESIGN" | "DOCUMENT" | "PROCESS" | "SAFETY" | "OTHER";
export type CapaStatus = "DRAFT" | "IN_PROGRESS" | "VERIFICATION" | "VERIFIED" | "CLOSED" | "REJECTED";

export interface CreateNcrInput {
  projectId: string;
  title: string;
  description: string;
  category?: NcrCategory;
  severity?: NcrSeverity;
  location?: string | null;
  wbsNodeId?: string | null;
  boqItemId?: string | null;
  responsibleParty?: string | null;
  subcontractorId?: string | null;
  attachments?: string[];
  userId?: string;
}

export interface UpdateNcrInput {
  title?: string;
  description?: string;
  category?: NcrCategory;
  severity?: NcrSeverity;
  location?: string | null;
  wbsNodeId?: string | null;
  boqItemId?: string | null;
  responsibleParty?: string | null;
  subcontractorId?: string | null;
  attachments?: string[];
}

export interface ReviewNcrInput {
  reviewNotes: string;
  outcome: "CAPA_REQUIRED" | "ACCEPTED" | "REJECTED";
  userId: string;
}

export interface CreateCapaInput {
  ncrId: string;
  rootCause: string;
  correctiveAction: string;
  correctiveDueDate?: Date | null;
  preventiveAction: string;
  preventiveDueDate?: Date | null;
  userId?: string;
}

export interface UpdateCapaInput {
  rootCause?: string;
  correctiveAction?: string;
  correctiveDueDate?: Date | null;
  preventiveAction?: string;
  preventiveDueDate?: Date | null;
}

// ── Number generation ──────────────────────────────────────

async function generateNcrNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `NCR-${ymd}-`;
  const existing = await tx.nonConformanceReport.findMany({
    where: { companyId, ncrNumber: { startsWith: prefix } },
    select: { ncrNumber: true },
  });
  const maxSeq = existing.reduce((max, e) => {
    const n = parseInt(e.ncrNumber.slice(prefix.length) ?? "0", 10);
    return n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

async function generateCapaNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `CAPA-${ymd}-`;
  const existing = await tx.capa.findMany({
    where: { companyId, capaNumber: { startsWith: prefix } },
    select: { capaNumber: true },
  });
  const maxSeq = existing.reduce((max, e) => {
    const n = parseInt(e.capaNumber.slice(prefix.length) ?? "0", 10);
    return n > max ? n : max;
  }, 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

// ── NCR CRUD ───────────────────────────────────────────────

export async function createNcr(input: CreateNcrInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({
      where: { id: input.projectId, deletedAt: null },
      include: { company: { select: { id: true } } },
    });
    if (!project) throw new ServiceError("Project not found", 404);

    if (!input.title?.trim() || !input.description?.trim()) {
      throw new ServiceError("Title and description are required", 400);
    }

    const ncrNumber = await generateNcrNumber(tx, project.company.id);

    const ncr = await tx.nonConformanceReport.create({
      data: {
        companyId: project.company.id,
        projectId: input.projectId,
        ncrNumber,
        title: input.title.trim(),
        description: input.description.trim(),
        category: input.category ?? "WORKMANSHIP",
        severity: input.severity ?? "MINOR",
        status: "OPEN",
        location: input.location ?? null,
        wbsNodeId: input.wbsNodeId ?? null,
        boqItemId: input.boqItemId ?? null,
        responsibleParty: input.responsibleParty ?? null,
        subcontractorId: input.subcontractorId ?? null,
        attachments: input.attachments ?? [],
        raisedById: input.userId ?? null,
        raisedAt: new Date(),
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "NCR_CREATE",
        entityType: "NonConformanceReport",
        entityId: ncr.id,
        after: { ncrNumber, projectId: input.projectId, severity: ncr.severity },
      });
    }

    return ncr;
  });
}

export async function getNcrs(projectId?: string, status?: NcrStatus, severity?: NcrSeverity) {
  const where: Prisma.NonConformanceReportWhereInput = {};
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  if (severity) where.severity = severity;
  return prisma.nonConformanceReport.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      subcontractor: { select: { id: true, name: true, trade: true } },
    },
    take: 100,
  });
}

export async function getNcr(id: string) {
  return prisma.nonConformanceReport.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      wbsNode: { select: { id: true, code: true, name: true } },
      boqItem: { select: { id: true, serialNo: true, description: true } },
      subcontractor: { select: { id: true, name: true, trade: true } },
      raisedBy: { select: { id: true, name: true } },
      reviewedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
      capa: true,
    },
  });
}

export async function updateNcr(id: string, input: UpdateNcrInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.nonConformanceReport.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("NCR not found", 404);
    if (existing.status !== "OPEN") {
      throw new ServiceError(`Cannot edit NCR in ${existing.status} status`, 400);
    }

    const data: Prisma.NonConformanceReportUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.category !== undefined) data.category = input.category;
    if (input.severity !== undefined) data.severity = input.severity;
    if (input.location !== undefined) data.location = input.location;
    if (input.wbsNodeId !== undefined) data.wbsNode = input.wbsNodeId ? { connect: { id: input.wbsNodeId } } : { disconnect: true };
    if (input.boqItemId !== undefined) data.boqItem = input.boqItemId ? { connect: { id: input.boqItemId } } : { disconnect: true };
    if (input.responsibleParty !== undefined) data.responsibleParty = input.responsibleParty;
    if (input.subcontractorId !== undefined) data.subcontractor = input.subcontractorId ? { connect: { id: input.subcontractorId } } : { disconnect: true };
    if (input.attachments !== undefined) data.attachments = input.attachments;

    return tx.nonConformanceReport.update({ where: { id }, data });
  });
}

// ── NCR Workflow ───────────────────────────────────────────

export async function reviewNcr(id: string, input: ReviewNcrInput) {
  return prisma.$transaction(async (tx) => {
    const ncr = await tx.nonConformanceReport.findUnique({ where: { id } });
    if (!ncr) throw new ServiceError("NCR not found", 404);
    if (ncr.status !== "OPEN" && ncr.status !== "UNDER_REVIEW") {
      throw new ServiceError(`Cannot review NCR in ${ncr.status} status`, 400);
    }
    if (!input.reviewNotes?.trim()) {
      throw new ServiceError("Review notes are required", 400);
    }

    const updated = await tx.nonConformanceReport.update({
      where: { id },
      data: {
        status: input.outcome,
        reviewedById: input.userId,
        reviewedAt: new Date(),
        reviewNotes: input.reviewNotes,
      },
    });

    await logAction(tx, {
      userId: input.userId,
      action: "NCR_REVIEW",
      entityType: "NonConformanceReport",
      entityId: id,
      after: { ncrNumber: ncr.ncrNumber, status: input.outcome },
    });

    return updated;
  });
}

export async function closeNcr(id: string, userId: string, closureNotes: string) {
  return prisma.$transaction(async (tx) => {
    const ncr = await tx.nonConformanceReport.findUnique({
      where: { id },
      include: { capa: true },
    });
    if (!ncr) throw new ServiceError("NCR not found", 404);

    // Can close from CAPA_REQUIRED (if CAPA is closed), ACCEPTED, or REJECTED
    const closableStatuses = ["CAPA_REQUIRED", "ACCEPTED", "REJECTED"];
    if (!closableStatuses.includes(ncr.status)) {
      throw new ServiceError(`Cannot close NCR in ${ncr.status} status`, 400);
    }
    if (!closureNotes?.trim()) {
      throw new ServiceError("Closure notes are required", 400);
    }
    // If CAPA was required, it must be closed first
    if (ncr.status === "CAPA_REQUIRED" && ncr.capa && ncr.capa.status !== "CLOSED") {
      throw new ServiceError(`CAPA must be closed before closing the NCR (current: ${ncr.capa.status})`, 400);
    }

    const updated = await tx.nonConformanceReport.update({
      where: { id },
      data: {
        status: "CLOSED",
        closedById: userId,
        closedAt: new Date(),
        closureNotes,
      },
    });

    await logAction(tx, {
      userId,
      action: "NCR_CLOSE",
      entityType: "NonConformanceReport",
      entityId: id,
      after: { ncrNumber: ncr.ncrNumber, status: "CLOSED" },
    });

    return updated;
  });
}

export async function cancelNcr(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const ncr = await tx.nonConformanceReport.findUnique({ where: { id } });
    if (!ncr) throw new ServiceError("NCR not found", 404);
    if (ncr.status !== "OPEN") {
      throw new ServiceError(`Cannot cancel NCR in ${ncr.status} status`, 400);
    }

    const updated = await tx.nonConformanceReport.update({
      where: { id },
      data: { status: "CANCELLED" },
    });

    await logAction(tx, {
      userId,
      action: "NCR_CANCEL",
      entityType: "NonConformanceReport",
      entityId: id,
      after: { ncrNumber: ncr.ncrNumber, status: "CANCELLED" },
    });

    return updated;
  });
}

export async function deleteNcr(id: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.nonConformanceReport.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("NCR not found", 404);
    if (existing.status === "CLOSED") {
      throw new ServiceError("Cannot delete a closed NCR", 400);
    }
    await tx.nonConformanceReport.delete({ where: { id } });
    if (userId) {
      await logAction(tx, {
        userId,
        action: "NCR_DELETE",
        entityType: "NonConformanceReport",
        entityId: id,
        before: { ncrNumber: existing.ncrNumber },
      });
    }
    return { ok: true };
  });
}

// ── CAPA CRUD + Workflow ───────────────────────────────────

export async function createCapa(input: CreateCapaInput) {
  return prisma.$transaction(async (tx) => {
    const ncr = await tx.nonConformanceReport.findUnique({
      where: { id: input.ncrId },
      include: { project: { select: { companyId: true } } },
    });
    if (!ncr) throw new ServiceError("NCR not found", 404);
    if (ncr.status !== "CAPA_REQUIRED") {
      throw new ServiceError(`CAPA can only be created for NCR in CAPA_REQUIRED status (current: ${ncr.status})`, 400);
    }

    // Check no existing CAPA
    const existing = await tx.capa.findUnique({ where: { ncrId: input.ncrId } });
    if (existing) throw new ServiceError("CAPA already exists for this NCR", 409);

    if (!input.rootCause?.trim() || !input.correctiveAction?.trim() || !input.preventiveAction?.trim()) {
      throw new ServiceError("Root cause, corrective action, and preventive action are all required", 400);
    }

    const capaNumber = await generateCapaNumber(tx, ncr.project.companyId);

    const capa = await tx.capa.create({
      data: {
        ncrId: input.ncrId,
        companyId: ncr.project.companyId,
        projectId: ncr.projectId,
        capaNumber,
        status: "DRAFT",
        rootCause: input.rootCause.trim(),
        correctiveAction: input.correctiveAction.trim(),
        correctiveDueDate: input.correctiveDueDate ?? null,
        preventiveAction: input.preventiveAction.trim(),
        preventiveDueDate: input.preventiveDueDate ?? null,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "CAPA_CREATE",
        entityType: "Capa",
        entityId: capa.id,
        after: { capaNumber, ncrId: input.ncrId },
      });
    }

    return capa;
  });
}

export async function getCapa(ncrId: string) {
  return prisma.capa.findUnique({
    where: { ncrId },
    include: {
      ncr: { select: { id: true, ncrNumber: true, title: true, severity: true } },
      correctiveDoneBy: { select: { id: true, name: true } },
      preventiveDoneBy: { select: { id: true, name: true } },
      verifiedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
  });
}

export async function updateCapa(id: string, input: UpdateCapaInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.capa.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("CAPA not found", 404);
    if (existing.status !== "DRAFT") {
      throw new ServiceError(`Cannot edit CAPA in ${existing.status} status`, 400);
    }

    const data: Prisma.CapaUpdateInput = {};
    if (input.rootCause !== undefined) data.rootCause = input.rootCause;
    if (input.correctiveAction !== undefined) data.correctiveAction = input.correctiveAction;
    if (input.correctiveDueDate !== undefined) data.correctiveDueDate = input.correctiveDueDate;
    if (input.preventiveAction !== undefined) data.preventiveAction = input.preventiveAction;
    if (input.preventiveDueDate !== undefined) data.preventiveDueDate = input.preventiveDueDate;

    return tx.capa.update({ where: { id }, data });
  });
}

export async function startCapa(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const capa = await tx.capa.findUnique({ where: { id } });
    if (!capa) throw new ServiceError("CAPA not found", 404);
    if (capa.status !== "DRAFT" && capa.status !== "REJECTED") {
      throw new ServiceError(`Cannot start CAPA in ${capa.status} status`, 400);
    }
    const updated = await tx.capa.update({ where: { id }, data: { status: "IN_PROGRESS" } });
    await logAction(tx, { userId, action: "CAPA_START", entityType: "Capa", entityId: id, after: { capaNumber: capa.capaNumber, status: "IN_PROGRESS" } });
    return updated;
  });
}

export async function completeCorrectiveAction(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const capa = await tx.capa.findUnique({ where: { id } });
    if (!capa) throw new ServiceError("CAPA not found", 404);
    if (capa.status !== "IN_PROGRESS") {
      throw new ServiceError(`Corrective action can only be completed in IN_PROGRESS status`, 400);
    }
    const updated = await tx.capa.update({
      where: { id },
      data: { correctiveDoneAt: new Date(), correctiveDoneById: userId },
    });
    await logAction(tx, { userId, action: "CAPA_CORRECTIVE_DONE", entityType: "Capa", entityId: id });
    return updated;
  });
}

export async function completePreventiveAction(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const capa = await tx.capa.findUnique({ where: { id } });
    if (!capa) throw new ServiceError("CAPA not found", 404);
    if (capa.status !== "IN_PROGRESS") {
      throw new ServiceError(`Preventive action can only be completed in IN_PROGRESS status`, 400);
    }
    if (!capa.correctiveDoneAt) {
      throw new ServiceError("Corrective action must be completed before preventive action", 400);
    }
    const updated = await tx.capa.update({
      where: { id },
      data: { preventiveDoneAt: new Date(), preventiveDoneById: userId, status: "VERIFICATION" },
    });
    await logAction(tx, { userId, action: "CAPA_PREVENTIVE_DONE", entityType: "Capa", entityId: id, after: { status: "VERIFICATION" } });
    return updated;
  });
}

export async function verifyCapa(id: string, userId: string, verificationMethod: string, verificationNotes: string, effective: boolean) {
  return prisma.$transaction(async (tx) => {
    const capa = await tx.capa.findUnique({ where: { id } });
    if (!capa) throw new ServiceError("CAPA not found", 404);
    if (capa.status !== "VERIFICATION") {
      throw new ServiceError(`Cannot verify CAPA in ${capa.status} status`, 400);
    }
    if (!verificationMethod?.trim() || !verificationNotes?.trim()) {
      throw new ServiceError("Verification method and notes are required", 400);
    }

    const newStatus = effective ? "VERIFIED" : "REJECTED";
    const updated = await tx.capa.update({
      where: { id },
      data: {
        status: newStatus,
        verificationMethod,
        verificationNotes,
        verifiedById: userId,
        verifiedAt: new Date(),
      },
    });

    await logAction(tx, {
      userId,
      action: effective ? "CAPA_VERIFIED" : "CAPA_VERIFICATION_FAILED",
      entityType: "Capa",
      entityId: id,
      after: { status: newStatus },
    });

    return updated;
  });
}

export async function closeCapa(id: string, userId: string, closureNotes: string) {
  return prisma.$transaction(async (tx) => {
    const capa = await tx.capa.findUnique({ where: { id } });
    if (!capa) throw new ServiceError("CAPA not found", 404);
    if (capa.status !== "VERIFIED") {
      throw new ServiceError(`Cannot close CAPA in ${capa.status} status — must be VERIFIED`, 400);
    }
    if (!closureNotes?.trim()) {
      throw new ServiceError("Closure notes are required", 400);
    }

    const updated = await tx.capa.update({
      where: { id },
      data: {
        status: "CLOSED",
        closedById: userId,
        closedAt: new Date(),
        closureNotes,
      },
    });

    await logAction(tx, {
      userId,
      action: "CAPA_CLOSE",
      entityType: "Capa",
      entityId: id,
      after: { status: "CLOSED" },
    });

    return updated;
  });
}
