import { NextRequest } from "next/server";
import { prisma } from "@nirman/db";
import { apiHandler, json, getCompany } from "@/lib/server";

/**
 * GET /api/projects/nearest?lat=XX.XX&lng=YY.YY
 *
 * Finds the nearest project site to the given GPS coordinates.
 * Queries StockLocations of type PROJECT_SITE that have lat/lng set,
 * computes the haversine distance, and returns the closest one.
 *
 * Response: { projectId, projectName, locationName, distanceMeters }
 * or 404 if no project sites with coordinates exist.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  const company = await getCompany();
  const url = new URL(req.url);
  const lat = parseFloat(url.searchParams.get("lat") ?? "");
  const lng = parseFloat(url.searchParams.get("lng") ?? "");

  if (isNaN(lat) || isNaN(lng)) {
    return json({ error: "lat and lng query params are required" }, { status: 400 });
  }

  // Fetch all project site locations with GPS coordinates in this company
  const locations = await prisma.stockLocation.findMany({
    where: {
      companyId: company.id,
      type: "PROJECT_SITE",
      deletedAt: null,
      lat: { not: null },
      lng: { not: null },
      project: { deletedAt: null },
    },
    include: {
      project: { select: { id: true, name: true } },
    },
  });

  if (locations.length === 0) {
    return json({ error: "No project sites with GPS coordinates found" }, { status: 404 });
  }

  // Compute haversine distance for each and find the nearest
  let nearest = locations[0]!;
  let nearestDist = haversine(lat, lng, nearest.lat!, nearest.lng!);

  for (let i = 1; i < locations.length; i++) {
    const loc = locations[i]!;
    const dist = haversine(lat, lng, loc.lat!, loc.lng!);
    if (dist < nearestDist) {
      nearest = loc;
      nearestDist = dist;
    }
  }

  return json({
    projectId: nearest.project!.id,
    projectName: nearest.project!.name,
    locationName: nearest.name,
    distanceMeters: Math.round(nearestDist),
  });
});

/**
 * Haversine distance between two lat/lng points, in metres.
 */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth radius in metres
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
