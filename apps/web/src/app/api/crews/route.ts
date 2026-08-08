import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createCrew } from "@nirman/services";
import { apiHandler, getCompany, json, crewSchema, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const url = new URL(req.url);
  const projectId = url.searchParams.get("projectId");

  const crews = await prisma.crew.findMany({
    where: {
      companyId: company.id,
      ...(projectId ? { projectId } : {}),
    },
    orderBy: { name: "asc" },
    include: {
      project: { select: { id: true, name: true } },
      supervisor: { select: { id: true, name: true } },
      _count: { select: { members: true } },
    },
  });
  return json(
    crews.map((c) => ({
      id: c.id,
      name: c.name,
      projectId: c.projectId,
      projectName: c.project?.name ?? null,
      supervisorId: c.supervisorId,
      supervisorName: c.supervisor?.name ?? null,
      memberCount: c._count.members,
      active: c.active,
    })),
  );
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = crewSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const crew = await createCrew({
    companyId: company.id,
    name: parsed.data.name,
    projectId: parsed.data.projectId ?? undefined,
    supervisorId: parsed.data.supervisorId ?? undefined,
    memberIds: parsed.data.memberIds,
    userId: user.id,
  });
  return json({ ok: true, id: crew.id }, { status: 201 });
});
