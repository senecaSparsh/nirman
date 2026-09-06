/**
 * Device tier — server-safe utilities.
 *
 * These functions can be imported from Server Components. They read the
 * device tier from cookies or User-Agent without any browser APIs.
 *
 * The client-side detection hook lives in device-tier-client.ts.
 */

export type DeviceTier = "high" | "mid" | "low";

/** Cookie name — set by the client (device-tier-client.ts) so the server
 *  can read it on subsequent navigations and skip SSR data fetching for
 *  high-tier devices. */
export const DEVICE_TIER_COOKIE = "nirman-device-tier";

/**
 * Server-side: read the device tier from the cookie.
 * Returns "high" if no cookie is set (first visit — safe default, full SSR).
 */
export function getDeviceTierFromCookies(cookieHeader: string | null | undefined): DeviceTier {
  if (!cookieHeader) return "high";
  const match = cookieHeader.match(new RegExp(`${DEVICE_TIER_COOKIE}=(high|mid|low)`));
  return (match?.[1] as DeviceTier) ?? "high";
}

/**
 * Server-side: parse User-Agent for a rough device tier estimate.
 * Used when no cookie is set (first visit). Conservative — only
 * classifies as "low" for known low-end device patterns.
 */
export function estimateDeviceTierFromUA(userAgent: string | null | undefined): DeviceTier {
  if (!userAgent) return "high";

  // Android Go / low-end Android patterns
  if (/Android.*Go|Android\s+[0-9]\.\d/.test(userAgent)) return "low";

  // Very old iOS (iPhone OS 1-9 → low, 10-12 → mid, 13+ → high)
  const iosMatch = userAgent.match(/(iPhone|iPad).*OS\s+(\d+)/);
  if (iosMatch) {
    const ver = parseInt(iosMatch[2] ?? "0", 10);
    if (ver < 10) return "low";
    if (ver < 13) return "mid";
    return "high";
  }

  // Desktop browsers are generally high
  if (!/Mobile|Android|iPhone/i.test(userAgent)) return "high";

  // Unknown mobile — give benefit of doubt
  return "mid";
}
