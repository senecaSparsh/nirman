import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createWorkOrder } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().optional().nullable(),
  subcontractorId: z.string().min(1),
  workTitle: z.string().min(1),
  description: z.string().optional().nullable(),
  retentionPct: z.coerce.number().optional(),
  tdsCategory: z.enum(["INDIVIDUAL", "COMPANY", "OTHER"]).optional(),
  advanceAmount: z.coerce.number().optional(),
  advanceRecoveryPct: z.coerce.number().optional(),
  startDate: z.string().datetime().optional().nullable(),
  endDate: z.string().datetime().optional().nullable(),
  defectLiabilityMonths: z.coerce.number().optional(),
  lines: z.array(z.object({
    boqItemId: z.string().min(1),
    agreedRate: z.coerce.number().min(0),
  })).min(1),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const d = parsed.data;
    const wo = await createWorkOrder({
      projectId: d.projectId,
      phaseId: d.phaseId ?? undefined,
      subcontractorId: d.subcontractorId,
      companyId: company.id,
      workTitle: d.workTitle,
      description: d.description ?? undefined,
      retentionPct: d.retentionPct,
      tdsCategory: d.tdsCategory,
      advanceAmount: d.advanceAmount,
      advanceRecoveryPct: d.advanceRecoveryPct,
      startDate: d.startDate ? new Date(d.startDate) : undefined,
      endDate: d.endDate ? new Date(d.endDate) : undefined,
      defectLiabilityMonths: d.defectLiabilityMonths,
      lines: d.lines,
      userId: user.id,
    });
    return json(wo, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const status = searchParams.get("status");

  const wos = await prisma.subcontractorWorkOrder.findMany({
    where: {
      companyId: company.id,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status: status as any } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      subcontractor: { select: { id: true, name: true, trade: true } },
      project: { select: { id: true, name: true } },
      _count: { select: { raBills: true, lines: true } },
    },
  });
  return json(wos.map((w) => ({
    ...w,
    retentionPct: toNum(w.retentionPct),
    tdsPct: toNum(w.tdsPct),
    advanceAmount: toNum(w.advanceAmount),
    advanceRecoveryPct: toNum(w.advanceRecoveryPct),
    totalWorkDone: toNum(w.totalWorkDone),
    totalDeductions: toNum(w.totalDeductions),
    totalPaid: toNum(w.totalPaid),
    retentionBalance: toNum(w.retentionBalance),
  })));
});
