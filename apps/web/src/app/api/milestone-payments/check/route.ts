import { NextRequest } from "next/server";
import { checkMilestonePayments } from "@nirman/services";
import { apiHandler, json, requirePermission } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const POST = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.SALES_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const result = await checkMilestonePayments(projectId);
  return json(result);
});
