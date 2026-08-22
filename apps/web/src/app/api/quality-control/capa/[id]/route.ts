import { NextRequest } from "next/server";
import { updateCapa, startCapa, completeCorrectiveAction, completePreventiveAction, verifyCapa, closeCapa } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const updateSchema = z.object({
  rootCause: z.string().min(1).optional(),
  correctiveAction: z.string().min(1).optional(),
  correctiveDueDate: z.string().optional().nullable(),
  preventiveAction: z.string().min(1).optional(),
  preventiveDueDate: z.string().optional().nullable(),
});

const actionSchema = z.object({
  action: z.enum(["start", "corrective_done", "preventive_done", "verify", "close"]),
  verificationMethod: z.string().optional(),
  verificationNotes: z.string().optional(),
  effective: z.boolean().optional(),
  closureNotes: z.string().optional(),
});

// PATCH /api/quality-control/capa/[id]
export const PATCH = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.WO_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();

  if (body.action && typeof body.action === "string") {
    const parsed = actionSchema.safeParse(body);
    if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid action" }, { status: 400 });
    try {
      switch (parsed.data.action) {
        case "start":
          return json(await startCapa(id, user.id));
        case "corrective_done":
          return json(await completeCorrectiveAction(id, user.id));
        case "preventive_done":
          return json(await completePreventiveAction(id, user.id));
        case "verify":
          if (!parsed.data.verificationMethod || !parsed.data.verificationNotes || parsed.data.effective === undefined)
            return json({ error: "verificationMethod, verificationNotes, and effective are required" }, { status: 400 });
          return json(await verifyCapa(id, user.id, parsed.data.verificationMethod, parsed.data.verificationNotes, parsed.data.effective));
        case "close":
          if (!parsed.data.closureNotes) return json({ error: "closureNotes required" }, { status: 400 });
          return json(await closeCapa(id, user.id, parsed.data.closureNotes));
      }
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
    }
  }

  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  try {
    return json(await updateCapa(id, {
      rootCause: parsed.data.rootCause,
      correctiveAction: parsed.data.correctiveAction,
      correctiveDueDate: parsed.data.correctiveDueDate ? new Date(parsed.data.correctiveDueDate) : null,
      preventiveAction: parsed.data.preventiveAction,
      preventiveDueDate: parsed.data.preventiveDueDate ? new Date(parsed.data.preventiveDueDate) : null,
    }));
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
