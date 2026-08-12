import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { prisma } from "@nirman/db";
import { submitDPR, deleteDpr, subAdminApproveDpr, adminApproveDpr, rejectDpr, resubmitDpr, sendNotification, markDprCostPosted, generateMaterialIssueFromDPR } from "@nirman/services";
import { apiHandler, getCompany, json, dprSchema, requirePermission, requireUser, toNum } from "@/lib/server";
import { PERM, hasPermission } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.DPR_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const dpr = await prisma.dailyProgressReport.findFirst({
    where: { id, companyId: company.id },
    include: {
      project: { select: { id: true, name: true, totalProjectCost: true, costPerSqft: true, totalBudget: true, totalSellableArea: true } },
      submittedBy: { select: { id: true, name: true } },
      subAdminApprovedBy: { select: { id: true, name: true } },
      adminApprovedBy: { select: { id: true, name: true } },
      materialLines: {
        include: { material: { select: { id: true, code: true, name: true, unit: true } } },
      },
      laborLines: {
        include: {
          employee: { select: { id: true, name: true, trade: true } },
          crew: { select: { id: true, name: true } },
        },
      },
    },
  });
  if (!dpr) return json({ error: "DPR not found" }, { status: 404 });
  return json({
    id: dpr.id,
    projectId: dpr.projectId,
    projectName: dpr.project?.name ?? null,
    date: dpr.date,
    submittedByName: dpr.submittedBy?.name ?? null,
    weather: dpr.weather,
    workSummary: dpr.workSummary,
    progressPct: toNum(dpr.progressPct),
    blockers: dpr.blockers,
    tomorrowPlan: dpr.tomorrowPlan,
    notes: dpr.notes,
    photoUrls: dpr.photoUrls,
    workType: dpr.workType,
    workQty: dpr.workQty ? toNum(dpr.workQty) : null,
    workUnit: dpr.workUnit,
    varianceAnalysis: dpr.varianceAnalysis,
    autoScrapGenerationId: dpr.autoScrapGenerationId,
    approvalStatus: dpr.approvalStatus,
    subAdminApprovedByName: dpr.subAdminApprovedBy?.name ?? null,
    subAdminApprovedAt: dpr.subAdminApprovedAt?.toISOString() ?? null,
    adminApprovedByName: dpr.adminApprovedBy?.name ?? null,
    adminApprovedAt: dpr.adminApprovedAt?.toISOString() ?? null,
    approvalNotes: dpr.approvalNotes,
    totalProjectCost: dpr.project?.totalProjectCost ? toNum(dpr.project.totalProjectCost) : null,
    costPerSqft: dpr.project?.costPerSqft ? toNum(dpr.project.costPerSqft) : null,
    projectBudget: dpr.project?.totalBudget ? toNum(dpr.project.totalBudget) : null,
    totalSellableArea: dpr.project?.totalSellableArea ? toNum(dpr.project.totalSellableArea) : null,
    materialLines: dpr.materialLines.map((l) => ({
      id: l.id,
      materialId: l.materialId,
      materialCode: l.material.code,
      materialName: l.material.name,
      unit: l.material.unit,
      qty: toNum(l.qty),
      unitCost: toNum(l.unitCost),
    })),
    laborLines: dpr.laborLines.map((l) => ({
      id: l.id,
      employeeId: l.employeeId,
      employeeName: l.employee?.name ?? null,
      crewId: l.crewId,
      crewName: l.crew?.name ?? null,
      hoursWorked: toNum(l.hoursWorked),
      taskDescription: l.taskDescription,
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const company = await getCompany();
  const { id } = await params;
  const existing = await prisma.dailyProgressReport.findUnique({ where: { id } });
  if (!existing) return json({ error: "DPR not found" }, { status: 404 });
  if (existing.companyId !== company.id) return json({ error: "DPR not found" }, { status: 404 });

  const body = await req.json();

  // ── Approval actions ──
  if (body.action === "subAdminApprove") {
    const user = await requirePermission(PERM.DPR_APPROVE_SUB_ADMIN);
    try {
      await subAdminApproveDpr(id, user.id, body.notes);
      // Notify the DPR submitter that their DPR was sub-admin approved
      try {
        const dpr = await prisma.dailyProgressReport.findUnique({
          where: { id },
          include: {
            submittedBy: { select: { phone: true, name: true } },
            project: { select: { name: true } },
          },
        });
        if (dpr?.submittedBy?.phone) {
          await sendNotification({
            companyId: company.id,
            eventType: "DPR_APPROVAL",
            channel: "WHATSAPP",
            recipient: dpr.submittedBy.phone,
            recipientName: dpr.submittedBy.name,
            message: `✅ DPR for ${dpr.project.name} (${dpr.date.toISOString().slice(0, 10)}) was approved by Sub-Admin. Pending final Admin approval.`,
          });
        }
      } catch { /* notification failure should not block approval */ }
      revalidatePath("/m/dprs");
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed") }, { status: 400 });
    }
  }
  if (body.action === "adminApprove") {
    const user = await requirePermission(PERM.DPR_APPROVE_ADMIN);
    try {
      await adminApproveDpr(id, user.id, body.notes);
      // Notify the DPR submitter that their DPR was fully approved
      try {
        const dpr = await prisma.dailyProgressReport.findUnique({
          where: { id },
          include: {
            submittedBy: { select: { phone: true, name: true } },
            project: { select: { name: true } },
          },
        });
        if (dpr?.submittedBy?.phone) {
          await sendNotification({
            companyId: company.id,
            eventType: "DPR_APPROVAL",
            channel: "WHATSAPP",
            recipient: dpr.submittedBy.phone,
            recipientName: dpr.submittedBy.name,
            message: `✅ DPR for ${dpr.project.name} (${dpr.date.toISOString().slice(0, 10)}) was fully approved by Admin.`,
          });
        }
      } catch { /* notification failure should not block approval */ }

      // DPR-Finance Bridge: auto-generate MaterialIssue from approved DPR
      // (best-effort — failures don't block the approval)
      try {
        const result = await generateMaterialIssueFromDPR(id, user.id);
        if (result && result.materialIssueId) {
          revalidatePath("/m/dprs");
          return json({ ok: true, materialIssueGenerated: true, linesCreated: result.linesCreated, skipped: result.skipped });
        }
      } catch (err) {
        console.error(`[dpr-finance-bridge] Failed to generate MaterialIssue from DPR ${id}:`, err);
      }

      revalidatePath("/m/dprs");
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed") }, { status: 400 });
    }
  }
  if (body.action === "reject") {
    // Both sub-admin and admin can reject — accept either permission
    const user = await requireUser();
    const canReject = hasPermission(user.role, PERM.DPR_APPROVE_SUB_ADMIN) || hasPermission(user.role, PERM.DPR_APPROVE_ADMIN);
    if (!canReject) return json({ error: "Forbidden — DPR rejection requires approval permission" }, { status: 403 });
    if (!body.reason?.trim() && !body.rejectReason?.trim()) return json({ error: "Rejection reason is required" }, { status: 400 });
    try {
      await rejectDpr(id, user.id, (body.reason ?? body.rejectReason).trim());
      revalidatePath("/m/dprs");
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed") }, { status: 400 });
    }
  }
  if (body.action === "resubmit") {
    const user = await requirePermission(PERM.DPR_SUBMIT);
    try {
      await resubmitDpr(id, user.id);
      revalidatePath("/m/dprs");
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed") }, { status: 400 });
    }
  }
  if (body.action === "markCostPosted") {
    const user = await requirePermission(PERM.FINANCE_VIEW);
    try {
      await markDprCostPosted(id, user.id);
      revalidatePath("/m/dprs");
      return json({ ok: true });
    } catch (err: unknown) {
      return json({ error: (err instanceof Error ? err.message : "Failed") }, { status: 400 });
    }
  }

  // ── Default: update the DPR content ──
  const user = await requirePermission(PERM.DPR_SUBMIT);
  const parsed = dprSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const dpr = await submitDPR({
      companyId: company.id,
      projectId: parsed.data.projectId,
      date: new Date(parsed.data.date),
      submittedById: user.id,
      weather: parsed.data.weather ?? undefined,
      workSummary: parsed.data.workSummary,
      workType: parsed.data.workType ?? undefined,
      workQty: parsed.data.workQty ?? undefined,
      workUnit: parsed.data.workUnit ?? undefined,
      progressPct: parsed.data.progressPct ?? undefined,
      blockers: parsed.data.blockers ?? undefined,
      tomorrowPlan: parsed.data.tomorrowPlan ?? undefined,
      notes: parsed.data.notes ?? undefined,
      materialLines: parsed.data.materialLines?.map((l) => ({
        materialId: l.materialId,
        qty: l.qty,
        unitCost: l.unitCost,
      })),
      laborLines: parsed.data.laborLines?.map((l) => ({
        employeeId: l.employeeId ?? undefined,
        crewId: l.crewId ?? undefined,
        hoursWorked: l.hoursWorked,
        taskDescription: l.taskDescription,
      })),
      userId: user.id,
    });
    revalidatePath("/m/dprs");
    return json({ ok: true, id: dpr.id });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to update DPR") }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const { id } = await params;
  // Verify the DPR belongs to the user's company before deleting
  const dpr = await prisma.dailyProgressReport.findFirst({
    where: { id, companyId: company.id },
    select: { id: true },
  });
  if (!dpr) return json({ error: "DPR not found" }, { status: 404 });
  try {
    await deleteDpr(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete DPR") }, { status: 400 });
  }
});
