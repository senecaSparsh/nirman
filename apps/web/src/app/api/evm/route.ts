import { NextRequest } from "next/server";
import { getEvmMetrics } from "@nirman/services";
import { apiHandler, json, requirePermission, toNum } from "@/lib/server";
import { PERM } from "@/lib/roles";

export const GET = apiHandler(async (req: NextRequest) => {
  await requirePermission(PERM.ASSETS_VIEW);
  const { searchParams } = new URL(req.url);
  const projectId = searchParams.get("projectId");
  if (!projectId) return json({ error: "projectId is required" }, { status: 400 });
  const m = await getEvmMetrics(projectId);
  return json({
    pv: toNum(m.pv),
    ev: toNum(m.ev),
    ac: toNum(m.ac),
    cv: toNum(m.cv),
    sv: toNum(m.sv),
    cpi: toNum(m.cpi),
    spi: toNum(m.spi),
    eac: toNum(m.eac),
    vac: toNum(m.vac),
    pctComplete: toNum(m.pctComplete),
  });
});
