import { NextRequest } from "next/server";
import { updateDailyReport, deleteDailyReport } from "@nirman/services";
import { apiHandler, getCompany, json, dailyReportSchema, requirePermission } from "@/lib/server";
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
  try {
    await deleteDailyReport(id, company.id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete daily report") }, { status: 400 });
  }
});
