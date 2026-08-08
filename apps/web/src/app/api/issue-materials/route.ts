import { NextRequest } from "next/server";
import { issueMaterialsToProject, issueMaterialsToDepartment } from "@nirman/services";
import { apiHandler, json, issueMaterialsSchema, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";
import { requirePermission } from "@/lib/server";

/**
 * POST /api/issue-materials — issue materials from a stock location to a
 * project OR a department (cost center). The schema enforces that exactly
 * one of projectId / departmentId is set.
 *
 * Both paths atomically record the stock movements (deduct at MAC), create a
 * MaterialIssue + lines (audit record), and post a balanced GL entry. Project
 * issues additionally trigger cost-per-sqft reallocation and post to WIP;
 * department issues post to Operating Expenses.
 */
export const POST = apiHandler(async (req: NextRequest) => {
  const user = await requirePermission(PERM.STOCK_ISSUE);
  const body = await req.json();
  const parsed = issueMaterialsSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? "Invalid input" }, { status: 400 });
  }
  try {
    const common = {
      fromLocationId: parsed.data.fromLocationId,
      issuedById: user.id,
      notes: parsed.data.notes ?? undefined,
      receiverName: parsed.data.receiverName ?? undefined,
      receiverMobile: parsed.data.receiverMobile ?? undefined,
      roundOff: parsed.data.roundOff ?? undefined,
      lines: parsed.data.lines.map((l) => ({ materialId: l.materialId, qty: l.qty, lotNumber: l.lotNumber ?? null })),
    };
    const result = parsed.data.departmentId
      ? await issueMaterialsToDepartment({ ...common, departmentId: parsed.data.departmentId })
      : await issueMaterialsToProject({ ...common, projectId: parsed.data.projectId!, builtUnitId: parsed.data.builtUnitId ?? undefined });
    return json(
      { ok: true, materialIssueId: result.materialIssue.id, issueNumber: result.materialIssue.issueNumber, totalCost: toNum(result.totalCost), totalAmount: toNum(result.totalCost) },
      { status: 201 },
    );
  } catch (err: unknown) {
    return json({ error: (err instanceof Error ? err.message : "Failed to issue materials") }, { status: 400 });
  }
});
