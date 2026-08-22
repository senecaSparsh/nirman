import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createNcr, getNcrs } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  category: z.enum(["MATERIAL", "WORKMANSHIP", "DESIGN", "DOCUMENT", "PROCESS", "SAFETY", "OTHER"]).optional(),
  severity: z.enum(["CRITICAL", "MAJOR", "MINOR", "OBSERVATION"]).optional(),
  location: z.string().optional().nullable(),
  wbsNodeId: z.string().optional().nullable(),
  boqItemId: z.string().optional().nullable(),
  responsibleParty: z.string().optional().nullable(),
  subcontractorId: z.string().optional().nullable(),
  attachments: z.array(z.string()).optional(),
});

// GET /api/quality-control/ncr?projectId=xxx&status=xxx&severity=xxx
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const status = req.nextUrl.searchParams.get("status") as any;
  const severity = req.nextUrl.searchParams.get("severity") as any;

  const ncrs = await prisma.nonConformanceReport.findMany({
    where: { companyId: company.id, ...(projectId ? { projectId } : {}), ...(status ? { status } : {}), ...(severity ? { severity } : {}) },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      subcontractor: { select: { id: true, name: true, trade: true } },
    },
    take: 100,
  });
  return json(ncrs);
});

// POST /api/quality-control/ncr
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const ncr = await createNcr({
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      category: parsed.data.category,
      severity: parsed.data.severity,
      location: parsed.data.location ?? null,
      wbsNodeId: parsed.data.wbsNodeId ?? null,
      boqItemId: parsed.data.boqItemId ?? null,
      responsibleParty: parsed.data.responsibleParty ?? null,
      subcontractorId: parsed.data.subcontractorId ?? null,
      attachments: parsed.data.attachments,
      userId: user.id,
    });
    return json(ncr, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
