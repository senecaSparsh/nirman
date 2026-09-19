import { NextRequest } from "next/server";
import { apiHandler, json, requireUser } from "@/lib/server";
import { searchAddress } from "@/lib/geocode";

/**
 * GET /api/geo/search?q=... — verified address autocomplete.
 * Proxies the configured geocode provider (Google Places when
 * GOOGLE_MAPS_API_KEY is set, OpenStreetMap Nominatim otherwise) so the
 * client only ever picks a real, geocoded address — free-text/fake
 * addresses can't be saved by the pickers that consume this.
 */
export const GET = apiHandler(async (req: NextRequest) => {
  await requireUser();
  const q = new URL(req.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 3) return json({ results: [] });
  if (q.length > 200) return json({ error: "Query too long" }, { status: 400 });
  try {
    const results = await searchAddress(q);
    return json({ results });
  } catch (err) {
    console.error("[geo/search]", err);
    return json({ error: "Address search is unavailable right now" }, { status: 502 });
  }
});
