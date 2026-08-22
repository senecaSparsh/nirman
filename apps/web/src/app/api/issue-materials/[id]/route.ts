import { NextRequest } from "next/server";
import { cancelMaterialIssue } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

/**
 * PATCH /api/issue-materials/[id] — cancel a material issue.
 * Reverses stock (ADJUSTMENT_IN), GL entries, and project cost reallocation.
 */
export const PATCH = apiHandler(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const user = await requirePermission(PERM.STOCK_ISSUE);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const action = body?.action as string;

  if (action === "cancel") {
    try {
      const result = await cancelMaterialIssue(id, user.id);
      return json({ id: result.id, status: result.status });
    } catch (err: unknown) {
      return json({ error: err instanceof Error ? err.message : "Failed to cancel issue" }, { status: 400 });
    }
  }

  return json({ error: "Unknown action" }, { status: 400 });
});
