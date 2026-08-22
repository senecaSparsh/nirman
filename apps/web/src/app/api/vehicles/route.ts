import { NextRequest } from "next/server";
import { searchVehicles, listVehicles } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * GET /api/vehicles?q=MH-12 — search vehicles by number (autocomplete)
 * GET /api/vehicles — list all vehicles for the company
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const company = await getCompany();
  const q = req.nextUrl.searchParams.get("q");

  if (q) {
    const results = await searchVehicles(company.id, q);
    return json(results);
  }

  const vehicles = await listVehicles(company.id);
  return json(vehicles);
});
