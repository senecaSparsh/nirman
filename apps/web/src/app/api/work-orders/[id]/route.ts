import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { issueWorkOrder, releaseRetention } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { id } = await params;
  const wo = await prisma.subcontractorWorkOrder.findUnique({
    where: { id },
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
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const action = body?.action;

  try {
    if (action === "issue") {
      const wo = await issueWorkOrder(id, user.id);
      return json(wo);
    }
    if (action === "release-retention") {
      const result = await releaseRetention(id, user.id);
      return json(result);
    }
    return json({ error: "Unknown action. Use: issue | release-retention" }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
