import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

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
    },
    include: {
      user: { select: { id: true, name: true, email: true, role: true } },
      project: { select: { id: true, name: true } },
    },
    orderBy: { assignedAt: "desc" },
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
  // Validate project belongs to company
  const project = await prisma.project.findFirst({
    where: { id: projectId, companyId: company.id, deletedAt: null },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  // Validate user exists
  const targetUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!targetUser) return json({ error: "User not found" }, { status: 404 });

  try {
    const assignment = await prisma.projectAssignment.upsert({
      where: { userId_projectId: { userId, projectId } },
      create: { userId, projectId, scopedRole: scopedRole ?? "SUPERVISOR", assignedById: user.id },
      update: { scopedRole: scopedRole ?? "SUPERVISOR", assignedById: user.id },
    });
    return json({ ok: true, id: assignment.id }, { status: 201 });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to create assignment") }, { status: 400 });
  }
});
