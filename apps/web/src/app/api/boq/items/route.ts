import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { createBoqItem } from "@nirman/services";
import { apiHandler, getCompany, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const createSchema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  type: z.enum(["SECTION", "SUBSECTION", "LINE_ITEM"]).optional(),
  serialNo: z.string().min(1),
  description: z.string().min(1),
  materialId: z.string().optional().nullable(),
  unit: z.string().optional().nullable(),
  estimatedQty: z.coerce.number().optional().nullable(),
  rate: z.coerce.number().optional().nullable(),
  notes: z.string().optional().nullable(),
  sortOrder: z.coerce.number().optional(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const company = await getCompany();
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  // Verify the project belongs to the user's company before creating BOQ items
  const project = await prisma.project.findFirst({
    where: { id: parsed.data.projectId, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!project) return json({ error: "Project not found" }, { status: 404 });
  try {
    const d = parsed.data;
    const item = await createBoqItem({
      projectId: d.projectId,
      phaseId: d.phaseId ?? undefined,
      parentId: d.parentId ?? undefined,
      type: d.type,
      serialNo: d.serialNo,
      description: d.description,
      materialId: d.materialId ?? undefined,
      unit: d.unit ?? undefined,
      estimatedQty: d.estimatedQty ?? undefined,
      rate: d.rate ?? undefined,
      notes: d.notes ?? undefined,
      sortOrder: d.sortOrder,
      userId: user.id,
    });
    return json(item, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
