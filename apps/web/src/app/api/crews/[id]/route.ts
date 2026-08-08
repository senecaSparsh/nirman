import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { updateCrew, deleteCrew } from "@nirman/services";
import { apiHandler, getCompany, json, crewSchema, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requirePermission(PERM.HR_VIEW);
  const company = await getCompany();
  const { id } = await params;
  const crew = await prisma.crew.findFirst({
    where: { id, companyId: company.id },
    include: {
      project: { select: { id: true, name: true } },
      supervisor: { select: { id: true, name: true } },
      members: {
        where: { deletedAt: null },
        select: { id: true, name: true, trade: true, dailyRate: true, wageType: true, active: true },
        orderBy: { name: "asc" },
      },
    },
  });
  if (!crew) return json({ error: "Crew not found" }, { status: 404 });
  return json({
    ...crew,
    members: crew.members.map((m) => ({ ...m, dailyRate: toNum(m.dailyRate) })),
  });
});

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const { id } = await params;
  const body = await req.json();
  const parsed = crewSchema.partial().safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const crew = await updateCrew({
    crewId: id,
    name: parsed.data.name,
    projectId: parsed.data.projectId,
    supervisorId: parsed.data.supervisorId,
    memberIds: parsed.data.memberIds,
    active: parsed.data.active,
    userId: user.id,
  });
  return json({ ok: true, id: crew.id });
});

export const DELETE = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.HR_MANAGE);
  const { id } = await params;
  try {
    await deleteCrew(id, user.id);
    return json({ ok: true });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to delete crew") }, { status: 400 });
  }
});
