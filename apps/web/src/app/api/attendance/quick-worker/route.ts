import { NextRequest } from "next/server";
import { apiHandler, getCompany, json, requireAnyPermission, assertScopeAllows } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { createEmployee } from "@nirman/services";
import { z } from "zod";

const quickWorkerSchema = z.object({
  name: z.string().min(1, "Name is required"),
  trade: z.string().optional().nullable(),
  dailyRate: z.coerce.number().finite().nonnegative().optional().nullable(),
  crewId: z.string().optional().nullable(),
  activeProjectId: z.string().optional().nullable(),
});

/**
 * POST /api/attendance/quick-worker — register a churn day-worker in seconds.
 *
 * Indian sites run on theke-wala / casual labour: workers with no phone, who
 * may be on site for days not years, supplied by a thekedar. The full
 * employee onboarding (bank, gov IDs, contract, dossier) is the wrong tool —
 * a mukadam needs "name + trade + ₹/day → present today" before the morning
 * shift, without leaving the attendance sheet.
 *
 * Deliberately gated on `attendance.log` (NOT hr.manage): the person marking
 * the day's roll is exactly who needs to add a worker who just arrived. The
 * endpoint only ever creates a minimal CASUAL + DAILY worker — no salary,
 * bank, gov IDs, hierarchy level, or dossier fields are accepted here, so an
 * ATTENDANCE_LOG holder can't mint a privileged or fully-paid-up record.
 * Those fields stay behind POST /api/employees (hr.manage).
 *
 * Body: { name, trade?, dailyRate?, crewId?, activeProjectId? }
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireAnyPermission(PERM.HR_MANAGE, PERM.ATTENDANCE_LOG);
  const company = await getCompany();

  const parsed = quickWorkerSchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  // The project/crew must be inside the marker's scope — a supervisor can't
  // register a worker onto a site they don't run.
  try {
    await assertScopeAllows({ projectId: parsed.data.activeProjectId ?? null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }

  const created = await createEmployee({
    companyId: company.id,
    name: parsed.data.name.trim(),
    trade: parsed.data.trade?.trim() || undefined,
    dailyRate: parsed.data.dailyRate ?? 0,
    wageType: "DAILY",
    employmentType: "CASUAL",
    crewId: parsed.data.crewId ?? undefined,
    activeProjectId: parsed.data.activeProjectId ?? undefined,
    userId: user.id,
  });

  return json(
    { ok: true, id: created.id, name: created.name, trade: created.trade ?? null },
    { status: 201 },
  );
}, { audit: { action: "CREATE", entityType: "Employee" } });
