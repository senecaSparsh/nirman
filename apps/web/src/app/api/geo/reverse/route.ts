import { NextRequest } from "next/server";
import { apiHandler, json, requireUser } from "@/lib/server";
import { reverseGeocode } from "@/lib/geocode";

/**
 * GET /api/geo/reverse?lat=..&lng=.. — resolve captured GPS coordinates to a
 * formatted address. Used by the "use my location" auto-detect button on
 * address pickers so the saved address is real, not typed.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lng = Number(sp.get("lng"));
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return json({ error: "Invalid coordinates" }, { status: 400 });
  }
  try {
    const label = await reverseGeocode(lat, lng);
    return json({ label });
  } catch (err) {
    console.error("[geo/reverse]", err);
    return json({ error: "Reverse geocode is unavailable right now" }, { status: 502 });
  }
});
