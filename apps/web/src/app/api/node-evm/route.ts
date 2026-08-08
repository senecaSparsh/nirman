import { NextRequest } from "next/server";
import { getNodeEvm } from "@nirman/services";
import { apiHandler, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const evm = await getNodeEvm(projectId);
  return json(evm.map((e) => ({
    ...e,
    pv: toNum(e.pv),
    ev: toNum(e.ev),
    progressPct: toNum(e.progressPct),
    variance: toNum(e.variance),
  })));
});
