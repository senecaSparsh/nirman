import { NextRequest } from "next/server";
import { verifyMbEntry, approveMbEntry, rejectMbEntry } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { z } from "zod";

export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const body = await req.json();
  const action = body?.action;

  try {
    if (action === "verify") {
      const user = await requirePermission(PERM.STOCK_ISSUE);
      const entry = await verifyMbEntry(id, user.id);
      return json(entry);
    }
    if (action === "approve") {
      const user = await requirePermission(PERM.ASSETS_MANAGE);
      const entry = await approveMbEntry(id, user.id);
      return json(entry);
    }
    if (action === "reject") {
      const user = await requirePermission(PERM.STOCK_ISSUE);
      const schema = z.object({ reason: z.string().min(1) });
      const parsed = schema.safeParse({ reason: body.reason });
      if (!parsed.success) return json({ error: "Rejection reason is required" }, { status: 400 });
      const entry = await rejectMbEntry(id, parsed.data.reason, user.id);
      return json(entry);
    }
    return json({ error: "Unknown action. Use: verify | approve | reject" }, { status: 400 });
  } catch (err: unknown) {
    return json({ error: err instanceof Error ? err.message : "Failed" }, { status: 400 });
  }
});
