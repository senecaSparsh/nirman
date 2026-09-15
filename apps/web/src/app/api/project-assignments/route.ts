import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { resolveScopeType } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission, scopeWhere, assertScopeAllows } from "@/lib/server";
import { PERM, ALL_ROLES } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.USERS_VIEW);
  const company = await getCompany();
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  const userId = searchParams.get("userId");

  const assignments = await prisma.projectAssignment.findMany({
    where: {
      ...(projectId ? { projectId } : {}),
      ...(userId ? { userId } : {}),
      project: { companyId: company.id },
      ...await scopeWhere("ProjectAssignment"),
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { assignedAt: "desc" },
    take: 300,
  });

  return json(
    assignments.map((a) => ({
      id: a.id,
      userId: a.userId,
      userName: a.user.name,
      userEmail: a.user.email,
      userRole: a.user.role,
      projectId: a.projectId,
      projectName: a.project.name,
      scopedRole: a.scopedRole,
      assignedAt: a.assignedAt.toISOString(),
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.USERS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const { userId, projectId, scopedRole } = body;
  if (!userId || !projectId) {
    return json({ error: "userId and projectId are required" }, { status: 400 });
  }
  if (scopedRole != null && !(ALL_ROLES as readonly string[]).includes(scopedRole)) {
    return json({ error: `Invalid scoped role "${scopedRole}"` }, { status: 400 });
  }
  try {
    await assertScopeAllows({ projectId, departmentId: null });
  } catch (err) {
    return json({ error: err instanceof Error ? err.message : "Scope violation" }, { status: 403 });
  }
  // Validate project belongs to company
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: company.id, deletedAt: null },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  // Validate user exists AND is a member of this company — a project
  // assignment for a non-member is a dangling row that grants nothing but
  // still renders in the roster.
  const targetMembership = await prisma.userCompany.findUnique({
    where: { userId_companyId: { userId, companyId: company.id } },
    include: { user: { select: { id: true } } },
  });
  if (!targetMembership) return json({ error: "User is not a member of this company" }, { status: 404 });

  try {
    const assignment = await prisma.projectAssignment.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: { userId, projectId, scopedRole: scopedRole ?? "SUPERVISOR", assignedById: user.id },
      update: { scopedRole: scopedRole ?? "SUPERVISOR", assignedById: user.id },
    });

    // Project-scoped roles (SITE_ENGINEER, SUPERVISOR, …) read their scope from
    // UserScope rows on the membership — the roster row alone doesn't unlock
    // pickers. Mirror the assignment into UserScope so assigning someone to a
    // project here actually grants them that project's data.
    const membership = targetMembership;
    if (membership && resolveScopeType(membership) === "PROJECT") {
      const existing = await prisma.userScope.findFirst({
        where: { userCompanyId: membership.id, scopeKind: "PROJECT", projectId },
      });
      if (!existing) {
        await prisma.userScope.create({
          data: { userCompanyId: membership.id, scopeKind: "PROJECT", projectId },
        });
      }
    }
    return json({ ok: true, id: assignment.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create assignment") }, { status: 400 });
  }
});
