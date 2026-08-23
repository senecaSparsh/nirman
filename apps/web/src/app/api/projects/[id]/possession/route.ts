import { NextRequest } from "next/server";
import { revalidatePath } from "next/cache";
import { markPossession } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * POST /api/projects/[id]/possession — mark or unmark possession of the project (built units).
 * Body: { isPossessed: boolean, possessionDate?: string, notes?: string }
 */
export const POST = apiHandler(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.PROJECTS_MANAGE);
  const { id } = await ctx.params;
  const body = await req.json();

  if (typeof body?.isPossessed !== "boolean") {
    return json({ error: "isPossessed (boolean) is required" }, { status: 400 });
  }

  try {
    const result = await markPossession({
      projectId: id,
      isPossessed: body.isPossessed,
      possessionDate: body.possessionDate,
      notes: body.notes,
      userId: user.id,
    });
    revalidatePath("/projects");
    revalidatePath(`/projects/${id}`);
    return json({ ok: true, result });
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to update possession") }, { status: 400 });
  }
});
