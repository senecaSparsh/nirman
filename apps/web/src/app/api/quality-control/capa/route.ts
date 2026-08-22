import { NextRequest } from "next/server";
import { createCapa, getCapa } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const createSchema = z.object({
  ncrId: z.string().min(1),
  rootCause: z.string().min(1),
  correctiveAction: z.string().min(1),
  correctiveDueDate: z.string().optional().nullable(),
  preventiveAction: z.string().min(1),
  preventiveDueDate: z.string().optional().nullable(),
});

// GET /api/quality-control/capa?ncrId=xxx
export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const ncrId = req.nextUrl.searchParams.get("ncrId");
  if (!ncrId) return json({ error: "ncrId is required" }, { status: 400 });
  const capa = await getCapa(ncrId);
  return json(capa);
});

// POST /api/quality-control/capa
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    const capa = await createCapa({
      ncrId: parsed.data.ncrId,
      rootCause: parsed.data.rootCause,
      correctiveAction: parsed.data.correctiveAction,
      correctiveDueDate: parsed.data.correctiveDueDate ? new Date(parsed.data.correctiveDueDate) : null,
      preventiveAction: parsed.data.preventiveAction,
      preventiveDueDate: parsed.data.preventiveDueDate ? new Date(parsed.data.preventiveDueDate) : null,
      userId: user.id,
    });
    return json(capa, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
