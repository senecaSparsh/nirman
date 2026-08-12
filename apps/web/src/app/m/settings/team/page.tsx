import { Suspense } from "react";
import { connection } from "next/server";
import { prisma } from "@nirman/db";
import { getCompany, getCurrentUser, getUserRole } from "@/lib/server";
import { hasPermission, PERM, ROLES, type Role } from "@/lib/roles";
import { MobileTeamList } from "./MobileTeamList";

/**
 * /m/settings/team — Team & Permissions.
 *
 * Purpose: an owner/admin opens this to manage who has access to the
 * company and what they can do. The page answers:
 *
 *   1. Who's on the team?           → Team roster with roles
 *   2. What can each role do?        → Permission matrix reference
 *   3. Can I change someone's role?  → Inline role change (hierarchical RBAC)
 *   4. Can I deactivate someone?     → Toggle active/inactive
 *
 * Tier 3 roles (SUPERVISOR/SALES/ACCOUNTANT) get read-only access.
 */
export default function TeamPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-12">
          <div className="size-4 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor: "var(--color-ink-300)", borderTopColor: "transparent" }} />
        </div>
      }
    >
      <TeamContent />
    </Suspense>
  );
}

async function TeamContent() {
  await connection();
  const company = await getCompany();
  const currentUser = await getCurrentUser();
  const role = await getUserRole();
  const canManage = hasPermission(role, PERM.USERS_MANAGE);

  // Get all users in this company with their membership info
  const memberships = await prisma.userCompany.findMany({
    where: { companyId: company.id },
    orderBy: { createdAt: "asc" },
    include: {
      user: { select: { id: true, name: true, email: true, phone: true, active: true, role: true } },
      reportsTo: { include: { user: { select: { name: true } } } },
    },
  });

  const team = memberships.map((m) => ({
    id: m.user.id,
    membershipId: m.id,
    name: m.user.name,
    email: m.user.email,
    phone: m.user.phone,
    role: m.role as Role,
    active: m.user.active,
    isSelf: m.user.id === currentUser?.id,
    reportsToName: m.reportsTo?.user.name ?? null,
  }));

  // Count by role
  const roleCounts: Record<string, number> = {};
  for (const m of team) {
    roleCounts[m.role] = (roleCounts[m.role] ?? 0) + 1;
  }

  const assignableRoles = canManage
    ? Object.values(ROLES).filter((r) => r.key !== role).map((r) => ({ key: r.key, label: r.label }))
    : [];

  return (
    <MobileTeamList
      team={team}
      canManage={canManage}
      currentUserId={currentUser?.id ?? ""}
      currentRole={role}
      roleCounts={roleCounts}
      assignableRoles={assignableRoles}
    />
  );
}
