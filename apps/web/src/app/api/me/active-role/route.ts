import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { logAction } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * POST /api/me/active-role — switch the hat the current user wears within
 * the active company ("one hat at a time" multi-role).
 *
 * Body: { role: string } — must be a member of the caller's held set
 * ({ membership.role } ∪ secondaryRoles). Send the primary role to switch
 * back (clears activeRole to NULL = primary).
 *
 * This is deliberately NOT a role-management operation: it changes only
 * which of the member's ALREADY-ASSIGNED roles is active, so no hierarchy
 * check applies — the held set itself is only editable via the role
 * assignment routes. Every permission/scope/authority resolver reads
 * activeRole ?? role, so the switch takes effect immediately.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requireUser();
  const company = await getCompany();
  const { role } = (await req.json().catch(() => ({}))) as { role?: string };

  if (!role || typeof role !== "string") {
    return json({ error: "role required" }, { status: 400 });
  }

  const membership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId: user.id, companyId: company.id } },
    select: { id: true, role: true, secondaryRoles: true, activeRole: true },
  });
  if (!membership) {
    return json({ error: "No membership in this company" }, { status: 404 });
  }

  const heldRoles = [...new Set([membership.role, ...membership.secondaryRoles])];
  if (!heldRoles.includes(role)) {
    return json({ error: "That role is not assigned to you" }, { status: 403 });
  }

  // Switching to the primary role clears activeRole (NULL = primary).
  const nextActive = role === membership.role ? null : role;
  if (nextActive !== membership.activeRole) {
    await prisma.userCompany.update({
      where: { id: membership.id },
      data: { activeRole: nextActive },
    });
    await logAction(prisma, {
      userId: user.id,
      companyId: company.id,
      action: "ROLE_SWITCH",
      entityType: "UserCompany",
      entityId: membership.id,
      before: { activeRole: membership.activeRole ?? membership.role },
      after: { activeRole: role },
    });
  }

  // Respond with the validated hat + held set — the write already landed,
  // so re-reading the membership adds a round-trip for no new information.
  return json({ ok: true, activeRole: role, roles: heldRoles });
});
