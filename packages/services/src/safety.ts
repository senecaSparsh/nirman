import { prisma, type Prisma } from "@nirman/db";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Safety Management Service — incidents, hazards, and inspections.
 *
 * Incident Lifecycle:
 *   REPORTED → UNDER_INVESTIGATION → INVESTIGATED → CLOSED
 *   REPORTED → CANCELLED
 *
 * Hazard Lifecycle:
 *   IDENTIFIED → MITIGATING → RESOLVED
 *
 * Inspection Lifecycle:
 *   SCHEDULED → IN_PROGRESS → COMPLETED (with result)
 *   SCHEDULED → CANCELLED
 */

// ── Types ──────────────────────────────────────────────────

export type IncidentType = "ACCIDENT" | "NEAR_MISS" | "INJURY" | "FATALITY" | "PROPERTY_DAMAGE" | "ENVIRONMENTAL" | "FIRE" | "STRUCTURAL" | "OTHER";
export type IncidentSeverity = "FIRST_AID" | "LOST_TIME" | "SERIOUS" | "FATAL" | "PROPERTY_ONLY";
export type IncidentStatus = "REPORTED" | "UNDER_INVESTIGATION" | "INVESTIGATED" | "CLOSED" | "CANCELLED";
export type HazardStatus = "IDENTIFIED" | "MITIGATING" | "RESOLVED";
export type HazardRiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type InspectionResult = "PASSED" | "PASSED_WITH_NOTES" | "FAILED" | "STOP_WORK";
export type SafetyInspectionStatus = "SCHEDULED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface CreateIncidentInput {
  projectId: string;
  title: string;
  description: string;
  type?: IncidentType;
  severity?: IncidentSeverity;
  incidentDate: Date;
  incidentTime?: string | null;
  location?: string | null;
  wbsNodeId?: string | null;
  peopleInvolved?: string | null;
  injuredCount?: number;
  fatalities?: number;
  propertyDamageEstimate?: number | null;
  attachments?: string[];
  userId?: string;
}

export interface UpdateIncidentInput {
  title?: string;
  description?: string;
  type?: IncidentType;
  severity?: IncidentSeverity;
  incidentDate?: Date;
  incidentTime?: string | null;
  location?: string | null;
  wbsNodeId?: string | null;
  peopleInvolved?: string | null;
  injuredCount?: number;
  fatalities?: number;
  propertyDamageEstimate?: number | null;
  attachments?: string[];
}

export interface InvestigateIncidentInput {
  rootCause: string;
  correctiveActions: string;
  userId: string;
}

export interface CreateHazardInput {
  projectId: string;
  title: string;
  description: string;
  likelihood?: number;
  severity?: number;
  location?: string | null;
  wbsNodeId?: string | null;
  mitigationPlan?: string | null;
  targetResolutionDate?: Date | null;
  attachments?: string[];
  userId?: string;
}

export interface CreateInspectionInput {
  projectId: string;
  title: string;
  scheduledDate: Date;
  inspectorName?: string | null;
  userId?: string;
}

// ── Risk level computation ─────────────────────────────────

export function computeRiskLevel(likelihood: number, severity: number): HazardRiskLevel {
  const score = likelihood * severity;
  if (score >= 20) return "CRITICAL";
  if (score >= 12) return "HIGH";
  if (score >= 6) return "MEDIUM";
  return "LOW";
}

// ── Number generation ──────────────────────────────────────

async function genIncidentNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `INC-${ymd}-`;
  const existing = await tx.safetyIncident.findMany({ where: { companyId, incidentNumber: { startsWith: prefix } }, select: { incidentNumber: true } });
  const maxSeq = existing.reduce((max, e) => Math.max(max, parseInt(e.incidentNumber.slice(prefix.length) ?? "0", 10)), 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

async function genHazardNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `HZD-${ymd}-`;
  const existing = await tx.safetyHazard.findMany({ where: { companyId, hazardNumber: { startsWith: prefix } }, select: { hazardNumber: true } });
  const maxSeq = existing.reduce((max, e) => Math.max(max, parseInt(e.hazardNumber.slice(prefix.length) ?? "0", 10)), 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

async function genInspectionNumber(tx: Prisma.TransactionClient, companyId: string): Promise<string> {
  const d = new Date();
  const ymd = `${String(d.getFullYear()).slice(2)}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const prefix = `INS-${ymd}-`;
  const existing = await tx.safetyInspection.findMany({ where: { companyId, inspectionNumber: { startsWith: prefix } }, select: { inspectionNumber: true } });
  const maxSeq = existing.reduce((max, e) => Math.max(max, parseInt(e.inspectionNumber.slice(prefix.length) ?? "0", 10)), 0);
  return `${prefix}${String(maxSeq + 1).padStart(4, "0")}`;
}

// ── Incident CRUD + Workflow ───────────────────────────────

export async function createIncident(input: CreateIncidentInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({ where: { id: input.projectId, deletedAt: null }, include: { company: { select: { id: true } } } });
    if (!project) throw new ServiceError("Project not found", 404);
    if (!input.title?.trim() || !input.description?.trim()) throw new ServiceError("Title and description are required", 400);

    const incidentNumber = await genIncidentNumber(tx, project.company.id);
    const incident = await tx.safetyIncident.create({
      data: {
        companyId: project.company.id,
        projectId: input.projectId,
        incidentNumber,
        title: input.title.trim(),
        description: input.description.trim(),
        type: input.type ?? "ACCIDENT",
        severity: input.severity ?? "FIRST_AID",
        status: "REPORTED",
        incidentDate: input.incidentDate,
        incidentTime: input.incidentTime ?? null,
        location: input.location ?? null,
        wbsNodeId: input.wbsNodeId ?? null,
        peopleInvolved: input.peopleInvolved ?? null,
        injuredCount: input.injuredCount ?? 0,
        fatalities: input.fatalities ?? 0,
        propertyDamageEstimate: input.propertyDamageEstimate ?? null,
        attachments: input.attachments ?? [],
        reportedById: input.userId ?? null,
        reportedAt: new Date(),
      },
    });

    if (input.userId) {
      await logAction(tx, { userId: input.userId, action: "SAFETY_INCIDENT_CREATE", entityType: "SafetyIncident", entityId: incident.id, after: { incidentNumber, severity: incident.severity } });
    }
    return incident;
  });
}

export async function getIncidents(projectId?: string, status?: IncidentStatus, severity?: IncidentSeverity) {
  const where: Prisma.SafetyIncidentWhereInput = {};
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  if (severity) where.severity = severity;
  return prisma.safetyIncident.findMany({ where, orderBy: { incidentDate: "desc" }, include: { project: { select: { id: true, name: true } } }, take: 100 });
}

export async function getIncident(id: string) {
  return prisma.safetyIncident.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      wbsNode: { select: { id: true, code: true, name: true } },
      reportedBy: { select: { id: true, name: true } },
      investigatedBy: { select: { id: true, name: true } },
      closedBy: { select: { id: true, name: true } },
    },
  });
}

export async function updateIncident(id: string, input: UpdateIncidentInput) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.safetyIncident.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Incident not found", 404);
    if (existing.status !== "REPORTED") throw new ServiceError(`Cannot edit incident in ${existing.status} status`, 400);

    const data: Prisma.SafetyIncidentUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.type !== undefined) data.type = input.type;
    if (input.severity !== undefined) data.severity = input.severity;
    if (input.incidentDate !== undefined) data.incidentDate = input.incidentDate;
    if (input.incidentTime !== undefined) data.incidentTime = input.incidentTime;
    if (input.location !== undefined) data.location = input.location;
    if (input.wbsNodeId !== undefined) data.wbsNode = input.wbsNodeId ? { connect: { id: input.wbsNodeId } } : { disconnect: true };
    if (input.peopleInvolved !== undefined) data.peopleInvolved = input.peopleInvolved;
    if (input.injuredCount !== undefined) data.injuredCount = input.injuredCount;
    if (input.fatalities !== undefined) data.fatalities = input.fatalities;
    if (input.propertyDamageEstimate !== undefined) data.propertyDamageEstimate = input.propertyDamageEstimate;
    if (input.attachments !== undefined) data.attachments = input.attachments;

    return tx.safetyIncident.update({ where: { id }, data });
  });
}

export async function investigateIncident(id: string, input: InvestigateIncidentInput) {
  return prisma.$transaction(async (tx) => {
    const incident = await tx.safetyIncident.findUnique({ where: { id } });
    if (!incident) throw new ServiceError("Incident not found", 404);
    if (incident.status !== "REPORTED" && incident.status !== "UNDER_INVESTIGATION") {
      throw new ServiceError(`Cannot investigate incident in ${incident.status} status`, 400);
    }
    if (!input.rootCause?.trim() || !input.correctiveActions?.trim()) {
      throw new ServiceError("Root cause and corrective actions are required", 400);
    }

    const updated = await tx.safetyIncident.update({
      where: { id },
      data: { status: "INVESTIGATED", investigatedById: input.userId, investigatedAt: new Date(), rootCause: input.rootCause, correctiveActions: input.correctiveActions },
    });

    await logAction(tx, { userId: input.userId, action: "SAFETY_INCIDENT_INVESTIGATE", entityType: "SafetyIncident", entityId: id, after: { status: "INVESTIGATED" } });
    return updated;
  });
}

export async function closeIncident(id: string, userId: string, closureNotes: string) {
  return prisma.$transaction(async (tx) => {
    const incident = await tx.safetyIncident.findUnique({ where: { id } });
    if (!incident) throw new ServiceError("Incident not found", 404);
    if (incident.status !== "INVESTIGATED") throw new ServiceError(`Cannot close incident in ${incident.status} status — must be INVESTIGATED`, 400);
    if (!closureNotes?.trim()) throw new ServiceError("Closure notes are required", 400);

    const updated = await tx.safetyIncident.update({ where: { id }, data: { status: "CLOSED", closedById: userId, closedAt: new Date(), closureNotes } });
    await logAction(tx, { userId, action: "SAFETY_INCIDENT_CLOSE", entityType: "SafetyIncident", entityId: id, after: { status: "CLOSED" } });
    return updated;
  });
}

export async function cancelIncident(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const incident = await tx.safetyIncident.findUnique({ where: { id } });
    if (!incident) throw new ServiceError("Incident not found", 404);
    if (incident.status !== "REPORTED") throw new ServiceError(`Cannot cancel incident in ${incident.status} status`, 400);
    const updated = await tx.safetyIncident.update({ where: { id }, data: { status: "CANCELLED" } });
    await logAction(tx, { userId, action: "SAFETY_INCIDENT_CANCEL", entityType: "SafetyIncident", entityId: id, after: { status: "CANCELLED" } });
    return updated;
  });
}

export async function deleteIncident(id: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.safetyIncident.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Incident not found", 404);
    if (existing.status === "CLOSED") throw new ServiceError("Cannot delete a closed incident", 400);
    await tx.safetyIncident.delete({ where: { id } });
    if (userId) await logAction(tx, { userId, action: "SAFETY_INCIDENT_DELETE", entityType: "SafetyIncident", entityId: id, before: { incidentNumber: existing.incidentNumber } });
    return { ok: true };
  });
}

// ── Hazard CRUD + Workflow ─────────────────────────────────

export async function createHazard(input: CreateHazardInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({ where: { id: input.projectId, deletedAt: null }, include: { company: { select: { id: true } } } });
    if (!project) throw new ServiceError("Project not found", 404);
    if (!input.title?.trim() || !input.description?.trim()) throw new ServiceError("Title and description are required", 400);

    const likelihood = input.likelihood ?? 2;
    const severity = input.severity ?? 2;
    const riskLevel = computeRiskLevel(likelihood, severity);
    const hazardNumber = await genHazardNumber(tx, project.company.id);

    const hazard = await tx.safetyHazard.create({
      data: {
        companyId: project.company.id,
        projectId: input.projectId,
        hazardNumber,
        title: input.title.trim(),
        description: input.description.trim(),
        status: "IDENTIFIED",
        likelihood,
        severity,
        riskLevel,
        location: input.location ?? null,
        wbsNodeId: input.wbsNodeId ?? null,
        mitigationPlan: input.mitigationPlan ?? null,
        targetResolutionDate: input.targetResolutionDate ?? null,
        attachments: input.attachments ?? [],
        identifiedById: input.userId ?? null,
        identifiedAt: new Date(),
      },
    });

    if (input.userId) {
      await logAction(tx, { userId: input.userId, action: "SAFETY_HAZARD_CREATE", entityType: "SafetyHazard", entityId: hazard.id, after: { hazardNumber, riskLevel } });
    }
    return hazard;
  });
}

export async function getHazards(projectId?: string, status?: HazardStatus, riskLevel?: HazardRiskLevel) {
  const where: Prisma.SafetyHazardWhereInput = {};
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  if (riskLevel) where.riskLevel = riskLevel;
  return prisma.safetyHazard.findMany({ where, orderBy: [{ riskLevel: "desc" }, { createdAt: "desc" }], include: { project: { select: { id: true, name: true } } }, take: 100 });
}

export async function getHazard(id: string) {
  return prisma.safetyHazard.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      wbsNode: { select: { id: true, code: true, name: true } },
      identifiedBy: { select: { id: true, name: true } },
      mitigatedBy: { select: { id: true, name: true } },
      resolvedBy: { select: { id: true, name: true } },
    },
  });
}

export async function updateHazard(id: string, input: Partial<CreateHazardInput>) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.safetyHazard.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Hazard not found", 404);
    if (existing.status === "RESOLVED") throw new ServiceError("Cannot edit a resolved hazard", 400);

    const data: Prisma.SafetyHazardUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.description !== undefined) data.description = input.description;
    if (input.location !== undefined) data.location = input.location;
    if (input.wbsNodeId !== undefined) data.wbsNode = input.wbsNodeId ? { connect: { id: input.wbsNodeId } } : { disconnect: true };
    if (input.mitigationPlan !== undefined) data.mitigationPlan = input.mitigationPlan;
    if (input.targetResolutionDate !== undefined) data.targetResolutionDate = input.targetResolutionDate;
    if (input.attachments !== undefined) data.attachments = input.attachments;
    if (input.likelihood !== undefined || input.severity !== undefined) {
      const lk = input.likelihood ?? existing.likelihood;
      const sv = input.severity ?? existing.severity;
      data.likelihood = lk;
      data.severity = sv;
      data.riskLevel = computeRiskLevel(lk, sv);
    }

    return tx.safetyHazard.update({ where: { id }, data });
  });
}

export async function startMitigation(id: string, userId: string, mitigationPlan?: string) {
  return prisma.$transaction(async (tx) => {
    const hazard = await tx.safetyHazard.findUnique({ where: { id } });
    if (!hazard) throw new ServiceError("Hazard not found", 404);
    if (hazard.status !== "IDENTIFIED") throw new ServiceError(`Cannot start mitigation in ${hazard.status} status`, 400);

    const updated = await tx.safetyHazard.update({
      where: { id },
      data: { status: "MITIGATING", mitigatedById: userId, mitigatedAt: new Date(), ...(mitigationPlan ? { mitigationPlan } : {}) },
    });
    await logAction(tx, { userId, action: "SAFETY_HAZARD_MITIGATE", entityType: "SafetyHazard", entityId: id, after: { status: "MITIGATING" } });
    return updated;
  });
}

export async function resolveHazard(id: string, userId: string, resolutionNotes: string) {
  return prisma.$transaction(async (tx) => {
    const hazard = await tx.safetyHazard.findUnique({ where: { id } });
    if (!hazard) throw new ServiceError("Hazard not found", 404);
    if (hazard.status !== "MITIGATING" && hazard.status !== "IDENTIFIED") throw new ServiceError(`Cannot resolve hazard in ${hazard.status} status`, 400);
    if (!resolutionNotes?.trim()) throw new ServiceError("Resolution notes are required", 400);

    const updated = await tx.safetyHazard.update({
      where: { id },
      data: { status: "RESOLVED", resolvedById: userId, resolvedAt: new Date(), resolutionNotes },
    });
    await logAction(tx, { userId, action: "SAFETY_HAZARD_RESOLVE", entityType: "SafetyHazard", entityId: id, after: { status: "RESOLVED" } });
    return updated;
  });
}

export async function deleteHazard(id: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.safetyHazard.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Hazard not found", 404);
    if (existing.status === "RESOLVED") throw new ServiceError("Cannot delete a resolved hazard", 400);
    await tx.safetyHazard.delete({ where: { id } });
    if (userId) await logAction(tx, { userId, action: "SAFETY_HAZARD_DELETE", entityType: "SafetyHazard", entityId: id, before: { hazardNumber: existing.hazardNumber } });
    return { ok: true };
  });
}

// ── Inspection CRUD + Workflow ─────────────────────────────

export async function createInspection(input: CreateInspectionInput) {
  return prisma.$transaction(async (tx) => {
    const project = await tx.project.findFirst({ where: { id: input.projectId, deletedAt: null }, include: { company: { select: { id: true } } } });
    if (!project) throw new ServiceError("Project not found", 404);
    if (!input.title?.trim()) throw new ServiceError("Title is required", 400);

    const inspectionNumber = await genInspectionNumber(tx, project.company.id);
    const inspection = await tx.safetyInspection.create({
      data: {
        companyId: project.company.id,
        projectId: input.projectId,
        inspectionNumber,
        title: input.title.trim(),
        status: "SCHEDULED",
        scheduledDate: input.scheduledDate,
        inspectorName: input.inspectorName ?? null,
        conductedById: input.userId ?? null,
      },
    });

    if (input.userId) {
      await logAction(tx, { userId: input.userId, action: "SAFETY_INSPECTION_CREATE", entityType: "SafetyInspection", entityId: inspection.id, after: { inspectionNumber } });
    }
    return inspection;
  });
}

export async function getInspections(projectId?: string, status?: SafetyInspectionStatus) {
  const where: Prisma.SafetyInspectionWhereInput = {};
  if (projectId) where.projectId = projectId;
  if (status) where.status = status;
  return prisma.safetyInspection.findMany({ where, orderBy: { scheduledDate: "desc" }, include: { project: { select: { id: true, name: true } } }, take: 100 });
}

export async function getInspection(id: string) {
  return prisma.safetyInspection.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, name: true } },
      inspector: { select: { id: true, name: true } },
    },
  });
}

export async function updateInspection(id: string, input: { title?: string; scheduledDate?: Date; inspectorName?: string | null; findings?: string; complianceNotes?: string; followUpActions?: string; attachments?: string[] }) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.safetyInspection.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Inspection not found", 404);
    if (existing.status === "COMPLETED") throw new ServiceError("Cannot edit a completed inspection", 400);

    const data: Prisma.SafetyInspectionUpdateInput = {};
    if (input.title !== undefined) data.title = input.title;
    if (input.scheduledDate !== undefined) data.scheduledDate = input.scheduledDate;
    if (input.inspectorName !== undefined) data.inspectorName = input.inspectorName;
    if (input.findings !== undefined) data.findings = input.findings;
    if (input.complianceNotes !== undefined) data.complianceNotes = input.complianceNotes;
    if (input.followUpActions !== undefined) data.followUpActions = input.followUpActions;
    if (input.attachments !== undefined) data.attachments = input.attachments;

    return tx.safetyInspection.update({ where: { id }, data });
  });
}

export async function startInspection(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const insp = await tx.safetyInspection.findUnique({ where: { id } });
    if (!insp) throw new ServiceError("Inspection not found", 404);
    if (insp.status !== "SCHEDULED") throw new ServiceError(`Cannot start inspection in ${insp.status} status`, 400);
    const updated = await tx.safetyInspection.update({ where: { id }, data: { status: "IN_PROGRESS", conductedById: userId } });
    await logAction(tx, { userId, action: "SAFETY_INSPECTION_START", entityType: "SafetyInspection", entityId: id, after: { status: "IN_PROGRESS" } });
    return updated;
  });
}

export async function completeInspection(id: string, userId: string, result: InspectionResult, findings: string, complianceNotes?: string, followUpActions?: string) {
  return prisma.$transaction(async (tx) => {
    const insp = await tx.safetyInspection.findUnique({ where: { id } });
    if (!insp) throw new ServiceError("Inspection not found", 404);
    if (insp.status !== "IN_PROGRESS" && insp.status !== "SCHEDULED") throw new ServiceError(`Cannot complete inspection in ${insp.status} status`, 400);
    if (!findings?.trim()) throw new ServiceError("Findings are required", 400);

    const updated = await tx.safetyInspection.update({
      where: { id },
      data: { status: "COMPLETED", result, conductedDate: new Date(), conductedById: userId, findings, complianceNotes: complianceNotes ?? null, followUpActions: followUpActions ?? null },
    });
    await logAction(tx, { userId, action: "SAFETY_INSPECTION_COMPLETE", entityType: "SafetyInspection", entityId: id, after: { status: "COMPLETED", result } });
    return updated;
  });
}

export async function cancelInspection(id: string, userId: string) {
  return prisma.$transaction(async (tx) => {
    const insp = await tx.safetyInspection.findUnique({ where: { id } });
    if (!insp) throw new ServiceError("Inspection not found", 404);
    if (insp.status !== "SCHEDULED") throw new ServiceError(`Cannot cancel inspection in ${insp.status} status`, 400);
    const updated = await tx.safetyInspection.update({ where: { id }, data: { status: "CANCELLED" } });
    await logAction(tx, { userId, action: "SAFETY_INSPECTION_CANCEL", entityType: "SafetyInspection", entityId: id, after: { status: "CANCELLED" } });
    return updated;
  });
}

export async function deleteInspection(id: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.safetyInspection.findUnique({ where: { id } });
    if (!existing) throw new ServiceError("Inspection not found", 404);
    if (existing.status === "COMPLETED") throw new ServiceError("Cannot delete a completed inspection", 400);
    await tx.safetyInspection.delete({ where: { id } });
    if (userId) await logAction(tx, { userId, action: "SAFETY_INSPECTION_DELETE", entityType: "SafetyInspection", entityId: id, before: { inspectionNumber: existing.inspectionNumber } });
    return { ok: true };
  });
}
