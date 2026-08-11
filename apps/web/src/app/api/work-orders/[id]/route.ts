import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { issueWorkOrder, completeWorkOrder, payAdvance, releaseRetention } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const wo = await prisma.subcontractorWorkOrder.findFirst({
    where: { id, companyId: company.id },
    include: {
      subcontractor: true,
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      lines: { include: { boqItem: { select: { id: true, serialNo: true, description: true, unit: true, estimatedQty: true, rate: true } } } },
      raBills: { orderBy: { billDate: "desc" }, select: { id: true, raBillNumber: true, billDate: true, status: true, grossAmount: true, netPayable: true } },
    },
  });
  if (!wo) return json({ error: "Work order not found" }, { status: 404 });
  return json({
    ...wo,
    retentionPct: toNum(wo.retentionPct),
    tdsPct: toNum(wo.tdsPct),
    advanceAmount: toNum(wo.advanceAmount),
    advanceRecoveryPct: toNum(wo.advanceRecoveryPct),
    totalWorkDone: toNum(wo.totalWorkDone),
    totalDeductions: toNum(wo.totalDeductions),
    totalPaid: toNum(wo.totalPaid),
    retentionBalance: toNum(wo.retentionBalance),
    lines: wo.lines.map((l) => ({
      ...l,
      agreedRate: toNum(l.agreedRate),
      cumulativeQty: toNum(l.cumulativeQty),
      cumulativeAmount: toNum(l.cumulativeAmount),
    })),
    raBills: wo.raBills.map((b) => ({
      ...b,
      grossAmount: toNum(b.grossAmount),
      netPayable: toNum(b.netPayable),
    })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const action = body?.action;

  // Enforce granular permissions per action (segregation of duties)
  const requiredPerm =
    action === "issue" || action === "complete" || action === "pay-advance" ? PERM.WO_MANAGE :
    action === "release-retention" ? PERM.RA_PAY :
    PERM.ASSETS_MANAGE; // fallback for unknown actions
  const user = await requirePermission(requiredPerm);

  try {
    if (action === "issue") {
      const wo = await issueWorkOrder(id, user.id);
      return json(wo);
    }
    if (action === "complete") {
      const wo = await completeWorkOrder(id, user.id);
      return json(wo);
    }
    if (action === "pay-advance") {
      const result = await payAdvance(id, body?.amount, user.id, body?.paymentMode, body?.paymentReference);
      return json(result);
    }
    if (action === "release-retention") {
      const override = body?.overrideReason ? { reason: body.overrideReason } : undefined;
      const result = await releaseRetention(id, user.id, body?.paymentMode, body?.paymentReference, override);
      return json(result);
    }
    return json({ error: "Unknown action. Use: issue | complete | pay-advance | release-retention" }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
