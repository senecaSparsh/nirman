import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { DEPARTMENTS, departmentWhere, type DepartmentKey } from "@/lib/department-activity";

/**
 * GET /api/activity?department=X&limit=N
 *
 * Returns recent audit-log entries for a specific department, scoped to the
 * current user's company. This powers the live activity feed on each
 * department dashboard.
 *
 * Unlike /api/audit (which requires AUDIT_VIEW and returns before/after
 * payloads), this endpoint:
 *  - Requires the department's view permission (e.g. FINANCE_VIEW for
 *    department=finance) — same gating as every other department API.
 *  - Returns only the action, user name, entity type, and timestamp —
 *    no before/after payloads (those are admin-only audit data).
 *  - Filters by department (action prefix mapping), not by entity type.
 *
 * Default limit: 20, max: 50. Results are newest-first.
 */
export const GET = apiHandler(
  async (req: NextRequest) => {
    const { searchParams } = new URL(req.url);
    const department = searchParams.get("department") as DepartmentKey | null;
    const parsedLimit = Number(searchParams.get("limit") ?? "20");
    const limit = Math.min(Number.isFinite(parsedLimit) && parsedLimit > 0 ? parsedLimit : 20, 50);

    if (!department || !DEPARTMENTS[department]) {
      return json(
        { error: `Invalid department. Valid: ${Object.keys(DEPARTMENTS).join(", ")}` },
        { status: 400 },
      );
    }

    // Enforce the same department-level view permission that the dashboard
    // itself requires. Without this, any authenticated user could read any
    // department's activity by calling the API directly.
    await requirePermission(DEPARTMENTS[department].viewPermission);
    const company = await getCompany();

    const where = departmentWhere(department, company.id);

    const entries = await prisma.auditLog.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      include: {
        user: { select: { name: true } },
      },
    });

    return json({
      rows: entries.map((e) => ({
        id: e.id,
        action: e.action,
        entityType: e.entityType,
        entityId: e.entityId,
        userName: e.user?.name ?? null,
        timestamp: e.timestamp.toISOString(),
      })),
    });
  },
  { rateLimit: "read" },
);
