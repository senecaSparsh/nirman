import { NextRequest } from "next/server";
import { assignScopedMembership, type ScopeType } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * PATCH /api/users/[id]/scope — set the hierarchical RBAC scope for a user's
 * membership in the active company.
 *
 * Body: {
 *   role: string,                          // current/target role (drives default scope)
 *   scopeType: "COMPANY" | "DEPARTMENT" | "PROJECT",
 *   scopeEntries?: { departmentId?: string; projectId?: string }[],  // required for DEPARTMENT/PROJECT
 *   reportsToUserCompanyId?: string | null,                          // optional reporting line
 * }
 *
 * Delegates to assignScopedMembership() which validates:
 *   - actor is above the target in the hierarchy
 *   - scope entries match the scope type
 *   - reportsTo is in the same company and doesn't create a cycle
 *   - department/project scope entries belong to the company
 * And writes an RBAC_ASSIGN_SCOPE audit log entry inside the transaction.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const session = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const { id: userId } = await params;

  const body = await req.json();
  const { role, scopeType, scopeEntries, reportsToUserCompanyId } = body as {
    role?: string;
    scopeType?: ScopeType;
    scopeEntries?: { departmentId?: string; projectId?: string }[];
    reportsToUserCompanyId?: string | null;
  };

  if (!role || typeof role !== "string") {
    return json({ error: "role is required" }, { status: 400 });
  }
  if (!scopeType || !["COMPANY", "DEPARTMENT", "PROJECT"].includes(scopeType)) {
    return json({ error: "scopeType must be COMPANY, DEPARTMENT, or PROJECT" }, { status: 400 });
  }

  try {
    const membership = await assignScopedMembership({
      actorUserId: session.id,
      userId,
      companyId: company.id,
      role,
      scopeType,
      scopeEntries: scopeEntries ?? [],
      reportsToUserCompanyId: reportsToUserCompanyId ?? null,
    });
    return json({ ok: true, membership });
  } catch (err: unknown) {
    const status = (err as { status?: number }).status ?? 400;
    const message = err instanceof Error ? err.message : "Failed to update scope";
    return json({ error: message }, { status });
  }
});

/**
 * GET /api/users/[id]/scope — fetch the user's current scope for the active
 * company. Returns { membership, scopeType, scopes } or 404 if not a member.
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.USERS_VIEW);
  const company = await getCompany();
  const { id: userId } = await params;

  const { prisma } = await import("@nirman/db");
  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId: company.id } },
    include: {
      scopes: {
        include: {
          department: { select: { id: true, code: true, name: true } },
          project: { select: { id: true, name: true } },
        },
      },
    },
  });

  if (!membership) {
    return json({ error: "User is not a member of this company" }, { status: 404 });
  }

  return json({
    membershipId: membership.id,
    role: membership.role,
    scopeType: membership.scopeType,
    reportsToUserCompanyId: membership.reportsToUserCompanyId,
    scopes: membership.scopes.map((s) => ({
      id: s.id,
      scopeKind: s.scopeKind,
      departmentId: s.departmentId,
      projectId: s.projectId,
      department: s.department,
      project: s.project,
    })),
  });
});
