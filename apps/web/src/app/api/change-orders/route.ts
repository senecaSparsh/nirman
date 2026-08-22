import { NextRequest } from "next/server";
import { prisma, type ChangeOrderStatus } from "@nirman/db";
import { createChangeOrder } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const lineSchema = z.object({
  boqItemId: z.string().optional().nullable(),
  description: z.string().min(1),
  originalQty: z.coerce.number().optional().default(0),
  revisedQty: z.coerce.number().optional().default(0),
  unit: z.string().min(1),
  rate: z.coerce.number(),
  notes: z.string().optional().nullable(),
  sortOrder: z.coerce.number().optional(),
});

const createSchema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().optional().nullable(),
  title: z.string().min(1),
  description: z.string().min(1),
  type: z.enum(["ADDITION", "DELETION", "MODIFICATION", "ACCELERATION", "DECELERATION", "VARIATION"]).optional(),
  reason: z.enum(["CLIENT_REQUEST", "SITE_CONDITION", "DESIGN_CHANGE", "ERROR_OMISSION", "REGULATORY", "VALUE_ENGINEERING", "OTHER"]).optional(),
  scheduleDeltaDays: z.coerce.number().optional().default(0),
  clientApprovalRequired: z.boolean().optional().default(true),
  initiatedBy: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  lines: z.array(lineSchema).min(1),
});

// GET /api/change-orders?projectId=xxx&status=xxx
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const company = await getCompany();
  const projectId = req.nextUrl.searchParams.get("projectId");
  const status = req.nextUrl.searchParams.get("status") as ChangeOrderStatus | null;

  const cos = await prisma.changeOrder.findMany({
    where: {
      companyId: company.id,
      ...(projectId ? { projectId } : {}),
      ...(status ? { status } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: {
      project: { select: { id: true, name: true } },
      phase: { select: { id: true, name: true } },
      _count: { select: { lines: true } },
    },
    take: 100,
  });

  return json(cos);
});

// POST /api/change-orders
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }

  try {
    const co = await createChangeOrder({
      projectId: parsed.data.projectId,
      phaseId: parsed.data.phaseId ?? null,
      title: parsed.data.title,
      description: parsed.data.description,
      type: parsed.data.type,
      reason: parsed.data.reason,
      scheduleDeltaDays: parsed.data.scheduleDeltaDays,
      clientApprovalRequired: parsed.data.clientApprovalRequired,
      initiatedBy: parsed.data.initiatedBy ?? null,
      notes: parsed.data.notes ?? null,
      lines: parsed.data.lines,
      userId: user.id,
    });
    return json(co, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
