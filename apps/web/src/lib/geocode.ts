/**
 * Server-side geocoding provider. Used by /api/geo/search and /api/geo/reverse
 * so verified-address pickers never hit a third-party API from the browser
 * (keeps the Google key server-side, enforces one auth + rate-limit path).
 *
 * Provider selection: if GOOGLE_MAPS_API_KEY is set → Google Places (New)
 * Text Search / Geocoding API. Otherwise → OpenStreetMap Nominatim (free, no
 * key — same provider the app already uses for client-side reverse geocoding).
 */

export type GeoSearchResult = {
  id: string;
  /** Full formatted address shown to the user. */
  label: string;
  lat: number;
  lng: number;
};

// Nominatim usage policy requires an identifying User-Agent.
const NOMINATIM_UA = "NirmanInventoryOS/1.0 (https://nirman.life)";
const TIMEOUT_MS = 8000;

function googleKey(): string | null {
  return process.env.GOOGLE_MAPS_API_KEY || null;
}

export function geocodeProvider(): "google" | "nominatim" {
  return googleKey() ? "google" : "nominatim";
}

/** Forward search: address text → candidate list with coordinates. */
export async function searchAddress(query: string): Promise<GeoSearchResult[]> {
  return googleKey() ? googleSearch(query) : nominatimSearch(query);
}

async function googleSearch(query: string): Promise<GeoSearchResult[]> {
  const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": googleKey()!,
      "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({ textQuery: query, regionCode: "in", pageSize: 6 }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Google Places search failed: ${res.status}`);
  const data = (await res.json()) as {
    places?: {
      id?: string;
      formattedAddress?: string;
      location?: { latitude?: number; longitude?: number };
    }[];
  };
  return (data.places ?? [])
    .filter((p) => p.formattedAddress && p.location?.latitude != null && p.location?.longitude != null)
    .map((p) => ({
      id: p.id ?? p.formattedAddress!,
      label: p.formattedAddress!,
      lat: p.location!.latitude!,
      lng: p.location!.longitude!,
    }));
}

async function nominatimSearch(query: string): Promise<GeoSearchResult[]> {
  const url =
    `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=6` +
    `&countrycodes=in&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_UA, "Accept-Language": "en" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Nominatim search failed: ${res.status}`);
  const data = (await res.json()) as { place_id: number; display_name: string; lat: string; lon: string }[];
  return data
    .map((r) => ({
      id: String(r.place_id),
      label: r.display_name,
      lat: parseFloat(r.lat),
      lng: parseFloat(r.lon),
    }))
    .filter((r) => Number.isFinite(r.lat) && Number.isFinite(r.lng));
}

/** Reverse geocode: coordinates → formatted address (or null if unmapped). */
export async function reverseGeocode(lat: number, lng: number): Promise<string | null> {
  if (googleKey()) {
    const url = `https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${googleKey()}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
    if (!res.ok) throw new Error(`Google geocode failed: ${res.status}`);
    const data = (await res.json()) as { results?: { formatted_address?: string }[] };
    return data.results?.[0]?.formatted_address ?? null;
  }
  const url =
    `https://nominatim.openstreetmap.org/reverse?format=jsonv2` +
    `&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`;
  const res = await fetch(url, {
    headers: { "User-Agent": NOMINATIM_UA, "Accept-Language": "en" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`Nominatim reverse failed: ${res.status}`);
  const data = (await res.json()) as { display_name?: string };
  return data.display_name ?? null;
}
