import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createIncident } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const createSchema = z.object({
  projectId: z.string().min(1),
  title: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["ACCIDENT", "NEAR_MISS", "INJURY", "FATALITY", "PROPERTY_DAMAGE", "ENVIRONMENTAL", "FIRE", "STRUCTURAL", "OTHER"]).optional(),
  severity: z.enum(["FIRST_AID", "LOST_TIME", "SERIOUS", "FATAL", "PROPERTY_ONLY"]).optional(),
  incidentDate: z.string().min(1),
  incidentTime: z.string().optional().nullable(),
  location: z.string().optional().nullable(),
  wbsNodeId: z.string().optional().nullable(),
  peopleInvolved: z.string().optional().nullable(),
  injuredCount: z.coerce.number().optional(),
  fatalities: z.coerce.number().optional(),
  propertyDamageEstimate: z.coerce.number().optional().nullable(),
  attachments: z.array(z.string()).optional(),
});

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const projectId = req.nextUrl.searchParams.get("projectId") ?? undefined;
  const status = req.nextUrl.searchParams.get("status") as any;
  const severity = req.nextUrl.searchParams.get("severity") as any;

  const incidents = await prisma.safetyIncident.findMany({
    where: { companyId: company.id, ...(projectId ? { projectId } : {}), ...(status ? { status } : {}), ...(severity ? { severity } : {}) },
    orderBy: { incidentDate: "desc" },
    include: { project: { select: { id: true, name: true } } },
    take: 100,
  });
  return json(incidents);
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const incident = await createIncident({
      projectId: parsed.data.projectId,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      severity: parsed.data.severity,
      incidentDate: new Date(parsed.data.incidentDate),
      incidentTime: parsed.data.incidentTime ?? null,
      location: parsed.data.location ?? null,
      wbsNodeId: parsed.data.wbsNodeId ?? null,
      peopleInvolved: parsed.data.peopleInvolved ?? null,
      injuredCount: parsed.data.injuredCount,
      fatalities: parsed.data.fatalities,
      propertyDamageEstimate: parsed.data.propertyDamageEstimate ?? null,
      attachments: parsed.data.attachments,
      userId: user.id,
    });
    return json(incident, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
