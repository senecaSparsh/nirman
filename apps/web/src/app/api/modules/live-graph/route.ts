import { NextRequest } from "next/server";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";
import { buildLiveGraph } from "@/lib/modules/resolver";

/**
 * GET /api/modules/live-graph
 * Returns a read-only graph of the real records in the active company,
 * traversed outward through every registry relation. One node per real
 * record; records reachable from multiple parents are flagged as shared.
 * Used by the playground "Live Data" toggle.
 */
export const GET = apiHandler(async (_req: NextRequest) => {
  await requireUser();
  const company = await getCompany();
  const graph = await buildLiveGraph(company.id);
  return json(graph);
});
