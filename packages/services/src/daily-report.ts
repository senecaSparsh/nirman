import { prisma, type Prisma } from "@nirman/db";
import { logAction } from "./audit";
import { ServiceError } from "./errors";

/**
 * Daily Report Service — site operations log (separate from DPR).
 *
 * Fields: Attendance, Work Done, Material Used, Equipment, Delay, Remarks
 * Unlike DPRs (which track project progress %), Daily Reports are operational
 * logs focused on what happened on-site today.
 */

export interface CreateDailyReportInput {
  companyId: string;
  projectId?: string | null;
  date: string | Date;
  attendanceSummary?: string | null;
  workDone: string;
  materialUsed?: string | null;
  equipment?: string | null;
  delay?: string | null;
  remarks?: string | null;
  userId?: string;
}

export async function createDailyReport(input: CreateDailyReportInput) {
  return prisma.$transaction(async (tx) => {
    const date = input.date instanceof Date ? input.date : new Date(input.date);
    if (isNaN(date.getTime())) throw new ServiceError("Invalid date");

    if (input.projectId) {
      const project = await tx.project.findFirst({ where: { id: input.projectId, companyId: input.companyId, deletedAt: null } });
      if (!project) throw new ServiceError("Project not found in this company", 404);
    }

    if (!input.workDone?.trim()) throw new ServiceError("Work done is required");

    const report = await tx.dailyReport.create({
      data: {
        companyId: input.companyId,
        projectId: input.projectId ?? null,
        date,
        attendanceSummary: input.attendanceSummary ?? null,
        workDone: input.workDone,
        materialUsed: input.materialUsed ?? null,
        equipment: input.equipment ?? null,
        delay: input.delay ?? null,
        remarks: input.remarks ?? null,
        submittedById: input.userId ?? null,
      },
    });

    if (input.userId) {
      await logAction(tx, {
        userId: input.userId,
        action: "DAILY_REPORT_CREATE",
        entityType: "DailyReport",
        entityId: report.id,
        after: { date: report.date.toISOString(), projectId: report.projectId },
      });
    }

    return report;
  });
}

export async function updateDailyReport(
  id: string,
  companyId: string,
  patch: Partial<Omit<CreateDailyReportInput, "companyId" | "userId">>,
  userId?: string,
) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.dailyReport.findFirst({ where: { id, companyId } });
    if (!existing) throw new ServiceError("Daily report not found", 404);

    const data: Prisma.DailyReportUpdateInput = {};
    if (patch.projectId !== undefined) {
      if (patch.projectId) {
        const project = await tx.project.findFirst({ where: { id: patch.projectId, companyId, deletedAt: null } });
        if (!project) throw new ServiceError("Project not found in this company", 404);
        data.project = { connect: { id: patch.projectId } };
      } else {
        data.project = { disconnect: true };
      }
    }
    if (patch.date !== undefined) {
      const d = patch.date instanceof Date ? patch.date : new Date(patch.date);
      if (!isNaN(d.getTime())) data.date = d;
    }
    if (patch.attendanceSummary !== undefined) data.attendanceSummary = patch.attendanceSummary ?? null;
    if (patch.workDone !== undefined) data.workDone = patch.workDone;
    if (patch.materialUsed !== undefined) data.materialUsed = patch.materialUsed ?? null;
    if (patch.equipment !== undefined) data.equipment = patch.equipment ?? null;
    if (patch.delay !== undefined) data.delay = patch.delay ?? null;
    if (patch.remarks !== undefined) data.remarks = patch.remarks ?? null;

    const updated = await tx.dailyReport.update({ where: { id }, data });

    if (userId) {
      await logAction(tx, {
        userId,
        action: "DAILY_REPORT_UPDATE",
        entityType: "DailyReport",
        entityId: id,
        before: { workDone: existing.workDone },
        after: { workDone: updated.workDone },
      });
    }

    return updated;
  });
}

export async function deleteDailyReport(id: string, companyId: string, userId?: string) {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.dailyReport.findFirst({ where: { id, companyId } });
    if (!existing) throw new ServiceError("Daily report not found", 404);
    await tx.dailyReport.delete({ where: { id } });
    if (userId) {
      await logAction(tx, {
        userId,
        action: "DAILY_REPORT_DELETE",
        entityType: "DailyReport",
        entityId: id,
        before: { date: existing.date.toISOString() },
      });
    }
    return { ok: true };
  });
}
