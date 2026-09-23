import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { getVehicleHistory } from "@nirman/services";
import { apiHandler, getCompany, json, requireUser } from "@/lib/server";

/**
 * GET /api/vehicles/[id]/trips — trip history for a vehicle
 */
export const GET = apiHandler(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireUser();
  const company = await getCompany();
  const { id } = await params;
  // Verify the vehicle belongs to the caller's company — a bare id
  // otherwise returns [] for foreign vehicles indistinguishably from
  // "exists but no trips", leaking existence via 200 vs error.
  const vehicle = await prisma.vehicle.findFirst({
    where: { id, companyId: company.id, deletedAt: null },
    select: { id: true },
  });
  if (!vehicle) return json({ error: "Vehicle not found" }, { status: 404 });
  const trips = await getVehicleHistory(id);
  // Filter to company's trips only
  return json(trips.filter((t) => t.companyId === company.id));
});
