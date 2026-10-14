import { prisma } from "@nirman/db";
import { getCustomRoleLabels, resolveRolePermissions, roleDisplayLabel } from "@/lib/server";
import { explainPermission, membershipSources, type AccessExplanation, type SourcedPermissions } from "@/lib/access-explain";

type Hat = { role: string; activeRole: string | null; secondaryRoles?: string[] | null };

function wornRole(m: Hat): string {
  return m.activeRole && [m.role, ...(m.secondaryRoles ?? [])].includes(m.activeRole) ? m.activeRole : m.role;
}

export async function memberAccessSources(companyId: string, userId: string): Promise<SourcedPermissions[] | null> {
  const m = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId } },
    select: {
      id: true,
      role: true,
      activeRole: true,
      secondaryRoles: true,
      userPermissions: { select: { permission: true } },
    },
  });
  if (!m) return null;
  const role = wornRole(m);
  const [rolePermissions, labels, delegators, hats] = await Promise.all([
    resolveRolePermissions(role, companyId, []),
    getCustomRoleLabels([companyId]),
    prisma.userCompany.findMany({
      where: { companyId, active: true, approvalsDelegatedToId: m.id, delegationEndsAt: { gt: new Date() } },
      select: { delegationEndsAt: true, user: { select: { name: true } } },
    }),
    prisma.projectAssignment.findMany({
      where: { userId, project: { companyId } },
      select: { projectId: true, scopedRole: true, project: { select: { name: true } } },
    }),
  ]);
  return membershipSources({
    role,
    label: roleDisplayLabel(role, companyId, labels),
    rolePermissions,
    grants: m.userPermissions.map((p) => p.permission),
    delegations: delegators.map((d) => ({
      from: d.user.name ?? "A delegator",
      endsAt: (d.delegationEndsAt ?? new Date()).toISOString(),
    })),
    projectHats: hats.map((h) => ({ projectId: h.projectId, projectName: h.project.name, role: h.scopedRole })),
  });
}

export type PermissionHolder = AccessExplanation & {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  label: string;
};

export async function permissionHolders(companyId: string, permission: string): Promise<PermissionHolder[]> {
  const now = new Date();
  const [members, delegators, hats, labels] = await Promise.all([
    prisma.userCompany.findMany({
      where: { companyId, active: true, user: { active: true } },
      select: {
        id: true,
        userId: true,
        role: true,
        activeRole: true,
        secondaryRoles: true,
        userPermissions: { select: { permission: true } },
        user: { select: { name: true, email: true } },
      },
    }),
    prisma.userCompany.findMany({
      where: { companyId, active: true, approvalsDelegatedToId: { not: null }, delegationEndsAt: { gt: now } },
      select: { approvalsDelegatedToId: true, delegationEndsAt: true, user: { select: { name: true } } },
    }),
    prisma.projectAssignment.findMany({
      where: { project: { companyId } },
      select: { userId: true, projectId: true, scopedRole: true, project: { select: { name: true } } },
    }),
    getCustomRoleLabels([companyId]),
  ]);
  const rolePerms = new Map<string, string[]>();
  for (const r of new Set(members.map((m) => wornRole(m)))) {
    rolePerms.set(r, await resolveRolePermissions(r, companyId, []));
  }
  const delegationsBy = new Map<string, { from: string; endsAt: string }[]>();
  for (const d of delegators) {
    if (!d.approvalsDelegatedToId) continue;
    const list = delegationsBy.get(d.approvalsDelegatedToId) ?? [];
    list.push({ from: d.user.name ?? "A delegator", endsAt: (d.delegationEndsAt ?? now).toISOString() });
    delegationsBy.set(d.approvalsDelegatedToId, list);
  }
  const hatsBy = new Map<string, { projectId: string; projectName: string; role: string }[]>();
  for (const h of hats) {
    const list = hatsBy.get(h.userId) ?? [];
    list.push({ projectId: h.projectId, projectName: h.project.name, role: h.scopedRole });
    hatsBy.set(h.userId, list);
  }
  const rows: PermissionHolder[] = [];
  for (const m of members) {
    const role = wornRole(m);
    const label = roleDisplayLabel(role, companyId, labels);
    const explanation = explainPermission(
      permission,
      membershipSources({
        role,
        label,
        rolePermissions: rolePerms.get(role) ?? [],
        grants: m.userPermissions.map((p) => p.permission),
        delegations: delegationsBy.get(m.id) ?? [],
        projectHats: hatsBy.get(m.userId) ?? [],
      }),
    );
    if (explanation.global || explanation.projects.length > 0) {
      rows.push({ userId: m.userId, name: m.user.name, email: m.user.email, role, label, ...explanation });
    }
  }
  return rows.sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""));
}
