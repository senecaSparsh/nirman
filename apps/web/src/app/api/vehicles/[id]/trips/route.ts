import { NextRequest } from "next/server";
import { getVehicleHistory } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * GET /api/vehicles/[id]/trips — trip history for a vehicle
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const company = await getCompany();
  const { id } = await params;
  const trips = await getVehicleHistory(id);
  // Filter to company's trips only
  return json(trips.filter((t) => t.companyId === company.id));
});
