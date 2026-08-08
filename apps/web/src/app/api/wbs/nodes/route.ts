import { NextRequest } from "next/server";
import { createWbsNode } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  projectId: z.string().min(1),
  phaseId: z.string().optional().nullable(),
  parentId: z.string().optional().nullable(),
  boqItemId: z.string().optional().nullable(),
  type: z.enum(["PROJECT_NODE", "PHASE_NODE", "ACTIVITY", "SUB_ACTIVITY", "MILESTONE"]).optional(),
  code: z.string().min(1),
  name: z.string().min(1),
  description: z.string().optional().nullable(),
  plannedStart: z.string().datetime().optional().nullable(),
  plannedEnd: z.string().datetime().optional().nullable(),
  sortOrder: z.coerce.number().optional(),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const d = parsed.data;
    const node = await createWbsNode({
      projectId: d.projectId,
      phaseId: d.phaseId ?? undefined,
      parentId: d.parentId ?? undefined,
      boqItemId: d.boqItemId ?? undefined,
      type: d.type,
      code: d.code,
      name: d.name,
      description: d.description ?? undefined,
      plannedStart: d.plannedStart ? new Date(d.plannedStart) : undefined,
      plannedEnd: d.plannedEnd ? new Date(d.plannedEnd) : undefined,
      sortOrder: d.sortOrder,
      userId: user.id,
    });
    return json(node, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
