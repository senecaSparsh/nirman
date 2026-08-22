import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createInspection } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  scheduledDate: z.string().min(1),
  inspectorName: z.string().optional().nullable(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const status = req.nextUrl.searchParams.get("status") as any;

  const inspections = await prisma.safetyInspection.findMany({
    where: { companyId: company.id, ...(projectId ? { projectId } : {}), ...(status ? { status } : {}) },
    orderBy: { scheduledDate: "desc" },
    include: { project: { select: { id: true, name: true } } },
    take: 100,
  });
  return json(inspections);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const inspection = await createInspection({
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      scheduledDate: new Date(parsed.data.scheduledDate),
      inspectorName: parsed.data.inspectorName ?? null,
      userId: user.id,
    });
    return json(inspection, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
