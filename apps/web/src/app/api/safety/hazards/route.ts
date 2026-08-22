import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createHazard } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  likelihood: z.coerce.number().min(1).max(5).optional(),
  severity: z.coerce.number().min(1).max(5).optional(),
  location: z.string().optional().nullable(),
  wbsNodeId: z.string().optional().nullable(),
  mitigationPlan: z.string().optional().nullable(),
  targetResolutionDate: z.string().optional().nullable(),
  attachments: z.array(z.string()).optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const status = req.nextUrl.searchParams.get("status") as any;
  const riskLevel = req.nextUrl.searchParams.get("riskLevel") as any;

  const hazards = await prisma.safetyHazard.findMany({
    where: { companyId: company.id, ...(projectId ? { projectId } : {}), ...(status ? { status } : {}), ...(riskLevel ? { riskLevel } : {}) },
    orderBy: [{ riskLevel: "desc" }, { createdAt: "desc" }],
    include: { project: { select: { id: true, name: true } } },
    take: 100,
  });
  return json(hazards);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const hazard = await createHazard({
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      likelihood: parsed.data.likelihood,
      severity: parsed.data.severity,
      location: parsed.data.location ?? null,
      wbsNodeId: parsed.data.wbsNodeId ?? null,
      mitigationPlan: parsed.data.mitigationPlan ?? null,
      targetResolutionDate: parsed.data.targetResolutionDate ? new Date(parsed.data.targetResolutionDate) : null,
      attachments: parsed.data.attachments,
      userId: user.id,
    });
    return json(hazard, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
