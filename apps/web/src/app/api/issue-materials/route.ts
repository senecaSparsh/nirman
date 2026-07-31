import { NextRequest } from "next/server";
import { issueMaterialsToProject } from "@nirman/services";
import { apiHandler, json, issueMaterialsSchema, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

/**
 * POST /api/issue-materials — issue materials from a stock location to a project.
 *
 * Delegates to the issue service which atomically:
 *  - records ISSUE_TO_PROJECT movements (deducts stock at MAC)
 *  - creates a MaterialIssue + lines (audit record)
 *  - triggers cost-per-sqft reallocation for the project
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.STOCK_ISSUE);
  const body = await req.json();
  const parsed = issueMaterialsSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  const result = await issueMaterialsToProject({
    projectId: parsed.data.projectId,
    fromLocationId: parsed.data.fromLocationId,
    issuedById: user.id,
    notes: parsed.data.notes ?? undefined,
    lines: parsed.data.lines.map((l) => ({ materialId: l.materialId, qty: l.qty })),
  });
  return json(
    { ok: true, materialIssueId: result.materialIssue.id, totalCost: toNum(result.totalCost) },
    { status: 201 },
  );
});
