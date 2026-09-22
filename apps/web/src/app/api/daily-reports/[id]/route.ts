import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { updateDailyReport, deleteDailyReport } from "@nirman/services";
import { apiHandler, getCompany, json, dailyReportSchema, requirePermission, scopeWhere, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.DPR_SUBMIT);
  const company = await getCompany();
  const { id } = await params;
  const body = await req.json();
  const parsed = dailyReportSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Scope wall — scoped users may only edit reports inside their scope.
  const inScope = await prisma.dailyReport.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("DailyReport") },
    select: { id: true },
  });
  if (!inScope) return json({ error: "Daily report not found" }, { status: 404 });
  if (parsed.data.projectId) {
    try {
      await assertScopeAllows({ projectId: parsed.data.projectId, departmentId: null });
    } catch (err) {
      return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
    }
  }
  try {
    const report = await updateDailyReport(id, company.id, parsed.data, user.id);
    return json({ ok: true, id: report.id });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to update daily report") }, { status: 400 });
  }
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.DPR_SUBMIT);
  const company = await getCompany();
  const { id } = await params;
  // Same scope wall as PATCH.
  const inScope = await prisma.dailyReport.findFirst({
    where: { id, companyId: company.id, ...await scopeWhere("DailyReport") },
    select: { id: true },
  });
  if (!inScope) return json({ error: "Daily report not found" }, { status: 404 });
  try {
    await deleteDailyReport(id, company.id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete daily report") }, { status: 400 });
  }
});
