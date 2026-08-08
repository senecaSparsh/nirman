import { NextRequest } from "next/server";
import { addWbsDependency } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

const schema = z.object({
  predecessorId: z.string().min(1),
  successorId: z.string().min(1),
  type: z.enum(["FS", "SS", "FF", "SF"]).default("FS"),
  lagDays: z.coerce.number().default(0),
});

export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.ASSETS_MANAGE);
  const body = await req.json();
  const parsed = schema.safeParse(body);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? "Invalid" }, { status: 400 });
  try {
    const dep = await addWbsDependency(
      parsed.data.predecessorId,
      parsed.data.successorId,
      parsed.data.type,
      parsed.data.lagDays,
      user.id,
    );
    return json(dep, { status: 201 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
